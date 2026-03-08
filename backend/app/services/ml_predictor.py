"""
ML Cost Prediction — Real Trained Model

Trains on actual Dallas comparable sales data (Redfin API) to predict:
1. Sale price per SF (regression via GradientBoosting)
2. Neighborhood price tier (clustering via KMeans)
3. Construction cost $/SF calibrated to local market

Falls back to analytical formulas if no trained model is available.
"""

from __future__ import annotations

import json
import math
import logging
from pathlib import Path
from typing import Any

import numpy as np
import joblib
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import cross_val_score

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"
_COMPS_PATH = Path(__file__).resolve().parent.parent.parent.parent / "Comparables (1).json"
_LAND_PATH = Path(__file__).resolve().parent.parent.parent.parent / "Dallas Land Data.json"

_REGRESSOR_PATH = _MODEL_DIR / "price_regressor.joblib"
_CLUSTER_PATH = _MODEL_DIR / "neighborhood_clusters.joblib"
_SCALER_PATH = _MODEL_DIR / "feature_scaler.joblib"
_METADATA_PATH = _MODEL_DIR / "model_metadata.json"

# ---------------------------------------------------------------------------
# Feature definitions
# ---------------------------------------------------------------------------

FEATURE_NAMES: list[str] = [
    "square_footage",       # 452 – 5000 SF
    "bedrooms",             # 1 – 6
    "bathrooms",            # 1 – 4.5
    "latitude",             # 32.66 – 32.86
    "longitude",            # -96.95 – -96.64
    "dist_to_core",         # miles to downtown Dallas
]

# Known zipcodes in our training data — encoded as one-hot features
_KNOWN_ZIPS: list[str] = []

# Dallas downtown core
_CORE_LAT, _CORE_LNG = 32.7767, -96.7970

# In-memory cached models
_regressor: GradientBoostingRegressor | None = None
_cluster_model: KMeans | None = None
_scaler: StandardScaler | None = None
_is_trained: bool = False
_feature_importance: dict[str, float] = {}
_model_metrics: dict[str, Any] = {}
_zip_medians: dict[str, float] = {}  # zipcode → median $/SF for blending

# Layer Editor material cost baselines (from LayerEditor.jsx)
_LAYER_COST_BASELINES = {
    "foundation":   {"min": 38000, "max": 45000, "pct_of_total": 0.18},
    "framing":      {"min": 48000, "max": 62000, "pct_of_total": 0.24},
    "sheathing":    {"min": 18000, "max": 44000, "pct_of_total": 0.10},
    "insulation":   {"min": 12000, "max": 34000, "pct_of_total": 0.08},
    "drywall":      {"min": 14000, "max": 19000, "pct_of_total": 0.07},
    "cladding":     {"min": 16000, "max": 52000, "pct_of_total": 0.14},
    "paint":        {"min": 4000,  "max": 9000,  "pct_of_total": 0.03},
    "roof":         {"min": 11000, "max": 48000, "pct_of_total": 0.16},
}


# ---------------------------------------------------------------------------
# Haversine distance (miles)
# ---------------------------------------------------------------------------

def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 3958.8
    dLat = math.radians(lat2 - lat1)
    dLng = math.radians(lng2 - lng1)
    a = (math.sin(dLat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dLng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ---------------------------------------------------------------------------
# Data loading & feature extraction
# ---------------------------------------------------------------------------

def _load_comparables() -> list[dict]:
    """Load and filter comparable sales to residential scale."""
    if not _COMPS_PATH.exists():
        logger.warning("Comparables file not found at %s", _COMPS_PATH)
        return []

    with open(_COMPS_PATH) as f:
        data = json.load(f)

    props = data.get("properties", [])
    filtered = []
    for p in props:
        area = p.get("area")
        price = p.get("price")
        beds = p.get("beds")
        baths = p.get("baths")
        lat = p.get("latitude")
        lng = p.get("longitude")

        if (area and price and beds and baths and lat and lng
                and 400 < area < 5000
                and 50_000 < price < 600_000
                and 1 <= beds <= 6
                and 1 <= baths <= 5):
            filtered.append({
                "price": price,
                "square_footage": area,
                "bedrooms": beds,
                "bathrooms": baths,
                "latitude": lat,
                "longitude": lng,
                "price_per_sf": price / area,
                "dist_to_core": _haversine(lat, lng, _CORE_LAT, _CORE_LNG),
                "zipcode": p.get("address", {}).get("zipcode", ""),
            })

    logger.info("Loaded %d residential comparables from %d total", len(filtered), len(props))
    return filtered


def _extract_features(records: list[dict], zip_list: list[str] | None = None) -> np.ndarray:
    """Extract feature matrix from comparable records.

    Includes base features + one-hot zipcode encoding for spatial signal.
    """
    zips = zip_list or _KNOWN_ZIPS
    n_base = len(FEATURE_NAMES)
    n_zip = len(zips)
    X = np.zeros((len(records), n_base + n_zip))
    for i, r in enumerate(records):
        X[i, 0] = r["square_footage"]
        X[i, 1] = r["bedrooms"]
        X[i, 2] = r["bathrooms"]
        X[i, 3] = r["latitude"]
        X[i, 4] = r["longitude"]
        X[i, 5] = r["dist_to_core"]
        # One-hot zipcode
        z = r.get("zipcode", "")
        if z in zips:
            X[i, n_base + zips.index(z)] = 1.0
    return X


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train() -> dict[str, Any]:
    """Train models on real comparable sales data.

    Returns training metrics and cluster info.
    """
    global _regressor, _cluster_model, _scaler, _is_trained
    global _feature_importance, _model_metrics, _KNOWN_ZIPS, _zip_medians

    comparables = _load_comparables()
    if len(comparables) < 20:
        return {"error": "Insufficient data", "comparables_found": len(comparables)}

    y_price_psf = np.array([c["price_per_sf"] for c in comparables])

    # ---------- Build zipcode vocabulary & medians ----------
    from collections import defaultdict
    zip_prices: dict[str, list[float]] = defaultdict(list)
    for c in comparables:
        z = c.get("zipcode", "")
        if z:
            zip_prices[z].append(c["price_per_sf"])

    # Only keep zips with >= 5 samples for reliable encoding
    _KNOWN_ZIPS = sorted(z for z, prices in zip_prices.items() if len(prices) >= 5)
    _zip_medians = {
        z: float(np.median(prices)) for z, prices in zip_prices.items()
    }

    X = _extract_features(comparables, _KNOWN_ZIPS)

    # ---------- Scale features ----------
    _scaler = StandardScaler()
    X_scaled = _scaler.fit_transform(X)

    # ---------- 1. Price regression (GradientBoosting) ----------
    _regressor = GradientBoostingRegressor(
        n_estimators=150,
        max_depth=3,
        learning_rate=0.05,
        min_samples_leaf=8,
        min_samples_split=12,
        subsample=0.8,
        max_features=0.8,
        random_state=42,
    )
    _regressor.fit(X_scaled, y_price_psf)

    # Grouped cross-validation by zipcode for spatial data
    from sklearn.model_selection import GroupKFold
    groups = np.array([c.get("zipcode", "unknown") for c in comparables])
    unique_groups = np.unique(groups)
    n_splits = min(5, len(unique_groups))
    if n_splits >= 2:
        gkf = GroupKFold(n_splits=n_splits)
        cv_scores = cross_val_score(
            _regressor, X_scaled, y_price_psf, cv=gkf, groups=groups, scoring="r2",
        )
        cv_mae = -cross_val_score(
            _regressor, X_scaled, y_price_psf, cv=gkf, groups=groups,
            scoring="neg_mean_absolute_error",
        )
    else:
        cv_scores = cross_val_score(_regressor, X_scaled, y_price_psf, cv=3, scoring="r2")
        cv_mae = -cross_val_score(
            _regressor, X_scaled, y_price_psf, cv=3, scoring="neg_mean_absolute_error",
        )

    # Train-set metrics
    y_pred = _regressor.predict(X_scaled)
    residuals = y_price_psf - y_pred
    train_r2 = 1.0 - np.sum(residuals ** 2) / np.sum((y_price_psf - np.mean(y_price_psf)) ** 2)
    train_mae = np.mean(np.abs(residuals))
    train_rmse = np.sqrt(np.mean(residuals ** 2))

    # Feature importance (map back to readable names)
    raw_importances = _regressor.feature_importances_
    all_feature_names = FEATURE_NAMES + [f"zip_{z}" for z in _KNOWN_ZIPS]
    _feature_importance = {
        name: round(float(imp), 4)
        for name, imp in sorted(
            zip(all_feature_names, raw_importances), key=lambda x: -x[1],
        )
        if imp > 0.005  # only report meaningful features
    }

    # ---------- 2. Neighborhood clustering (KMeans) ----------
    cluster_features = np.column_stack([
        X[:, 3],  # latitude
        X[:, 4],  # longitude
        y_price_psf / np.max(y_price_psf),  # normalized price
    ])
    n_clusters = min(5, len(comparables) // 10)
    _cluster_model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    _cluster_model.fit(cluster_features)
    cluster_labels = _cluster_model.labels_

    # Cluster summaries
    cluster_info = []
    for k in range(n_clusters):
        mask = cluster_labels == k
        cluster_prices = y_price_psf[mask]
        cluster_sf = X[mask, 0]
        cluster_info.append({
            "cluster_id": k,
            "count": int(np.sum(mask)),
            "avg_psf": round(float(np.mean(cluster_prices)), 2),
            "median_psf": round(float(np.median(cluster_prices)), 2),
            "min_psf": round(float(np.min(cluster_prices)), 2),
            "max_psf": round(float(np.max(cluster_prices)), 2),
            "avg_sf": round(float(np.mean(cluster_sf)), 0),
            "center_lat": round(float(_cluster_model.cluster_centers_[k, 0]), 4),
            "center_lng": round(float(_cluster_model.cluster_centers_[k, 1]), 4),
        })
    cluster_info.sort(key=lambda c: c["avg_psf"], reverse=True)

    # ---------- Store metrics ----------
    _model_metrics = {
        "training_samples": len(comparables),
        "features": len(FEATURE_NAMES),
        "regressor": {
            "type": "GradientBoostingRegressor",
            "train_r2": round(float(train_r2), 4),
            "train_mae_psf": round(float(train_mae), 2),
            "train_rmse_psf": round(float(train_rmse), 2),
            "cv_r2_mean": round(float(np.mean(cv_scores)), 4),
            "cv_r2_std": round(float(np.std(cv_scores)), 4),
            "cv_mae_mean_psf": round(float(np.mean(cv_mae)), 2),
        },
        "clusters": {
            "type": "KMeans",
            "n_clusters": n_clusters,
            "inertia": round(float(_cluster_model.inertia_), 2),
            "cluster_summaries": cluster_info,
        },
        "price_distribution": {
            "mean_psf": round(float(np.mean(y_price_psf)), 2),
            "median_psf": round(float(np.median(y_price_psf)), 2),
            "std_psf": round(float(np.std(y_price_psf)), 2),
            "min_psf": round(float(np.min(y_price_psf)), 2),
            "max_psf": round(float(np.max(y_price_psf)), 2),
        },
    }

    # ---------- Save to disk ----------
    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(_regressor, _REGRESSOR_PATH)
    joblib.dump(_cluster_model, _CLUSTER_PATH)
    joblib.dump(_scaler, _SCALER_PATH)
    with open(_METADATA_PATH, "w") as f:
        json.dump({
            "metrics": _model_metrics,
            "feature_importance": _feature_importance,
            "feature_names": FEATURE_NAMES,
            "known_zips": _KNOWN_ZIPS,
            "zip_medians": _zip_medians,
        }, f, indent=2)

    _is_trained = True
    logger.info(
        "Model trained: R²=%.3f (CV=%.3f), MAE=$%.0f/SF, %d clusters, %d zip features",
        train_r2, np.mean(cv_scores), train_mae, n_clusters, len(_KNOWN_ZIPS),
    )

    return {
        "status": "trained",
        "metrics": _model_metrics,
        "feature_importance": _feature_importance,
    }


def _load_models() -> bool:
    """Load previously trained models from disk."""
    global _regressor, _cluster_model, _scaler, _is_trained
    global _feature_importance, _model_metrics, _KNOWN_ZIPS, _zip_medians

    required = [_REGRESSOR_PATH, _CLUSTER_PATH, _SCALER_PATH, _METADATA_PATH]
    if not all(p.exists() for p in required):
        return False

    try:
        _regressor = joblib.load(_REGRESSOR_PATH)
        _cluster_model = joblib.load(_CLUSTER_PATH)
        _scaler = joblib.load(_SCALER_PATH)
        with open(_METADATA_PATH) as f:
            meta = json.load(f)
        _feature_importance = meta.get("feature_importance", {})
        _model_metrics = meta.get("metrics", {})
        _KNOWN_ZIPS = meta.get("known_zips", [])
        _zip_medians = meta.get("zip_medians", {})
        _is_trained = True
        logger.info("Loaded trained models from %s", _MODEL_DIR)
        return True
    except Exception as e:
        logger.warning("Failed to load models: %s", e)
        return False


def ensure_trained() -> None:
    """Load from disk or train fresh if needed."""
    global _is_trained
    if _is_trained:
        return
    if not _load_models():
        logger.info("No saved models found — training from scratch...")
        result = train()
        if "error" in result:
            logger.warning("Training failed: %s", result["error"])


# ---------------------------------------------------------------------------
# Analytical fallback
# ---------------------------------------------------------------------------

def _analytical_fallback(features: dict) -> dict[str, Any]:
    """Deterministic fallback when no trained model is available."""
    sf = float(features.get("square_footage", 2000))
    beds = int(features.get("bedrooms", 3))
    baths = float(features.get("bathrooms", 2.0))

    base_psf = 178.0
    base_psf -= (sf - 2100) / 2100 * 15.0
    base_psf += (beds - 3) * 3.0
    base_psf += (baths - 2) * 5.0
    cost_psf = max(80.0, min(400.0, base_psf))

    return {
        "cost_per_sf": round(cost_psf, 2),
        "total_cost": round(cost_psf * sf, 2),
        "confidence_interval_95": {
            "low": round(cost_psf * 0.85, 2),
            "high": round(cost_psf * 1.15, 2),
        },
        "model_type": "analytical_fallback",
        "feature_importance": {
            "square_footage": 0.35, "bedrooms": 0.15, "bathrooms": 0.15,
            "latitude": 0.15, "longitude": 0.10, "dist_to_core": 0.10,
        },
        "model_metrics": {},
        "cluster": None,
        "neighborhood_tier": "unknown",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def predict(features: dict) -> dict[str, Any]:
    """Predict market price per SF and construction feasibility metrics.

    Parameters
    ----------
    features : dict
        Keys: square_footage, bedrooms, bathrooms, latitude, longitude
        Optional: quality_score, land_cost

    Returns
    -------
    dict
        cost_per_sf, total_cost, confidence_interval_95,
        feature_importance, model_metrics, cluster info,
        construction_cost_breakdown, feasibility_indicators
    """
    ensure_trained()

    if not _is_trained:
        return _analytical_fallback(features)

    sf = float(features.get("square_footage", 2000))
    beds = int(features.get("bedrooms", 3))
    baths = float(features.get("bathrooms", 2.0))
    lat = float(features.get("latitude", _CORE_LAT))
    lng = float(features.get("longitude", _CORE_LNG))
    zipcode = str(features.get("zipcode", ""))
    dist_core = _haversine(lat, lng, _CORE_LAT, _CORE_LNG)

    # Build feature vector with zipcode encoding
    record = {
        "square_footage": sf, "bedrooms": beds, "bathrooms": baths,
        "latitude": lat, "longitude": lng, "dist_to_core": dist_core,
        "zipcode": zipcode,
    }
    X = _extract_features([record], _KNOWN_ZIPS)
    X_scaled = _scaler.transform(X)

    # ---------- Price prediction ----------
    predicted_psf = float(_regressor.predict(X_scaled)[0])

    rmse = _model_metrics.get("regressor", {}).get("train_rmse_psf", 15.0)
    ci_low = predicted_psf - 1.96 * rmse
    ci_high = predicted_psf + 1.96 * rmse
    total_predicted = predicted_psf * sf

    # ---------- Cluster assignment ----------
    max_psf = _model_metrics.get("price_distribution", {}).get("max_psf", 400)
    cluster_features = np.array([[lat, lng, predicted_psf / max_psf]])
    cluster_id = int(_cluster_model.predict(cluster_features)[0])

    cluster_summaries = _model_metrics.get("clusters", {}).get("cluster_summaries", [])
    tier_names = ["premium", "above_average", "average", "below_average", "value"]
    tier_idx = next(
        (i for i, cs in enumerate(cluster_summaries) if cs["cluster_id"] == cluster_id), 0,
    )
    neighborhood_tier = tier_names[min(tier_idx, len(tier_names) - 1)]

    # ---------- Construction cost breakdown ----------
    construction_ratio = 0.55
    quality_score = float(features.get("quality_score", 5.0))
    construction_ratio += (quality_score - 5.0) * 0.02

    construction_psf = predicted_psf * construction_ratio
    total_construction = construction_psf * sf

    layer_breakdown = {}
    for layer_name, config in _LAYER_COST_BASELINES.items():
        layer_cost = total_construction * config["pct_of_total"]
        layer_breakdown[layer_name] = {
            "estimated_cost": round(layer_cost, 2),
            "pct_of_total": config["pct_of_total"],
            "range": {"min": config["min"], "max": config["max"]},
        }

    # ---------- Feasibility indicators ----------
    land_cost = float(features.get("land_cost", 75000))
    total_investment = land_cost + total_construction
    gross_profit = total_predicted - total_investment
    margin = (gross_profit / total_predicted * 100) if total_predicted > 0 else 0

    feasibility = {
        "market_value_estimate": round(total_predicted, 2),
        "construction_cost_estimate": round(total_construction, 2),
        "construction_psf": round(construction_psf, 2),
        "land_cost": round(land_cost, 2),
        "total_investment": round(total_investment, 2),
        "gross_profit": round(gross_profit, 2),
        "margin_pct": round(margin, 1),
        "viable": margin > 15.0,
    }

    return {
        "cost_per_sf": round(predicted_psf, 2),
        "total_cost": round(total_predicted, 2),
        "confidence_interval_95": {
            "low": round(ci_low, 2),
            "high": round(ci_high, 2),
        },
        "model_type": "trained_gradient_boosting",
        "feature_importance": _feature_importance,
        "model_metrics": _model_metrics,
        "cluster": {
            "id": cluster_id,
            "tier": neighborhood_tier,
        },
        "construction_cost_breakdown": layer_breakdown,
        "feasibility": feasibility,
    }


def get_training_status() -> dict[str, Any]:
    """Return current model training status and metrics."""
    return {
        "is_trained": _is_trained,
        "metrics": _model_metrics if _is_trained else None,
        "feature_importance": _feature_importance if _is_trained else None,
        "model_dir": str(_MODEL_DIR),
    }


def get_cluster_analysis(lat: float, lng: float) -> dict[str, Any]:
    """Get neighborhood cluster analysis for a specific location."""
    ensure_trained()

    if not _is_trained or _cluster_model is None:
        return {"error": "Model not trained"}

    dist_core = _haversine(lat, lng, _CORE_LAT, _CORE_LNG)
    record = {
        "square_footage": 2000, "bedrooms": 3, "bathrooms": 2,
        "latitude": lat, "longitude": lng, "dist_to_core": dist_core,
        "zipcode": "",
    }
    X = _extract_features([record], _KNOWN_ZIPS)
    X_scaled = _scaler.transform(X)
    baseline_psf = float(_regressor.predict(X_scaled)[0])

    max_psf = _model_metrics.get("price_distribution", {}).get("max_psf", 400)
    cluster_features = np.array([[lat, lng, baseline_psf / max_psf]])
    cluster_id = int(_cluster_model.predict(cluster_features)[0])

    cluster_summaries = _model_metrics.get("clusters", {}).get("cluster_summaries", [])
    matched = next((cs for cs in cluster_summaries if cs["cluster_id"] == cluster_id), None)

    return {
        "cluster_id": cluster_id,
        "baseline_psf": round(baseline_psf, 2),
        "cluster_stats": matched,
        "dist_to_core_miles": round(dist_core, 2),
        "all_clusters": cluster_summaries,
    }
