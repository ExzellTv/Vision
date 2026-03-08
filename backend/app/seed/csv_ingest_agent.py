"""
csv_ingest_agent.py — CSV Data Ingestion Agent

Reads a CSV file containing up to 350 property records, maps each row
into the canonical JSON schema, classifies it as land or non-land, and
appends new records to the appropriate seed file without duplicates.

Classification (same rule as ingest_agent.py):
  - is_land() == True  →  dallas_land_data.json
  - is_land() == False →  comparables.json

Supported CSV formats
---------------------
Standard Redfin export:
  MLS#, SALE TYPE, PROPERTY TYPE, ADDRESS, CITY, STATE OR PROVINCE,
  ZIP OR POSTAL CODE, PRICE, BEDS, BATHS, SQUARE FEET, LATITUDE,
  LONGITUDE, URL (...), SOURCE, ...

Flexible fallback:
  The mapper accepts common column-name aliases (see COLUMN_MAP below).
  Any column not recognised is silently ignored; any field not present in
  the CSV is written as null so the schema stays consistent.

Usage (standalone):
    cd backend/
    python -m app.seed.csv_ingest_agent path/to/listings.csv
    python -m app.seed.csv_ingest_agent path/to/listings.csv --dry-run
    python -m app.seed.csv_ingest_agent path/to/listings.csv --limit 200

Triggered via API:
    POST /api/ingest/csv   (multipart/form-data, field name: file)
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import logging
import re
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any

# Reuse classification and persistence helpers from existing agents.
from app.seed.fetch_dallas_land import is_land
from app.seed.ingest_agent import (
    LAND_FILE,
    COMP_FILE,
    _load_json,
    _collect_ids,
)

MAX_ROWS = 350

log = logging.getLogger(__name__)


# ── Column name aliases ───────────────────────────────────────────────────────
# Maps canonical field names to the list of CSV header spellings we accept.
# The first match wins; matching is case-insensitive after stripping whitespace.

COLUMN_MAP: dict[str, list[str]] = {
    "mlsId": [
        "mls#", "mls #", "mls id", "listing id", "mlsid", "mls number",
    ],
    "propertyType": [
        "property type", "propertytype", "type", "prop type",
    ],
    "street": [
        "address", "street address", "street", "property address",
    ],
    "city": ["city"],
    "state": [
        "state or province", "state", "province",
    ],
    "zipcode": [
        "zip or postal code", "zip code", "zipcode", "zip", "postal code",
    ],
    "price": [
        "price", "list price", "listing price", "sale price",
    ],
    "beds": [
        "beds", "bedrooms", "bed", "br",
    ],
    "baths": [
        "baths", "bathrooms", "bath",
    ],
    "area": [
        "square feet", "sq ft", "sqft", "area", "square footage", "living area",
    ],
    "lotSize": [
        "lot size", "lotsize", "lot sq ft", "lot square feet", "lot area",
    ],
    "yearBuilt": [
        "year built", "yearbuilt", "year_built", "built",
    ],
    "daysOnMarket": [
        "days on market", "days on redfin", "dom", "daysonmarket",
    ],
    "status": [
        "status", "listing status",
    ],
    "latitude": ["latitude", "lat"],
    "longitude": ["longitude", "lng", "lon", "long"],
    "url": [
        "url (see http://www.redfin.com/buy-a-home/comparative-market-analysis"
        " for info on redfin's agent fee)",
        "url", "listing url", "property url", "link",
    ],
    "description": [
        "description", "remarks", "public remarks", "listing description",
    ],
    "propertyId": [
        "property id", "propertyid", "redfin property id",
    ],
    "photos": [
        "photo url", "photo", "photos", "image url", "primary photo",
    ],
}


# ── Column resolver ───────────────────────────────────────────────────────────

def _build_resolver(headers: list[str]) -> dict[str, str]:
    """Return {canonical_field: actual_header} for the given CSV headers.

    Resolution is case-insensitive.  The first alias in COLUMN_MAP that
    matches an actual header is used.
    """
    lower_headers = {h.strip().lower(): h for h in headers}
    resolver: dict[str, str] = {}
    for field, aliases in COLUMN_MAP.items():
        for alias in aliases:
            if alias.lower() in lower_headers:
                resolver[field] = lower_headers[alias.lower()]
                break
    return resolver


# ── Value coercers ────────────────────────────────────────────────────────────

def _int_or_none(raw: str | None) -> int | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d.]", "", raw.strip())
    try:
        return int(float(cleaned))
    except (ValueError, TypeError):
        return None


def _float_or_none(raw: str | None) -> float | None:
    if not raw:
        return None
    cleaned = re.sub(r"[^\d.\-]", "", raw.strip())
    try:
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _str_or_none(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    return s if s else None


# ── Row → canonical dict ──────────────────────────────────────────────────────

def _map_row(row: dict[str, str], resolver: dict[str, str]) -> dict[str, Any]:
    """Convert one CSV row into a property dict matching our JSON schema."""

    def get(field: str) -> str | None:
        col = resolver.get(field)
        return row.get(col) if col else None

    # Build a stable synthetic id if no numeric id is available from CSV.
    mls_id = _str_or_none(get("mlsId"))
    prop_id_raw = _str_or_none(get("propertyId"))
    prop_id = _int_or_none(prop_id_raw)

    street  = _str_or_none(get("street")) or ""
    city    = _str_or_none(get("city"))   or "Dallas"
    state   = _str_or_none(get("state"))  or "TX"
    zipcode = _str_or_none(get("zipcode"))
    price   = _int_or_none(get("price"))

    # Synthetic id: stable hash of street + zipcode + price so re-runs dedupe.
    _sig = f"csv:{street.lower()}:{zipcode}:{price}"
    synthetic_id = int(hashlib.md5(_sig.encode()).hexdigest()[:8], 16)
    record_id = synthetic_id  # numeric; MLS# is kept in mlsId

    # Photos: some exports include a single primary photo URL.
    raw_photos = _str_or_none(get("photos"))
    photos: list[str] = [raw_photos] if raw_photos else []

    return {
        "id":           record_id,
        "mlsId":        mls_id,
        "propertyId":   prop_id,
        "url":          _str_or_none(get("url")),
        "price":        price,
        "address": {
            "street":   street or None,
            "city":     city,
            "state":    state,
            "zipcode":  zipcode,
        },
        "propertyType": _str_or_none(get("propertyType")),
        "area":         _int_or_none(get("area")),
        "lotSize":      _int_or_none(get("lotSize")),
        "yearBuilt":    _int_or_none(get("yearBuilt")),
        "daysOnMarket": _int_or_none(get("daysOnMarket")),
        "status":       _str_or_none(get("status")),
        "beds":         _int_or_none(get("beds")),
        "baths":        _float_or_none(get("baths")),
        "latitude":     _float_or_none(get("latitude")),
        "longitude":    _float_or_none(get("longitude")),
        "description":  _str_or_none(get("description")),
        "photos":       photos[:5],
    }


# ── Dedup key extraction ──────────────────────────────────────────────────────

def _record_ids(rec: dict) -> list[str]:
    """Return all non-null id strings for a mapped record (same API as ingest_agent)."""
    ids: list[str] = []
    for key in ("id", "propertyId", "mlsId"):
        val = rec.get(key)
        if val is not None:
            ids.append(str(val))
    return ids


# ── Main ingestion routine ────────────────────────────────────────────────────

def run(
    csv_source: str | Path | StringIO,
    limit: int = MAX_ROWS,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Parse a CSV file/stream, classify records, and persist to JSON files.

    Parameters
    ----------
    csv_source : path to CSV file (str or Path) or an already-opened StringIO
    limit      : max rows to process (default 350)
    dry_run    : if True, parse and classify but do not write any files

    Returns
    -------
    dict with keys: rows_read, new_land, new_comparables,
                    skipped_duplicates, skipped_invalid, errors, dry_run
    """
    # Open source
    if isinstance(csv_source, (str, Path)):
        csv_path = Path(csv_source)
        if not csv_path.exists():
            raise FileNotFoundError(f"CSV file not found: {csv_path}")
        log.info("Reading CSV: %s", csv_path)
        text = csv_path.read_text(encoding="utf-8-sig")  # strip BOM if present
        reader_io = StringIO(text)
    else:
        reader_io = csv_source

    reader = csv.DictReader(reader_io)
    if reader.fieldnames is None:
        raise ValueError("CSV has no header row or is empty")

    resolver = _build_resolver(list(reader.fieldnames))
    log.info("CSV headers resolved: %s", {k: v for k, v in resolver.items()})

    # Load existing data once and build global dedup set.
    land_data = _load_json(LAND_FILE)
    comp_data = _load_json(COMP_FILE)
    seen_ids: set[str] = _collect_ids(land_data) | _collect_ids(comp_data)

    new_land: list[dict] = []
    new_comps: list[dict] = []
    rows_read = 0
    skipped_dup = 0
    skipped_invalid = 0
    errors = 0

    for raw_row in reader:
        if rows_read >= limit:
            log.info("Row limit (%d) reached — stopping.", limit)
            break

        rows_read += 1

        try:
            rec = _map_row(raw_row, resolver)
        except Exception as exc:
            log.warning("Row %d: mapping error — %s", rows_read, exc)
            errors += 1
            continue

        # Require at minimum a price or an address to consider the row valid.
        if rec["price"] is None and not (rec["address"].get("street")):
            log.debug("Row %d: no price and no address — skipping", rows_read)
            skipped_invalid += 1
            continue

        rec_ids = _record_ids(rec)
        if not rec_ids:
            skipped_invalid += 1
            continue

        # Duplicate check across both files and within this batch.
        if any(rid in seen_ids for rid in rec_ids):
            skipped_dup += 1
            continue

        seen_ids.update(rec_ids)

        if is_land(rec):
            new_land.append(rec)
        else:
            new_comps.append(rec)

    log.info(
        "Parse complete — %d rows | %d new land | %d new comparables "
        "| %d duplicates | %d invalid | %d errors",
        rows_read, len(new_land), len(new_comps),
        skipped_dup, skipped_invalid, errors,
    )

    if dry_run:
        log.info("Dry-run: no files written")
        return {
            "rows_read": rows_read,
            "new_land": len(new_land),
            "new_comparables": len(new_comps),
            "skipped_duplicates": skipped_dup,
            "skipped_invalid": skipped_invalid,
            "errors": errors,
            "dry_run": True,
        }

    # ── Persist ──────────────────────────────────────────────────────────────
    run_ts = datetime.now(timezone.utc).isoformat()

    if new_land:
        land_data.setdefault("properties", []).extend(new_land)
        land_data.setdefault("metadata", {}).update({
            "last_csv_ingested": run_ts,
            "land_filtered": len(land_data["properties"]),
        })
        LAND_FILE.write_text(json.dumps(land_data, indent=2), encoding="utf-8")
        log.info("Saved %d new land records → %s", len(new_land), LAND_FILE.name)
    else:
        log.info("No new land records to save.")

    if new_comps:
        comp_data.setdefault("properties", []).extend(new_comps)
        comp_data.setdefault("metadata", {}).update({
            "last_csv_ingested": run_ts,
            "comparables_saved": len(comp_data["properties"]),
        })
        COMP_FILE.write_text(json.dumps(comp_data, indent=2), encoding="utf-8")
        log.info("Saved %d new comparables → %s", len(new_comps), COMP_FILE.name)
    else:
        log.info("No new comparables to save.")

    return {
        "rows_read": rows_read,
        "new_land": len(new_land),
        "new_comparables": len(new_comps),
        "skipped_duplicates": skipped_dup,
        "skipped_invalid": skipped_invalid,
        "errors": errors,
        "dry_run": False,
    }


# ── CLI entry point ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(description="CSV property ingestion agent")
    parser.add_argument("csv_file", help="Path to the CSV file to ingest")
    parser.add_argument(
        "--limit",
        type=int,
        default=MAX_ROWS,
        help=f"Max rows to process (default: {MAX_ROWS})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and classify but do not write any files",
    )
    args = parser.parse_args()
    result = run(args.csv_file, limit=args.limit, dry_run=args.dry_run)
    print("\nResult:", json.dumps(result, indent=2))
