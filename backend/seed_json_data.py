#!/usr/bin/env python3
"""
Seed MongoDB with Dallas comparables and land data.

Run from the backend/ directory:
  python3 seed_json_data.py

Collections created/updated:
  - comparables    <- Comparables (1).json
  - land_listings  <- Dallas Land Data.json

Safe to re-run (upserts on `id` field).
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# ── locate the JSON files relative to the repo root ──────────────────────────
REPO_ROOT = Path(__file__).parent.parent
COMPARABLES_FILE = REPO_ROOT / "Comparables (1).json"
LAND_FILE        = REPO_ROOT / "Dallas Land Data.json"

# ── load connection settings from the local .env ─────────────────────────────
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

MONGO_URL = os.getenv("MONGODB_URL", "")
DB_NAME   = os.getenv("MONGODB_DB_NAME", "vision")

if not MONGO_URL:
    print("ERROR: MONGODB_URL not found in backend/.env")
    sys.exit(1)


def load_json(path: Path) -> dict:
    print(f"  Loading {path.name}…")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


async def upsert_many(col, docs: list, metadata: dict) -> None:
    from pymongo import UpdateOne
    from pymongo.errors import BulkWriteError

    ops = [
        UpdateOne({"id": doc["id"]}, {"$set": {**doc, "source_metadata": metadata}}, upsert=True)
        for doc in docs
    ]
    if not ops:
        print("  [!] 0 documents — nothing to do.")
        return

    try:
        result = await col.bulk_write(ops, ordered=False)
        ins = result.upserted_count
        upd = result.modified_count
        print(f"  ✓ {ins} inserted  |  {upd} updated  |  {len(ops)} total")
    except BulkWriteError as exc:
        print(f"  [!] BulkWriteError: {exc.details}")
        raise


async def main() -> None:
    import certifi
    from motor.motor_asyncio import AsyncIOMotorClient

    print(f"\nConnecting to MongoDB  ({DB_NAME})…")
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=20_000, tlsCAFile=certifi.where())
    try:
        await client.admin.command("ping")
    except Exception as exc:
        print(f"  ✗ Connection failed: {exc}")
        print("\n  Make sure your IP is whitelisted in MongoDB Atlas:")
        print("  https://cloud.mongodb.com → Network Access → + Add IP Address")
        sys.exit(1)

    print("  ✓ Connected\n")
    db = client[DB_NAME]

    # ---------- comparables ----------
    print("[ comparables ]")
    data = load_json(COMPARABLES_FILE)
    props = data.get("properties", [])
    print(f"  {len(props)} properties")
    await upsert_many(db["comparables"], props, data.get("metadata", {}))

    # ---------- land listings ----------
    print("\n[ land_listings ]")
    data = load_json(LAND_FILE)
    props = data.get("properties", [])
    print(f"  {len(props)} properties")
    await upsert_many(db["land_listings"], props, data.get("metadata", {}))

    client.close()
    print("\nAll done ✓")


if __name__ == "__main__":
    asyncio.run(main())
