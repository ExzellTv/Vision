"""
CSV Import Router
-----------------
Imports Redfin CSV exports into the land_listings MongoDB collection.
Deduplicates by MLS# (id field) — safe to re-run, no duplicates ever added.

Usage:
    POST /api/import/csv?city=Los+Angeles&state=CA
    Body: multipart/form-data with field `file` containing the CSV

After import, clear the city cache so the next search picks up the new data:
    DELETE /api/map/cache?city=Los+Angeles&state=CA
"""

import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pymongo import UpdateOne

from app import mongodb

logger = logging.getLogger(__name__)

router = APIRouter()


def _safe_int(val: str) -> Optional[int]:
    try:
        return int(str(val).replace(",", "").replace("$", "").strip())
    except (ValueError, TypeError):
        return None


def _safe_float(val: str) -> Optional[float]:
    try:
        return float(str(val).replace(",", "").strip())
    except (ValueError, TypeError):
        return None


def _parse_lot_size(val: str) -> Optional[int]:
    """Convert lot size string (sq ft or acres) to integer sq ft."""
    if not val or not val.strip():
        return None
    raw = val.strip().lower()
    try:
        if "acre" in raw:
            num = float(raw.replace("acres", "").replace("acre", "").replace(",", "").strip())
            return int(num * 43560)
        num_str = raw.replace(",", "").replace("sq ft", "").replace("sqft", "").strip()
        return int(float(num_str))
    except (ValueError, TypeError):
        return None


def _csv_row_to_doc(row: dict, city_override: str, state_override: str) -> Optional[dict]:
    """Convert a CSV row dict to a MongoDB land_listings document.

    Returns None if the row should be skipped (missing lat/lng).
    """
    lat = _safe_float(row.get("LATITUDE", ""))
    lng = _safe_float(row.get("LONGITUDE", ""))
    if lat is None or lng is None:
        return None

    mls = (row.get("MLS#") or "").strip()
    url = (row.get("URL") or "").strip()

    # Primary dedup key: MLS#; fallback: URL
    unique_id = mls if mls else url
    if not unique_id:
        return None

    address_street = (row.get("ADDRESS") or "").strip()
    zip_code = str(row.get("ZIP OR POSTAL CODE") or "").strip()

    doc = {
        "id": unique_id,
        "url": url,
        "price": _safe_int(row.get("PRICE", "")),
        "address": {
            "street": address_street,
            "city": city_override,
            "state": state_override,
            "zipcode": zip_code,
        },
        "area": _parse_lot_size(row.get("LOT SIZE", "")),
        "sqFt": _safe_int(row.get("SQUARE FEET", "")),
        "status": (row.get("STATUS") or "").strip(),
        "daysOnMarket": _safe_int(row.get("DAYS ON MARKET", "")),
        "propertyType": (row.get("PROPERTY TYPE") or "").strip(),
        "latitude": lat,
        "longitude": lng,
        "yearBuilt": _safe_int(row.get("YEAR BUILT", "")),
        "source": (row.get("SOURCE") or "").strip(),
        "beds": _safe_int(row.get("BEDS", "")),
        "baths": _safe_float(row.get("BATHS", "")),
        "importedFromCsv": True,
    }
    return doc


@router.post("")
async def import_csv(
    file: UploadFile = File(...),
    city: str = Query(..., description="City name, e.g. 'Los Angeles'"),
    state: str = Query(..., description="State abbreviation, e.g. 'CA'"),
):
    """
    Import a Redfin CSV export into land_listings collection.
    Deduplicates by MLS# — safe to call multiple times with the same file.
    """
    db = mongodb.get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")

    city_override = city.strip()
    state_override = state.upper().strip()[:2]

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handles BOM from Excel-saved CSVs
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    operations = []
    skipped = 0

    for row in reader:
        doc = _csv_row_to_doc(row, city_override, state_override)
        if doc is None:
            skipped += 1
            continue
        operations.append(
            UpdateOne(
                {"id": doc["id"]},
                {"$set": doc},
                upsert=True,
            )
        )

    if not operations:
        return {
            "inserted": 0,
            "updated": 0,
            "skipped": skipped,
            "total_rows": skipped,
            "city": city_override,
            "state": state_override,
        }

    result = await db["land_listings"].bulk_write(operations, ordered=False)

    inserted = result.upserted_count
    updated = result.modified_count

    logger.info(
        "[csv_import] city=%s state=%s inserted=%d updated=%d skipped=%d",
        city_override, state_override, inserted, updated, skipped,
    )

    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "total_rows": inserted + updated + skipped,
        "city": city_override,
        "state": state_override,
        "note": "Call DELETE /api/map/cache?city={city}&state={state} to clear stale cache.",
    }
