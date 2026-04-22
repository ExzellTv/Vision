"""
Compliance Router — jurisdiction-aware RAG (Cerebras) + deterministic structural checks.
"""

from fastapi import APIRouter, Depends, HTTPException
from typing import Any
from pydantic import BaseModel

from app.mongodb import get_db
from app.services.compliance_rag import evaluate_compliance, evaluate_compliance_rag, diagnose_issues, generate_fix_patches

router = APIRouter()


class ComplianceCheckRequest(BaseModel):
    project_id: int = 1
    building_context: dict[str, Any] | None = None


class DiagnosisRequest(BaseModel):
    analysis_type: str  # "compliance" or "structural"
    results: dict
    project_id: int = 1
    building_context: dict[str, Any] | None = None


@router.post("/check")
async def check_compliance(req: ComplianceCheckRequest, db=Depends(get_db)) -> dict:
    """
    Evaluate compliance for a project.
    If city + state are present in building_context.location, uses Cerebras RAG
    with jurisdiction-specific building codes. Otherwise falls back to deterministic checks.
    """
    ctx = req.building_context or {}
    location = ctx.get("location") or {}
    city = location.get("city", "").strip()
    state = location.get("state", "").strip()

    try:
        if city and state:
            result = await evaluate_compliance_rag(city, state, ctx, db)
        else:
            result = await evaluate_compliance(req.project_id, ctx)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Compliance evaluation failed: {exc}")
    return result


class ComplianceFixRequest(BaseModel):
    violations: list[dict[str, Any]]
    rooms: list[dict[str, Any]]
    location: dict[str, Any]


@router.post("/fix")
async def fix_compliance(req: ComplianceFixRequest) -> dict:
    """
    Generate room-dimension patches to resolve RAG compliance violations.
    Calls Cerebras with the violations + current rooms to produce the minimum
    set of resize operations needed. Returns patches + list of unfixable violations.
    """
    try:
        result = await generate_fix_patches(req.violations, req.rooms, req.location)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Compliance fix generation failed: {exc}")
    return result


@router.post("/ai-diagnosis")
async def ai_diagnosis(req: DiagnosisRequest) -> dict:
    """
    AI-powered diagnosis of failed/marginal compliance or structural checks.
    Uses Gemini 2.5 Flash to explain root causes and suggest fixes.
    """
    try:
        result = await diagnose_issues(
            analysis_type=req.analysis_type,
            results=req.results,
            project_id=req.project_id,
            building_context_override=req.building_context,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI diagnosis failed: {exc}")
    return result
