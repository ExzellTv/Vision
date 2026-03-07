"""Dallas residential zoning templates for seed data.

Ten zoning classifications covering single-family, duplex, and multifamily
residential districts per the Dallas Development Code (Chapter 51A).
"""

DALLAS_ZONING_TEMPLATES = [
    {"classification": "R-1ac", "description": "Single Family 1-Acre Estate", "max_height_ft": 36, "front_setback_ft": 40, "side_setback_ft": 15, "rear_setback_ft": 20, "far": 0.35, "lot_coverage_pct": 35},
    {"classification": "R-1", "description": "Single Family Residential", "max_height_ft": 36, "front_setback_ft": 30, "side_setback_ft": 5, "rear_setback_ft": 5, "far": 0.45, "lot_coverage_pct": 45},
    {"classification": "R-3", "description": "Single Family Small Lot", "max_height_ft": 36, "front_setback_ft": 25, "side_setback_ft": 5, "rear_setback_ft": 5, "far": 0.50, "lot_coverage_pct": 50},
    {"classification": "R-5", "description": "Single Family Compact", "max_height_ft": 36, "front_setback_ft": 20, "side_setback_ft": 5, "rear_setback_ft": 5, "far": 0.55, "lot_coverage_pct": 55},
    {"classification": "R-7.5", "description": "Single Family Standard", "max_height_ft": 36, "front_setback_ft": 25, "side_setback_ft": 5, "rear_setback_ft": 5, "far": 0.50, "lot_coverage_pct": 50},
    {"classification": "R-10", "description": "Single Family Medium Lot", "max_height_ft": 36, "front_setback_ft": 25, "side_setback_ft": 6, "rear_setback_ft": 8, "far": 0.45, "lot_coverage_pct": 45},
    {"classification": "R-13", "description": "Single Family Large Lot", "max_height_ft": 36, "front_setback_ft": 30, "side_setback_ft": 6, "rear_setback_ft": 10, "far": 0.40, "lot_coverage_pct": 40},
    {"classification": "R-16", "description": "Single Family Estate Lot", "max_height_ft": 36, "front_setback_ft": 30, "side_setback_ft": 8, "rear_setback_ft": 10, "far": 0.40, "lot_coverage_pct": 40},
    {"classification": "D(A)", "description": "Duplex Residential", "max_height_ft": 36, "front_setback_ft": 25, "side_setback_ft": 5, "rear_setback_ft": 5, "far": 0.60, "lot_coverage_pct": 60},
    {"classification": "MF-1", "description": "Multifamily Low Density", "max_height_ft": 36, "front_setback_ft": 15, "side_setback_ft": 10, "rear_setback_ft": 15, "far": 0.80, "lot_coverage_pct": 60},
]
