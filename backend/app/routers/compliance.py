"""
Compliance Router — Gemini Pro RAG evaluation of structural code compliance.
"""

from fastapi import APIRouter, HTTPException
from typing import Any
from pydantic import BaseModel

from app.services.compliance_rag import evaluate_compliance, diagnose_issues

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
async def check_compliance(req: ComplianceCheckRequest) -> dict:
    """
    Evaluate all 7 compliance checks for a project using Gemini Pro
    with the structural RAG knowledge base.
    """
    try:
        result = await evaluate_compliance(req.project_id, req.building_context)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Compliance evaluation failed: {exc}")
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
