"""
Monte Carlo Risk Simulator — PRD Module 6

Runs 1,000-10,000 vectorized iterations over a real-estate
development pro-forma.  Uses numpy for performance.
Pure computation, no DB dependencies.
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

# ---------------------------------------------------------------------------
# Default capital-stack & timeline assumptions
# ---------------------------------------------------------------------------

DEFAULT_DEBT_RATIO         = 0.70
DEFAULT_EQUITY_RATIO       = 0.30
DEFAULT_INTEREST_RATE      = 0.06
DEFAULT_CONSTRUCTION_MO    = 12
DEFAULT_STABILIZATION_MO   = 15
DEFAULT_EXIT_YEAR          = 5
HISTOGRAM_BINS             = 20

# Default volatility parameters
_DEFAULT_VOLATILITY = {
    "material_price_volatility": 0.12,   # ±12 %
    "market_value_volatility":   0.08,   # ±8 %
    "interest_rate_sensitivity": 0.015,  # ±150 bps
    "construction_delay_mo":     3.0,    # avg delay months
    "occupancy_ramp_up_mo":      6.0,    # avg ramp months
}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_distributions(
    n: int,
    vol: dict[str, float],
    rng: np.random.Generator,
) -> dict[str, np.ndarray]:
    """Sample random variates for each risk variable."""
    return {
        "material_factor": rng.normal(1.0, vol["material_price_volatility"], n),
        "market_factor":   rng.normal(1.0, vol["market_value_volatility"], n),
        "rate_delta":      rng.normal(0.0, vol["interest_rate_sensitivity"], n),
        "delay_mo":        np.clip(rng.exponential(vol["construction_delay_mo"], n), 0, 18),
        "ramp_mo":         np.clip(rng.exponential(vol["occupancy_ramp_up_mo"], n), 0, 24),
    }


def _pro_forma(
    base_cost: float,
    base_value: float,
    material_factor: np.ndarray,
    market_factor: np.ndarray,
    rate_delta: np.ndarray,
    delay_mo: np.ndarray,
    ramp_mo: np.ndarray,
    debt_ratio: float,
    equity_ratio: float,
    interest_rate: float,
    construction_mo: int,
    exit_year: int,
) -> dict[str, np.ndarray]:
    """Vectorized pro-forma returning key metrics per iteration."""
    n = len(material_factor)

    # Adjusted cost & value
    total_cost  = base_cost * material_factor
    exit_value  = base_value * market_factor

    # Capital stack
    debt   = total_cost * debt_ratio
    equity = total_cost * equity_ratio

    # Interest carry (construction + delay + ramp)
    effective_rate = np.clip(interest_rate + rate_delta, 0.01, 0.15)
    carry_months   = construction_mo + delay_mo + ramp_mo
    interest_cost  = debt * effective_rate * (carry_months / 12.0)

    # Total invested
    total_invested = total_cost + interest_cost

    # Profit
    profit = exit_value - total_invested

    # Cash-on-cash (equity return)
    cash_on_cash = np.where(equity > 0, profit / equity, 0.0)

    # Simplified IRR approximation: annualized return over hold period
    hold_years = exit_year + delay_mo / 12.0 + ramp_mo / 12.0
    # Avoid division by zero / negatives
    safe_hold = np.clip(hold_years, 1.0, 20.0)
    return_multiple = np.clip(exit_value / np.clip(total_invested, 1.0, None), 0.01, 100.0)
    irr = np.power(return_multiple, 1.0 / safe_hold) - 1.0

    return {
        "total_cost":     total_cost,
        "exit_value":     exit_value,
        "interest_cost":  interest_cost,
        "total_invested": total_invested,
        "profit":         profit,
        "cash_on_cash":   cash_on_cash,
        "irr":            irr,
    }


def _histogram(data: np.ndarray, bins: int = HISTOGRAM_BINS) -> list[dict]:
    """Return histogram bucket data suitable for front-end charting."""
    counts, edges = np.histogram(data, bins=bins)
    buckets = []
    for i in range(len(counts)):
        buckets.append({
            "bin_low":  round(float(edges[i]), 2),
            "bin_high": round(float(edges[i + 1]), 2),
            "count":    int(counts[i]),
        })
    return buckets


def _sensitivity_table(
    base_cost: float,
    base_value: float,
    vol: dict[str, float],
    rng: np.random.Generator,
) -> list[dict]:
    """One-at-a-time sensitivity on profit, varying each factor ±1 sigma."""
    results = []
    # Baseline profit (no randomness)
    baseline_profit = base_value - base_cost * (
        1.0 + DEFAULT_DEBT_RATIO * DEFAULT_INTEREST_RATE * DEFAULT_CONSTRUCTION_MO / 12.0
    )

    for var_name, sigma in vol.items():
        low_profit  = baseline_profit
        high_profit = baseline_profit

        if var_name == "material_price_volatility":
            low_profit  = base_value - base_cost * (1.0 - sigma) * 1.05
            high_profit = base_value - base_cost * (1.0 + sigma) * 1.05
        elif var_name == "market_value_volatility":
            low_profit  = base_value * (1.0 - sigma) - base_cost * 1.05
            high_profit = base_value * (1.0 + sigma) - base_cost * 1.05
        elif var_name == "interest_rate_sensitivity":
            low_profit  = baseline_profit + base_cost * DEFAULT_DEBT_RATIO * sigma
            high_profit = baseline_profit - base_cost * DEFAULT_DEBT_RATIO * sigma
        elif var_name == "construction_delay_mo":
            extra = base_cost * DEFAULT_DEBT_RATIO * DEFAULT_INTEREST_RATE * sigma / 12.0
            low_profit  = baseline_profit + extra * 0.5
            high_profit = baseline_profit - extra * 1.5
        elif var_name == "occupancy_ramp_up_mo":
            extra = base_cost * DEFAULT_DEBT_RATIO * DEFAULT_INTEREST_RATE * sigma / 12.0
            low_profit  = baseline_profit + extra * 0.3
            high_profit = baseline_profit - extra * 1.2

        results.append({
            "variable":    var_name,
            "sigma":       round(sigma, 4),
            "profit_low":  round(float(low_profit), 2),
            "profit_high": round(float(high_profit), 2),
            "impact":      round(abs(float(high_profit - low_profit)), 2),
        })

    # Sort descending by impact
    results.sort(key=lambda r: r["impact"], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def simulate(
    base_cost: float,
    base_value: float,
    iterations: int = 1_000,
    volatility_params: dict[str, float] | None = None,
    seed: int | None = None,
) -> dict[str, Any]:
    """Run Monte Carlo simulation on a development pro-forma.

    Parameters
    ----------
    base_cost : float
        Total development cost ($).
    base_value : float
        Expected exit / market value ($).
    iterations : int
        Number of simulation runs (1,000 – 10,000).
    volatility_params : dict, optional
        Override any key from ``_DEFAULT_VOLATILITY``.
    seed : int, optional
        RNG seed for reproducibility.

    Returns
    -------
    dict
        profit_histogram, mean, std_dev, var_95, irr statistics,
        downside_probability, cash_on_cash stats, sensitivity_table,
        elapsed_seconds.
    """
    iterations = max(100, min(iterations, 10_000))
    rng = np.random.default_rng(seed)

    vol = dict(_DEFAULT_VOLATILITY)
    if volatility_params:
        vol.update(volatility_params)

    t0 = time.perf_counter()

    # Sample distributions
    dists = _build_distributions(iterations, vol, rng)

    # Run vectorized pro-forma
    results = _pro_forma(
        base_cost=base_cost,
        base_value=base_value,
        material_factor=dists["material_factor"],
        market_factor=dists["market_factor"],
        rate_delta=dists["rate_delta"],
        delay_mo=dists["delay_mo"],
        ramp_mo=dists["ramp_mo"],
        debt_ratio=DEFAULT_DEBT_RATIO,
        equity_ratio=DEFAULT_EQUITY_RATIO,
        interest_rate=DEFAULT_INTEREST_RATE,
        construction_mo=DEFAULT_CONSTRUCTION_MO,
        exit_year=DEFAULT_EXIT_YEAR,
    )

    profit = results["profit"]
    irr    = results["irr"]
    coc    = results["cash_on_cash"]

    elapsed = time.perf_counter() - t0

    # Statistics
    profit_mean  = float(np.mean(profit))
    profit_std   = float(np.std(profit))
    var_95       = float(np.percentile(profit, 5))  # 5th percentile = VaR 95
    downside_prob = float(np.mean(profit < 0))

    irr_mean = float(np.mean(irr))
    irr_p10  = float(np.percentile(irr, 10))
    irr_p90  = float(np.percentile(irr, 90))

    coc_mean = float(np.mean(coc))
    coc_p10  = float(np.percentile(coc, 10))
    coc_p90  = float(np.percentile(coc, 90))

    # Sensitivity
    sens = _sensitivity_table(base_cost, base_value, vol, rng)

    return {
        "iterations":            iterations,
        "elapsed_seconds":       round(elapsed, 3),
        "profit_histogram":      _histogram(profit),
        "mean_profit":           round(profit_mean, 2),
        "std_dev_profit":        round(profit_std, 2),
        "var_95":                round(var_95, 2),
        "downside_probability":  round(downside_prob, 4),
        "irr": {
            "mean":  round(irr_mean, 4),
            "p10":   round(irr_p10, 4),
            "p90":   round(irr_p90, 4),
        },
        "cash_on_cash": {
            "mean":  round(coc_mean, 4),
            "p10":   round(coc_p10, 4),
            "p90":   round(coc_p90, 4),
        },
        "sensitivity_table":     sens,
        "assumptions": {
            "debt_ratio":        DEFAULT_DEBT_RATIO,
            "equity_ratio":      DEFAULT_EQUITY_RATIO,
            "interest_rate":     DEFAULT_INTEREST_RATE,
            "construction_mo":   DEFAULT_CONSTRUCTION_MO,
            "stabilization_mo":  DEFAULT_STABILIZATION_MO,
            "exit_year":         DEFAULT_EXIT_YEAR,
            "volatility":        vol,
        },
    }
