"""
Floor Plan Generation — PRD Module 1

Generates floor plan variants from parameters using constraint-based layout.
MVP supports rectangular rooms only.  Pure computation, no DB dependencies.
"""

from __future__ import annotations

import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Constants & defaults
# ---------------------------------------------------------------------------

PARAM_DEFAULTS: dict[str, Any] = {
    "target_sf":    2200,
    "bedrooms":     3,
    "bathrooms":    2,
    "stories":      1,
    "lot_width_ft": 60,
    "lot_depth_ft": 120,
    "style":        "ranch",
    "garage":       "2-car",
    "open_plan":    True,
}

PARAM_RANGES: dict[str, tuple[int, int]] = {
    "target_sf":    (800, 5000),
    "bedrooms":     (1, 6),
    "bathrooms":    (1, 4),
    "stories":      (1, 3),
    "lot_width_ft": (30, 200),
    "lot_depth_ft": (50, 300),
}

VALID_STYLES = {"ranch", "colonial", "modern", "craftsman", "mediterranean"}
VALID_GARAGE  = {"none", "1-car", "2-car", "detached"}

# Setbacks (ft)
SETBACK_FRONT = 25
SETBACK_SIDE  = 5
SETBACK_REAR  = 5

# Code minimums
MIN_BEDROOM_SF        = 70
MIN_BEDROOM_DIMENSION = 7  # ft

# ---------------------------------------------------------------------------
# Room templates (width x depth in feet)
# ---------------------------------------------------------------------------

ROOM_TEMPLATES: dict[str, tuple[float, float]] = {
    "master_bedroom":    (16, 14),
    "secondary_bedroom": (12, 12),
    "master_bathroom":   (10, 8),
    "bathroom":          (8,  5),
    "kitchen":           (14, 12),
    "living_room":       (20, 16),
    "dining_room":       (12, 12),
    "garage_1car":       (12, 24),
    "garage_2car":       (24, 24),
}

# Labels for nicer output
ROOM_LABELS: dict[str, str] = {
    "master_bedroom":    "Master Bedroom",
    "secondary_bedroom": "Bedroom",
    "master_bathroom":   "Master Bathroom",
    "bathroom":          "Bathroom",
    "kitchen":           "Kitchen",
    "living_room":       "Living Room",
    "dining_room":       "Dining Room",
    "garage_1car":       "1-Car Garage",
    "garage_2car":       "2-Car Garage",
    "hallway":           "Hallway",
}

# Adjacency preferences: (room_a, room_b) → weight (higher = more important)
ADJACENCY_PREFS: list[tuple[str, str, float]] = [
    ("kitchen",        "dining_room",   1.0),
    ("kitchen",        "living_room",   0.8),
    ("master_bedroom", "master_bathroom", 1.0),
    ("bathroom",       "bathroom",      0.6),
    ("secondary_bedroom", "secondary_bedroom", 0.5),
    ("secondary_bedroom", "bathroom",   0.7),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _clamp(value: int | float, lo: int | float, hi: int | float) -> int | float:
    return max(lo, min(hi, value))


def _validate_params(raw: dict) -> dict:
    """Merge with defaults, clamp numeric ranges, validate enums."""
    p: dict[str, Any] = {**PARAM_DEFAULTS, **raw}

    for key, (lo, hi) in PARAM_RANGES.items():
        if key in p:
            p[key] = _clamp(p[key], lo, hi)

    if p["style"] not in VALID_STYLES:
        p["style"] = "ranch"
    if p["garage"] not in VALID_GARAGE:
        p["garage"] = "2-car"
    p["open_plan"] = bool(p.get("open_plan", True))

    return p


def _buildable_envelope(params: dict) -> tuple[float, float]:
    """Return (max_width, max_depth) of the buildable area after setbacks."""
    max_w = params["lot_width_ft"] - 2 * SETBACK_SIDE
    max_d = params["lot_depth_ft"] - SETBACK_FRONT - SETBACK_REAR
    return max(10.0, max_w), max(10.0, max_d)


@dataclass
class PlacedRoom:
    room_type: str
    label: str
    x: float
    y: float
    width: float
    depth: float

    @property
    def area(self) -> float:
        return self.width * self.depth

    @property
    def x2(self) -> float:
        return self.x + self.width

    @property
    def y2(self) -> float:
        return self.y + self.depth

    def overlaps(self, other: "PlacedRoom") -> bool:
        return not (
            self.x2 <= other.x or other.x2 <= self.x
            or self.y2 <= other.y or other.y2 <= self.y
        )

    def center(self) -> tuple[float, float]:
        return (self.x + self.width / 2, self.y + self.depth / 2)

    _TYPE_MAP = {
        "master_bedroom": "bedroom",
        "secondary_bedroom": "bedroom",
        "master_bathroom": "bathroom",
        "bathroom": "bathroom",
        "garage_2car": "garage",
        "garage_1car": "garage",
        "living_room": "living",
        "dining_room": "dining",
    }

    def to_dict(self) -> dict:
        return {
            "type": self._TYPE_MAP.get(self.room_type, self.room_type),
            "label": self.label,
            "x": round(self.x, 1),
            "y": round(self.y, 1),
            "width": round(self.width, 1),
            "depth": round(self.depth, 1),
            "area": round(self.area, 1),
        }


# ---------------------------------------------------------------------------
# Room list builder
# ---------------------------------------------------------------------------

def _build_room_list(params: dict) -> list[tuple[str, float, float]]:
    """Return list of (room_type, width, depth) sorted largest-first."""
    rooms: list[tuple[str, float, float]] = []

    # Master bedroom
    w, d = ROOM_TEMPLATES["master_bedroom"]
    rooms.append(("master_bedroom", w, d))

    # Secondary bedrooms
    for _ in range(int(params["bedrooms"]) - 1):
        w, d = ROOM_TEMPLATES["secondary_bedroom"]
        rooms.append(("secondary_bedroom", w, d))

    # Master bath
    w, d = ROOM_TEMPLATES["master_bathroom"]
    rooms.append(("master_bathroom", w, d))

    # Additional bathrooms
    for _ in range(int(params["bathrooms"]) - 1):
        w, d = ROOM_TEMPLATES["bathroom"]
        rooms.append(("bathroom", w, d))

    # Kitchen
    w, d = ROOM_TEMPLATES["kitchen"]
    rooms.append(("kitchen", w, d))

    # Living room (larger if open plan)
    w, d = ROOM_TEMPLATES["living_room"]
    if params["open_plan"]:
        w += 4
        d += 2
    rooms.append(("living_room", w, d))

    # Dining room
    w, d = ROOM_TEMPLATES["dining_room"]
    rooms.append(("dining_room", w, d))

    # Garage
    if params["garage"] == "1-car":
        w, d = ROOM_TEMPLATES["garage_1car"]
        rooms.append(("garage_1car", w, d))
    elif params["garage"] in ("2-car", "detached"):
        w, d = ROOM_TEMPLATES["garage_2car"]
        rooms.append(("garage_2car", w, d))

    # Sort largest-first by area
    rooms.sort(key=lambda r: r[1] * r[2], reverse=True)
    return rooms


# ---------------------------------------------------------------------------
# Placement engine
# ---------------------------------------------------------------------------

HALLWAY_WIDTH = 3.5  # ft


def _place_rooms(
    room_list: list[tuple[str, float, float]],
    footprint_w: float,
    footprint_d: float,
    grid_step: float = 1.0,
) -> list[PlacedRoom] | None:
    """
    Greedy grid-based placement.  Tries positions on a 1-ft grid, largest
    room first.  Returns None if any room cannot be placed.
    """
    placed: list[PlacedRoom] = []
    label_counters: dict[str, int] = {}

    for room_type, rw, rd in room_list:
        # Scale room down if needed to fit footprint at all
        rw = min(rw, footprint_w)
        rd = min(rd, footprint_d)

        best_pos: tuple[float, float] | None = None
        best_score = -1e9

        # Try every grid position
        y = 0.0
        while y + rd <= footprint_d + 0.01:
            x = 0.0
            while x + rw <= footprint_w + 0.01:
                candidate = PlacedRoom(
                    room_type=room_type,
                    label="",
                    x=x, y=y,
                    width=rw, depth=rd,
                )
                # Check overlap
                if not any(candidate.overlaps(p) for p in placed):
                    # Score: prefer adjacency to related rooms, penalise
                    # distance from origin for first rooms
                    score = -((x + y) * 0.01)  # slight bias toward origin
                    for p in placed:
                        for a, b, weight in ADJACENCY_PREFS:
                            if (room_type == a and p.room_type == b) or (
                                room_type == b and p.room_type == a
                            ):
                                cx, cy = candidate.center()
                                px, py = p.center()
                                dist = abs(cx - px) + abs(cy - py)
                                score += weight / (1.0 + dist * 0.1)
                    if score > best_score:
                        best_score = score
                        best_pos = (x, y)
                x += grid_step
            y += grid_step

        if best_pos is None:
            # Try rotated
            rw, rd = rd, rw
            y = 0.0
            while y + rd <= footprint_d + 0.01:
                x = 0.0
                while x + rw <= footprint_w + 0.01:
                    candidate = PlacedRoom(
                        room_type=room_type, label="",
                        x=x, y=y, width=rw, depth=rd,
                    )
                    if not any(candidate.overlaps(p) for p in placed):
                        score = -((x + y) * 0.01)
                        for p in placed:
                            for a, b, weight in ADJACENCY_PREFS:
                                if (room_type == a and p.room_type == b) or (
                                    room_type == b and p.room_type == a
                                ):
                                    cx, cy = candidate.center()
                                    px, py = p.center()
                                    dist = abs(cx - px) + abs(cy - py)
                                    score += weight / (1.0 + dist * 0.1)
                        if score > best_score:
                            best_score = score
                            best_pos = (x, y)
                    x += grid_step
                y += grid_step

        if best_pos is None:
            return None  # could not place this room

        # Build label with counter
        base_label = ROOM_LABELS.get(room_type, room_type.replace("_", " ").title())
        label_counters[room_type] = label_counters.get(room_type, 0) + 1
        count = label_counters[room_type]
        label = base_label if count == 1 else f"{base_label} {count}"

        placed.append(PlacedRoom(
            room_type=room_type,
            label=label,
            x=best_pos[0], y=best_pos[1],
            width=rw, depth=rd,
        ))

    return placed


# ---------------------------------------------------------------------------
# Wall / door / window derivation
# ---------------------------------------------------------------------------

def _derive_walls(rooms: list[PlacedRoom], footprint_w: float, footprint_d: float) -> list[dict]:
    """Generate exterior perimeter walls and interior walls between rooms."""
    walls: list[dict] = []

    # Exterior perimeter (bearing walls)
    perimeter = [
        (0, 0, footprint_w, 0),
        (footprint_w, 0, footprint_w, footprint_d),
        (footprint_w, footprint_d, 0, footprint_d),
        (0, footprint_d, 0, 0),
    ]
    for x1, y1, x2, y2 in perimeter:
        walls.append({
            "x1": round(x1, 1), "y1": round(y1, 1),
            "x2": round(x2, 1), "y2": round(y2, 1),
            "thickness": 5.5, "bearing": True,
        })

    # Interior walls from room edges (simplified: each room edge becomes a wall
    # segment if it doesn't coincide with the perimeter)
    for room in rooms:
        edges = [
            (room.x, room.y, room.x2, room.y),
            (room.x2, room.y, room.x2, room.y2),
            (room.x2, room.y2, room.x, room.y2),
            (room.x, room.y2, room.x, room.y),
        ]
        for x1, y1, x2, y2 in edges:
            on_perim = (
                (x1 == 0 and x2 == 0)
                or (y1 == 0 and y2 == 0)
                or (abs(x1 - footprint_w) < 0.1 and abs(x2 - footprint_w) < 0.1)
                or (abs(y1 - footprint_d) < 0.1 and abs(y2 - footprint_d) < 0.1)
            )
            if not on_perim:
                walls.append({
                    "x1": round(x1, 1), "y1": round(y1, 1),
                    "x2": round(x2, 1), "y2": round(y2, 1),
                    "thickness": 3.5, "bearing": False,
                })

    return walls


def _derive_doors(rooms: list[PlacedRoom]) -> list[dict]:
    """Place one door per room, centred on the first interior wall edge."""
    doors: list[dict] = []
    for room in rooms:
        if "garage" in room.room_type:
            door_type = "exterior"
            width = 96  # garage door inches — simplified
        elif "bathroom" in room.room_type:
            door_type = "interior"
            width = 30
        else:
            door_type = "interior"
            width = 36

        # Place door at the midpoint of the bottom edge of the room
        doors.append({
            "x": round(room.x + room.width / 2, 1),
            "y": round(room.y, 1),
            "width": width,
            "type": door_type,
        })
    return doors


def _derive_windows(rooms: list[PlacedRoom], footprint_w: float, footprint_d: float) -> list[dict]:
    """Place windows on exterior-facing walls for non-bathroom rooms."""
    windows: list[dict] = []
    for room in rooms:
        if "garage" in room.room_type:
            continue

        # Determine which edges are on the perimeter
        exterior_edges: list[tuple[float, float, bool]] = []
        if abs(room.y) < 0.1:
            exterior_edges.append((room.x + room.width / 2, 0, True))
        if abs(room.y2 - footprint_d) < 0.5:
            exterior_edges.append((room.x + room.width / 2, footprint_d, True))
        if abs(room.x) < 0.1:
            exterior_edges.append((0, room.y + room.depth / 2, False))
        if abs(room.x2 - footprint_w) < 0.5:
            exterior_edges.append((footprint_w, room.y + room.depth / 2, False))

        for wx, wy, _ in exterior_edges[:1]:  # at most one window per room for MVP
            if "bathroom" in room.room_type:
                win_w, win_h, sill = 24, 24, 60  # small high window
            else:
                win_w, win_h, sill = 36, 48, 36
            windows.append({
                "x": round(wx, 1),
                "y": round(wy, 1),
                "width": win_w,
                "height": win_h,
                "sill_height": sill,
            })
    return windows


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _score_variant(
    rooms: list[PlacedRoom],
    footprint_w: float,
    footprint_d: float,
    target_sf: float,
) -> tuple[float, float, float, float]:
    """Return (total, space_eff, adjacency_sat, proportion) scores in 0-1."""
    total_room_area = sum(r.area for r in rooms)
    footprint_area = footprint_w * footprint_d

    # Space efficiency: how much of the footprint is used by rooms
    space_eff = min(1.0, total_room_area / footprint_area) if footprint_area else 0.0

    # Adjacency satisfaction
    adj_score_sum = 0.0
    adj_weight_sum = 0.0
    for a_type, b_type, weight in ADJACENCY_PREFS:
        a_rooms = [r for r in rooms if r.room_type == a_type]
        b_rooms = [r for r in rooms if r.room_type == b_type]
        for ar in a_rooms:
            for br in b_rooms:
                if ar is br:
                    continue
                cx, cy = ar.center()
                px, py = br.center()
                dist = abs(cx - px) + abs(cy - py)
                satisfied = 1.0 / (1.0 + dist * 0.05)
                adj_score_sum += satisfied * weight
                adj_weight_sum += weight
    adjacency_sat = (adj_score_sum / adj_weight_sum) if adj_weight_sum else 0.5

    # Proportion: how close total room area is to target
    proportion = 1.0 - min(1.0, abs(total_room_area - target_sf) / target_sf)

    total = 0.4 * space_eff + 0.3 * adjacency_sat + 0.3 * proportion
    return round(total, 3), round(space_eff, 3), round(adjacency_sat, 3), round(proportion, 3)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate(params: dict) -> dict:
    """
    Generate 2-3 floor plan variants from the given parameters.

    Parameters
    ----------
    params : dict
        See ``PARAM_DEFAULTS`` for accepted keys and ranges.

    Returns
    -------
    dict
        ``{"variants": [...]}`` with each variant containing rooms, walls,
        doors, windows, dimensions, and a composite score.
    """
    p = _validate_params(params)

    # Buildable area
    max_w, max_d = _buildable_envelope(p)
    footprint_sf = p["target_sf"] / p["stories"]
    room_list = _build_room_list(p)

    # We generate up to 3 variants by trying different footprint aspect ratios
    aspect_ratios = [0.8, 1.0, 1.3]
    variants: list[dict] = []

    for idx, aspect in enumerate(aspect_ratios):
        # Use a padded footprint (1.25x target SF) so rooms + circulation fit.
        # Clamp to buildable envelope.
        padded_sf = footprint_sf * 1.25
        fp_w = min(max_w, (padded_sf * aspect) ** 0.5)
        fp_d = min(max_d, padded_sf / fp_w) if fp_w > 0 else max_d
        fp_w = max(fp_w, 20.0)
        fp_d = max(fp_d, 20.0)

        # Use 1ft grid for reliable placement
        placed = _place_rooms(room_list, fp_w, fp_d, grid_step=1.0)
        if placed is None:
            continue

        # Validate code minimums
        valid = True
        for r in placed:
            if "bedroom" in r.room_type:
                if r.area < MIN_BEDROOM_SF:
                    valid = False
                if min(r.width, r.depth) < MIN_BEDROOM_DIMENSION:
                    valid = False
        if not valid:
            continue

        total_room_sf = sum(r.area for r in placed)
        walls = _derive_walls(placed, fp_w, fp_d)
        doors = _derive_doors(placed)
        windows = _derive_windows(placed, fp_w, fp_d)
        total_score, eff, adj, prop = _score_variant(placed, fp_w, fp_d, p["target_sf"])

        variants.append({
            "id": f"variant-{idx + 1}",
            "score": total_score,
            "score_breakdown": {
                "space_efficiency": eff,
                "adjacency_satisfaction": adj,
                "proportion_score": prop,
            },
            "rooms": [r.to_dict() for r in placed],
            "walls": walls,
            "doors": doors,
            "windows": windows,
            "dimensions": {
                "total_sf": round(total_room_sf, 1),
                "footprint_width": round(fp_w, 1),
                "footprint_depth": round(fp_d, 1),
                "perimeter": round(2 * (fp_w + fp_d), 1),
                "stories": p["stories"],
            },
        })

    # Sort by score descending and keep top 3
    variants.sort(key=lambda v: v["score"], reverse=True)
    variants = variants[:3]

    # Re-number after sorting
    for i, v in enumerate(variants):
        v["id"] = f"variant-{i + 1}"

    return {"variants": variants}
