"""
Structural Analysis Engine — Vision Platform

Closed-form beam analysis with LRFD load combinations per ASCE 7-22
and code compliance checks per AISC 360-16.

All calculations assume simply supported beam with uniformly distributed load.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Legal disclaimer
# ---------------------------------------------------------------------------
DISCLAIMER = (
    "DISCLAIMER: This structural analysis is for preliminary estimation only. "
    "Results do not constitute a professional engineering opinion and must not "
    "be used for final design, permitting, or construction without review and "
    "stamping by a licensed Professional Engineer (PE). The developers of this "
    "software assume no liability for designs based on these calculations."
)

# ---------------------------------------------------------------------------
# AISC W-shape section database (units: inches, ksi, in^4, in^3, lb/ft)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SteelSection:
    designation: str
    d: float       # depth (in)
    bf: float      # flange width (in)
    A: float       # cross-section area (in^2)
    Ix: float      # moment of inertia (in^4)
    Sx: float      # section modulus (in^3)
    Zx: float      # plastic section modulus (in^3)
    W: float       # weight (lb/ft)
    Fy: float      # yield stress (ksi)
    E: float       # elastic modulus (ksi)

    @property
    def tw_est(self) -> float:
        """Estimate web thickness from area, depth, and flange geometry."""
        # tw ≈ (A - 2 * bf * tf_est) / d  with tf_est ≈ 0.5 in
        tf_est = 0.5
        tw = (self.A - 2.0 * self.bf * tf_est) / self.d
        return max(tw, 0.20)


_SECTION_DATA: Dict[str, SteelSection] = {
    s.designation: s for s in [
        SteelSection("W14x22",  d=13.7, bf=5.00,  A=6.49,  Ix=199,  Sx=29.0,  Zx=33.2,  W=22, Fy=50, E=29000),
        SteelSection("W14x30",  d=13.8, bf=6.73,  A=8.85,  Ix=291,  Sx=42.0,  Zx=47.3,  W=30, Fy=50, E=29000),
        SteelSection("W14x90",  d=14.0, bf=14.52, A=26.5,  Ix=999,  Sx=143.0, Zx=157.0, W=90, Fy=50, E=29000),
        SteelSection("W16x36",  d=15.9, bf=6.99,  A=10.6,  Ix=448,  Sx=56.5,  Zx=64.0,  W=36, Fy=50, E=29000),
        SteelSection("W18x50",  d=18.0, bf=7.50,  A=14.7,  Ix=800,  Sx=88.9,  Zx=101.0, W=50, Fy=50, E=29000),
        SteelSection("W21x62",  d=21.0, bf=8.24,  A=18.3,  Ix=1330, Sx=127.0, Zx=144.0, W=62, Fy=50, E=29000),
        SteelSection("W24x84",  d=24.1, bf=9.02,  A=24.7,  Ix=2370, Sx=196.0, Zx=224.0, W=84, Fy=50, E=29000),
    ]
}

# Ordered from lightest to heaviest for upgrade suggestions
_SECTIONS_ORDERED: List[str] = [
    "W14x22", "W14x30", "W16x36", "W14x90", "W18x50", "W21x62", "W24x84",
]

# ---------------------------------------------------------------------------
# Foundation factors for SCI calculation
# ---------------------------------------------------------------------------
_FOUNDATION_FACTORS: Dict[str, float] = {
    "slab": 0.2,
    "crawlspace": 0.5,
    "pier": 0.7,
    "basement": 1.0,
}

# ---------------------------------------------------------------------------
# Internal data structures
# ---------------------------------------------------------------------------

@dataclass
class BeamResults:
    """Results of simply-supported beam analysis."""
    w_plf: float          # distributed load (lb/ft)
    w_pli: float          # distributed load (lb/in)
    span_ft: float
    span_in: float
    M_max_inlb: float     # maximum moment (in-lb)
    M_max_ftk: float      # maximum moment (ft-kip)
    V_max_lb: float       # maximum shear (lb)
    V_max_kip: float      # maximum shear (kip)
    delta_max_in: float   # maximum deflection (in)
    sigma_ksi: float      # bending stress (ksi)
    utilization: float    # stress ratio σ / Fy
    status: str           # PASS / WARNING / FAIL


@dataclass
class LoadCombinations:
    """LRFD load combinations per ASCE 7-22."""
    combos: Dict[str, float]        # combo label → factored load (psf)
    governing_combo: str
    governing_load_psf: float


@dataclass
class ComplianceCheck:
    """Single code compliance check result."""
    name: str
    demand: float
    capacity: float
    ratio: float
    unit: str
    passed: bool
    code_ref: str
    mitigation: Optional[str] = None


@dataclass
class SolverDiagnostics:
    """Honest solver metadata."""
    method: str = "Analytical"
    solve_time_ms: float = 0.0
    iterations: str = "N/A"
    convergence: str = "Exact"
    residual_pct: float = 0.0


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def get_sections() -> List[Dict]:
    """Return all available steel sections as a list of dicts."""
    return [asdict(s) for s in _SECTION_DATA.values()]


def get_section(designation: str) -> Dict:
    """Return a single section dict by designation. Raises KeyError if not found."""
    sec = _SECTION_DATA.get(designation)
    if sec is None:
        raise KeyError(
            f"Section '{designation}' not found. "
            f"Available: {', '.join(_SECTION_DATA.keys())}"
        )
    return asdict(sec)


def compute_load_combinations(
    D: float,
    L: float,
    W: float = 0.0,
    S: float = 0.0,
    E: float = 0.0,
) -> Dict[str, float]:
    """
    Compute the 6 LRFD load combinations per ASCE 7-22.

    Parameters are unfactored loads in consistent units (typically psf).
    Returns dict of {combo_label: factored_load}.
    """
    return {
        "LC1: 1.4D":                   1.4 * D,
        "LC2: 1.2D + 1.6L":            1.2 * D + 1.6 * L,
        "LC3: 1.2D + 1.0W + 0.5L":     1.2 * D + 1.0 * W + 0.5 * L,
        "LC4: 0.9D + 1.0E":            0.9 * D + 1.0 * E,
        "LC5: 1.2D + 1.6S + 0.5W":     1.2 * D + 1.6 * S + 0.5 * W,
        "LC6: 1.2D + 1.0L + 0.2S":     1.2 * D + 1.0 * L + 0.2 * S,
    }


# ---------------------------------------------------------------------------
# Internal calculation helpers
# ---------------------------------------------------------------------------

def _normalize(value: float, lo: float, hi: float) -> float:
    """Clamp-normalize value to [0, 1] range."""
    if hi <= lo:
        return 0.0
    return max(0.0, min(1.0, (value - lo) / (hi - lo)))


def _compute_sci(
    span_ft: float,
    stories: int,
    foundation_type: str,
    total_load_psf: float,
) -> float:
    """
    Structural Complexity Index (0-10).

    SCI = 0.35 * norm(span) + 0.25 * norm(stories)
        + 0.20 * foundation_factor + 0.20 * norm(total_load)
    """
    f_factor = _FOUNDATION_FACTORS.get(foundation_type.lower(), 0.5)
    raw = (
        0.35 * _normalize(span_ft, 12, 40)
        + 0.25 * _normalize(stories, 1, 5)
        + 0.20 * f_factor
        + 0.20 * _normalize(total_load_psf, 60, 200)
    )
    return round(raw * 10.0, 2)


def _beam_analysis(
    w_plf: float,
    span_ft: float,
    section: SteelSection,
) -> BeamResults:
    """
    Simply-supported beam under uniform load — closed-form solution.

    Parameters
    ----------
    w_plf : float   distributed load in lb/ft
    span_ft : float beam span in feet
    section : SteelSection
    """
    span_in = span_ft * 12.0
    w_pli = w_plf / 12.0                          # lb/in

    M_max_inlb = w_pli * span_in ** 2 / 8.0       # in-lb
    V_max_lb = w_pli * span_in / 2.0              # lb
    delta_max_in = (
        5.0 * w_pli * span_in ** 4
        / (384.0 * section.E * 1000.0 * section.Ix)
    )
    # E is in ksi; multiply by 1000 to get psi for unit consistency with w (lb/in)

    sigma_psi = M_max_inlb / section.Sx            # psi
    sigma_ksi = sigma_psi / 1000.0                 # ksi

    utilization = sigma_ksi / section.Fy           # Fy is already ksi

    if utilization <= 0.85:
        status = "PASS"
    elif utilization <= 1.0:
        status = "WARNING"
    else:
        status = "FAIL"

    return BeamResults(
        w_plf=round(w_plf, 2),
        w_pli=round(w_pli, 4),
        span_ft=span_ft,
        span_in=round(span_in, 2),
        M_max_inlb=round(M_max_inlb, 1),
        M_max_ftk=round(M_max_inlb / 12000.0, 2),
        V_max_lb=round(V_max_lb, 1),
        V_max_kip=round(V_max_lb / 1000.0, 2),
        delta_max_in=round(delta_max_in, 4),
        sigma_ksi=round(sigma_ksi, 2),
        utilization=round(utilization, 4),
        status=status,
    )


def _suggest_next_section(current: str) -> Optional[str]:
    """Return the next heavier section designation, or None if already heaviest."""
    try:
        idx = _SECTIONS_ORDERED.index(current)
    except ValueError:
        return None
    if idx + 1 < len(_SECTIONS_ORDERED):
        return _SECTIONS_ORDERED[idx + 1]
    return None


def _compliance_checks(
    beam: BeamResults,
    section: SteelSection,
    governing_load_psf: float,
    dead_load_psf: float,
    wind_load_psf: float,
    tributary_width_ft: float,
    footing_area_sf: float,
    story_height_ft: float,
    stories: int,
    seismic_factor: float,
) -> List[ComplianceCheck]:
    """Run the 6 code compliance checks and return results."""
    checks: List[ComplianceCheck] = []

    # --- 1. Flexural strength (AISC 360-16 F2) ---
    phi_Mn_inlb = 0.9 * section.Fy * section.Zx * 1000.0  # Fy(ksi)*Zx(in^3)*1000 → in-lb
    Mu = beam.M_max_inlb
    flex_ratio = Mu / phi_Mn_inlb if phi_Mn_inlb > 0 else 999.0
    flex_mit = None
    if flex_ratio > 1.0:
        nxt = _suggest_next_section(section.designation)
        flex_mit = (
            f"Section overstressed. Consider upgrading to {nxt}."
            if nxt
            else "Section overstressed. Consider a heavier section or higher steel grade."
        )
    checks.append(ComplianceCheck(
        name="Flexural Strength",
        demand=round(Mu / 12000.0, 2),
        capacity=round(phi_Mn_inlb / 12000.0, 2),
        ratio=round(flex_ratio, 4),
        unit="ft-kip",
        passed=flex_ratio <= 1.0,
        code_ref="AISC 360-16 F2",
        mitigation=flex_mit,
    ))

    # --- 2. Shear strength (AISC 360-16 G2) ---
    tw = section.tw_est
    phi_Vn_lb = 0.9 * 0.6 * section.Fy * 1000.0 * section.d * tw  # psi units
    Vu = beam.V_max_lb
    shear_ratio = Vu / phi_Vn_lb if phi_Vn_lb > 0 else 999.0
    shear_mit = None
    if shear_ratio > 1.0:
        shear_mit = "Shear demand exceeds capacity. Use a section with a thicker web or higher grade steel."
    checks.append(ComplianceCheck(
        name="Shear Strength",
        demand=round(Vu / 1000.0, 2),
        capacity=round(phi_Vn_lb / 1000.0, 2),
        ratio=round(shear_ratio, 4),
        unit="kip",
        passed=shear_ratio <= 1.0,
        code_ref="AISC 360-16 G2",
        mitigation=shear_mit,
    ))

    # --- 3. Deflection (L/360 serviceability) ---
    delta_allow = beam.span_in / 360.0
    defl_ratio = beam.delta_max_in / delta_allow if delta_allow > 0 else 999.0
    defl_mit = None
    if defl_ratio > 1.0:
        defl_mit = "Deflection exceeds L/360 limit. Increase beam depth or reduce span length."
    checks.append(ComplianceCheck(
        name="Deflection Limit (L/360)",
        demand=round(beam.delta_max_in, 4),
        capacity=round(delta_allow, 4),
        ratio=round(defl_ratio, 4),
        unit="in",
        passed=defl_ratio <= 1.0,
        code_ref="IBC Table 1604.3",
        mitigation=defl_mit,
    ))

    # --- 4. Soil bearing pressure ---
    # Total reaction at one support = V_max (half of total load on beam)
    # Additional column load from upper stories
    total_reaction_lb = beam.V_max_lb * stories
    q_psf = total_reaction_lb / footing_area_sf if footing_area_sf > 0 else 999999.0
    q_allow = 2500.0  # psf
    soil_ratio = q_psf / q_allow
    soil_mit = None
    if soil_ratio > 1.0:
        needed = total_reaction_lb / q_allow
        soil_mit = (
            f"Soil bearing pressure exceeded. Increase footing area to at least "
            f"{needed:.1f} sq ft or perform site-specific geotechnical investigation."
        )
    checks.append(ComplianceCheck(
        name="Soil Bearing Pressure",
        demand=round(q_psf, 1),
        capacity=q_allow,
        ratio=round(soil_ratio, 4),
        unit="psf",
        passed=soil_ratio <= 1.0,
        code_ref="IBC 1806.2 / Presumptive",
        mitigation=soil_mit,
    ))

    # --- 5. Seismic drift ---
    story_height_in = story_height_ft * 12.0
    # Simplified drift estimate: seismic_factor * governing_load contributes lateral
    if seismic_factor > 0 and story_height_in > 0:
        lateral_force_lb = seismic_factor * governing_load_psf * tributary_width_ft * beam.span_ft
        # Approximate drift as PL^3 / (48EI) for point load at midspan analogy
        drift_in = (
            lateral_force_lb * (story_height_in ** 3)
            / (48.0 * section.E * 1000.0 * section.Ix)
        )
        drift_ratio_val = drift_in / story_height_in
    else:
        drift_in = 0.0
        drift_ratio_val = 0.0
    drift_limit = 0.020
    drift_check_ratio = drift_ratio_val / drift_limit if drift_limit > 0 else 0.0
    drift_mit = None
    if drift_ratio_val > drift_limit:
        drift_mit = "Seismic drift exceeds 2% limit. Add lateral bracing or shear walls."
    checks.append(ComplianceCheck(
        name="Seismic Drift (delta/h)",
        demand=round(drift_ratio_val, 6),
        capacity=drift_limit,
        ratio=round(drift_check_ratio, 4),
        unit="ratio",
        passed=drift_ratio_val <= drift_limit,
        code_ref="ASCE 7-22 Table 12.12-1",
        mitigation=drift_mit,
    ))

    # --- 6. Wind uplift ---
    D_plf = dead_load_psf * tributary_width_ft  # lb/ft
    W_uplift_plf = wind_load_psf * tributary_width_ft  # lb/ft (simplified)
    resist = 0.9 * D_plf
    uplift_ratio = W_uplift_plf / resist if resist > 0 else 0.0
    uplift_mit = None
    if W_uplift_plf > resist:
        uplift_mit = "Wind uplift exceeds 0.9D resistance. Add mechanical anchorage or increase dead load."
    checks.append(ComplianceCheck(
        name="Wind Uplift (0.9D >= W_uplift)",
        demand=round(W_uplift_plf, 2),
        capacity=round(resist, 2),
        ratio=round(uplift_ratio, 4),
        unit="plf",
        passed=W_uplift_plf <= resist,
        code_ref="ASCE 7-22 §2.3.1 LC4",
        mitigation=uplift_mit,
    ))

    return checks


def _load_path_summary(
    governing_load_psf: float,
    tributary_width_ft: float,
    span_ft: float,
    stories: int,
    footing_area_sf: float,
) -> Dict:
    """Tributary-width load path: floor → beams → columns → foundation → soil."""
    floor_load_plf = governing_load_psf * tributary_width_ft
    beam_reaction_lb = floor_load_plf * span_ft / 2.0
    column_load_lb = beam_reaction_lb * stories
    soil_pressure_psf = column_load_lb / footing_area_sf if footing_area_sf > 0 else 0.0

    return {
        "tributary_width_ft": tributary_width_ft,
        "floor_load_plf": round(floor_load_plf, 2),
        "beam_reaction_lb": round(beam_reaction_lb, 1),
        "column_load_lb": round(column_load_lb, 1),
        "footing_area_sf": footing_area_sf,
        "soil_pressure_psf": round(soil_pressure_psf, 1),
        "path": [
            "Floor (psf)",
            "→ Beams (plf via tributary width)",
            "→ Columns (point loads at supports)",
            "→ Foundation (spread footing)",
            "→ Soil (bearing pressure, psf)",
        ],
    }


# ---------------------------------------------------------------------------
# Main analysis entry point
# ---------------------------------------------------------------------------

def analyze(
    span_ft: float,
    stories: int,
    foundation_type: str,
    dead_load_psf: float,
    live_load_psf: float,
    section_designation: str,
    wind_load_psf: float = 0.0,
    snow_load_psf: float = 0.0,
    seismic_factor: float = 0.0,
    tributary_width_ft: float = 8.0,
    footing_area_sf: float = 16.0,
    story_height_ft: float = 9.0,
) -> Dict:
    """
    Run full structural analysis for a simply-supported beam.

    Parameters
    ----------
    span_ft : float             Beam span in feet.
    stories : int               Number of stories.
    foundation_type : str       One of: slab, crawlspace, pier, basement.
    dead_load_psf : float       Unfactored dead load (psf).
    live_load_psf : float       Unfactored live load (psf).
    section_designation : str   AISC W-shape designation (e.g. "W14x30").
    wind_load_psf : float       Unfactored wind load (psf), default 0.
    snow_load_psf : float       Unfactored snow load (psf), default 0.
    seismic_factor : float      Seismic coefficient (dimensionless), default 0.
    tributary_width_ft : float  Tributary width (ft), default 8.
    footing_area_sf : float     Footing area per column (sq ft), default 16.
    story_height_ft : float     Story height (ft), default 9.

    Returns
    -------
    dict with keys: inputs, section, load_combinations, beam_analysis,
    compliance_checks, sci, load_path, mitigations, diagnostics, disclaimer.
    """
    t0 = time.perf_counter()

    # --- Validate section ---
    section = _SECTION_DATA.get(section_designation)
    if section is None:
        raise KeyError(
            f"Section '{section_designation}' not found. "
            f"Available: {', '.join(_SECTION_DATA.keys())}"
        )

    # --- Compute seismic equivalent load for combinations ---
    # E = seismic_factor * (D + L) as simplified equivalent lateral pressure
    E_psf = seismic_factor * (dead_load_psf + live_load_psf)

    # --- LRFD load combinations ---
    combos = compute_load_combinations(
        D=dead_load_psf,
        L=live_load_psf,
        W=wind_load_psf,
        S=snow_load_psf,
        E=E_psf,
    )
    governing_combo = max(combos, key=combos.get)
    governing_load_psf = combos[governing_combo]

    lc_result = LoadCombinations(
        combos=combos,
        governing_combo=governing_combo,
        governing_load_psf=round(governing_load_psf, 2),
    )

    # --- Convert governing area load to line load via tributary width ---
    w_plf = governing_load_psf * tributary_width_ft  # lb/ft

    # --- Beam analysis ---
    beam = _beam_analysis(w_plf, span_ft, section)

    # --- Compliance checks ---
    checks = _compliance_checks(
        beam=beam,
        section=section,
        governing_load_psf=governing_load_psf,
        dead_load_psf=dead_load_psf,
        wind_load_psf=wind_load_psf,
        tributary_width_ft=tributary_width_ft,
        footing_area_sf=footing_area_sf,
        story_height_ft=story_height_ft,
        stories=stories,
        seismic_factor=seismic_factor,
    )

    # --- SCI ---
    total_load_psf = dead_load_psf + live_load_psf + snow_load_psf + wind_load_psf
    sci = _compute_sci(span_ft, stories, foundation_type, total_load_psf)

    # --- Load path ---
    load_path = _load_path_summary(
        governing_load_psf, tributary_width_ft, span_ft, stories, footing_area_sf,
    )

    # --- Gather mitigations ---
    mitigations: List[str] = []
    for c in checks:
        if c.mitigation:
            mitigations.append(c.mitigation)
    if sci > 8.5:
        mitigations.append(
            "Structural Complexity Index exceeds 8.5. "
            "A detailed engineering review by a licensed PE is strongly recommended."
        )

    # --- Diagnostics ---
    solve_time_ms = (time.perf_counter() - t0) * 1000.0
    diagnostics = SolverDiagnostics(solve_time_ms=round(solve_time_ms, 3))

    # --- Assemble output ---
    return {
        "inputs": {
            "span_ft": span_ft,
            "stories": stories,
            "foundation_type": foundation_type,
            "dead_load_psf": dead_load_psf,
            "live_load_psf": live_load_psf,
            "section": section_designation,
            "wind_load_psf": wind_load_psf,
            "snow_load_psf": snow_load_psf,
            "seismic_factor": seismic_factor,
            "tributary_width_ft": tributary_width_ft,
            "footing_area_sf": footing_area_sf,
            "story_height_ft": story_height_ft,
        },
        "section": asdict(section),
        "load_combinations": asdict(lc_result),
        "beam_analysis": asdict(beam),
        "compliance_checks": [asdict(c) for c in checks],
        "all_checks_passed": all(c.passed for c in checks),
        "sci": {
            "value": sci,
            "rating": (
                "Low" if sci <= 3.0
                else "Moderate" if sci <= 6.0
                else "High" if sci <= 8.5
                else "Very High — Engineering Review Recommended"
            ),
        },
        "load_path": load_path,
        "mitigations": mitigations,
        "diagnostics": asdict(diagnostics),
        "disclaimer": DISCLAIMER,
    }
