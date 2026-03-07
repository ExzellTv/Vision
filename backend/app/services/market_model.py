"""
Market Valuation — PRD Module 5

ARV (After-Repair Value) estimation using comparable-sales regression
and demographic scoring.  Calibrated to Dallas median ~$375K.
Pure computation, no DB dependencies.
"""

from __future__ import annotations

import math
from typing import Any

# ---------------------------------------------------------------------------
# Dallas baseline calibration
# ---------------------------------------------------------------------------

DALLAS_MEDIAN_VALUE  = 375_000.0
DALLAS_MEDIAN_SF     = 2_100.0
DALLAS_MEDIAN_PSF    = DALLAS_MEDIAN_VALUE / DALLAS_MEDIAN_SF  # ~$178.57

# Growth-rate scenarios (annual)
GROWTH_RATES = {"best": 0.08, "expected": 0.05, "low": 0.03}

# Rental yield band
RENTAL_YIELD_RANGE = (0.055, 0.080)

# Cap-rate scenarios
CAP_RATE_SCENARIOS = {
    "conservative": 0.065,
    "target":       0.058,
    "aggressive":   0.052,
}

# Dallas bounding box for demographic scoring
_LAT_RANGE = (32.62, 33.02)
_LNG_RANGE = (-97.00, -96.46)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _price_per_sf_regression(
    sf: float,
    bedrooms: int,
    bathrooms: float,
    stories: int,
    quality_score: float,
) -> float:
    """Hedonic regression returning estimated $/SF.

    quality_score is 1-10 (1=builder-grade, 10=luxury).
    """
    # Base $/SF from Dallas median
    base_psf = DALLAS_MEDIAN_PSF

    # Size adjustment: mild economy of scale
    size_norm = (sf - DALLAS_MEDIAN_SF) / DALLAS_MEDIAN_SF
    base_psf -= size_norm * 15.0

    # Bedroom / bath premiums
    base_psf += (bedrooms - 3) * 3.0
    base_psf += (bathrooms - 2) * 5.0

    # Stories premium (two-story marginally cheaper per SF)
    if stories >= 2:
        base_psf -= 4.0 * (stories - 1)

    # Quality multiplier: 1.0 at quality 5, ±6 % per point
    quality_mult = 1.0 + (quality_score - 5.0) * 0.06
    base_psf *= quality_mult

    return max(base_psf, 80.0)


def _adjust_with_comparables(
    base_psf: float,
    comparables: list[dict],
) -> float:
    """Blend base regression with comparable-sales data."""
    if not comparables:
        return base_psf

    comp_psfs = []
    for c in comparables:
        price = c.get("sale_price", 0)
        csf   = c.get("square_footage", 1)
        if price > 0 and csf > 0:
            comp_psfs.append(price / csf)

    if not comp_psfs:
        return base_psf

    comp_avg = sum(comp_psfs) / len(comp_psfs)
    # Weight: 60 % comps, 40 % regression
    return 0.60 * comp_avg + 0.40 * base_psf


def _demographic_score(lat: float, lng: float) -> float:
    """Simplified demographic desirability score (0-10).

    Heuristic: distance from Dallas core (32.78, -96.80) — closer is higher.
    """
    core_lat, core_lng = 32.78, -96.80
    dist = math.sqrt((lat - core_lat) ** 2 + (lng - core_lng) ** 2)
    # Max useful distance ~0.3 degrees (~20 mi)
    score = max(0.0, 10.0 - dist / 0.03)
    return round(min(score, 10.0), 1)


def _growth_alerts(
    demographic_score: float,
    quality_score: float,
) -> list[str]:
    """Generate growth-related alerts."""
    alerts: list[str] = []
    if demographic_score >= 8.0:
        alerts.append("High-growth corridor — above-average appreciation expected")
    if demographic_score <= 4.0:
        alerts.append("Below-average demographic growth — exercise caution")
    if quality_score >= 8:
        alerts.append("Premium finish level may outpace neighborhood median")
    if quality_score <= 3:
        alerts.append("Builder-grade finishes — value-add opportunity exists")
    return alerts


def _rental_yield(demographic_score: float) -> float:
    """Estimate gross rental yield based on location quality.

    Higher demographic score → lower yield (cap rate compression).
    """
    lo, hi = RENTAL_YIELD_RANGE
    # Invert: score 10 → low yield, score 0 → high yield
    t = demographic_score / 10.0
    return round(hi - t * (hi - lo), 4)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def estimate(
    building_specs: dict,
    location: dict,
    comparables: list[dict] | None = None,
) -> dict[str, Any]:
    """Estimate after-repair market value.

    Parameters
    ----------
    building_specs : dict
        square_footage, bedrooms, bathrooms, stories, quality_score (1-10)
    location : dict
        lat, lng
    comparables : list[dict], optional
        Each dict: sale_price, square_footage, (optionally) sale_date

    Returns
    -------
    dict
        market_value, confidence_range, price_per_sf,
        five_year_forecast, rental_yield, cap_rate_sensitivity,
        demographic_score, growth_alerts
    """
    comparables = comparables or []

    sf            = float(building_specs.get("square_footage", DALLAS_MEDIAN_SF))
    bedrooms      = int(building_specs.get("bedrooms", 3))
    bathrooms     = float(building_specs.get("bathrooms", 2.0))
    stories       = int(building_specs.get("stories", 1))
    quality_score = float(building_specs.get("quality_score", 5.0))

    lat = float(location.get("lat", 32.78))
    lng = float(location.get("lng", -96.80))

    # 1. Regression + comparables
    base_psf = _price_per_sf_regression(sf, bedrooms, bathrooms, stories, quality_score)
    blended_psf = _adjust_with_comparables(base_psf, comparables)
    market_value = blended_psf * sf

    # 2. Confidence range (±5-10 % depending on comp count)
    margin_pct = 0.10 if len(comparables) < 3 else 0.05
    confidence_range = {
        "low":  round(market_value * (1.0 - margin_pct), 2),
        "high": round(market_value * (1.0 + margin_pct), 2),
        "margin_pct": margin_pct,
    }

    # 3. Five-year forecast
    five_year_forecast: dict[str, list[dict]] = {}
    for scenario, rate in GROWTH_RATES.items():
        yearly = []
        for yr in range(1, 6):
            projected = market_value * (1.0 + rate) ** yr
            yearly.append({"year": yr, "value": round(projected, 2)})
        five_year_forecast[scenario] = yearly

    # 4. Demographics
    demo_score = _demographic_score(lat, lng)

    # 5. Rental yield & cap-rate sensitivity
    ry = _rental_yield(demo_score)

    cap_sensitivity: dict[str, dict] = {}
    annual_rent = market_value * ry
    for label, cap in CAP_RATE_SCENARIOS.items():
        implied_value = annual_rent / cap if cap else 0.0
        cap_sensitivity[label] = {
            "cap_rate": cap,
            "implied_value": round(implied_value, 2),
        }

    # 6. Growth alerts
    alerts = _growth_alerts(demo_score, quality_score)

    return {
        "market_value":          round(market_value, 2),
        "confidence_range":      confidence_range,
        "price_per_sf":          round(blended_psf, 2),
        "five_year_forecast":    five_year_forecast,
        "rental_yield":          ry,
        "annual_rent_estimate":  round(annual_rent, 2),
        "cap_rate_sensitivity":  cap_sensitivity,
        "demographic_score":     demo_score,
        "growth_alerts":         alerts,
    }
