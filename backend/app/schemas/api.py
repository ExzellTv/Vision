"""
Pydantic v2 request/response models for all API endpoints.
"""

from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Any, Optional


# ===========================================================================
# Floorplan
# ===========================================================================

class FloorplanGenerateRequest(BaseModel):
    targetSF: float = Field(2200, alias="targetSF", description="Total square footage")
    bedrooms: int = Field(3)
    bathrooms: float = Field(2.0)
    stories: int = Field(1)
    lotWidth: float = Field(60, alias="lotWidth")
    lotDepth: float = Field(120, alias="lotDepth")
    style: str = Field("Ranch")
    garage: str = Field("2-car")
    openFloorPlan: bool = Field(True, alias="openFloorPlan")

    model_config = {"populate_by_name": True}


class FloorplanGenerateResponse(BaseModel):
    id: str
    rooms: list[dict[str, Any]]
    metadata: dict[str, Any]


class FloorplanUpdateRequest(BaseModel):
    rooms: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


# ===========================================================================
# Structural
# ===========================================================================

class StructuralAnalyzeRequest(BaseModel):
    span_ft: float = Field(..., description="Beam span in feet")
    stories: int = Field(..., description="Number of stories")
    foundation_type: str = Field(..., description="slab, crawlspace, pier, or basement")
    dead_load_psf: float = Field(..., description="Unfactored dead load (psf)")
    live_load_psf: float = Field(..., description="Unfactored live load (psf)")
    section_designation: str = Field(..., description="AISC W-shape designation")
    wind_load_psf: float = Field(0.0)
    snow_load_psf: float = Field(0.0)
    seismic_factor: float = Field(0.0)
    tributary_width_ft: float = Field(8.0)
    footing_area_sf: float = Field(16.0)
    story_height_ft: float = Field(9.0)


class LoadCombinationRequest(BaseModel):
    D: float = Field(..., description="Dead load (psf)")
    L: float = Field(..., description="Live load (psf)")
    W: float = Field(0.0, description="Wind load (psf)")
    S: float = Field(0.0, description="Snow load (psf)")
    E: float = Field(0.0, description="Seismic load (psf)")


# ===========================================================================
# Cost
# ===========================================================================

class MaterialSelection(BaseModel):
    layer: str
    unit_cost: float
    area_key: str | None = None


class CostLayersRequest(BaseModel):
    floor_plan_geometry: dict[str, Any]
    material_selections: list[MaterialSelection]


class MLPredictRequest(BaseModel):
    features: dict[str, Any] = Field(
        ...,
        description="Feature dict with keys like square_footage, stories, etc.",
    )


# ===========================================================================
# Market
# ===========================================================================

class MarketEstimateRequest(BaseModel):
    building_specs: dict[str, Any] = Field(
        ...,
        description="square_footage, bedrooms, bathrooms, stories, quality_score",
    )
    location: dict[str, Any] = Field(
        ...,
        description="lat, lng",
    )
    comparables: list[dict[str, Any]] | None = None


# ===========================================================================
# Risk
# ===========================================================================

class RiskSimulateRequest(BaseModel):
    base_cost: float = Field(..., description="Total development cost ($)")
    base_value: float = Field(..., description="Expected exit / market value ($)")
    iterations: int = Field(1000, ge=100, le=10000)
    volatility_params: dict[str, float] | None = None
    seed: int | None = None


# ===========================================================================
# Zoning
# ===========================================================================

class ZoningAnalyzeRequest(BaseModel):
    lat: float
    lng: float
    building_footprint: float
    building_height: float
    total_sf: float
    lot_sf: float
    lot_width: float | None = None
    lot_depth: float | None = None


# ===========================================================================
# Schedule
# ===========================================================================

class ScheduleCreateRequest(BaseModel):
    project_name: str
    total_sf: float
    stories: int = 1
    foundation_type: str = "slab"


class PhaseUpdateRequest(BaseModel):
    status: str = Field(..., description="new status for the phase")
    notes: str | None = None
