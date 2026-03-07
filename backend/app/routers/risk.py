"""
Risk Router — Monte Carlo simulation.
"""

from fastapi import APIRouter

from app.schemas.api import RiskSimulateRequest
from app.services import risk_simulator

router = APIRouter()


@router.post("/simulate")
def simulate(req: RiskSimulateRequest) -> dict:
    """Run Monte Carlo simulation on a development pro-forma."""
    result = risk_simulator.simulate(
        base_cost=req.base_cost,
        base_value=req.base_value,
        iterations=req.iterations,
        volatility_params=req.volatility_params,
        seed=req.seed,
    )
    return result
