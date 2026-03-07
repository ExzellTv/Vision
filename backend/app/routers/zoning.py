"""
Zoning Router — zoning analysis and template lookup.
"""

from fastapi import APIRouter

from app.schemas.api import ZoningAnalyzeRequest
from app.services import zoning_service

router = APIRouter()


@router.post("/analyze")
def analyze(req: ZoningAnalyzeRequest) -> dict:
    """Run zoning analysis for a proposed building."""
    result = zoning_service.analyze(
        lat=req.lat,
        lng=req.lng,
        building_footprint=req.building_footprint,
        building_height=req.building_height,
        total_sf=req.total_sf,
        lot_sf=req.lot_sf,
        lot_width=req.lot_width,
        lot_depth=req.lot_depth,
    )
    return result


@router.get("/templates")
def list_templates() -> list[dict]:
    """List all available Dallas residential zoning templates."""
    return zoning_service.get_templates()
