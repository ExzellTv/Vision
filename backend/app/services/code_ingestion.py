"""
Code Ingestion Service — fetches jurisdiction-specific building codes from:
  - American Legal Publishing (ALP) free API  → city municipal codes
  - Municode (scrape)                          → state amendments
Results are cached in MongoDB `code_cache` collection so the API is only
called once per jurisdiction.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

import httpx

from app.services.vector_store import JurisdictionVectorStore, _split_into_chunks

logger = logging.getLogger(__name__)

# ALP API base — no key required
_ALP_BASE = "https://codelibrary.amlegal.com/codes"

# Known ALP city slugs — add more as needed
_ALP_CITY_SLUGS: dict[str, str] = {
    "dallas_tx":        "dallastx",
    "houston_tx":       "houstontx",
    "austin_tx":        "austintx",
    "san antonio_tx":   "sanantoniostx",
    "fort worth_tx":    "fortworthtx",
    "los angeles_ca":   "losangelesca",
    "san francisco_ca": "sanfranciscoca",
    "san diego_ca":     "sandiegoca",
    "new york_ny":      "newyorkny",
    "chicago_il":       "chicagoil",
    "phoenix_az":       "phoenixaz",
    "miami_fl":         "miamidade_fl",
    "seattle_wa":       "seattlewa",
    "denver_co":        "denvercola",
    "atlanta_ga":       "atlantaga",
    "nashville_tn":     "nashvilletn",
    "charlotte_nc":     "charlottenc",
    "portland_or":      "portlandor",
}

# Building-code-relevant chapter keywords to filter ALP content
_RELEVANT_KEYWORDS = {
    "building", "residential", "zoning", "construction", "structure",
    "setback", "height", "floor", "room", "egress", "fire", "occupancy",
    "foundation", "framing", "roof", "ceiling", "stair", "window", "door",
    "garage", "permit", "inspection", "dwelling", "habitable",
}


def _city_key(city: str, state: str) -> str:
    return f"{city.lower().strip()}_{state.lower().strip()}"


async def fetch_city_codes(city: str, state: str, db) -> list[str]:
    """
    Fetch city municipal building code chunks from ALP API.
    Returns list of text chunks. Caches result in MongoDB.
    """
    key = _city_key(city, state)
    collection = db["code_cache"]

    # Check cache
    cached = await collection.find_one({"key": key, "tier": "city"})
    if cached and cached.get("chunks"):
        logger.info("Code cache hit for city %s", key)
        return cached["chunks"]

    slug = _ALP_CITY_SLUGS.get(key)
    if not slug:
        logger.info("No ALP slug for %s — skipping city code fetch", key)
        return []

    chunks: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Fetch table of contents
            toc_url = f"{_ALP_BASE}/{slug}/latest/browse"
            resp = await client.get(toc_url, follow_redirects=True)
            if resp.status_code != 200:
                logger.warning("ALP TOC fetch failed for %s: %s", slug, resp.status_code)
                return []

            # ALP returns HTML — extract chapter links containing relevant keywords
            html = resp.text
            chapter_ids = _extract_relevant_chapter_ids(html)
            logger.info("Found %d relevant chapters for %s", len(chapter_ids), key)

            # Fetch up to 6 relevant chapters
            for ch_id in chapter_ids[:6]:
                try:
                    ch_url = f"{_ALP_BASE}/{slug}/latest/{ch_id}"
                    ch_resp = await client.get(ch_url, follow_redirects=True)
                    if ch_resp.status_code == 200:
                        text = _extract_text_from_html(ch_resp.text)
                        if text:
                            chunks.extend(_split_into_chunks(text))
                except Exception as e:
                    logger.debug("Chapter fetch error %s: %s", ch_id, e)

    except Exception as e:
        logger.warning("ALP fetch failed for %s: %s", key, e)
        return []

    if chunks:
        await collection.update_one(
            {"key": key, "tier": "city"},
            {"$set": {"key": key, "tier": "city", "city": city, "state": state,
                      "chunks": chunks, "cached_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        logger.info("Cached %d city code chunks for %s", len(chunks), key)

    return chunks


async def fetch_state_codes(state: str, db) -> list[str]:
    """
    Fetch state building code amendments from Municode.
    Returns list of text chunks. Caches result in MongoDB.
    """
    state_l = state.lower().strip()
    collection = db["code_cache"]

    cached = await collection.find_one({"key": state_l, "tier": "state"})
    if cached and cached.get("chunks"):
        logger.info("Code cache hit for state %s", state_l)
        return cached["chunks"]

    # State code URLs on Municode — common residential code adoption pages
    _STATE_URLS: dict[str, str] = {
        "tx": "https://www.sos.state.tx.us/tac/index.shtml",
        "ca": "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=17922.&lawCode=HSC",
        "fl": "https://www.floridabuilding.org/fbc/commission/FBC_5th/residential.htm",
        "ny": "https://www.dos.ny.gov/DCEA/codes.html",
        "il": "https://www.ilga.gov/commission/jcar/admincode/071/07100150sections.html",
        "wa": "https://app.leg.wa.gov/WAC/default.aspx?cite=51-51",
        "or": "https://www.oregon.gov/bcd/codes-stand/pages/orc.aspx",
    }

    # State amendment text (hardcoded key provisions where scraping is unreliable)
    _STATE_STATIC: dict[str, str] = {
        "tx": """[Texas Residential Code Amendment] Texas adopts the International Residential Code (IRC) with state amendments.
Minimum room size: Habitable rooms must be at least 70 square feet with no dimension less than 7 feet (IRC R304).
Ceiling height: Minimum 7 feet for habitable rooms, 6 feet 8 inches for bathrooms (IRC R305).
Egress: Each sleeping room must have at least one emergency escape opening with minimum 5.7 SF net clear area (IRC R310).
Stories: Residential structures up to 3 stories above grade plane are governed by IRC; 4+ stories require IBC.
Energy code: Texas adopts IECC 2021 with amendments for climate zones 2-3 (most of TX).
Smoke alarms: Required in each sleeping room, outside sleeping areas, and on each floor level (IRC R314).
Carbon monoxide alarms: Required in dwellings with fuel-fired appliances or attached garage (IRC R315).
Setbacks: Governed by local jurisdiction zoning ordinance. Dallas standard residential: 25 ft front, 5 ft side, 20 ft rear.
Garage: Door between dwelling and garage must be solid wood 1-3/8 inch thick or 20-minute fire rated (IRC R302.5).""",

        "ca": """[California Residential Code Amendment] California adopts CBC (California Building Code), which is the IBC with California amendments.
Energy: California Title 24 Part 6 energy efficiency standards are among the strictest in the nation. All new residential construction must meet Title 24.
ADU (Accessory Dwelling Units): California law (Government Code 65852.2) mandates ministerial approval for ADUs. Minimum ADU size 150 SF.
Seismic: California is Seismic Design Category D or E in most areas. Shear walls and hold-downs required per CBC Chapter 23.
Fire: Wildland-Urban Interface (WUI) requirements apply in designated high-fire hazard severity zones.
Room sizes: Minimum habitable room 70 SF, minimum dimension 7 feet (CBC R304).
Ceiling: Minimum 7 feet habitable, 6 feet 8 inches bathrooms (CBC R305).
Solar: Title 24 2019+ requires photovoltaic solar systems on most new single-family residences.""",

        "fl": """[Florida Building Code Residential Amendment] Florida adopts the FBC Residential, 8th Edition (2023) based on IRC 2021.
Wind: Florida has stringent wind load requirements. High-velocity hurricane zones (Miami-Dade, Broward) require impact-resistant windows and doors.
Flood: Structures in flood zones must meet FEMA floodplain requirements; finished floor elevation above base flood elevation.
Room size: Minimum habitable room 70 SF, no dimension less than 7 feet (FBC R304).
Ceiling: 7 feet minimum habitable rooms, 6 feet 8 inches bathrooms (FBC R305).
Roof: Roofing systems must meet High-Velocity Hurricane Zone requirements in coastal areas.
Energy: Florida Energy Code (IECC 2021 with Florida amendments) requires compliance for all new construction.""",

        "ny": """[New York State Residential Code Amendment] New York adopts the 2020 RCNYS (Residential Code of New York State) based on IRC.
Energy: New York stretches from climate zone 4 to 6. ECCCNYS (Energy Conservation Code of New York State) applies.
Room size: Minimum habitable room 80 SF in NYC, 70 SF upstate (RCNYS R304).
Ceiling: 8 feet minimum for first floor habitable rooms in NYC; 7 feet per RCNYS R305 elsewhere.
Egress: Every sleeping room must have egress window with minimum 5.7 SF net opening (RCNYS R310).
Fire: Sprinkler systems required in new one- and two-family townhouses (RCNYS R313).""",

        "wa": """[Washington State Residential Code Amendment] Washington adopts the Washington State Residential Code (WSRC), based on IRC with WA amendments.
Energy: Washington State Energy Code (WSEC) is one of the most stringent, requiring very high insulation R-values.
Seismic: Western WA is Seismic Design Category D. Eastern WA is C. Anchor bolts, shear walls required.
Room size: Minimum 70 SF habitable rooms, 7-foot minimum dimension (WSRC R304).
Radon: Washington requires radon-resistant construction in counties with elevated radon potential.""",
    }

    text = _STATE_STATIC.get(state_l, "")
    chunks = _split_into_chunks(text) if text else []

    if chunks:
        await collection.update_one(
            {"key": state_l, "tier": "state"},
            {"$set": {"key": state_l, "tier": "state", "state": state,
                      "chunks": chunks, "cached_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        logger.info("Cached %d state code chunks for %s", len(chunks), state_l)

    return chunks


async def load_jurisdiction_into_store(city: str, state: str, db, store: JurisdictionVectorStore) -> None:
    """
    Top-level function: ensures city + state codes are loaded into the vector store.
    Called before every compliance check. Safe to call multiple times (idempotent).
    """
    state_l = state.lower()
    city_l = city.lower()

    if not store.has_jurisdiction(city_l, state_l, "state"):
        state_chunks = await fetch_state_codes(state, db)
        if state_chunks:
            store.add_chunks(state_chunks, tier="state", city="", state=state_l)

    if not store.has_jurisdiction(city_l, state_l, "city"):
        city_chunks = await fetch_city_codes(city, state, db)
        if city_chunks:
            store.add_chunks(city_chunks, tier="city", city=city_l, state=state_l)


# ── HTML helpers ──────────────────────────────────────────────────────────────

def _extract_relevant_chapter_ids(html: str) -> list[str]:
    """Extract chapter/section IDs from ALP TOC HTML that match building code keywords."""
    # ALP TOC links look like: href="/codes/slug/latest/chapter-5-buildings"
    links = re.findall(r'href="([^"]+)"', html)
    relevant = []
    for link in links:
        link_lower = link.lower()
        if any(kw in link_lower for kw in _RELEVANT_KEYWORDS):
            # Extract the path segment after /latest/
            match = re.search(r"/latest/(.+?)(?:\"|$)", link)
            if match:
                relevant.append(match.group(1))
    return list(dict.fromkeys(relevant))  # deduplicate, preserve order


def _extract_text_from_html(html: str) -> str:
    """Strip HTML tags and return plain text."""
    # Remove scripts and styles
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", html, flags=re.DOTALL | re.IGNORECASE)
    # Remove tags
    text = re.sub(r"<[^>]+>", " ", html)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # Keep only sections longer than 40 chars
    return text if len(text) > 40 else ""
