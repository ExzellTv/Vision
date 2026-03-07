"""
Cost Router — layer cost calculation and ML cost prediction.
"""

from fastapi import APIRouter

from app.schemas.api import CostLayersRequest, MLPredictRequest
from app.services import cost_engine, ml_predictor

router = APIRouter()


@router.post("/calculate-layers")
def calculate_layers(req: CostLayersRequest) -> dict:
    """Calculate per-layer and total construction cost."""
    result = cost_engine.calculate_layers(
        floor_plan_geometry=req.floor_plan_geometry,
        material_selections=[m.model_dump() for m in req.material_selections],
    )
    return result


@router.post("/predict")
def predict(req: MLPredictRequest) -> dict:
    """ML ensemble cost prediction."""
    result = ml_predictor.predict(features=req.features)
    return result
