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
import asyncio
import http.client
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import certifi
from fastapi import APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

router = APIRouter()

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
    area  = doc.get("area")
    addr  = doc.get("address") or {}

    # ── lot_sf: prefer real data from MongoDB, fall back to estimate ──
    if area and area > 0:
        lot_sf = int(area)
    elif price > 0:
        # Fallback for the ~8 listings without area data.
        est_sf = price / 15.0
        lot_sf = max(2000, min(int(est_sf), 50000))
    else:
        lot_sf = 0

    acres = round(lot_sf / 43560, 2) if lot_sf > 0 else None

    # ── Redfin listing URL — pass through only if it looks valid ──
    raw_url = doc.get("url") or ""
    listing_url = raw_url if raw_url.startswith("http") else None

    return {
        "id":             str(doc.get("id") or doc.get("_id", "")),
        "lat":            doc.get("latitude"),
        "lng":            doc.get("longitude"),
        "price":          price,
        "lot_sf":         lot_sf,
        "acres":          acres,
        "zoning":         doc.get("zoning") or "N/A",
        "address":        f"{addr.get('street', '')}, {addr.get('city', '')}".strip(", "),
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
      6. Centroid always returned (from Nominatim) even if HasData yields nothing
    """
    HASDATA_KEY = "97402f5b-37b8-468a-af04-adeffb9ee9aa"
    MAX_ZIPS    = 8

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

    # city_name variants for exact-match queries (Atlas M0 blocks $regex)
    city_variants = list({city.strip(), city.strip().title(), city.strip().upper(), city.strip().lower()})

    # ── Cache check: return MongoDB-cached results if available ───────────
    # Re-enrich stale entries that are missing comps or land from the raw collections.
    try:
        db = _get_db()
        if db is not None:
            cached = await db["city_search_cache"].find_one(
                {"city": city_key, "state": state_abbr},
                {"_id": 0, "comparables": 1, "land": 1, "centroid": 1},
            )
            if cached:
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
                            "comparables": cached_comps,
                            "land":        cached_land,
                            "cached_at":   datetime.now(timezone.utc),
                        }},
                    )
                return {
                    "comparables": cached_comps,
                    "land":        cached_land,
                    "centroid":    cached.get("centroid"),
                }
    except Exception:
        pass  # cache miss — continue to live fetch

    # ── Check existing comparables/land_listings collections first ───────
    # Dallas (and any other city imported directly into MongoDB) lives here.
    # If found, normalize, save to city_search_cache, and return — no API call needed.
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
                loop = asyncio.get_event_loop()
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
                            "city":        city_key,
                            "state":       state_abbr,
                            "comparables": comparables,
                            "land":        land_listings,
                            "centroid":    centroid,
                            "cached_at":   datetime.now(timezone.utc),
                        }},
                        upsert=True,
                    )
                except Exception:
                    pass
                return result
    except Exception:
        pass  # fall through to HasData

    def _fetch_zips(city_name: str, state_code: str) -> list[str]:
        """Synchronous call to zippopotam.us — runs in threadpool."""
        try:
            conn = http.client.HTTPSConnection("api.zippopotam.us", timeout=6)
            conn.request("GET", f"/us/{state_code}/{city_name.replace(' ', '%20')}")
            res  = conn.getresponse()
            if res.status != 200:
                return []
            body = json.loads(res.read().decode("utf-8"))
            return [p["post code"] for p in body.get("places", [])]
        except Exception:
            return []

    def _fetch_hasdata(keyword: str) -> list[dict]:
        """Synchronous HasData call for one keyword (zip or city) — runs in threadpool."""
        try:
            conn = http.client.HTTPSConnection("api.hasdata.com", timeout=15)
            conn.request(
                "GET",
                f"/scrape/redfin/listing?keyword={keyword}&type=forSale",
                headers={
                    "x-api-key":    HASDATA_KEY,
                    "Content-Type": "application/json",
                },
            )
            res  = conn.getresponse()
            body = json.loads(res.read().decode("utf-8"))
            return body.get("properties", [])
        except Exception:
            return []

    loop = asyncio.get_event_loop()

    # ── 1. Resolve zips + centroid in parallel ────────────────────────────
    zips, nominatim_centroid = await asyncio.gather(
        loop.run_in_executor(None, _fetch_zips, city, state_abbr),
        loop.run_in_executor(None, _fetch_nominatim_centroid, city, state_abbr),
    )

    zips = zips[:MAX_ZIPS]

    # ── 2. Fetch listings for each zip ────────────────────────────────────
    all_props: list[dict] = []
    for z in zips:
        props = await loop.run_in_executor(None, _fetch_hasdata, z)
        all_props.extend(props)

    # ── 2b. Fallback: search by "City ST" keyword if zip lookup found nothing ─
    if not all_props:
        direct = await loop.run_in_executor(None, _fetch_hasdata, f"{city} {state_abbr}")
        all_props.extend(direct)
    if not all_props:
        direct2 = await loop.run_in_executor(None, _fetch_hasdata, f"{city}, {state_abbr}")
        all_props.extend(direct2)

    # ── 3. Split and normalize ────────────────────────────────────────────
    comparables: list[dict] = []
    land_listings: list[dict] = []

    for prop in all_props:
        if prop.get("latitude") is None or prop.get("longitude") is None:
            continue
        prop_type = (prop.get("propertyType") or "").lower()
        if prop_type == "land":
            land_listings.append(_normalize_land(prop))
        else:
            comparables.append(_normalize_comp(prop))

    # ── 4. Centroid: prefer Nominatim (always accurate), fall back to avg ─
    centroid = nominatim_centroid
    if not centroid:
        anchor = comparables or land_listings
        if anchor:
            centroid = {
                "lat": round(sum(p["lat"] for p in anchor) / len(anchor), 6),
                "lng": round(sum(p["lng"] for p in anchor) / len(anchor), 6),
            }

    result = {
        "comparables": comparables[:500],
        "land":        land_listings[:500],
        "centroid":    centroid,
    }

    # ── Save to MongoDB cache for future searches ─────────────────────────
    if comparables or land_listings:
        try:
            db = _get_db()
            if db is not None:
                await db["city_search_cache"].update_one(
                    {"city": city_key, "state": state_abbr},
                    {"$set": {
                        "city":        city_key,
                        "state":       state_abbr,
                        "comparables": result["comparables"],
                        "land":        result["land"],
                        "centroid":    centroid,
                        "cached_at":   datetime.now(timezone.utc),
                    }},
                    upsert=True,
                )
        except Exception:
            pass  # cache write failure is non-fatal

    return result


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
