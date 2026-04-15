"""
fix_misrouted_listings.py
-------------------------
Finds all docs in land_listings where propertyType is NOT a land type
and moves them to the comparables collection.

Run from backend/:
    python fix_misrouted_listings.py
"""

import asyncio
import certifi
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.config import settings

LAND_TYPES = {
    "land", "lot/land", "lots/land", "vacant land", "farm", "farm and ranch",
    "lot", "lots", "land/lot", "land/lots", "vacant lot", "vacant lots",
    "residential land", "commercial land", "industrial land",
    "unimproved land", "raw land", "acreage",
}

BATCH_SIZE = 200


async def main():
    client = AsyncIOMotorClient(settings.mongodb_uri, tlsCAFile=certifi.where())
    db = client[settings.mongodb_db]

    print("Scanning land_listings for misrouted docs...")

    cursor = db["land_listings"].find(
        {},
        {"_id": 1, "id": 1, "propertyType": 1, "price": 1, "area": 1,
         "address": 1, "latitude": 1, "longitude": 1, "beds": 1, "baths": 1,
         "yearBuilt": 1, "status": 1, "daysOnMarket": 1, "url": 1,
         "sqFtLot": 1, "lastSoldDate": 1, "importedFromCsv": 1, "source": 1}
    )

    misrouted = []
    async for doc in cursor:
        prop_type = (doc.get("propertyType") or "").lower().strip()
        if prop_type not in LAND_TYPES and prop_type != "":
            misrouted.append(doc)

    print(f"Found {len(misrouted)} misrouted docs to move to comparables.")

    if not misrouted:
        print("Nothing to fix.")
        client.close()
        return

    # Insert into comparables in batches
    comp_inserted = comp_updated = 0
    for i in range(0, len(misrouted), BATCH_SIZE):
        batch = misrouted[i:i + BATCH_SIZE]
        ops = [
            UpdateOne(
                {"id": doc.get("id") or str(doc["_id"])},
                {"$set": {k: v for k, v in doc.items() if k != "_id"}},
                upsert=True,
            )
            for doc in batch
        ]
        r = await db["comparables"].bulk_write(ops, ordered=False)
        comp_inserted += r.upserted_count
        comp_updated  += r.modified_count
        print(f"  Batch {i // BATCH_SIZE + 1}: inserted={r.upserted_count} updated={r.modified_count}")

    # Delete misrouted docs from land_listings in batches
    ids_to_delete = [doc["_id"] for doc in misrouted]
    deleted = 0
    for i in range(0, len(ids_to_delete), BATCH_SIZE):
        batch = ids_to_delete[i:i + BATCH_SIZE]
        r = await db["land_listings"].delete_many({"_id": {"$in": batch}})
        deleted += r.deleted_count
        print(f"  Deleted batch {i // BATCH_SIZE + 1}: {r.deleted_count} docs from land_listings")

    print(f"\nDone — moved {len(misrouted)} docs:")
    print(f"  comparables: inserted={comp_inserted} updated={comp_updated}")
    print(f"  land_listings: deleted={deleted}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
