"""
Market Valuation Router — ARV estimation.
"""

from fastapi import APIRouter

from app.schemas.api import MarketEstimateRequest
from app.services import market_model

router = APIRouter()


@router.post("/estimate")
def estimate(req: MarketEstimateRequest) -> dict:
    """Estimate after-repair market value."""
    result = market_model.estimate(
        building_specs=req.building_specs,
        location=req.location,
        comparables=req.comparables,
    )
    return result
