"""
Zoning Service — PRD Module 7

Dallas zoning lookup with 10 residential templates from the
Dallas Development Code Chapter 51A.  Maps lat/lng to the nearest
template centroid and checks building compliance.
Pure computation, no DB dependencies.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Dallas bounding box
# ---------------------------------------------------------------------------

DALLAS_LAT_RANGE = (32.62, 33.02)
DALLAS_LNG_RANGE = (-97.00, -96.46)

# ---------------------------------------------------------------------------
# Zoning templates — Dallas Development Code Chapter 51A
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ZoningTemplate:
    code: str
    name: str
    height_ft: float        # max building height
    front_setback_ft: float
    side_setback_ft: float
    rear_setback_ft: float
    far: float              # floor-area ratio
    lot_coverage: float     # max lot coverage (0-1)
    # Approximate centroid inside Dallas for geo-mapping
    centroid_lat: float
    centroid_lng: float


TEMPLATES: list[ZoningTemplate] = [
    ZoningTemplate("R-1ac", "1 Acre Estate",    36, 40, 15, 20, 0.35, 0.35, 32.92, -96.82),
    ZoningTemplate("R-1",   "Single Family",    36, 30,  5,  5, 0.45, 0.45, 32.87, -96.78),
    ZoningTemplate("R-3",   "Small Lot",        36, 25,  5,  5, 0.50, 0.50, 32.82, -96.75),
    ZoningTemplate("R-5",   "Compact",          36, 20,  5,  5, 0.55, 0.55, 32.80, -96.72),
    ZoningTemplate("R-7.5", "R-7.5",            36, 25,  5,  5, 0.50, 0.50, 32.78, -96.80),
    ZoningTemplate("R-10",  "R-10",             36, 25,  6,  8, 0.45, 0.45, 32.76, -96.77),
    ZoningTemplate("R-13",  "R-13",             36, 30,  6, 10, 0.40, 0.40, 32.74, -96.85),
    ZoningTemplate("R-16",  "R-16",             36, 30,  8, 10, 0.40, 0.40, 32.72, -96.88),
    ZoningTemplate("D(A)",  "Duplex",           36, 25,  5,  5, 0.60, 0.60, 32.77, -96.70),
    ZoningTemplate("MF-1",  "Multifamily",      36, 15, 10, 15, 0.80, 0.60, 32.79, -96.68),
]

_TEMPLATE_MAP: dict[str, ZoningTemplate] = {t.code: t for t in TEMPLATES}


# ---------------------------------------------------------------------------
# Geo helpers
# ---------------------------------------------------------------------------

def _haversine_approx(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Cheap Euclidean approximation in degrees (fine for same-city)."""
    return math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2)


def _nearest_template(lat: float, lng: float) -> ZoningTemplate:
    """Return template whose centroid is closest to (lat, lng)."""
    best = TEMPLATES[0]
    best_dist = _haversine_approx(lat, lng, best.centroid_lat, best.centroid_lng)
    for t in TEMPLATES[1:]:
        d = _haversine_approx(lat, lng, t.centroid_lat, t.centroid_lng)
        if d < best_dist:
            best, best_dist = t, d
    return best


def _flood_zone(lat: float) -> dict[str, Any]:
    """Simplified flood-zone determination based on latitude band."""
    if lat < 32.70:
        zone, risk = "AE", "high"
    elif lat < 32.75:
        zone, risk = "AH", "moderate"
    elif lat < 32.85:
        zone, risk = "X500", "low"
    else:
        zone, risk = "X", "minimal"
    return {"zone": zone, "risk_level": risk}


# ---------------------------------------------------------------------------
# Buildable envelope (3D box for Three.js)
# ---------------------------------------------------------------------------

def _buildable_envelope(
    lot_width: float,
    lot_depth: float,
    template: ZoningTemplate,
) -> dict[str, Any]:
    """Compute buildable 3D bounding box after setbacks.

    Returns corner coordinates suitable for Three.js Box geometry.
    Origin at lot front-left corner; X = width, Y = up, Z = depth.
    """
    x_min = template.side_setback_ft
    x_max = lot_width - template.side_setback_ft
    z_min = template.front_setback_ft
    z_max = lot_depth - template.rear_setback_ft
    y_max = template.height_ft

    # Ensure valid box
    if x_max <= x_min or z_max <= z_min:
        return {"valid": False, "reason": "Lot too small for setbacks"}

    return {
        "valid": True,
        "corners": [
            {"x": round(x_min, 2), "y": 0, "z": round(z_min, 2)},
            {"x": round(x_max, 2), "y": 0, "z": round(z_min, 2)},
            {"x": round(x_max, 2), "y": 0, "z": round(z_max, 2)},
            {"x": round(x_min, 2), "y": 0, "z": round(z_max, 2)},
            {"x": round(x_min, 2), "y": round(y_max, 2), "z": round(z_min, 2)},
            {"x": round(x_max, 2), "y": round(y_max, 2), "z": round(z_min, 2)},
            {"x": round(x_max, 2), "y": round(y_max, 2), "z": round(z_max, 2)},
            {"x": round(x_min, 2), "y": round(y_max, 2), "z": round(z_max, 2)},
        ],
        "dimensions": {
            "width_ft":  round(x_max - x_min, 2),
            "depth_ft":  round(z_max - z_min, 2),
            "height_ft": round(y_max, 2),
        },
    }


# ---------------------------------------------------------------------------
# Compliance checks
# ---------------------------------------------------------------------------

def _check_compliance(
    building_footprint: float,
    building_height: float,
    total_sf: float,
    lot_sf: float,
    template: ZoningTemplate,
    lot_width: float | None = None,
    lot_depth: float | None = None,
) -> dict[str, Any]:
    """Check building against zoning limits.  Returns pass/fail per rule."""
    issues: list[str] = []

    # Height
    height_ok = building_height <= template.height_ft
    if not height_ok:
        issues.append(
            f"Height {building_height} ft exceeds max {template.height_ft} ft"
        )

    # FAR
    actual_far = total_sf / lot_sf if lot_sf > 0 else 0
    far_ok = actual_far <= template.far
    if not far_ok:
        issues.append(
            f"FAR {actual_far:.2f} exceeds max {template.far:.2f}"
        )

    # Lot coverage
    actual_coverage = building_footprint / lot_sf if lot_sf > 0 else 0
    coverage_ok = actual_coverage <= template.lot_coverage
    if not coverage_ok:
        issues.append(
            f"Lot coverage {actual_coverage:.0%} exceeds max {template.lot_coverage:.0%}"
        )

    # Setback fit (simplified: check if footprint fits inside setback box)
    setback_ok = True
    if lot_width is not None and lot_depth is not None:
        usable_w = lot_width - 2 * template.side_setback_ft
        usable_d = lot_depth - template.front_setback_ft - template.rear_setback_ft
        max_footprint = usable_w * usable_d
        if building_footprint > max_footprint:
            setback_ok = False
            issues.append(
                f"Footprint {building_footprint:.0f} SF exceeds setback envelope "
                f"{max_footprint:.0f} SF ({usable_w:.0f} x {usable_d:.0f})"
            )

    compliant = height_ok and far_ok and coverage_ok and setback_ok

    return {
        "compliant":        compliant,
        "height_ok":        height_ok,
        "far_ok":           far_ok,
        "far_actual":       round(actual_far, 3),
        "coverage_ok":      coverage_ok,
        "coverage_actual":  round(actual_coverage, 3),
        "setback_ok":       setback_ok,
        "issues":           issues,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze(
    lat: float,
    lng: float,
    building_footprint: float,
    building_height: float,
    total_sf: float,
    lot_sf: float,
    lot_width: float | None = None,
    lot_depth: float | None = None,
) -> dict[str, Any]:
    """Full zoning analysis for a proposed building at a Dallas location.

    Parameters
    ----------
    lat, lng : float
        Site coordinates (must be within Dallas bounding box).
    building_footprint : float
        Ground-floor footprint area (SF).
    building_height : float
        Proposed building height (ft).
    total_sf : float
        Total conditioned square footage (all floors).
    lot_sf : float
        Total lot area (SF).
    lot_width, lot_depth : float, optional
        Lot dimensions for setback and envelope calculations.

    Returns
    -------
    dict
        zoning_template, compliance, buildable_envelope, flood_zone, in_dallas
    """
    in_dallas = (
        DALLAS_LAT_RANGE[0] <= lat <= DALLAS_LAT_RANGE[1]
        and DALLAS_LNG_RANGE[0] <= lng <= DALLAS_LNG_RANGE[1]
    )

    template = _nearest_template(lat, lng)

    compliance = _check_compliance(
        building_footprint=building_footprint,
        building_height=building_height,
        total_sf=total_sf,
        lot_sf=lot_sf,
        template=template,
        lot_width=lot_width,
        lot_depth=lot_depth,
    )

    # Buildable envelope (needs lot dimensions)
    envelope: dict[str, Any] = {"valid": False, "reason": "Lot dimensions not provided"}
    if lot_width is not None and lot_depth is not None:
        envelope = _buildable_envelope(lot_width, lot_depth, template)

    flood = _flood_zone(lat)

    return {
        "in_dallas_bounds": in_dallas,
        "zoning_template": {
            "code":            template.code,
            "name":            template.name,
            "max_height_ft":   template.height_ft,
            "front_setback":   template.front_setback_ft,
            "side_setback":    template.side_setback_ft,
            "rear_setback":    template.rear_setback_ft,
            "far":             template.far,
            "lot_coverage":    template.lot_coverage,
        },
        "compliance":            compliance,
        "buildable_envelope":    envelope,
        "flood_zone":            flood,
    }


def get_templates() -> list[dict[str, Any]]:
    """Return all available Dallas residential zoning templates."""
    return [
        {
            "code":            t.code,
            "name":            t.name,
            "max_height_ft":   t.height_ft,
            "front_setback":   t.front_setback_ft,
            "side_setback":    t.side_setback_ft,
            "rear_setback":    t.rear_setback_ft,
            "far":             t.far,
            "lot_coverage":    t.lot_coverage,
            "centroid_lat":    t.centroid_lat,
            "centroid_lng":    t.centroid_lng,
        }
        for t in TEMPLATES
    ]
