"""
backfill_lot_sizes.py — One-time migration to populate lot sizes in MongoDB.

Problem:
    All 358 land_listings in MongoDB have area=null because the original
    data source (HasData Redfin Listing API) did not include lot size, and
    the CSV ingester did not map the LOT SIZE column when it was available.

Solution:
    This script reads the Redfin CSV export (which has a LOT SIZE column in
    square feet), matches rows to MongoDB documents by street address, and
    updates the `area` field directly in MongoDB.

    For the ~9 documents that also have lot sizes mentioned in their
    description (e.g. "5.69 acres", "12,672 sq ft"), the script parses
    those as a secondary source if the CSV match fails.

Usage:
    cd backend/
    python -m app.seed.backfill_lot_sizes                    # dry run
    python -m app.seed.backfill_lot_sizes --apply            # write to MongoDB
    python -m app.seed.backfill_lot_sizes --csv path/to.csv  # custom CSV path
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import logging
import re
import sys
from pathlib import Path

import certifi
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import settings

log = logging.getLogger(__name__)

SQFT_PER_ACRE = 43_560

# ── Regex patterns for description parsing ─────────────────────────────────
_RE_SQFT = re.compile(
    r"([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet)|square\s*feet|sf)\b",
    re.IGNORECASE,
)
_RE_ACRE = re.compile(
    r"([\d,]+(?:\.\d+)?)\s*acre[s]?\b",
    re.IGNORECASE,
)


def _parse_lot_sf_from_description(desc: str) -> int | None:
    """Extract lot square footage from free-text description."""
    m = _RE_SQFT.search(desc)
    if m:
        try:
            return int(float(m.group(1).replace(",", "")))
        except ValueError:
            pass

    m = _RE_ACRE.search(desc)
    if m:
        try:
            acres = float(m.group(1).replace(",", ""))
            return int(acres * SQFT_PER_ACRE)
        except ValueError:
            pass

    return None


def _load_csv_lot_sizes(csv_path: Path) -> dict[str, int]:
    """Load {lowercase_address: lot_size_sf} from the Redfin CSV."""
    lookup: dict[str, int] = {}
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            addr = (row.get("ADDRESS") or "").strip().lower()
            raw = (row.get("LOT SIZE") or "").strip()
            if addr and raw:
                try:
                    lookup[addr] = int(float(raw))
                except ValueError:
                    pass
    return lookup


def _find_csv() -> Path | None:
    """Walk upward from this file to find a redfin_*.csv."""
    search = Path(__file__).resolve().parent
    for _ in range(6):
        search = search.parent
        candidates = list(search.glob("redfin_*.csv"))
        if candidates:
            return candidates[0]
    return None


async def backfill(csv_path: Path | None = None, apply: bool = False):
    """Main migration logic."""
    # ── Find CSV ──
    if csv_path is None:
        csv_path = _find_csv()
    if csv_path is None or not csv_path.exists():
        log.error("Redfin CSV not found. Pass --csv <path> explicitly.")
        sys.exit(1)

    log.info("Loading lot sizes from %s", csv_path.name)
    csv_lots = _load_csv_lot_sizes(csv_path)
    log.info("  → %d addresses with lot sizes in CSV", len(csv_lots))

    # ── Connect to MongoDB ──
    uri = settings.mongodb_uri
    if not uri:
        log.error("MONGODB_URI not configured. Set it in backend/.env")
        sys.exit(1)

    client = AsyncIOMotorClient(uri, tlsCAFile=certifi.where())
    db = client[settings.mongodb_db]

    cursor = db["land_listings"].find(
        {},
        {"_id": 1, "address": 1, "area": 1, "description": 1, "price": 1},
    )
    docs = await cursor.to_list(length=1000)
    log.info("Loaded %d land listings from MongoDB", len(docs))

    # ── Match and prepare updates ──
    updates_csv = []
    updates_desc = []
    already_set = []
    no_match = []

    for doc in docs:
        existing_area = doc.get("area")
        if existing_area and existing_area > 0:
            already_set.append(doc["_id"])
            continue

        addr = doc.get("address", {})
        street = (addr.get("street", "") or "").strip().lower()

        # Priority 1: CSV lookup
        if street in csv_lots:
            lot_sf = csv_lots[street]
            updates_csv.append((doc["_id"], lot_sf, street))
            continue

        # Priority 2: Description parsing
        desc = doc.get("description") or ""
        if desc:
            parsed = _parse_lot_sf_from_description(desc)
            if parsed and parsed > 0:
                updates_desc.append((doc["_id"], parsed, street))
                continue

        no_match.append(street)

    log.info("=== Backfill Summary ===")
    log.info("  Already have area > 0:  %d", len(already_set))
    log.info("  Matched via CSV:        %d", len(updates_csv))
    log.info("  Matched via description: %d", len(updates_desc))
    log.info("  No match (unresolved):  %d", len(no_match))
    log.info("  Total updates to apply: %d", len(updates_csv) + len(updates_desc))

    if no_match:
        log.info("  Unresolved samples: %s", no_match[:10])

    # Show a few samples
    log.info("")
    log.info("Sample CSV matches:")
    for _id, sf, street in updates_csv[:8]:
        acres = round(sf / SQFT_PER_ACRE, 2)
        log.info("  %-40s → %8s SF  (%s acres)", street, f"{sf:,}", acres)

    if updates_desc:
        log.info("Sample description matches:")
        for _id, sf, street in updates_desc[:5]:
            acres = round(sf / SQFT_PER_ACRE, 2)
            log.info("  %-40s → %8s SF  (%s acres)", street, f"{sf:,}", acres)

    if not apply:
        log.info("")
        log.info("DRY RUN — no changes written. Pass --apply to update MongoDB.")
        client.close()
        return

    # ── Apply updates ──
    all_updates = updates_csv + updates_desc
    updated = 0
    for _id, lot_sf, _street in all_updates:
        result = await db["land_listings"].update_one(
            {"_id": _id},
            {"$set": {"area": lot_sf}},
        )
        if result.modified_count:
            updated += 1

    log.info("")
    log.info("✅ Updated %d / %d documents in MongoDB", updated, len(all_updates))

    # Verify
    count_with_area = await db["land_listings"].count_documents({"area": {"$gt": 0}})
    total = await db["land_listings"].count_documents({})
    log.info("   Now %d / %d land listings have area > 0", count_with_area, total)

    client.close()


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(message)s",
        datefmt="%H:%M:%S",
    )
    parser = argparse.ArgumentParser(
        description="Backfill lot sizes in MongoDB land_listings from Redfin CSV"
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="Path to the Redfin CSV file (auto-detected if omitted)",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write updates to MongoDB (default is dry-run)",
    )
    args = parser.parse_args()
    asyncio.run(backfill(csv_path=args.csv, apply=args.apply))
