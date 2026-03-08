"""
Cost Router — layer cost calculation, ML cost prediction, and model training.
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
    """ML ensemble cost prediction trained on real Dallas comparable sales."""
    result = ml_predictor.predict(features=req.features)
    return result


@router.post("/train")
def train_model() -> dict:
    """Train/retrain the ML model on current comparable sales data."""
    return ml_predictor.train()


@router.get("/model-status")
def model_status() -> dict:
    """Return current model training status and metrics."""
    return ml_predictor.get_training_status()


@router.post("/cluster-analysis")
def cluster_analysis(params: dict) -> dict:
    """Get neighborhood cluster analysis for a lat/lng location."""
    lat = float(params.get("lat", 32.7767))
    lng = float(params.get("lng", -96.7970))
    return ml_predictor.get_cluster_analysis(lat, lng)
