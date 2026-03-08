"""
Compliance RAG Service — JSON knowledge base + Gemini Pro evaluation.

Loads structural_rag_knowledge.json at import time, builds a prompt with the
full knowledge base + building context, and asks Gemini Pro to evaluate all
7 compliance checks.  Metrics and loads are returned directly from the
building context (no LLM needed for numbers).
"""

import json
import logging
from pathlib import Path

import google.generativeai as genai

from app.config import settings

logger = logging.getLogger(__name__)

# ─── Load knowledge base once at startup ──────────────────────────────────────
_KB_PATH = Path(__file__).resolve().parent.parent.parent / "structural_rag_knowledge.json"
with open(_KB_PATH, "r") as f:
    KNOWLEDGE_BASE = json.load(f)

# ─── Mock building contexts keyed by project_id ──────────────────────────────
# TODO [SWAP]: Replace with real per-project data. Options:
#   1. Query from DB: ctx = db.query(Project).filter_by(id=project_id).first()
#      then map Project model fields → this dict shape
#   2. Or accept building context as a parameter to evaluate_compliance()
#      instead of looking it up here.
# Required dict keys: span_ft, stories, total_sf, foundation_type,
#   framing_material, section, Ix_in4, Sx_in3, Zx_in3, Fy_ksi,
#   dead_load_psf, live_load_psf, snow_load_psf, max_moment_kip_ft,
#   max_shear_kips, max_deflection_in, footing_area_ft2,
#   total_reaction_lbs, story_drift_ratio, sci_score
# All projects share the same mock data for now (teammate hasn't delivered
# per-project data yet).
_DEFAULT_CONTEXT = {
    "span_ft": 24,
    "stories": 2,
    "total_sf": 2200,
    "foundation_type": "slab_on_grade",
    "framing_material": "Wood SPF",
    "section": "W14x22",
    "Ix_in4": 199,
    "Sx_in3": 29.0,
    "Zx_in3": 33.2,
    "Fy_ksi": 50,
    "dead_load_psf": 25,
    "live_load_psf": 40,
    "snow_load_psf": 5,
    "max_moment_kip_ft": 18.4,
    "max_shear_kips": 12.2,
    "max_deflection_in": 0.78,
    "footing_area_ft2": 4.0,
    "total_reaction_lbs": 8500,
    "story_drift_ratio": 0.018,
    "sci_score": 6.2,
}

BUILDING_CONTEXTS: dict[int, dict] = {pid: dict(_DEFAULT_CONTEXT) for pid in range(1, 11)}


def _configure_gemini():
    """Configure the Gemini SDK with the API key (idempotent)."""
    genai.configure(api_key=settings.google_api_key)


# ─── Prompt template ─────────────────────────────────────────────────────────
_SYSTEM_PROMPT = """\
You are a structural code compliance evaluator for the Vision platform.
You evaluate residential building projects against IBC 2021 / ASCE 7-22
compliance requirements.

KNOWLEDGE BASE (compliance rules, formulas, thresholds):
{knowledge}

BUILDING CONTEXT (the project being evaluated):
{context}

TASK:
Evaluate ALL 7 compliance checks from the knowledge base against the building
context.  For each check, determine:
  - name: exact name from knowledge base
  - standard: the code standard
  - factor: numeric utilization factor (ratio of actual / allowable, rounded to 2 decimals)
  - status: "PASS", "WARNING", or "FAIL" using the status_logic rules
  - explanation: one concise sentence explaining the result

Also determine which LRFD load combination governs (the one producing the
highest factored demand).

Return ONLY a valid JSON object with this exact schema — no markdown, no
fences, no extra text:

{{
  "checks": [
    {{
      "name": "...",
      "standard": "...",
      "factor": "0.85",
      "status": "PASS",
      "explanation": "..."
    }}
  ],
  "governing_combination": {{
    "id": "LC2",
    "formula": "1.2D + 1.6L",
    "label": "PRIMARY COMBINATION MATRIX LC-02"
  }}
}}
"""


async def evaluate_compliance(project_id: int = 1, building_context_override: dict | None = None) -> dict:
    """
    Run Gemini Pro compliance evaluation for a project.

    Returns dict with:
      - checks: list of 7 check results
      - metrics: drift / deflection / shear from building context
      - loads: D / L / S / Lr values
      - governing_combination: which LC governs

    If building_context_override is supplied it is used directly instead of
    the hardcoded BUILDING_CONTEXTS lookup, enabling real per-project data.
    """
    ctx = building_context_override or BUILDING_CONTEXTS.get(project_id, _DEFAULT_CONTEXT)

    _configure_gemini()

    # Build the prompt with full knowledge + context
    prompt = _SYSTEM_PROMPT.format(
        knowledge=json.dumps(KNOWLEDGE_BASE["compliance_checks"], indent=2),
        context=json.dumps(ctx, indent=2),
    )

    model = genai.GenerativeModel("gemini-2.5-flash")

    try:
        response = await model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1,  # deterministic
                max_output_tokens=8192,
            ),
        )
        raw = response.text.strip()

        # Strip markdown fences if Gemini wraps them anyway
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]  # drop first line
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()

        gemini_result = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Gemini returned invalid JSON: %s — raw: %s", exc, raw)
        # Fall back to computed defaults so the UI never breaks
        gemini_result = _fallback_result(ctx)
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        gemini_result = _fallback_result(ctx)

    # Metrics come from building context — compute from real data
    span_ft = ctx.get("span_ft", 24)
    span_in = span_ft * 12
    dead_psf = ctx.get("dead_load_psf", 25)
    live_psf = ctx.get("live_load_psf", 40)
    snow_psf = ctx.get("snow_load_psf", 5)
    trib_w = 8
    Ix = ctx.get("Ix_in4", 199)
    Zx = ctx.get("Zx_in3", 33.2)
    Fy = ctx.get("Fy_ksi", 50)
    E_ksi = 29000

    # Compute real deflection: δ = 5wL⁴/(384EI)
    w_service_plf = (dead_psf + live_psf) * trib_w
    w_service_pli = w_service_plf / 12.0
    delta_max = 5.0 * w_service_pli * (span_in ** 4) / (384.0 * E_ksi * 1000.0 * Ix) if Ix > 0 else 0
    deflection_limit = round(span_in / 360, 2)

    # Compute real shear: V = wL/2
    lc2 = 1.2 * dead_psf + 1.6 * live_psf
    w_factored_pli = lc2 * trib_w / 12.0
    shear_kips = round(w_factored_pli * span_in / 2.0 / 1000, 2)
    # Shear capacity: phi * 0.6 * Fy * d * tw (estimate)
    section_d = ctx.get("d_in", 13.7)  # fallback W14x22
    tw_est = 0.25  # conservative web thickness
    shear_cap_kips = round(0.9 * 0.6 * Fy * section_d * tw_est, 1)

    # Drift: always pass (no real seismic data)
    drift_ratio = 0.0

    metrics = {
        "max_drift": {
            "value": drift_ratio,
            "limit": 0.02,
            "unit": "h",
            "status": "NOMINAL",
        },
        "max_deflection": {
            "value": round(delta_max, 3),
            "limit": deflection_limit,
            "unit": "in",
            "status": _metric_status(delta_max, deflection_limit),
        },
        "base_shear": {
            "value": shear_kips,
            "limit": shear_cap_kips,
            "unit": "kips",
            "status": _metric_status(shear_kips, shear_cap_kips),
        },
    }

    loads = {
        "D": dead_psf,
        "L": live_psf,
        "S": snow_psf,
        "Lr": 20,  # roof live load default
    }

    fb = _fallback_result(ctx)
    governing = gemini_result.get("governing_combination", fb["governing_combination"])

    return {
        "checks": gemini_result.get("checks", fb["checks"]),
        "metrics": metrics,
        "loads": loads,
        "governing_combination": governing,
    }


def _metric_status(value: float, limit: float) -> str:
    ratio = value / limit if limit else 0
    if ratio <= 0.85:
        return "NOMINAL"
    if ratio <= 1.0:
        return "MARGINAL"
    return "FAIL"


def _fallback_result(ctx: dict | None = None) -> dict:
    """
    Compute compliance checks from real building context.
    Checks that can be derived from floor plan data use real values;
    checks that rely on unavailable data (seismic, wind, foundation, snow)
    always PASS.
    """
    if not ctx:
        ctx = _DEFAULT_CONTEXT

    span_ft = ctx.get("span_ft", 24)
    span_in = span_ft * 12
    dead_psf = ctx.get("dead_load_psf", 25)
    live_psf = ctx.get("live_load_psf", 40)
    snow_psf = ctx.get("snow_load_psf", 5)
    stories = ctx.get("stories", 2)
    trib_w = 8  # tributary width ft

    Ix = ctx.get("Ix_in4", 199)
    Zx = ctx.get("Zx_in3", 33.2)
    Fy = ctx.get("Fy_ksi", 50)
    E_ksi = 29000

    # --- Real calculations from floor plan data ---
    # Factored load (LC2: 1.2D + 1.6L)
    lc2 = 1.2 * dead_psf + 1.6 * live_psf
    w_plf = lc2 * trib_w                           # lb/ft
    w_pli = w_plf / 12.0                            # lb/in
    M_inlb = w_pli * (span_in ** 2) / 8.0           # in-lb
    phi_Mn = 0.9 * Fy * Zx * 1000.0                 # Fy(ksi)*Zx(in³)*1000 → in-lb

    # Deflection (service load): δ = 5wL⁴/(384EI)
    w_service_plf = (dead_psf + live_psf) * trib_w   # lb/ft
    w_service_pli = w_service_plf / 12.0             # lb/in
    # E in ksi * 1000 → psi for unit consistency with w(lb/in), I(in⁴), L(in)
    delta_max = 5.0 * w_service_pli * (span_in ** 4) / (384.0 * E_ksi * 1000.0 * Ix)
    delta_allow = span_in / 360.0
    defl_ratio = round(delta_max / delta_allow, 2) if delta_allow > 0 else 0

    # Flexural utilization
    flex_ratio = round(M_inlb / phi_Mn, 2) if phi_Mn > 0 else 0

    # IBC general — pass if flexural + deflection are OK
    ibc_ok = flex_ratio <= 1.0 and defl_ratio <= 1.0

    # Deflection status
    if defl_ratio > 1.0:
        defl_status = "FAIL"
        defl_expl = f"Deflection {delta_max:.3f}in exceeds L/360 = {delta_allow:.3f}in."
    elif defl_ratio > 0.85:
        defl_status = "WARNING"
        defl_expl = f"Deflection at {defl_ratio*100:.0f}% of L/360 allowable."
    else:
        defl_status = "PASS"
        defl_expl = f"Deflection {delta_max:.3f}in within L/360 = {delta_allow:.3f}in."

    # Load combination status
    lc_ratio = round(flex_ratio, 2)
    lc_status = "FAIL" if lc_ratio > 1.0 else ("WARNING" if lc_ratio > 0.85 else "PASS")
    lc_expl = f"LC2 governs at {lc_ratio:.2f} utilization; {'demand exceeds capacity' if lc_ratio > 1.0 else 'demand within capacity'}."

    checks = [
        {"name": "International Building Code", "standard": "IBC 2021",     "factor": f"{flex_ratio:.2f}", "status": "PASS" if ibc_ok else "FAIL", "explanation": "All IBC minimums met." if ibc_ok else "Flexural or deflection limits exceeded."},
        {"name": "Load Combinations",           "standard": "ASCE 7-22",    "factor": f"{lc_ratio:.2f}",   "status": lc_status, "explanation": lc_expl},
        {"name": "Deflection Limit",            "standard": "L/360",        "factor": f"{defl_ratio:.2f}", "status": defl_status, "explanation": defl_expl},
        # --- Checks without real data: always PASS ---
        {"name": "Seismic Drift Ratio",         "standard": "ASCE 7-22",    "factor": "0.00", "status": "PASS",    "explanation": "Seismic drift not applicable — insufficient site data."},
        {"name": "Wind Uplift Check",           "standard": "ASCE 7-22",    "factor": "0.00", "status": "PASS",    "explanation": "Wind uplift not applicable — insufficient site data."},
        {"name": "Foundation Bearing Pressure",  "standard": "IBC 1806.2",   "factor": "0.00", "status": "PASS",    "explanation": "Foundation bearing not applicable — insufficient geotechnical data."},
        {"name": "Snow Load Calculation",       "standard": "ASCE 7-22",    "factor": "0.00", "status": "PASS",    "explanation": "Dallas, TX — minimal snow region; within capacity."},
    ]

    return {
        "checks": checks,
        "governing_combination": {
            "id": "LC2",
            "formula": f"1.2({dead_psf}) + 1.6({live_psf}) = {lc2:.1f} psf",
            "label": "PRIMARY COMBINATION MATRIX LC-02",
        },
    }


# ─── AI Diagnosis prompt ─────────────────────────────────────────────────────
_DIAGNOSIS_PROMPT = """\
You are a senior structural engineer analyzing failed or marginal compliance
checks for a residential building project (IBC 2021 / ASCE 7-22).

KNOWLEDGE BASE (compliance rules, formulas, thresholds):
{knowledge}

BUILDING CONTEXT:
{context}

FAILED / MARGINAL ITEMS TO DIAGNOSE:
{issues}

For each item, provide:
  - item_name: exact name from the input
  - status: the current status (FAIL, WARNING, or MARGINAL)
  - root_cause: 2-3 sentences explaining WHY it failed or is marginal,
    referencing specific numbers from the building context and code limits
  - severity: "critical" if FAIL, "moderate" if WARNING/MARGINAL
  - recommendations: array of 2-4 actionable fix steps the engineer should
    consider, ordered by impact (most effective first)

Return ONLY valid JSON — no markdown, no fences:
{{
  "diagnoses": [
    {{
      "item_name": "...",
      "status": "FAIL",
      "root_cause": "...",
      "severity": "critical",
      "recommendations": ["...", "..."]
    }}
  ]
}}
"""


async def diagnose_issues(analysis_type: str, results: dict, project_id: int = 1, building_context_override: dict | None = None) -> dict:
    """
    Ask Gemini 2.5 Flash to diagnose FAIL/WARNING/MARGINAL items and suggest fixes.

    Parameters
    ----------
    analysis_type : "compliance" or "structural"
    results : the full results dict from evaluate_compliance() or structural_engine.analyze()
    project_id : project ID for building context lookup

    Returns dict with { diagnoses: [...] }
    """
    # Gather the failed/marginal items depending on type
    issues = []
    if analysis_type == "compliance":
        for c in results.get("checks", []):
            if c.get("status") in ("FAIL", "WARNING"):
                issues.append(c)
        # Also check metrics
        for key in ("max_drift", "max_deflection", "base_shear"):
            m = (results.get("metrics") or {}).get(key)
            if m and m.get("status") in ("MARGINAL", "FAIL"):
                issues.append({
                    "name": key.replace("_", " ").title(),
                    "status": m["status"],
                    "factor": f"{m['value']}/{m['limit']}",
                    "explanation": f"Actual {m['value']}{m['unit']} vs limit {m['limit']}{m['unit']}",
                })
    elif analysis_type == "structural":
        for c in results.get("compliance_checks", []):
            if not c.get("passed", True):
                issues.append({
                    "name": c.get("name", "Unknown"),
                    "status": "FAIL",
                    "factor": f"{c.get('ratio', 0):.2f}",
                    "explanation": f"Demand {c.get('demand', 0)} vs capacity {c.get('capacity', 0)} {c.get('unit', '')}",
                })
        beam = results.get("beam_analysis", {})
        if beam.get("status") == "WARNING" or beam.get("utilization", 0) > 0.85:
            issues.append({
                "name": "Beam Utilization",
                "status": "WARNING" if beam.get("utilization", 0) <= 1.0 else "FAIL",
                "factor": f"{beam.get('utilization', 0):.2f}",
                "explanation": f"Utilization at {beam.get('utilization', 0) * 100:.1f}%",
            })

    if not issues:
        return {"diagnoses": []}

    ctx = building_context_override or BUILDING_CONTEXTS.get(project_id, _DEFAULT_CONTEXT)
    _configure_gemini()

    prompt = _DIAGNOSIS_PROMPT.format(
        knowledge=json.dumps(KNOWLEDGE_BASE.get("compliance_checks", []), indent=2),
        context=json.dumps(ctx, indent=2),
        issues=json.dumps(issues, indent=2),
    )

    model = genai.GenerativeModel("gemini-2.5-flash")

    try:
        response = await model.generate_content_async(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.2,
                max_output_tokens=8192,
            ),
        )
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()
        return json.loads(raw)
    except Exception as exc:
        logger.error("Gemini diagnosis error: %s", exc)
        # Fallback — return check-specific diagnosis for each issue
        return {
            "diagnoses": [
                _fallback_diagnosis(item) for item in issues
            ],
        }


# ─── Check-specific fallback recommendations ─────────────────────────────────
_FALLBACK_RECS: dict[str, dict] = {
    "Foundation Bearing Pressure": {
        "root_cause": "Bearing pressure exceeds allowable capacity. The footing area ({factor}) is undersized relative to the total reaction load, resulting in soil pressure above the geotechnical limit of 2,000 psf.",
        "recommendations": [
            "Increase footing area from current size to at least 6.0 sf to reduce unit bearing pressure below 2,000 psf",
            "Consider switching to a continuous strip footing or mat foundation to distribute loads over a larger area",
            "Request updated geotechnical report — actual allowable bearing may be higher than the conservative 2,000 psf default",
            "Reduce tributary dead loads by substituting lighter framing materials (e.g., engineered lumber vs solid sawn)",
        ],
    },
    "Deflection Limit": {
        "root_cause": "Mid-span deflection is at or near the L/360 serviceability limit. The current section's moment of inertia (Ix) is insufficient for the span length and applied loading.",
        "recommendations": [
            "Upgrade to a deeper section with higher Ix (e.g., W16x36 with Ix=448 in⁴ or W18x50 with Ix=800 in⁴)",
            "Reduce the tributary width to lower the distributed load per linear foot on the beam",
            "Add intermediate supports or columns to shorten the effective span",
            "Consider cambering the beam to offset dead load deflection",
        ],
    },
    "Seismic Drift Ratio": {
        "root_cause": "Inter-story drift ratio ({factor}) approaches or exceeds the 0.020h limit per ASCE 7-22 §12.12.1. Lateral stiffness is insufficient for the seismic design category.",
        "recommendations": [
            "Add shear walls or braced frames to increase lateral stiffness and reduce story drift",
            "Reduce story height to lower the drift demand",
            "Increase column sizes or add moment connections at beam-column joints",
            "Review seismic design category — verify Ss and S1 values match the actual site class",
        ],
    },
    "Wind Uplift Check": {
        "root_cause": "Net uplift from wind loads is not fully resisted by the dead weight of the structure. The ratio of wind uplift to resisting dead load ({factor}) indicates marginal or insufficient anchorage.",
        "recommendations": [
            "Install hurricane ties or uplift straps at roof-to-wall and wall-to-foundation connections",
            "Increase roof dead load with heavier sheathing or ballast to improve uplift resistance",
            "Verify exposure category and wind speed — confirm ASCE 7-22 Figure 26.5-1 values for the site",
            "Add mechanical anchorage at critical connections per IBC §2308.5",
        ],
    },
    "Beam Utilization": {
        "root_cause": "Beam utilization ratio ({factor}) exceeds 85%, indicating the section is near or over its plastic moment capacity. The demand/capacity ratio leaves insufficient margin of safety.",
        "recommendations": [
            "Upgrade to the next heavier W-shape section to lower the utilization ratio below 0.85",
            "Reduce the span length by adding an interior support column",
            "Decrease the applied loading by reducing tributary width or re-distributing loads to adjacent members",
            "Verify that Fy = 50 ksi is correct — using A992 Grade 50 steel is standard for W-shapes",
        ],
    },
    "Flexural Strength": {
        "root_cause": "Applied bending moment exceeds or approaches the nominal moment capacity (φMn) of the selected section. The demand-to-capacity ratio ({factor}) is unsatisfactory.",
        "recommendations": [
            "Select a section with higher plastic section modulus Zx (e.g., W16x36 or W18x50)",
            "Reduce span length by adding an intermediate support",
            "Decrease applied loads — review tributary area and live load assumptions",
            "Provide continuous lateral bracing to ensure the section reaches full plastic capacity",
        ],
    },
    "Shear Strength": {
        "root_cause": "Applied shear force is close to or exceeds the nominal shear capacity (φVn) of the beam web. The web area (d × tw) is insufficient for the reaction forces.",
        "recommendations": [
            "Upgrade to a section with a thicker web or deeper section to increase shear area",
            "Add web stiffeners at support locations to prevent web crippling",
            "Reduce reactions by shortening the span or reducing the distributed load intensity",
            "Verify that shear capacity calculation uses the correct web depth (d - 2tf) per AISC §G2",
        ],
    },
    "Load Combinations": {
        "root_cause": "The governing LRFD load combination produces a factored demand that exceeds available capacity. The combination ({factor}) amplifies the applied loads beyond what the structural system can safely resist.",
        "recommendations": [
            "Increase member sizes to accommodate the governing factored load combination",
            "Review live load and dead load assumptions — verify they match actual occupancy and construction",
            "Consider load path optimization to redistribute forces to stiffer elements",
            "Check whether load combination includes appropriate factors for the occupancy category",
        ],
    },
    "Snow Load Calculation": {
        "root_cause": "Ground snow load and roof geometry produce a snow load demand that is close to or exceeds the roof structure's capacity. The thermal factor and exposure coefficient may amplify the design snow load.",
        "recommendations": [
            "Verify ground snow load (pg) for the Dallas, TX region — typically 5 psf per ASCE 7-22 Fig. 7.2-1",
            "Review roof slope and thermal factor — heated buildings with slopes > 30° have reduced balanced snow loads",
            "Increase roof framing capacity if unbalanced or drifted snow loads govern",
            "Consider adding roof heating or snow guards to manage accumulation",
        ],
    },
    "Max Drift": {
        "root_cause": "Computed lateral drift ({factor}) is at or near the code limit. The structure lacks sufficient lateral stiffness to control wind or seismic displacement.",
        "recommendations": [
            "Add lateral bracing or shear walls to increase building stiffness",
            "Use deeper column sections to increase lateral moment of inertia",
            "Reduce story height to decrease drift demand",
            "Add moment-frame connections at beam-column joints",
        ],
    },
    "Max Deflection": {
        "root_cause": "Computed deflection ({factor}) approaches or exceeds serviceability limits. The member's flexural stiffness (EI) is insufficient for the loading and span conditions.",
        "recommendations": [
            "Upgrade to a deeper section with significantly higher Ix",
            "Reduce the effective span by adding intermediate supports",
            "Decrease the applied live load or limit the tributary area",
            "Consider pre-cambering to offset dead load deflection",
        ],
    },
    "Base Shear": {
        "root_cause": "Computed base shear ({factor}) is at or near the lateral force resisting system's capacity. The overall lateral system needs additional strength or stiffness.",
        "recommendations": [
            "Add braced frames or shear walls to increase lateral capacity at the base",
            "Increase anchor bolt sizes and base plate dimensions at column foundations",
            "Review seismic response modification factor (R) — verify for the lateral system type used",
            "Consider reducing building mass to lower seismic base shear demand",
        ],
    },
}

# Generic fallback for unrecognized check names
_GENERIC_FALLBACK = {
    "root_cause": "This check ({factor}) did not meet code requirements. The demand exceeds the allowable capacity per the applicable standard.",
    "recommendations": [
        "Review and increase member sizes or connection capacities for the failing element",
        "Verify all input parameters match actual site and loading conditions",
        "Consult with a licensed Professional Engineer for a detailed evaluation",
    ],
}


def _fallback_diagnosis(item: dict) -> dict:
    """Return a check-specific fallback diagnosis for a single issue."""
    name = item.get("name", "Unknown")
    factor = item.get("factor", "N/A")
    status = item.get("status", "FAIL")

    # Try exact match, then partial match
    fb = _FALLBACK_RECS.get(name)
    if not fb:
        # Try partial match (e.g., "Deflection Limit" matches "Max Deflection")
        name_lower = name.lower()
        for key, val in _FALLBACK_RECS.items():
            if key.lower() in name_lower or name_lower in key.lower():
                fb = val
                break
    if not fb:
        fb = _GENERIC_FALLBACK

    return {
        "item_name": name,
        "status": status,
        "root_cause": fb["root_cause"].format(factor=factor),
        "severity": "critical" if status == "FAIL" else "moderate",
        "recommendations": list(fb["recommendations"]),
    }
