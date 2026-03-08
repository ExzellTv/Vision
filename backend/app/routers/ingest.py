"""
Ingest Router — placeholder for CSV / API data ingestion.

Registered in main.py at /api/ingest. Actual CSV ingestion logic lives in
app.seed.csv_ingest_agent; this router exposes it as an API surface.
"""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/status")
def ingest_status():
    """Health check for the ingest subsystem."""
    return {"status": "ok", "message": "Ingest router is available."}
