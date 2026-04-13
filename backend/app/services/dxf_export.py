"""
DXF Floor Plan Export Service
Converts a Vision floor plan dict into a professional DXF file.

Uses only stable ezdxf primitives (lines, polylines, arcs, text) to avoid
version-specific API issues.

Coordinate transform:
  Vision canvas : origin top-left,  Y-axis DOWN, units = feet
  DXF standard  : origin bottom-left, Y-axis UP,   units = feet
  => dxf_y = footprint_depth - canvas_y
"""

import io
import math
from datetime import date

import ezdxf
from ezdxf import colors


# ---------------------------------------------------------------------------
# Layer definitions  (name -> (aci_color, lineweight_int))
# ---------------------------------------------------------------------------
LAYERS = {
    "WALLS":      (colors.WHITE,  50),
    "LABELS":     (colors.YELLOW, 0),
    "DIMS":       (colors.CYAN,   0),
    "DOORS":      (colors.GREEN,  25),
    "WINDOWS":    (colors.BLUE,   25),
    "TITLEBLOCK": (colors.WHITE,  0),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_dxf(floor_plan: dict, project_name: str = "Vision Project") -> bytes:
    """
    Convert a Vision floor plan dict to DXF bytes.

    Expects floor_plan to have:
      rooms   — list of { type, label, x, y, w (or width), h (or depth) }
      walls   — optional list of { x1,y1,x2,y2, bearing }
      doors   — optional list of { x, y, width (inches) }
      windows — optional list of { x, y, width (inches) }
      width   — overall footprint width in feet
      depth   — overall footprint depth in feet
    """
    doc = ezdxf.new(dxfversion="R2010")
    doc.units = 2  # 2 = Feet (AutoCAD INSUNITS)
    msp = doc.modelspace()

    _setup_layers(doc)

    rooms = floor_plan.get("rooms", [])
    if not rooms:
        return _to_bytes(doc)

    fp_w = float(floor_plan.get("width") or _max_x(rooms))
    fp_d = float(floor_plan.get("depth") or _max_y(rooms))

    def fy(y: float) -> float:
        """Flip Y for DXF."""
        return fp_d - y

    # 1. Walls
    walls = floor_plan.get("walls")
    if walls:
        for wall in walls:
            x1, y1 = float(wall.get("x1", 0)), fy(float(wall.get("y1", 0)))
            x2, y2 = float(wall.get("x2", 0)), fy(float(wall.get("y2", 0)))
            lw = 50 if wall.get("bearing") else 25
            msp.add_line((x1, y1), (x2, y2), dxfattribs={"layer": "WALLS", "lineweight": lw})
    else:
        _draw_derived_walls(msp, rooms, fp_w, fp_d, fy)

    # 2. Doors
    for door in floor_plan.get("doors", []):
        _draw_door(msp, door, fy)

    # 3. Windows
    for win in floor_plan.get("windows", []):
        _draw_window(msp, win, fy)

    # 4. Room labels + areas
    for room in rooms:
        _draw_room_label(msp, room, fp_d, fy)

    # 5. Overall footprint dimensions (text-based, no DIMENSION entity)
    _draw_overall_dims(msp, fp_w, fp_d)

    # 6. Title block
    _draw_title_block(msp, fp_w, fp_d, project_name)

    return _to_bytes(doc)


# ---------------------------------------------------------------------------
# Layer setup
# ---------------------------------------------------------------------------

def _setup_layers(doc):
    for name, (color, lw) in LAYERS.items():
        if name not in doc.layers:
            layer = doc.layers.add(name)
        else:
            layer = doc.layers.get(name)
        layer.color = color
        if lw:
            layer.lineweight = lw


# ---------------------------------------------------------------------------
# Wall drawing
# ---------------------------------------------------------------------------

def _draw_derived_walls(msp, rooms, fp_w, fp_d, fy):
    """Exterior perimeter as closed polyline + interior room-edge lines."""
    # Exterior perimeter
    msp.add_lwpolyline(
        [(0, 0), (fp_w, 0), (fp_w, fp_d), (0, fp_d)],
        close=True,
        dxfattribs={"layer": "WALLS", "lineweight": 50},
    )

    eps = 0.15  # feet — tolerance for "on exterior"
    for room in rooms:
        rx, ry, rw, rh = _rect(room)
        x0, x1 = rx, rx + rw
        # DXF bottom/top of room
        y0 = fy(ry + rh)
        y1 = fy(ry)

        edges = [
            ((x0, y0), (x1, y0), "bottom"),
            ((x1, y0), (x1, y1), "right"),
            ((x1, y1), (x0, y1), "top"),
            ((x0, y1), (x0, y0), "left"),
        ]
        for (ax, ay), (bx, by), _ in edges:
            on_ext = (
                (abs(ay) < eps and abs(by) < eps) or
                (abs(ay - fp_d) < eps and abs(by - fp_d) < eps) or
                (abs(ax) < eps and abs(bx) < eps) or
                (abs(ax - fp_w) < eps and abs(bx - fp_w) < eps)
            )
            if not on_ext:
                msp.add_line(
                    (ax, ay), (bx, by),
                    dxfattribs={"layer": "WALLS", "lineweight": 25},
                )


# ---------------------------------------------------------------------------
# Door / window symbols
# ---------------------------------------------------------------------------

def _draw_door(msp, door, fy):
    dx = float(door.get("x", 0))
    dy = fy(float(door.get("y", 0)))
    leaf = float(door.get("width", 36)) / 12.0  # inches → feet

    msp.add_line((dx, dy), (dx + leaf, dy), dxfattribs={"layer": "DOORS"})
    msp.add_arc(
        center=(dx, dy),
        radius=leaf,
        start_angle=0,
        end_angle=90,
        dxfattribs={"layer": "DOORS"},
    )


def _draw_window(msp, win, fy):
    wx = float(win.get("x", 0))
    wy = fy(float(win.get("y", 0)))
    ww = float(win.get("width", 36)) / 12.0

    for offset in (-0.1, 0.0, 0.1):
        msp.add_line(
            (wx, wy + offset), (wx + ww, wy + offset),
            dxfattribs={"layer": "WINDOWS"},
        )


# ---------------------------------------------------------------------------
# Room labels
# ---------------------------------------------------------------------------

def _draw_room_label(msp, room, fp_d, fy):
    rx, ry, rw, rh = _rect(room)
    cx = rx + rw / 2.0
    # Centre Y in DXF coords
    cy = fy(ry + rh / 2.0)

    label = (room.get("label") or room.get("type", "Room")).replace("_", " ").title()
    area = f"{rw * rh:.0f} sf"

    msp.add_text(
        label,
        dxfattribs={
            "layer": "LABELS",
            "height": min(rh * 0.12, 1.0),
            "insert": (cx, cy + 0.3),
            "halign": 4,   # 4 = MIDDLE_CENTER (requires alignment point)
            "valign": 0,
        },
    ).set_placement((cx, cy + 0.3), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    msp.add_text(
        area,
        dxfattribs={
            "layer": "LABELS",
            "height": min(rh * 0.08, 0.7),
            "insert": (cx, cy - 0.5),
        },
    ).set_placement((cx, cy - 0.5), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)


# ---------------------------------------------------------------------------
# Overall dimension annotations (text + tick lines — no DIMENSION entity)
# ---------------------------------------------------------------------------

def _draw_overall_dims(msp, fp_w, fp_d):
    offset = 3.0  # feet outside footprint
    tick = 0.4

    # ── Width dimension below plan ──
    dim_y = -offset
    # Extension lines
    msp.add_line((0, 0), (0, dim_y - tick), dxfattribs={"layer": "DIMS"})
    msp.add_line((fp_w, 0), (fp_w, dim_y - tick), dxfattribs={"layer": "DIMS"})
    # Dim line
    msp.add_line((0, dim_y), (fp_w, dim_y), dxfattribs={"layer": "DIMS"})
    # Ticks
    msp.add_line((0, dim_y - tick), (0, dim_y + tick), dxfattribs={"layer": "DIMS"})
    msp.add_line((fp_w, dim_y - tick), (fp_w, dim_y + tick), dxfattribs={"layer": "DIMS"})
    # Text
    msp.add_text(
        f"{fp_w:.1f}'",
        dxfattribs={"layer": "DIMS", "height": 0.7},
    ).set_placement((fp_w / 2, dim_y - 1.0), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)

    # ── Depth dimension right of plan ──
    dim_x = fp_w + offset
    msp.add_line((fp_w, 0), (dim_x + tick, 0), dxfattribs={"layer": "DIMS"})
    msp.add_line((fp_w, fp_d), (dim_x + tick, fp_d), dxfattribs={"layer": "DIMS"})
    msp.add_line((dim_x, 0), (dim_x, fp_d), dxfattribs={"layer": "DIMS"})
    msp.add_line((dim_x - tick, 0), (dim_x + tick, 0), dxfattribs={"layer": "DIMS"})
    msp.add_line((dim_x - tick, fp_d), (dim_x + tick, fp_d), dxfattribs={"layer": "DIMS"})
    msp.add_text(
        f"{fp_d:.1f}'",
        dxfattribs={"layer": "DIMS", "height": 0.7},
    ).set_placement((dim_x + 1.2, fp_d / 2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER)


# ---------------------------------------------------------------------------
# Title block
# ---------------------------------------------------------------------------

def _draw_title_block(msp, fp_w, fp_d, project_name: str):
    tb_h = 4.0
    tb_y = -8.0  # below dim line
    tb_x = 0.0
    tb_w = max(fp_w, 30.0)

    # Border
    msp.add_lwpolyline(
        [(tb_x, tb_y), (tb_x + tb_w, tb_y),
         (tb_x + tb_w, tb_y + tb_h), (tb_x, tb_y + tb_h)],
        close=True,
        dxfattribs={"layer": "TITLEBLOCK"},
    )

    # Divider
    div_x = tb_x + tb_w * 0.55
    msp.add_line((div_x, tb_y), (div_x, tb_y + tb_h), dxfattribs={"layer": "TITLEBLOCK"})

    # Project name
    msp.add_text(
        project_name,
        dxfattribs={"layer": "TITLEBLOCK", "height": 0.9},
    ).set_placement(
        (tb_x + div_x / 2, tb_y + tb_h / 2),
        align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
    )

    # Right side info
    today = date.today().strftime("%Y-%m-%d")
    right_cx = div_x + (tb_x + tb_w - div_x) / 2
    for i, line in enumerate([
        f"Date: {today}",
        "Scale: 1\" = 1'",
        "Vision AI - For Reference Only",
    ]):
        msp.add_text(
            line,
            dxfattribs={"layer": "TITLEBLOCK", "height": 0.45},
        ).set_placement(
            (right_cx, tb_y + tb_h - 0.7 - i * 0.9),
            align=ezdxf.enums.TextEntityAlignment.MIDDLE_CENTER,
        )


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def _rect(room: dict):
    x = float(room.get("x", 0))
    y = float(room.get("y", 0))
    w = float(room.get("w") or room.get("width") or 10)
    h = float(room.get("h") or room.get("depth") or 10)
    return x, y, w, h


def _max_x(rooms):
    return max((r.get("x", 0) + (r.get("w") or r.get("width") or 10) for r in rooms), default=40.0)


def _max_y(rooms):
    return max((r.get("y", 0) + (r.get("h") or r.get("depth") or 10) for r in rooms), default=50.0)


def _to_bytes(doc) -> bytes:
    buf = io.StringIO()
    doc.write(buf)
    return buf.getvalue().encode("utf-8")
