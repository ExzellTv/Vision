"""
Schedule & Phase Manager — PRD Module 8

Creates and manages construction schedules.  5 phases map to 7 layers.
Pure computation, no DB dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

# ---------------------------------------------------------------------------
# Phase definitions
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class PhaseTemplate:
    """Immutable definition for one construction phase."""
    number: int
    name: str
    layers: list[int]
    base_weeks_min: int
    base_weeks_max: int
    budget_pct: float          # fraction of total budget
    milestone: str
    dependencies: list[str]


PHASE_TEMPLATES: list[PhaseTemplate] = [
    PhaseTemplate(
        number=1,
        name="Site Prep & Foundation",
        layers=[1],
        base_weeks_min=2,
        base_weeks_max=4,
        budget_pct=0.15,
        milestone="Foundation pour complete. Concrete cured. Foundation inspection passed.",
        dependencies=["Permits approved", "Soil test", "Survey complete"],
    ),
    PhaseTemplate(
        number=2,
        name="Framing & Structure",
        layers=[2],
        base_weeks_min=3,
        base_weeks_max=6,
        budget_pct=0.25,
        milestone="Structural framing complete. Sheathing applied. Framing inspection passed.",
        dependencies=["Foundation inspection passed", "Lumber delivery"],
    ),
    PhaseTemplate(
        number=3,
        name="Envelope & Rough-In",
        layers=[3, 4],
        base_weeks_min=3,
        base_weeks_max=5,
        budget_pct=0.20,
        milestone="Roofing complete. MEP rough-in inspected. Building dried in.",
        dependencies=["Framing inspection passed", "HVAC equipment on site"],
    ),
    PhaseTemplate(
        number=4,
        name="Interior & Exterior Finish",
        layers=[5, 6],
        base_weeks_min=4,
        base_weeks_max=6,
        budget_pct=0.30,
        milestone="Drywall finished. Cabinets and fixtures installed. Exterior trim complete.",
        dependencies=["Rough-in inspections passed", "Finish materials delivered"],
    ),
    PhaseTemplate(
        number=5,
        name="Final Finish & Close-Out",
        layers=[7],
        base_weeks_min=2,
        base_weeks_max=3,
        budget_pct=0.10,
        milestone="Final inspections passed. Punch list complete. Certificate of occupancy issued.",
        dependencies=["Interior finish complete", "Landscaping complete"],
    ),
]

# ---------------------------------------------------------------------------
# Duration estimation
# ---------------------------------------------------------------------------

# Adjustment keys → set of phase numbers they affect
_SF_THRESHOLD          = 2500
_SF_INCREASE_PHASES    = {2, 4}   # framing, interior finish
_SF_INCREASE_FACTOR    = 0.20

_MULTI_STORY_FOUND     = {1}     # foundation
_MULTI_STORY_FRAME     = {2}     # framing
_MULTI_STORY_FOUND_FAC = 0.30
_MULTI_STORY_FRAME_FAC = 0.25

_STEEL_PHASE           = {2}
_STEEL_FACTOR           = 0.15

_SCI_THRESHOLD         = 7
_SCI_FACTOR            = 0.10


def _estimate_duration(
    template: PhaseTemplate,
    total_sf: float,
    stories: int,
    material_type: str,
    sci: float,
) -> float:
    """Return estimated duration in weeks (float) for one phase."""
    base = (template.base_weeks_min + template.base_weeks_max) / 2.0

    # Square-footage adjustment
    if total_sf > _SF_THRESHOLD and template.number in _SF_INCREASE_PHASES:
        base *= 1.0 + _SF_INCREASE_FACTOR

    # Multi-story adjustments
    if stories > 1:
        if template.number in _MULTI_STORY_FOUND:
            base *= 1.0 + _MULTI_STORY_FOUND_FAC
        if template.number in _MULTI_STORY_FRAME:
            base *= 1.0 + _MULTI_STORY_FRAME_FAC

    # Steel framing
    if material_type.lower() == "steel" and template.number in _STEEL_PHASE:
        base *= 1.0 + _STEEL_FACTOR

    # Complexity (SCI) uplift
    if sci > _SCI_THRESHOLD:
        base *= 1.0 + _SCI_FACTOR

    return round(base, 1)


# ---------------------------------------------------------------------------
# Budget estimation
# ---------------------------------------------------------------------------

# Rough cost per SF (total construction), used as a baseline
_BASE_COST_PER_SF = 175.0  # Dallas-area mid-range


def _estimate_total_budget(total_sf: float, stories: int, sci: float) -> float:
    """Quick total budget estimate from SF and complexity."""
    budget = total_sf * _BASE_COST_PER_SF
    if stories > 1:
        budget *= 1.10  # 10 % uplift for multi-story
    if sci > _SCI_THRESHOLD:
        budget *= 1.0 + (sci - _SCI_THRESHOLD) * 0.03
    return round(budget, 2)


# ---------------------------------------------------------------------------
# Date helpers
# ---------------------------------------------------------------------------

def _add_weeks(start: date, weeks: float) -> date:
    """Add a fractional number of weeks to a date."""
    return start + timedelta(weeks=weeks)


def _next_monday(d: date) -> date:
    """Round a date forward to the next Monday (or keep if already Monday)."""
    days_ahead = (7 - d.weekday()) % 7
    return d + timedelta(days=days_ahead) if days_ahead else d


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_SPEC_DEFAULTS: dict[str, Any] = {
    "total_sf":         2200,
    "stories":          1,
    "foundation_type":  "slab",
    "material_type":    "wood",
    "complexity_score": 5.0,
    "start_date":       None,       # defaults to next Monday from today
    "total_budget":     None,       # auto-estimated when omitted
}


def create_schedule(project_specs: dict) -> dict:
    """
    Create a construction schedule with 5 phases mapped to 7 layers.

    Parameters
    ----------
    project_specs : dict
        Keys: total_sf, stories, foundation_type, material_type,
        complexity_score (SCI), start_date (optional ISO string),
        total_budget (optional override).

    Returns
    -------
    dict
        ``{"phases": [...], "total_duration_weeks": N,
           "estimated_completion": "YYYY-MM-DD"}``
    """
    specs: dict[str, Any] = {**_SPEC_DEFAULTS, **project_specs}

    total_sf:       float = float(specs["total_sf"])
    stories:        int   = int(specs["stories"])
    material_type:  str   = str(specs["material_type"])
    sci:            float = float(specs["complexity_score"])

    # Resolve start date
    if specs["start_date"] is not None:
        if isinstance(specs["start_date"], str):
            start = date.fromisoformat(specs["start_date"])
        else:
            start = specs["start_date"]
    else:
        start = _next_monday(date.today() + timedelta(days=30))

    # Budget
    if specs["total_budget"] is not None:
        total_budget = float(specs["total_budget"])
    else:
        total_budget = _estimate_total_budget(total_sf, stories, sci)

    # Build phases
    phases: list[dict] = []
    cursor = start
    total_weeks = 0.0

    for tmpl in PHASE_TEMPLATES:
        dur = _estimate_duration(tmpl, total_sf, stories, material_type, sci)
        dur_weeks = int(round(dur))  # snap to whole weeks for cleaner dates
        dur_weeks = max(dur_weeks, tmpl.base_weeks_min)

        phase_start = cursor
        phase_end   = _add_weeks(cursor, dur_weeks)
        budget_alloc = round(total_budget * tmpl.budget_pct, 2)

        phases.append({
            "phase_number":     tmpl.number,
            "phase_name":       tmpl.name,
            "layers_included":  list(tmpl.layers),
            "start_date":       phase_start.isoformat(),
            "end_date":         phase_end.isoformat(),
            "duration_weeks":   dur_weeks,
            "status":           "planned",
            "budget_allocated": budget_alloc,
            "budget_spent":     0,
            "milestone":        tmpl.milestone,
            "dependencies":     list(tmpl.dependencies),
        })

        cursor = phase_end
        total_weeks += dur_weeks

    return {
        "phases":               phases,
        "total_duration_weeks":  int(total_weeks),
        "estimated_completion":  cursor.isoformat(),
        "total_budget":          round(total_budget, 2),
    }
