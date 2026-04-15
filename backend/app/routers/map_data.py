"""
Map Data Router — comparable sales and land listings.

Endpoints:
  GET /api/map/comparables    — residential comp sales, normalized for Leaflet markers
  GET /api/map/land-listings  — vacant land parcels, normalized for Leaflet markers
  GET /api/map/market-stats   — aggregate statistics for the feasibility dashboard

Data source priority:
  1. MongoDB Atlas (when MONGODB_URI is configured)
  2. Local JSON files (Comparables (1).json / Dallas Land Data.json) as fallback
"""
from __future__ import annotations

import json
import logging
import asyncio
import http.client
from urllib.parse import quote

logger = logging.getLogger(__name__)
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import certifi
from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

HASDATA_KEY = settings.hasdata_api_key

# ── Cache version — bump this whenever search logic changes so stale entries
#    are automatically re-fetched on next request. ──────────────────────────
CACHE_VERSION = 6

# ── Land property-type variants returned by HasData / Redfin ─────────────────
LAND_TYPES = {
    "land", "lot/land", "lots/land", "vacant land", "farm", "farm and ranch",
    # Additional Redfin / HasData variants
    "lot", "lots", "land/lot", "land/lots", "vacant lot", "vacant lots",
    "residential land", "commercial land", "industrial land",
    "unimproved land", "raw land", "acreage",
}

# ── Nominatim → Redfin city name normalization ────────────────────────────────
# Nominatim uses official OSM names (e.g. "New York City", borough names) that
# differ from the market names Redfin/HasData index. This maps the raw Nominatim
# value (lowercased) to the correct Redfin search term.
CITY_NORMALIZATIONS: dict[str, str] = {
    "new york city": "New York",
    "manhattan":     "New York",
    "brooklyn":      "New York",
    "queens":        "New York",
    "the bronx":     "New York",
    "bronx":         "New York",
    "staten island": "New York",
}

# ── State-level centroid fallback (geographic center of each state) ──────────
STATE_CENTROIDS: dict[str, tuple[float, float]] = {
    "AL": (32.806671, -86.791130), "AK": (61.370716, -152.404419),
    "AZ": (33.729759, -111.431221), "AR": (34.969704, -92.373123),
    "CA": (36.116203, -119.681564), "CO": (39.059811, -105.311104),
    "CT": (41.597782, -72.755371),  "DE": (39.318523, -75.507141),
    "FL": (27.766279, -81.686783),  "GA": (33.040619, -83.643074),
    "HI": (21.094318, -157.498337), "ID": (44.240459, -114.478828),
    "IL": (40.349457, -88.986137),  "IN": (39.849426, -86.258278),
    "IA": (42.011539, -93.210526),  "KS": (38.526600, -96.726486),
    "KY": (37.668140, -84.670067),  "LA": (31.169960, -91.867805),
    "ME": (44.693947, -69.381927),  "MD": (39.063946, -76.802101),
    "MA": (42.230171, -71.530106),  "MI": (43.326618, -84.536095),
    "MN": (45.694454, -93.900192),  "MS": (32.741646, -89.678696),
    "MO": (38.456085, -92.288368),  "MT": (46.921925, -110.454353),
    "NE": (41.125370, -98.268082),  "NV": (38.313515, -117.055374),
    "NH": (43.452492, -71.563896),  "NJ": (40.298904, -74.521011),
    "NM": (34.840515, -106.248482), "NY": (42.165726, -74.948051),
    "NC": (35.630066, -79.806419),  "ND": (47.528912, -99.784012),
    "OH": (40.388783, -82.764915),  "OK": (35.565342, -96.928917),
    "OR": (44.572021, -122.070938), "PA": (40.590752, -77.209755),
    "RI": (41.680893, -71.511780),  "SC": (33.856892, -80.945007),
    "SD": (44.299782, -99.438828),  "TN": (35.747845, -86.692345),
    "TX": (31.054487, -97.563461),  "UT": (40.150032, -111.862434),
    "VT": (44.045876, -72.710686),  "VA": (37.769337, -78.169968),
    "WA": (47.400902, -121.490494), "WV": (38.491226, -80.954453),
    "WI": (44.268543, -89.616508),  "WY": (42.755966, -107.302490),
    "DC": (38.897438, -77.026817),
}

router = APIRouter()

# ── Global HasData scrape lock — enforces 1 concurrent scrape at a time ─────
# HasData's plan allows only 1 concurrent request. Without this lock, two
# simultaneous city searches fight each other and both get 429 rate-limited.
_hasdata_lock: asyncio.Lock | None = None
_scraping_cities: set[str] = set()   # cities currently being scraped
_background_tasks: set = set()        # strong references — prevents GC killing running tasks

def _get_hasdata_lock() -> asyncio.Lock:
    global _hasdata_lock
    if _hasdata_lock is None:
        _hasdata_lock = asyncio.Lock()
    return _hasdata_lock

# ── JSON fallback cache ────────────────────────────────────────────────────
_ROOT = Path(__file__).resolve().parent.parent.parent.parent  # repo root
_COMP_JSON = _ROOT / "Comparables (1).json"
_LAND_JSON = _ROOT / "Dallas Land Data.json"

_json_cache: dict[str, list[dict] | None] = {"comps": None, "land": None}


def _load_json(path: Path) -> list[dict]:
    """Load a Redfin-export JSON file and return its `properties` array."""
    with open(path, "r") as f:
        data = json.load(f)
    return data.get("properties", data if isinstance(data, list) else [])


def _get_comp_docs_from_json() -> list[dict]:
    if _json_cache["comps"] is None:
        _json_cache["comps"] = _load_json(_COMP_JSON) if _COMP_JSON.exists() else []
    return _json_cache["comps"]


def _get_land_docs_from_json() -> list[dict]:
    if _json_cache["land"] is None:
        _json_cache["land"] = _load_json(_LAND_JSON) if _LAND_JSON.exists() else []
    return _json_cache["land"]


# ── MongoDB client ─────────────────────────────────────────────────────────
_mongo_client: AsyncIOMotorClient | None = None

_mongo_available: bool | None = None  # None = not yet checked


def _get_db():
    """Return the configured MongoDB database, or None if not configured."""
    global _mongo_client
    if not settings.mongodb_uri:
        return None
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(
            settings.mongodb_uri,
            tlsCAFile=certifi.where(),
        )
    return _mongo_client[settings.mongodb_db]


# ── Normalizers ────────────────────────────────────────────────────────────

def _normalize_comp(doc: dict[str, Any]) -> dict[str, Any]:
    """
    Map a MongoDB comparable-sale document to the marker schema expected by
    useLeafletMap and valuationEngine (matches DALLAS_COMPS shape).

    Real MongoDB data notes:
    - yearBuilt is absent for most records. We estimate from price/area
      heuristics: newer builds tend to have higher $/SF.
    - sqFtLot (lot square footage) is absent. We estimate as area * 3 for
      single-family, area * 1.5 for condos/townhouses, clamped to a
      reasonable Dallas range.
    - lastSoldDate is absent. We leave it as None.
    """
    price = doc.get("price") or 0
    area  = doc.get("area") or 0
    beds  = doc.get("beds")
    baths = doc.get("baths")
    addr  = doc.get("address") or {}
    prop_type = doc.get("propertyType") or "House"

    # ── year_built estimation ──
    # If not stored, estimate from price-per-SF bracket (Dallas heuristic).
    year_built = doc.get("yearBuilt")
    if not year_built and area > 0:
        psf = price / area
        if psf > 300:
            year_built = 2022
        elif psf > 220:
            year_built = 2018
        elif psf > 160:
            year_built = 2005
        elif psf > 120:
            year_built = 1990
        else:
            year_built = 1975
    year_built = year_built or 2005

    # ── lot_sf estimation ──
    lot_sf = doc.get("sqFtLot")
    if not lot_sf and area > 0:
        if prop_type in ("Condo", "Townhouse"):
            lot_sf = int(area * 1.5)
        else:
            lot_sf = int(area * 3)
        lot_sf = max(3000, min(lot_sf, 20000))
    lot_sf = lot_sf or 0

    # ── Redfin listing URL — pass through only if it looks valid ──
    raw_url = doc.get("url") or ""
    listing_url = raw_url if raw_url.startswith("http") else None

    return {
        "id":           str(doc.get("id") or doc.get("_id", "")),
        "lat":          doc.get("latitude"),
        "lng":          doc.get("longitude"),
        "sale_price":   price,
        "sf":           area,
        "bedrooms":     beds if beds is not None else 3,
        "bathrooms":    baths if baths is not None else 2,
        "year_built":   year_built,
        "lot_sf":       lot_sf,
        "price_per_sf": round(price / area, 2) if area > 0 else 0,
        "sale_date":    doc.get("lastSoldDate"),
        "address":      f"{addr.get('street', '')}, {addr.get('city', '')}".strip(", "),
        "property_type": prop_type,
        "url":          listing_url,
    }


def _normalize_land(doc: dict[str, Any]) -> dict[str, Any]:
    """
    Map a MongoDB land-listing document to the marker schema expected by
    useLeafletMap (matches DALLAS_LAND shape).

    The `area` field stores lot size in square feet (backfilled from the
    Redfin CSV LOT SIZE column via backfill_lot_sizes.py — 350/358 docs).
    For the handful of documents still missing area, we fall back to a
    price-based estimate.
    """
    price = doc.get("price") or 0

    # HasData returns area under several field names; MongoDB seed uses "area"
    area = (
        doc.get("area") or
        doc.get("lotSize") or
        doc.get("sqFtLot") or
        doc.get("lot_sf") or
        0
    )

    # address can be a dict (MongoDB seed) or a plain string (HasData)
    raw_addr = doc.get("address")
    if isinstance(raw_addr, dict):
        addr_str = f"{raw_addr.get('street', '')}, {raw_addr.get('city', '')}".strip(", ")
    elif isinstance(raw_addr, str):
        addr_str = raw_addr.strip()
    else:
        addr_str = ""

    # ── lot_sf: prefer real data, fall back to price-based estimate ──
    try:
        lot_sf = int(float(area)) if area and float(area) > 0 else 0
    except (ValueError, TypeError):
        lot_sf = 0

    if lot_sf == 0 and price > 0:
        est_sf = price / 15.0
        lot_sf = max(2000, min(int(est_sf), 50000))

    acres = round(lot_sf / 43560, 2) if lot_sf > 0 else None

    # lat/lng coerced to float — HasData sometimes returns as string
    try:
        lat = float(doc.get("latitude") or 0) or None
        lng = float(doc.get("longitude") or 0) or None
    except (ValueError, TypeError):
        lat = lng = None

    # ── Redfin listing URL — pass through only if it looks valid ──
    raw_url = doc.get("url") or ""
    listing_url = raw_url if raw_url.startswith("http") else None

    return {
        "id":             str(doc.get("id") or doc.get("listingId") or doc.get("_id", "")),
        "lat":            lat,
        "lng":            lng,
        "price":          price,
        "lot_sf":         lot_sf,
        "acres":          acres,
        "zoning":         doc.get("zoning") or "N/A",
        "address":        addr_str,
        "status":         doc.get("status") or "Active",
        "topography":     "Level",
        "utilities":      "Unknown",
        "days_on_market": doc.get("daysOnMarket"),
        "listed":         doc.get("listDate"),
        "property_type":  doc.get("propertyType") or "Land",
        "url":            listing_url,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/comparables")
async def get_comparables() -> list[dict]:
    """
    Return up to 500 comparable residential sales, normalized to the flat
    marker schema used by the Leaflet map.
    Tries MongoDB first; falls back to local JSON files.
    """
    try:
        db = _get_db()
        if db is not None:
            cursor = db["comparables"].find(
                {
                    "latitude":  {"$exists": True, "$ne": None},
                    "longitude": {"$exists": True, "$ne": None},
                },
                {
                    "_id": 1, "id": 1,
                    "latitude": 1, "longitude": 1,
                    "price": 1, "area": 1,
                    "beds": 1, "baths": 1,
                    "address": 1,
                    "yearBuilt": 1, "sqFtLot": 1, "lastSoldDate": 1,
                    "propertyType": 1,
                    "url": 1,
                },
            ).limit(500)
            docs = await cursor.to_list(length=500)
            return [_normalize_comp(d) for d in docs]
    except HTTPException:
        raise
    except Exception:
        pass  # fall through to JSON

    # JSON fallback
    docs = _get_comp_docs_from_json()
    return [
        _normalize_comp(d) for d in docs
        if d.get("latitude") is not None and d.get("longitude") is not None
    ][:500]


@router.get("/land-listings")
async def get_land_listings() -> list[dict]:
    """
    Return up to 500 vacant land listings, normalized to the flat
    marker schema used by the Leaflet map.
    Tries MongoDB first; falls back to local JSON files.
    """
    try:
        db = _get_db()
        if db is not None:
            cursor = db["land_listings"].find(
                {
                    "latitude":  {"$exists": True, "$ne": None},
                    "longitude": {"$exists": True, "$ne": None},
                },
                {
                    "_id": 1, "id": 1,
                    "latitude": 1, "longitude": 1,
                    "price": 1, "area": 1,
                    "address": 1,
                    "status": 1, "daysOnMarket": 1,
                    "zoning": 1, "listDate": 1,
                    "propertyType": 1,
                    "url": 1,
                },
            ).limit(500)
            docs = await cursor.to_list(length=500)
            return [_normalize_land(d) for d in docs]
    except HTTPException:
        raise
    except Exception:
        pass  # fall through to JSON

    # JSON fallback
    docs = _get_land_docs_from_json()
    return [
        _normalize_land(d) for d in docs
        if d.get("latitude") is not None and d.get("longitude") is not None
    ][:500]


def _fetch_nominatim_centroid(city_name: str, state_code: str) -> dict | None:
    """Synchronous Nominatim geocode — runs in threadpool."""
    try:
        conn = http.client.HTTPSConnection("nominatim.openstreetmap.org", timeout=6)
        conn.request(
            "GET",
            f"/search?city={city_name.replace(' ', '%20')}&state={state_code}&country=US&format=json&limit=1",
            headers={"User-Agent": "VisionApp/1.0"},
        )
        body = json.loads(conn.getresponse().read())
        if body:
            return {"lat": float(body[0]["lat"]), "lng": float(body[0]["lon"])}
    except Exception:
        pass
    return None


def _fetch_zips(city_name: str, state_code: str) -> list[str]:
    """Synchronous call to zippopotam.us — runs in threadpool."""
    try:
        conn = http.client.HTTPSConnection("api.zippopotam.us", timeout=6)
        conn.request("GET", f"/us/{state_code}/{city_name.replace(' ', '%20')}")
        res = conn.getresponse()
        if res.status != 200:
            return []
        body = json.loads(res.read().decode("utf-8"))
        return [p["post code"] for p in body.get("places", [])]
    except Exception:
        return []


def _fetch_hasdata_land(keyword: str, max_pages: int = 12, start_page: int = 1) -> tuple[list[dict], int, bool]:
    """Paginated HasData call — fetches up to max_pages pages starting from start_page.
    Returns (props, pages_fetched, was_rate_limited). Sleeps 7s between pages."""
    import time as _time
    all_props: list[dict] = []
    pages_fetched = 0
    rate_limited = False
    for i, page in enumerate(range(start_page, start_page + max_pages)):
        if i > 0:
            _time.sleep(5)
        try:
            conn = http.client.HTTPSConnection("api.hasdata.com", timeout=8)
            conn.request(
                "GET",
                f"/scrape/redfin/listing?keyword={quote(keyword)}&type=forSale&page={page}",
                headers={"x-api-key": HASDATA_KEY, "Content-Type": "application/json"},
            )
            res       = conn.getresponse()
            raw_bytes = res.read()
            if res.status == 429:
                logger.warning("[HasData] zip=%r page=%d rate-limited (429)", keyword, page)
                rate_limited = True
                break
            if res.status != 200:
                logger.warning("[HasData] zip=%r page=%d HTTP %d — skipping", keyword, page, res.status)
                break
            raw_text = raw_bytes.decode("utf-8").strip()
            if not raw_text:
                logger.warning("[HasData] zip=%r page=%d empty response — skipping", keyword, page)
                break
            body = json.loads(raw_text)
            if "error" in body or ("message" in body and not body.get("properties")):
                logger.warning("[HasData] zip=%r page=%d error: %s", keyword, page, body.get("error") or body.get("message", ""))
                break
            props = body.get("properties", [])
            pages_fetched += 1
            logger.info("[HasData] zip=%r page=%d → %d props", keyword, page, len(props))
            if not props:
                break
            all_props.extend(props)
        except Exception as exc:
            logger.warning("[HasData] zip=%r page=%d exception: %s", keyword, page, exc)
            break
    return all_props, pages_fetched, rate_limited


async def _scrape_city_background(
    city: str, city_key: str, state_abbr: str,
    city_variants: list[str], zips: list[str],
    centroid: dict | None, scrape_key: str,
) -> None:
    """Background task: scrapes HasData for a city and saves to MongoDB.
    Runs after search_by_city returns so the frontend never waits on it."""
    from pymongo import UpdateOne as _UpdateOne
    try:
        loop = asyncio.get_running_loop()

        # Build per-zip CSV start pages
        REDFIN_PAGE_SIZE = 42
        zip_start_pages: dict[str, int] = {}
        try:
            _db = _get_db()
            if _db is not None:
                _pipeline = [
                    {"$match": {"address.city": {"$in": city_variants}, "address.zipcode": {"$exists": True, "$ne": None}}},
                    {"$group": {"_id": "$address.zipcode", "count": {"$sum": 1}}},
                ]
                _zip_counts = await _db["land_listings"].aggregate(_pipeline).to_list(None)
                for _entry in _zip_counts:
                    _z = str(_entry["_id"]).strip()
                    _n = _entry["count"]
                    if _z:
                        zip_start_pages[_z] = (_n // REDFIN_PAGE_SIZE) + 1
        except Exception as _exc:
            logger.warning("[BG] failed to build zip start pages: %s", _exc)

        all_props: list[dict] = []
        MAX_CREDITS = 75
        credits_used = 0

        async with _get_hasdata_lock():
            logger.info("[BG] acquired scrape lock for %s, %s", city, state_abbr)
            for z in zips:
                if credits_used >= MAX_CREDITS:
                    logger.info("[BG] credit cap reached — stopping zip search for %s", city)
                    break
                start_page = zip_start_pages.get(z, 1)
                if start_page > 9:
                    continue
                # Cap at 2 pages per zip — land listings rarely exceed 84 per zip.
                # Keeps scrape time manageable while covering all zips.
                pages_allowed = min(2, MAX_CREDITS - credits_used)
                batch, pages_used, was_429 = await loop.run_in_executor(
                    None, _fetch_hasdata_land, z, pages_allowed, start_page
                )
                credits_used += pages_used
                all_props.extend(batch)
                logger.info("[BG] zip=%s → %d props (credits: %d/%d)", z, len(batch), credits_used, MAX_CREDITS)
                if was_429:
                    await asyncio.sleep(15)
                elif pages_used == 0:
                    # Zip returned nothing — short gap before next zip
                    await asyncio.sleep(2)
                else:
                    # 6s = minimum safe gap for 10 req/min rate limit
                    await asyncio.sleep(6)

        # Deduplicate
        seen_ids: set = set()
        unique_props: list[dict] = []
        for p in all_props:
            pid = p.get("id") or p.get("listingId") or p.get("url") or id(p)
            if pid not in seen_ids:
                seen_ids.add(pid)
                unique_props.append(p)
        all_props = unique_props

        # Split into land vs comps
        comparables: list[dict] = []
        land_listings: list[dict] = []
        for prop in all_props:
            if prop.get("latitude") is None or prop.get("longitude") is None:
                continue
            prop_type = (prop.get("propertyType") or "").lower()
            try:
                if prop_type in LAND_TYPES:
                    n = _normalize_land(prop)
                    if n.get("lat") and n.get("lng"):
                        land_listings.append(n)
                else:
                    n = _normalize_comp(prop)
                    if n.get("lat") and n.get("lng"):
                        comparables.append(n)
            except Exception as exc:
                logger.warning("[BG] normalize error: %s", exc)

        # Recalculate centroid from data if Nominatim didn't return one
        if not centroid:
            anchor = comparables or land_listings
            if anchor:
                centroid = {
                    "lat": round(sum(p["lat"] for p in anchor) / len(anchor), 6),
                    "lng": round(sum(p["lng"] for p in anchor) / len(anchor), 6),
                }

        logger.info("[BG] %s, %s — %d comps, %d land", city, state_abbr, len(comparables), len(land_listings))

        db = _get_db()
        if db is None:
            return

        # Persist land to land_listings permanently
        if all_props:
            land_ops = []
            for prop in all_props:
                if (prop.get("propertyType") or "").lower() not in LAND_TYPES:
                    continue
                unique_id = prop.get("id") or prop.get("listingId") or prop.get("url")
                if not unique_id:
                    continue
                raw_addr = prop.get("address") or ""
                addr_doc = (
                    raw_addr if isinstance(raw_addr, dict)
                    else {"street": str(raw_addr).strip(), "city": city.strip().title(), "state": state_abbr}
                )
                if isinstance(addr_doc, dict) and not addr_doc.get("city"):
                    addr_doc["city"] = city.strip().title()
                    addr_doc["state"] = state_abbr
                land_ops.append(_UpdateOne(
                    {"id": str(unique_id)},
                    {"$set": {
                        "id": str(unique_id), "url": prop.get("url") or "",
                        "price": prop.get("price"), "address": addr_doc,
                        "latitude": prop.get("latitude"), "longitude": prop.get("longitude"),
                        "area": prop.get("lotSize") or prop.get("sqFtLot") or prop.get("area") or 0,
                        "status": prop.get("status") or "Active",
                        "daysOnMarket": prop.get("daysOnMarket"),
                        "propertyType": prop.get("propertyType") or "Land",
                        "source": "hasdata",
                    }},
                    upsert=True,
                ))
            if land_ops:
                await db["land_listings"].bulk_write(land_ops, ordered=False)
                logger.info("[BG] persisted %d land docs for %s", len(land_ops), city)

        # Save to city_search_cache
        if comparables or land_listings:
            await db["city_search_cache"].update_one(
                {"city": city_key, "state": state_abbr},
                {"$set": {
                    "city": city_key, "state": state_abbr,
                    "comparables": comparables[:500], "land": land_listings[:1000],
                    "centroid": centroid, "cache_version": CACHE_VERSION,
                    "cached_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
            logger.info("[BG] cache saved for %s, %s — scrape complete", city, state_abbr)
        else:
            await db["city_search_cache"].update_one(
                {"city": city_key, "state": state_abbr},
                {"$set": {
                    "city": city_key, "state": state_abbr,
                    "comparables": [], "land": [], "centroid": centroid,
                    "cache_version": CACHE_VERSION,
                    "retry_after": datetime.now(timezone.utc).timestamp() + 3600,
                    "cached_at": datetime.now(timezone.utc),
                }},
                upsert=True,
            )
    except Exception as exc:
        logger.error("[BG] scrape failed for %s, %s: %s", city, state_abbr, exc)
    finally:
        _scraping_cities.discard(scrape_key)
        logger.info("[BG] scrape lock released for %s, %s", city, state_abbr)


@router.get("/search")
async def search_by_city(
    city:  str = Query(..., description="City name, e.g. Detroit"),
    state: str = Query(..., description="State name or abbreviation, e.g. Michigan or MI"),
) -> dict:
    """
    Return live property listings for any US city using the HasData/Redfin API.

    Flow:
      1. Normalize state to 2-letter abbreviation (handles full names like "Michigan" → "MI")
      2. In parallel: resolve zip codes via zippopotam.us AND geocode centroid via Nominatim
      3. For each zip (capped at 8) call HasData scraper
      4. Split results: Land → _normalize_land, everything else → _normalize_comp
      5. Return { comparables, land, centroid }
      6. Centroid always returned (Nominatim → avg coords → state-level fallback)
    """
    MAX_ZIPS    = 25

    # ── State name → 2-letter abbreviation ───────────────────────────────
    STATE_ABBR = {
        "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
        "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
        "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
        "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
        "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
        "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
        "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
        "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
        "new mexico": "NM", "new york": "NY", "north carolina": "NC",
        "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
        "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
        "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
        "vermont": "VT", "virginia": "VA", "washington": "WA",
        "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    }
    state_abbr = STATE_ABBR.get(state.lower().strip(), state.upper().strip()[:2])
    city_key   = city.lower().strip()

    # Normalize Nominatim city names to Redfin market names (e.g. "New York City" → "New York")
    city     = CITY_NORMALIZATIONS.get(city_key, city)
    city_key = city.lower().strip()

    # city_name variants for exact-match queries (Atlas M0 blocks $regex)
    city_variants = list({city.strip(), city.strip().title(), city.strip().upper(), city.strip().lower()})

    # ── Cache check: return MongoDB-cached results if available ───────────
    # Re-enrich stale entries that are missing comps or land from the raw collections.
    try:
        db = _get_db()
        if db is not None:
            cached = await db["city_search_cache"].find_one(
                {"city": city_key, "state": state_abbr},
                {"_id": 0, "comparables": 1, "land": 1, "centroid": 1, "cache_version": 1, "retry_after": 1},
            )
            if cached:
                has_data    = bool(cached.get("comparables") or cached.get("land"))
                retry_after = cached.get("retry_after")
                ttl_expired = retry_after and datetime.now(timezone.utc).timestamp() > retry_after
                version_ok  = cached.get("cache_version") == CACHE_VERSION
                # Serve full-data entries unconditionally (preserves Houston etc. across version bumps).
                # Only re-fetch no-data entries when the version changed or the TTL expired.
                if has_data or (version_ok and not ttl_expired):
                    cached_comps = cached.get("comparables") or []
                    cached_land  = cached.get("land") or []
                    needs_update = False

                    if not cached_land:
                        land_cursor = db["land_listings"].find(
                            {"address.city": {"$in": city_variants},
                             "latitude":  {"$exists": True, "$ne": None},
                             "longitude": {"$exists": True, "$ne": None}},
                            limit=500,
                        )
                        land_docs = await land_cursor.to_list(500)
                        if land_docs:
                            cached_land  = [_normalize_land(d) for d in land_docs]
                            needs_update = True

                    # If still no land after MongoDB check, hit HasData for land —
                    # handles cached cities (e.g. Phoenix) that were saved before
                    # the land-specific fetch was added.
                    if not cached_land:
                        _loop = asyncio.get_running_loop()
                        # Resolve zips for this city to fetch land via zip codes
                        _zips = await _loop.run_in_executor(None, _fetch_zips, city, state_abbr)
                        for _z in _zips:
                            _batch, _, _was_429 = await _loop.run_in_executor(None, _fetch_hasdata_land, _z)
                            for _prop in _batch:
                                if _prop.get("latitude") is None or _prop.get("longitude") is None:
                                    continue
                                _pt = (_prop.get("propertyType") or "").lower()
                                if _pt in LAND_TYPES:
                                    cached_land.append(_normalize_land(_prop))
                        if cached_land:
                            needs_update = True

                    if not cached_comps:
                        comp_cursor = db["comparables"].find(
                            {"address.city": {"$in": city_variants},
                             "latitude":  {"$exists": True, "$ne": None},
                             "longitude": {"$exists": True, "$ne": None}},
                            limit=500,
                        )
                        comp_docs = await comp_cursor.to_list(500)
                        if comp_docs:
                            cached_comps = [_normalize_comp(d) for d in comp_docs]
                            needs_update = True

                    if needs_update:
                        await db["city_search_cache"].update_one(
                            {"city": city_key, "state": state_abbr},
                            {"$set": {
                                "comparables":   cached_comps,
                                "land":          cached_land,
                                "cache_version": CACHE_VERSION,
                                "cached_at":     datetime.now(timezone.utc),
                            }},
                        )
                    return {
                        "comparables": cached_comps,
                        "land":        cached_land,
                        "centroid":    cached.get("centroid"),
                    }
                # else: TTL expired — fall through to live fetch
    except Exception:
        pass  # cache miss — continue to live fetch

    # ── Check existing comparables/land_listings collections first ───────
    # Dallas (and any other city imported directly into MongoDB) lives here.
    # If found, normalize, save to city_search_cache, and return — no API call needed.

    try:
        db = _get_db()
        if db is not None:
            comp_cursor = db["comparables"].find(
                {"address.city": {"$in": city_variants},
                 "latitude":  {"$exists": True, "$ne": None},
                 "longitude": {"$exists": True, "$ne": None}},
                limit=500,
            )
            land_cursor = db["land_listings"].find(
                {"address.city": {"$in": city_variants},
                 "latitude":  {"$exists": True, "$ne": None},
                 "longitude": {"$exists": True, "$ne": None}},
                limit=500,
            )
            comp_docs, land_docs = await asyncio.gather(
                comp_cursor.to_list(500),
                land_cursor.to_list(500),
            )
            if comp_docs or land_docs:
                comparables   = [_normalize_comp(d) for d in comp_docs]
                land_listings = [_normalize_land(d) for d in land_docs]
                loop = asyncio.get_running_loop()
                centroid = await loop.run_in_executor(None, _fetch_nominatim_centroid, city, state_abbr)
                if not centroid:
                    anchor = comparables or land_listings
                    if anchor:
                        centroid = {
                            "lat": round(sum(p["lat"] for p in anchor) / len(anchor), 6),
                            "lng": round(sum(p["lng"] for p in anchor) / len(anchor), 6),
                        }
                result = {"comparables": comparables, "land": land_listings, "centroid": centroid}
                # save to city_search_cache so next request is instant
                try:
                    await db["city_search_cache"].update_one(
                        {"city": city_key, "state": state_abbr},
                        {"$set": {
                            "city":          city_key,
                            "state":         state_abbr,
                            "comparables":   comparables,
                            "land":          land_listings,
                            "centroid":      centroid,
                            "cache_version": CACHE_VERSION,
                            "cached_at":     datetime.now(timezone.utc),
                        }},
                        upsert=True,
                    )
                except Exception:
                    pass
                return result
    except Exception:
        pass  # fall through to HasData

    loop = asyncio.get_running_loop()

    # ── 1. Resolve zips + centroid in parallel ────────────────────────────
    zips, nominatim_centroid = await asyncio.gather(
        loop.run_in_executor(None, _fetch_zips, city, state_abbr),
        loop.run_in_executor(None, _fetch_nominatim_centroid, city, state_abbr),
    )

    zips = zips[:MAX_ZIPS]

    ABBR_TO_STATE = {v: k.title() for k, v in STATE_ABBR.items()}
    full_state = ABBR_TO_STATE.get(state_abbr, "")

    # ── 2. Return immediately with centroid — fire HasData scrape in background ─
    # The scrape can take minutes (25 zips × 7s gap). Returning immediately
    # prevents frontend socket timeouts. The background task saves results to
    # land_listings + city_search_cache so the NEXT search gets full data instantly.
    centroid = nominatim_centroid
    if not centroid and state_abbr in STATE_CENTROIDS:
        lat, lng = STATE_CENTROIDS[state_abbr]
        centroid = {"lat": lat, "lng": lng}

    city_scrape_key = f"{city_key},{state_abbr}"
    if city_scrape_key not in _scraping_cities:
        _scraping_cities.add(city_scrape_key)
        task = asyncio.create_task(
            _scrape_city_background(
                city=city, city_key=city_key, state_abbr=state_abbr,
                city_variants=city_variants, zips=zips, centroid=centroid,
                scrape_key=city_scrape_key,
            )
        )
        # Hold a strong reference so Python's GC doesn't kill the task mid-scrape
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
        logger.info("[HasData] background scrape started for %s, %s", city, state_abbr)
    else:
        logger.info("[HasData] scrape already in progress for %s, %s — skipping duplicate", city, state_abbr)

    return {"comparables": [], "land": [], "centroid": centroid}


@router.delete("/cache")
async def clear_city_cache(
    city:  str = Query(..., description="City name, e.g. Phoenix"),
    state: str = Query(..., description="State abbreviation, e.g. AZ"),
) -> dict:
    """
    Delete a city's cache entry from city_search_cache so the next search
    does a full fresh fetch from HasData and re-plots all land and properties.
    """
    try:
        db = _get_db()
        if db is None:
            raise HTTPException(status_code=503, detail="MongoDB not available")
        city_key   = city.lower().strip()
        state_abbr = state.upper().strip()[:2]
        result = await db["city_search_cache"].delete_one(
            {"city": city_key, "state": state_abbr}
        )
        if result.deleted_count:
            logger.info("[map_data] Cache cleared for %s, %s", city_key, state_abbr)
            return {"cleared": True, "city": city_key, "state": state_abbr}
        else:
            return {"cleared": False, "detail": "No cache entry found — will fetch fresh on next search"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/market-stats")
async def get_market_stats() -> dict:
    """
    Aggregate statistics from both collections for the feasibility dashboard.
    Tries MongoDB first; falls back to local JSON files.
    """
    def _median(values: list) -> float:
        if not values:
            return 0
        s = sorted(values)
        n = len(s)
        return (s[n // 2] + s[(n - 1) // 2]) / 2

    # ── Try MongoDB first ──
    try:
        db = _get_db()
        if db is not None:
            comp_pipeline = [
                {"$match": {"price": {"$gt": 0}, "area": {"$gt": 0},
                            "latitude": {"$ne": None}, "longitude": {"$ne": None}}},
                {"$group": {
                    "_id":       None,
                    "count":     {"$sum": 1},
                    "avgPrice":  {"$avg": "$price"},
                    "minPrice":  {"$min": "$price"},
                    "maxPrice":  {"$max": "$price"},
                    "avgArea":   {"$avg": "$area"},
                    "avgBeds":   {"$avg": "$beds"},
                    "avgBaths":  {"$avg": "$baths"},
                    "avgLat":    {"$avg": "$latitude"},
                    "avgLng":    {"$avg": "$longitude"},
                    "prices":    {"$push": "$price"},
                }},
            ]
            comp_agg = await db["comparables"].aggregate(comp_pipeline).to_list(1)

            land_pipeline = [
                {"$match": {"price": {"$gt": 0},
                            "latitude": {"$ne": None}, "longitude": {"$ne": None}}},
                {"$group": {
                    "_id":       None,
                    "count":     {"$sum": 1},
                    "avgPrice":  {"$avg": "$price"},
                    "minPrice":  {"$min": "$price"},
                    "maxPrice":  {"$max": "$price"},
                    "prices":    {"$push": "$price"},
                }},
            ]
            land_agg = await db["land_listings"].aggregate(land_pipeline).to_list(1)

            comp_data = comp_agg[0] if comp_agg else {}
            land_data = land_agg[0] if land_agg else {}
            comp_prices = comp_data.pop("prices", [])
            land_prices = land_data.pop("prices", [])

            return {
                "comparables": {
                    "count":       comp_data.get("count", 0),
                    "avgPrice":    round(comp_data.get("avgPrice", 0), 0),
                    "medianPrice": round(_median(comp_prices), 0),
                    "minPrice":    comp_data.get("minPrice", 0),
                    "maxPrice":    comp_data.get("maxPrice", 0),
                    "avgArea":     round(comp_data.get("avgArea", 0), 0),
                    "avgBeds":     round(comp_data.get("avgBeds", 0), 1),
                    "avgBaths":    round(comp_data.get("avgBaths", 0), 1),
                    "centroidLat": round(comp_data.get("avgLat", 32.7767), 6),
                    "centroidLng": round(comp_data.get("avgLng", -96.797), 6),
                },
                "land": {
                    "count":       land_data.get("count", 0),
                    "avgPrice":    round(land_data.get("avgPrice", 0), 0),
                    "medianPrice": round(_median(land_prices), 0),
                    "minPrice":    land_data.get("minPrice", 0),
                    "maxPrice":    land_data.get("maxPrice", 0),
                },
            }
    except HTTPException:
        raise
    except Exception:
        pass  # fall through to JSON

    # ── JSON fallback ──
    comp_docs = [
        d for d in _get_comp_docs_from_json()
        if (d.get("price") or 0) > 0 and (d.get("area") or 0) > 0
        and d.get("latitude") is not None and d.get("longitude") is not None
    ]
    land_docs = [
        d for d in _get_land_docs_from_json()
        if (d.get("price") or 0) > 0
        and d.get("latitude") is not None and d.get("longitude") is not None
    ]

    comp_prices = [d["price"] for d in comp_docs]
    land_prices = [d["price"] for d in land_docs]

    return {
        "comparables": {
            "count":       len(comp_docs),
            "avgPrice":    round(sum(comp_prices) / len(comp_prices), 0) if comp_prices else 0,
            "medianPrice": round(_median(comp_prices), 0),
            "minPrice":    min(comp_prices) if comp_prices else 0,
            "maxPrice":    max(comp_prices) if comp_prices else 0,
            "avgArea":     round(sum(d.get("area", 0) for d in comp_docs) / len(comp_docs), 0) if comp_docs else 0,
            "avgBeds":     round(sum(d.get("beds", 0) or 0 for d in comp_docs) / len(comp_docs), 1) if comp_docs else 0,
            "avgBaths":    round(sum(d.get("baths", 0) or 0 for d in comp_docs) / len(comp_docs), 1) if comp_docs else 0,
            "centroidLat": round(sum(d["latitude"] for d in comp_docs) / len(comp_docs), 6) if comp_docs else 32.7767,
            "centroidLng": round(sum(d["longitude"] for d in comp_docs) / len(comp_docs), 6) if comp_docs else -96.797,
        },
        "land": {
            "count":       len(land_docs),
            "avgPrice":    round(sum(land_prices) / len(land_prices), 0) if land_prices else 0,
            "medianPrice": round(_median(land_prices), 0),
            "minPrice":    min(land_prices) if land_prices else 0,
            "maxPrice":    max(land_prices) if land_prices else 0,
        },
    }
