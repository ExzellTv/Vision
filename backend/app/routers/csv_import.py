"""
CSV Import Router
-----------------
Imports Redfin CSV exports into MongoDB.

  type=land  (default) → land_listings collection
  type=comps           → comparables collection

Deduplicates by MLS# (id field) — safe to re-run, no duplicates ever added.

Usage:
    POST /api/import/csv?city=Los+Angeles&state=CA&type=land
    POST /api/import/csv?city=Akron&state=OH&type=comps
    Body: multipart/form-data with field `file` containing the CSV

After import, clear the city cache so the next search picks up the new data:
    DELETE /api/map/cache?city=Los+Angeles&state=CA
"""

import asyncio
import csv
import io
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
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


def _get_url(row: dict) -> str:
    """Extract URL from a CSV row — handles Redfin's long column name."""
    for key in row:
        if key.strip().upper().startswith("URL"):
            val = (row[key] or "").strip()
            if val:
                return val
    return ""


def _csv_row_to_land_doc(row: dict, city_override: str, state_override: str) -> Optional[dict]:
    """Convert a CSV row to a land_listings document. Returns None if lat/lng missing."""
    lat = _safe_float(row.get("LATITUDE", ""))
    lng = _safe_float(row.get("LONGITUDE", ""))
    if lat is None or lng is None:
        return None

    mls = (row.get("MLS#") or "").strip()
    url = _get_url(row)
    unique_id = mls if mls else url
    if not unique_id:
        return None

    return {
        "id": unique_id,
        "url": url,
        "price": _safe_int(row.get("PRICE", "")),
        "address": {
            "street": (row.get("ADDRESS") or "").strip(),
            "city": city_override,
            "state": state_override,
            "zipcode": str(row.get("ZIP OR POSTAL CODE") or "").strip(),
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


def _csv_row_to_comp_doc(row: dict, city_override: str, state_override: str) -> Optional[dict]:
    """Convert a CSV row to a comparables document. Returns None if lat/lng missing."""
    lat = _safe_float(row.get("LATITUDE", ""))
    lng = _safe_float(row.get("LONGITUDE", ""))
    if lat is None or lng is None:
        return None

    mls = (row.get("MLS#") or "").strip()
    url = _get_url(row)
    unique_id = mls if mls else url
    if not unique_id:
        return None

    price = _safe_int(row.get("PRICE", ""))
    area  = _safe_int(row.get("SQUARE FEET", ""))

    return {
        "id": unique_id,
        "url": url,
        "price": price,
        "address": {
            "street": (row.get("ADDRESS") or "").strip(),
            "city": city_override,
            "state": state_override,
            "zipcode": str(row.get("ZIP OR POSTAL CODE") or "").strip(),
        },
        "area": area,
        "sqFtLot": _parse_lot_size(row.get("LOT SIZE", "")),
        "status": (row.get("STATUS") or "").strip(),
        "daysOnMarket": _safe_int(row.get("DAYS ON MARKET", "")),
        "propertyType": (row.get("PROPERTY TYPE") or "").strip(),
        "latitude": lat,
        "longitude": lng,
        "yearBuilt": _safe_int(row.get("YEAR BUILT", "")),
        "lastSoldDate": (row.get("SOLD DATE") or row.get("CLOSE DATE") or "").strip() or None,
        "beds": _safe_int(row.get("BEDS", "")),
        "baths": _safe_float(row.get("BATHS", "")),
        "importedFromCsv": True,
    }


@router.post("")
async def import_csv(
    file: UploadFile = File(...),
    city: str = Query(..., description="City name, e.g. 'Los Angeles'"),
    state: str = Query(..., description="State abbreviation, e.g. 'CA'"),
    type: str = Query("land", description="'land' → land_listings, 'comps' → comparables"),
):
    """
    Import a Redfin CSV export into MongoDB.
      type=land  → land_listings collection (default)
      type=comps → comparables collection
    Deduplicates by MLS# — safe to call multiple times with the same file.
    """
    import_type = type.lower().strip()
    if import_type not in ("land", "comps"):
        raise HTTPException(status_code=400, detail="type must be 'land' or 'comps'")

    db = mongodb.get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")

    city_override  = city.strip()
    state_override = state.upper().strip()[:2]
    collection     = "land_listings" if import_type == "land" else "comparables"

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")  # handles BOM from Excel-saved CSVs
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    operations = []
    skipped = 0

    row_fn = _csv_row_to_land_doc if import_type == "land" else _csv_row_to_comp_doc

    for row in reader:
        doc = row_fn(row, city_override, state_override)
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
            "collection": collection,
        }

    result = await db[collection].bulk_write(operations, ordered=False)

    inserted = result.upserted_count
    updated  = result.modified_count

    logger.info(
        "[csv_import] collection=%s city=%s state=%s inserted=%d updated=%d skipped=%d",
        collection, city_override, state_override, inserted, updated, skipped,
    )

    return {
        "inserted": inserted,
        "updated": updated,
        "skipped": skipped,
        "total_rows": inserted + updated + skipped,
        "city": city_override,
        "state": state_override,
        "collection": collection,
        "note": f"Call DELETE /api/map/cache?city={city_override}&state={state_override} to clear stale cache.",
    }


# ── Land property-type keywords (mirrors map_data.py LAND_TYPES) ─────────────
_LAND_TYPES = {
    "land", "lot/land", "lots/land", "vacant land", "farm", "farm and ranch",
    "lot", "lots", "land/lot", "land/lots", "vacant lot", "vacant lots",
    "residential land", "commercial land", "industrial land",
    "unimproved land", "raw land", "acreage",
}


def _detect_collection(prop_type: str) -> str:
    """Return 'land_listings' or 'comparables' based on Redfin PROPERTY TYPE value."""
    return "land_listings" if prop_type.lower().strip() in _LAND_TYPES else "comparables"


def _parse_csv_text(text: str) -> tuple[list[tuple[str, UpdateOne]], int, set[tuple[str, str]]]:
    """Parse CSV text into (operations, skipped, cities_touched).
    cities_touched is a set of (city_key, state) tuples for cache merging."""
    reader = csv.DictReader(io.StringIO(text))
    operations: list[tuple[str, UpdateOne]] = []
    cities_touched: set[tuple[str, str]] = set()
    skipped = 0

    for row in reader:
        lat = _safe_float(row.get("LATITUDE", ""))
        lng = _safe_float(row.get("LONGITUDE", ""))
        if lat is None or lng is None:
            skipped += 1
            continue

        mls = (row.get("MLS#") or "").strip()
        url = _get_url(row)
        unique_id = mls if mls else url
        if not unique_id:
            skipped += 1
            continue

        # Auto-detect city and state from the CSV row
        city  = (row.get("CITY") or row.get("CITY/TOWN") or "").strip().title()
        state = (row.get("STATE OR PROVINCE") or row.get("STATE") or "").strip().upper()[:2]
        if not city or not state:
            skipped += 1
            continue

        prop_type  = (row.get("PROPERTY TYPE") or "").strip()
        collection = _detect_collection(prop_type)

        if collection == "land_listings":
            doc = _csv_row_to_land_doc(row, city, state)
        else:
            doc = _csv_row_to_comp_doc(row, city, state)

        if doc is None:
            skipped += 1
            continue

        cities_touched.add((city.lower().strip(), state))
        operations.append((collection, UpdateOne({"id": doc["id"]}, {"$set": doc}, upsert=True)))

    return operations, skipped, cities_touched


class FolderImportRequest(BaseModel):
    path: str


@router.post("/folder")
async def import_folder(body: FolderImportRequest):
    """
    Import all CSV files in a folder into MongoDB.
    City, state, and collection (land_listings vs comparables) are auto-detected
    from each row's CITY, STATE OR PROVINCE, and PROPERTY TYPE columns.
    No query params needed — just point it at a folder.
    """
    db = mongodb.get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="MongoDB not connected")

    folder = Path(body.path.strip())
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(status_code=400, detail=f"Folder not found: {folder}")

    csv_files = sorted(folder.glob("*.csv"))
    if not csv_files:
        raise HTTPException(status_code=400, detail=f"No CSV files found in {folder}")

    land_ops:  list[UpdateOne] = []
    comp_ops:  list[UpdateOne] = []
    total_skipped = 0
    all_cities: set[tuple[str, str]] = set()

    for csv_path in csv_files:
        logger.info("[folder_import] reading %s", csv_path.name)
        try:
            raw = csv_path.read_bytes()
            try:
                text = raw.decode("utf-8-sig")
            except UnicodeDecodeError:
                text = raw.decode("latin-1")
        except Exception as exc:
            logger.warning("[folder_import] could not read %s: %s", csv_path.name, exc)
            continue

        ops, skipped, cities = _parse_csv_text(text)
        total_skipped += skipped
        all_cities.update(cities)

        for collection, op in ops:
            if collection == "land_listings":
                land_ops.append(op)
            else:
                comp_ops.append(op)

    # Bulk write both collections
    land_inserted = land_updated = comp_inserted = comp_updated = 0

    if land_ops:
        r = await db["land_listings"].bulk_write(land_ops, ordered=False)
        land_inserted = r.upserted_count
        land_updated  = r.modified_count

    if comp_ops:
        r = await db["comparables"].bulk_write(comp_ops, ordered=False)
        comp_inserted = r.upserted_count
        comp_updated  = r.modified_count

    # ── Merge new docs into existing cache entries (no cache clear needed) ──
    # For each city touched, if a cache entry exists, append any new docs that
    # aren't already in the cache. Existing scraped data is never removed.
    from app.routers.map_data import _normalize_land, _normalize_comp
    from datetime import datetime, timezone
    cache_merged: list[str] = []

    for city_key, state in all_cities:
        try:
            city_variants = list({city_key, city_key.title(), city_key.upper(), city_key.lower()})
            cached = await db["city_search_cache"].find_one(
                {"city": city_key, "state": state},
                {"_id": 0, "comparables": 1, "land": 1, "centroid": 1, "cache_version": 1},
            )
            if not cached:
                continue  # no cache yet — will be built fresh on next search

            # Fetch all docs for this city from the permanent collections
            land_cursor = db["land_listings"].find(
                {"address.city": {"$in": city_variants},
                 "latitude": {"$exists": True, "$ne": None},
                 "longitude": {"$exists": True, "$ne": None}},
                limit=1000,
            )
            comp_cursor = db["comparables"].find(
                {"address.city": {"$in": city_variants},
                 "latitude": {"$exists": True, "$ne": None},
                 "longitude": {"$exists": True, "$ne": None}},
                limit=500,
            )
            land_docs, comp_docs = await asyncio.gather(
                land_cursor.to_list(1000),
                comp_cursor.to_list(500),
            )

            # Build id sets from current cache to avoid duplicates
            cached_land_ids  = {p.get("id") for p in (cached.get("land")  or [])}
            cached_comp_ids  = {p.get("id") for p in (cached.get("comparables") or [])}

            new_land  = [_normalize_land(d) for d in land_docs if str(d.get("id") or d.get("_id", "")) not in cached_land_ids]
            new_comps = [_normalize_comp(d) for d in comp_docs if str(d.get("id") or d.get("_id", "")) not in cached_comp_ids]

            if new_land or new_comps:
                merged_land  = (cached.get("land")  or []) + new_land
                merged_comps = (cached.get("comparables") or []) + new_comps
                await db["city_search_cache"].update_one(
                    {"city": city_key, "state": state},
                    {"$set": {
                        "land":        merged_land[:1000],
                        "comparables": merged_comps[:500],
                        "cached_at":   datetime.now(timezone.utc),
                    }},
                )
                cache_merged.append(f"{city_key.title()}, {state} (+{len(new_land)} land, +{len(new_comps)} comps)")
                logger.info("[folder_import] cache merged for %s, %s", city_key, state)
        except Exception as exc:
            logger.warning("[folder_import] cache merge failed for %s, %s: %s", city_key, state, exc)

    total_inserted = land_inserted + comp_inserted
    total_updated  = land_updated  + comp_updated

    logger.info(
        "[folder_import] files=%d land=%d+%d comps=%d+%d skipped=%d",
        len(csv_files), land_inserted, land_updated, comp_inserted, comp_updated, total_skipped,
    )

    return {
        "files_processed": len(csv_files),
        "land_listings":  {"inserted": land_inserted, "updated": land_updated},
        "comparables":    {"inserted": comp_inserted, "updated": comp_updated},
        "total_inserted": total_inserted,
        "total_updated":  total_updated,
        "skipped":        total_skipped,
        "cache_merged":   cache_merged,
    }
