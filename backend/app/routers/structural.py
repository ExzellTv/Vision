"""
Structural Analysis Router — beam analysis, sections, and load combinations.
"""

from fastapi import APIRouter, HTTPException

from app.schemas.api import StructuralAnalyzeRequest, LoadCombinationRequest
from app.services import structural_engine

router = APIRouter()


@router.post("/analyze")
def analyze(req: StructuralAnalyzeRequest) -> dict:
    """Run full structural analysis. Includes engineering disclaimer."""
    try:
        result = structural_engine.analyze(
            span_ft=req.span_ft,
            stories=req.stories,
            foundation_type=req.foundation_type,
            dead_load_psf=req.dead_load_psf,
            live_load_psf=req.live_load_psf,
            section_designation=req.section_designation,
            wind_load_psf=req.wind_load_psf,
            snow_load_psf=req.snow_load_psf,
            seismic_factor=req.seismic_factor,
            tributary_width_ft=req.tributary_width_ft,
            footing_area_sf=req.footing_area_sf,
            story_height_ft=req.story_height_ft,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return result


@router.get("/sections")
def list_sections() -> list[dict]:
    """List all available AISC steel sections."""
    return structural_engine.get_sections()


@router.get("/sections/{designation}")
def get_section(designation: str) -> dict:
    """Look up a single AISC section by designation."""
    try:
        return structural_engine.get_section(designation)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/load-combinations")
def load_combinations(req: LoadCombinationRequest) -> dict:
    """Compute LRFD load combinations per ASCE 7-22."""
    combos = structural_engine.compute_load_combinations(
        D=req.D,
        L=req.L,
        W=req.W,
        S=req.S,
        E=req.E,
    )
    return combos
