"""
ML Cost Prediction — PRD Module 4

Ensemble of 3 synthetic models (Linear Regression, Random Forest, MLP)
calibrated to Dallas residential construction at $120-$220/SF.
No actual training — deterministic formulas simulate realistic predictions.
"""

from __future__ import annotations

import math
from typing import Any

# ---------------------------------------------------------------------------
# Feature definitions & normalization ranges (Dallas residential)
# ---------------------------------------------------------------------------

FEATURE_NAMES: list[str] = [
    "square_footage",       # 800 – 5000 SF
    "structural_span_ft",   # 12 – 40 ft
    "stories",              # 1 – 3
    "foundation_type",      # 0=slab, 1=pier, 2=basement
    "material_type",        # 0=wood, 1=steel, 2=concrete
    "section_weight_plf",   # 10 – 60 plf
    "dead_load_psf",        # 10 – 30 psf
    "live_load_psf",        # 30 – 60 psf
    "seismic_zone",         # 0 – 4
    "soil_classification",  # 0=rock, 1=stiff, 2=soft, 3=expansive
    "labor_market_index",   # 0.80 – 1.30
    "material_price_index", # 0.85 – 1.25
]

_RANGES: dict[str, tuple[float, float]] = {
    "square_footage":       (800.0, 5000.0),
    "structural_span_ft":   (12.0,  40.0),
    "stories":              (1.0,   3.0),
    "foundation_type":      (0.0,   2.0),
    "material_type":        (0.0,   2.0),
    "section_weight_plf":   (10.0,  60.0),
    "dead_load_psf":        (10.0,  30.0),
    "live_load_psf":        (30.0,  60.0),
    "seismic_zone":         (0.0,   4.0),
    "soil_classification":  (0.0,   3.0),
    "labor_market_index":   (0.80,  1.30),
    "material_price_index": (0.85,  1.25),
}

# Hardcoded realistic model metrics
MODEL_METRICS: dict[str, dict[str, float]] = {
    "random_forest": {
        "r_squared": 0.934,
        "mae_per_sf": 8.2,
        "rmse_per_sf": 11.4,
    },
    "linear_regression": {
        "r_squared": 0.891,
        "mae_per_sf": 11.7,
        "rmse_per_sf": 15.3,
    },
    "mlp": {
        "r_squared": 0.918,
        "mae_per_sf": 9.5,
        "rmse_per_sf": 12.8,
    },
}

# Feature importance weights (calibrated so RF dominates ensemble)
_FEATURE_IMPORTANCE: dict[str, float] = {
    "square_footage":       0.22,
    "material_type":        0.15,
    "labor_market_index":   0.13,
    "material_price_index": 0.12,
    "foundation_type":      0.08,
    "structural_span_ft":   0.07,
    "stories":              0.06,
    "dead_load_psf":        0.04,
    "live_load_psf":        0.04,
    "section_weight_plf":   0.03,
    "seismic_zone":         0.03,
    "soil_classification":  0.03,
}

# Ensemble weights
_ENSEMBLE_WEIGHTS = {"linear_regression": 0.20, "random_forest": 0.50, "mlp": 0.30}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _normalize(value: float, lo: float, hi: float) -> float:
    """Min-max normalize to [0, 1]."""
    if hi == lo:
        return 0.5
    return max(0.0, min(1.0, (value - lo) / (hi - lo)))


def _get_normalized(features: dict) -> dict[str, float]:
    """Return normalized feature vector with defaults for missing keys."""
    normed: dict[str, float] = {}
    defaults: dict[str, float] = {
        "square_footage": 2000, "structural_span_ft": 24, "stories": 1,
        "foundation_type": 0, "material_type": 0, "section_weight_plf": 25,
        "dead_load_psf": 15, "live_load_psf": 40, "seismic_zone": 1,
        "soil_classification": 1, "labor_market_index": 1.0,
        "material_price_index": 1.0,
    }
    for name in FEATURE_NAMES:
        raw = float(features.get(name, defaults[name]))
        lo, hi = _RANGES[name]
        normed[name] = _normalize(raw, lo, hi)
    return normed


# ---------------------------------------------------------------------------
# Synthetic model functions — each returns $/SF
# ---------------------------------------------------------------------------

def _linear_regression(n: dict[str, float]) -> float:
    """Weighted linear combination → $/SF."""
    base = 140.0
    base += n["square_footage"] * -20.0       # larger → economies of scale
    base += n["material_type"] * 35.0         # steel/concrete cost more
    base += n["foundation_type"] * 18.0
    base += n["structural_span_ft"] * 12.0
    base += n["stories"] * 10.0
    base += n["labor_market_index"] * 22.0
    base += n["material_price_index"] * 20.0
    base += n["dead_load_psf"] * 5.0
    base += n["live_load_psf"] * 4.0
    base += n["seismic_zone"] * 6.0
    base += n["soil_classification"] * 8.0
    base += n["section_weight_plf"] * 3.0
    return base


def _random_forest(n: dict[str, float]) -> float:
    """Non-linear formula simulating tree-based ensemble."""
    base = 145.0
    # Size discount with diminishing returns
    size_effect = -25.0 * n["square_footage"] + 5.0 * n["square_footage"] ** 2
    base += size_effect
    # Material uplift with interaction
    mat = n["material_type"]
    base += mat * 30.0 + mat * n["structural_span_ft"] * 10.0
    # Foundation interaction with soil
    base += n["foundation_type"] * 15.0 + n["soil_classification"] * n["foundation_type"] * 8.0
    # Market indices
    base += n["labor_market_index"] * 25.0
    base += n["material_price_index"] * 22.0
    # Structural
    base += n["stories"] * 8.0
    base += n["dead_load_psf"] * 4.5
    base += n["live_load_psf"] * 3.5
    base += n["seismic_zone"] * 5.0
    base += n["section_weight_plf"] * 2.5
    return base


def _mlp(n: dict[str, float]) -> float:
    """Simulated neural network with sigmoid activations."""
    # Hidden layer 1 (3 neurons)
    h1 = 1.0 / (1.0 + math.exp(-(2.0 * n["square_footage"] - 1.5 * n["material_type"] + n["labor_market_index"] - 1.0)))
    h2 = 1.0 / (1.0 + math.exp(-(1.5 * n["foundation_type"] + n["soil_classification"] + n["stories"] - 1.2)))
    h3 = 1.0 / (1.0 + math.exp(-(n["material_price_index"] + 0.8 * n["structural_span_ft"] + 0.5 * n["seismic_zone"] - 0.9)))

    # Output layer
    cost_sf = 130.0 + h1 * (-15.0) + h2 * 40.0 + h3 * 35.0
    # Small contributions from remaining features
    cost_sf += n["dead_load_psf"] * 5.0
    cost_sf += n["live_load_psf"] * 4.0
    cost_sf += n["section_weight_plf"] * 3.0
    return cost_sf


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def predict(features: dict) -> dict[str, Any]:
    """Predict construction cost per SF using a synthetic ensemble.

    Parameters
    ----------
    features : dict
        Keys from ``FEATURE_NAMES``.  Missing keys receive sensible defaults.

    Returns
    -------
    dict
        {
            "cost_per_sf": float,
            "total_cost": float,
            "confidence_interval_95": {"low": float, "high": float},
            "feature_importance": dict[str, float],
            "model_metrics": dict,
            "individual_models": {
                "linear_regression": float,
                "random_forest": float,
                "mlp": float,
            },
        }
    """
    normed = _get_normalized(features)
    sf = float(features.get("square_footage", 2000))

    # Individual model predictions
    lr_pred = _linear_regression(normed)
    rf_pred = _random_forest(normed)
    mlp_pred = _mlp(normed)

    # Clamp each to the Dallas range
    lr_pred  = max(120.0, min(220.0, lr_pred))
    rf_pred  = max(120.0, min(220.0, rf_pred))
    mlp_pred = max(120.0, min(220.0, mlp_pred))

    # Weighted ensemble
    cost_per_sf = (
        _ENSEMBLE_WEIGHTS["linear_regression"] * lr_pred
        + _ENSEMBLE_WEIGHTS["random_forest"] * rf_pred
        + _ENSEMBLE_WEIGHTS["mlp"] * mlp_pred
    )

    total_cost = cost_per_sf * sf

    # 95 % CI derived from RF RMSE
    rmse = MODEL_METRICS["random_forest"]["rmse_per_sf"]
    ci_low  = cost_per_sf - 1.96 * rmse
    ci_high = cost_per_sf + 1.96 * rmse

    return {
        "cost_per_sf": round(cost_per_sf, 2),
        "total_cost": round(total_cost, 2),
        "confidence_interval_95": {
            "low": round(ci_low, 2),
            "high": round(ci_high, 2),
        },
        "feature_importance": _FEATURE_IMPORTANCE,
        "model_metrics": MODEL_METRICS,
        "individual_models": {
            "linear_regression": round(lr_pred, 2),
            "random_forest": round(rf_pred, 2),
            "mlp": round(mlp_pred, 2),
        },
    }
