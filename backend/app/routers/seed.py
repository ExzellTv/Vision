"""
One-shot seed endpoint.
POST /api/seed-data  → loads both JSON files into MongoDB.
Safe to call multiple times (upserts on `id`).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pymongo import UpdateOne
from pymongo.errors import BulkWriteError

from app.mongodb import get_db

router = APIRouter()

# JSON files sit two directories above this file (repo root)
REPO_ROOT         = Path(__file__).parent.parent.parent
COMPARABLES_FILE  = REPO_ROOT / "Comparables (1).json"
LAND_FILE         = REPO_ROOT / "Dallas Land Data.json"


async def _upsert(col, docs: list, metadata: dict) -> dict:
    ops = [
        UpdateOne({"id": doc["id"]}, {"$set": {**doc, "source_metadata": metadata}}, upsert=True)
        for doc in docs
    ]
    if not ops:
        return {"inserted": 0, "updated": 0, "total": 0}
    try:
        r = await col.bulk_write(ops, ordered=False)
        return {"inserted": r.upserted_count, "updated": r.modified_count, "total": len(ops)}
    except BulkWriteError as exc:
        raise HTTPException(status_code=500, detail=str(exc.details)) from exc


@router.post("")
async def seed_data(db=Depends(get_db)) -> dict:
    """Load Comparables and Dallas Land Data JSON files into MongoDB."""
    results = {}

    for name, path, collection in [
        ("comparables",  COMPARABLES_FILE, "comparables"),
        ("land_listings", LAND_FILE,       "land_listings"),
    ]:
        if not path.exists():
            raise HTTPException(status_code=404, detail=f"File not found: {path}")
        data = json.loads(path.read_text(encoding="utf-8"))
        props = data.get("properties", [])
        meta  = data.get("metadata",   {})
        results[name] = await _upsert(db[collection], props, meta)
        results[name]["file"] = path.name

    return {"status": "ok", "results": results}
