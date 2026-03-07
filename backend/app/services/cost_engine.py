"""
Layer Cost Engine — PRD Module 3

Calculates per-layer and total construction costs from floor plan
geometry and material selections.  Pure computation, no DB dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

WASTE_FACTORS: dict[str, float] = {
    "framing":     0.12,
    "drywall":     0.10,
    "insulation":  0.05,
    "paint":       0.10,
    "siding":      0.12,
    "sheathing":   0.08,
    "foundation":  0.05,
}

# Dallas-area labor rates ($/SF installed)
LABOR_RATES: dict[str, float] = {
    "concrete":    10.00,
    "framing":      6.00,
    "insulation":   2.25,
    "drywall":      3.00,
    "siding":       5.00,
    "paint":        2.25,
    "sheathing":    3.00,
}

GENERAL_CONDITIONS_RATE = 0.10   # 10 %
OVERHEAD_PROFIT_RATE    = 0.15   # 15 %

DEFAULT_PITCH_FACTOR    = 1.12   # moderate roof pitch multiplier
DEFAULT_OVERDIG_MARGIN  = 2.0    # feet beyond footprint each side


# ---------------------------------------------------------------------------
# Quantity take-off helpers
# ---------------------------------------------------------------------------

def _quantity_takeoff(geo: dict) -> dict[str, float]:
    """Derive material quantities from floor-plan geometry.

    Expected keys in *geo*:
        perimeter       – exterior wall perimeter (ft)
        wall_height     – floor-to-plate height (ft), default 9
        openings_area   – total window + door area (SF), default 0
        room_areas      – list of individual room areas (SF)
        footprint_area  – building footprint (SF)
        pitch_factor    – roof pitch multiplier, default 1.12
        overdig_margin  – extra excavation beyond footprint (ft), default 2
    """
    perimeter      = geo.get("perimeter", 0.0)
    wall_height    = geo.get("wall_height", 9.0)
    openings_area  = geo.get("openings_area", 0.0)
    room_areas     = geo.get("room_areas", [])
    footprint_area = geo.get("footprint_area", 0.0)
    pitch_factor   = geo.get("pitch_factor", DEFAULT_PITCH_FACTOR)
    overdig_margin = geo.get("overdig_margin", DEFAULT_OVERDIG_MARGIN)

    wall_area       = max(perimeter * wall_height - openings_area, 0.0)
    ceiling_area    = sum(room_areas) if room_areas else footprint_area
    roof_area       = footprint_area * pitch_factor
    # Simplified overdig: add margin strip around perimeter
    foundation_area = footprint_area + perimeter * overdig_margin

    return {
        "wall_area":       round(wall_area, 2),
        "ceiling_area":    round(ceiling_area, 2),
        "roof_area":       round(roof_area, 2),
        "foundation_area": round(foundation_area, 2),
    }


# ---------------------------------------------------------------------------
# Layer mapping — which quantity drives each layer
# ---------------------------------------------------------------------------

_LAYER_AREA_MAP: dict[str, str] = {
    "foundation":  "foundation_area",
    "framing":     "wall_area",
    "sheathing":   "wall_area",
    "insulation":  "wall_area",
    "drywall":     "wall_area",
    "siding":      "wall_area",
    "paint":       "wall_area",
    "concrete":    "foundation_area",
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def calculate_layers(
    floor_plan_geometry: dict,
    material_selections: list[dict],
) -> dict:
    """Calculate per-layer and grand-total construction cost.

    Parameters
    ----------
    floor_plan_geometry : dict
        Geometry values consumed by ``_quantity_takeoff``.
    material_selections : list[dict]
        Each dict must contain:
            layer      – cost layer name (e.g. "framing", "drywall")
            unit_cost  – material cost per SF before waste ($)
        Optional:
            area_key   – override which takeoff quantity to use

    Returns
    -------
    dict
        {
            "quantities": { ... },
            "layers": [
                {
                    "layer": str,
                    "area_sf": float,
                    "unit_cost": float,
                    "waste_factor": float,
                    "material_cost": float,
                    "labor_rate": float,
                    "labor_cost": float,
                    "layer_total": float,
                },
                ...
            ],
            "subtotal": float,
            "general_conditions": float,
            "overhead_profit": float,
            "grand_total": float,
        }
    """
    quantities = _quantity_takeoff(floor_plan_geometry)

    layers: list[dict[str, Any]] = []
    subtotal = 0.0

    for mat in material_selections:
        layer_name = mat["layer"].lower()
        unit_cost  = float(mat["unit_cost"])

        # Resolve area
        area_key = mat.get("area_key") or _LAYER_AREA_MAP.get(layer_name, "wall_area")
        area_sf  = quantities.get(area_key, 0.0)

        # Waste & labor
        waste   = WASTE_FACTORS.get(layer_name, 0.0)
        labor_r = LABOR_RATES.get(layer_name, 0.0)

        material_cost = area_sf * unit_cost * (1.0 + waste)
        labor_cost    = area_sf * labor_r
        layer_total   = material_cost + labor_cost

        layers.append({
            "layer":         layer_name,
            "area_sf":       round(area_sf, 2),
            "unit_cost":     round(unit_cost, 2),
            "waste_factor":  round(waste, 4),
            "material_cost": round(material_cost, 2),
            "labor_rate":    round(labor_r, 2),
            "labor_cost":    round(labor_cost, 2),
            "layer_total":   round(layer_total, 2),
        })
        subtotal += layer_total

    general_conditions = subtotal * GENERAL_CONDITIONS_RATE
    overhead_profit    = (subtotal + general_conditions) * OVERHEAD_PROFIT_RATE
    grand_total        = subtotal + general_conditions + overhead_profit

    return {
        "quantities":          quantities,
        "layers":              layers,
        "subtotal":            round(subtotal, 2),
        "general_conditions":  round(general_conditions, 2),
        "overhead_profit":     round(overhead_profit, 2),
        "grand_total":         round(grand_total, 2),
    }
