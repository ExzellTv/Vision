/**
 * FloorPlanDraw — Interactive 2D floor plan editor
 * Draw rooms by dragging, select/move/resize them, then save to project.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { colors, fonts, radii } from "../../theme/tokens";
import { useProject } from "../../hooks/useProjectStore";

/* ─────────────────────────── Constants ─────────────────────────── */

const PX_PER_FT = 7;   // canvas pixels per foot
const SNAP      = 1;   // snap-to-grid resolution (ft)
const HSZ       = 7;   // resize handle half-size (px)

const ROOM_TYPES = [
  { key: "living",   label: "Living Room",    fill: "rgba(46,213,115,0.22)",  stroke: "#2ed573" },
  { key: "kitchen",  label: "Kitchen",        fill: "rgba(255,159,67,0.22)",  stroke: "#ff9f43" },
  { key: "bedroom",  label: "Bedroom",        fill: "rgba(59,130,246,0.22)",  stroke: "#3b82f6" },
  { key: "bathroom", label: "Bathroom",       fill: "rgba(0,212,255,0.22)",   stroke: "#00d4ff" },
  { key: "dining",   label: "Dining",         fill: "rgba(138,155,176,0.22)", stroke: "#8a9bb0" },
  { key: "garage",   label: "Garage",         fill: "rgba(90,101,128,0.25)",  stroke: "#5a6580" },
  { key: "hallway",  label: "Hallway",        fill: "rgba(42,53,72,0.4)",     stroke: "#3d4e66" },
  { key: "closet",   label: "Closet",         fill: "rgba(42,53,72,0.3)",     stroke: "#2a3a50" },
  { key: "laundry",  label: "Laundry",        fill: "rgba(138,155,176,0.2)",  stroke: "#6b7a90" },
  { key: "office",   label: "Office",         fill: "rgba(124,92,191,0.22)",  stroke: "#7c5cbf" },
];

const TYPE_MAP = Object.fromEntries(ROOM_TYPES.map((t) => [t.key, t]));

function roomColor(type) {
  return TYPE_MAP[type] || { fill: "rgba(42,53,72,0.3)", stroke: "#5a6580" };
}

let _uid = 100;
const uid = () => `r${++_uid}`;

/* ─────────────────────── Coordinate helpers ───────────────────── */

function snap(v) { return Math.round(v / SNAP) * SNAP; }

function computeTransform(canvas, planW, planH) {
  const rect = canvas.getBoundingClientRect();
  const cw = rect.width;
  const ch = rect.height;
  const pad = 55;
  const scale = Math.min((cw - pad * 2) / (planW * PX_PER_FT), (ch - pad * 2) / (planH * PX_PER_FT), 2.5);
  const pxW = planW * PX_PER_FT * scale;
  const pxH = planH * PX_PER_FT * scale;
  return { offX: (cw - pxW) / 2, offY: (ch - pxH) / 2, scale };
}

function pxToFt(px, offset, scale) { return (px - offset) / (PX_PER_FT * scale); }
function ftToPx(ft, offset, scale) { return offset + ft * PX_PER_FT * scale; }

function handlePositions(rx, ry, rw, rh) {
  return [
    { id: "nw", x: rx,        y: ry        },
    { id: "n",  x: rx + rw/2, y: ry        },
    { id: "ne", x: rx + rw,   y: ry        },
    { id: "e",  x: rx + rw,   y: ry + rh/2 },
    { id: "se", x: rx + rw,   y: ry + rh   },
    { id: "s",  x: rx + rw/2, y: ry + rh   },
    { id: "sw", x: rx,        y: ry + rh   },
    { id: "w",  x: rx,        y: ry + rh/2 },
  ];
}

const RESIZE_CURSORS = { nw:"nw-resize", n:"n-resize", ne:"ne-resize", e:"e-resize",
                          se:"se-resize", s:"s-resize", sw:"sw-resize", w:"w-resize" };

/* ─────────────────────── Canvas renderer ─────────────────────── */

function renderCanvas(canvas, { rooms, selected, preview, planW, planH }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  canvas.width  = rect.width  * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const cw = rect.width, ch = rect.height;
  const { offX, offY, scale } = computeTransform(canvas, planW, planH);

  // Background
  ctx.fillStyle = "#0a0e17";
  ctx.fillRect(0, 0, cw, ch);

  const pxW = planW * PX_PER_FT * scale;
  const pxH = planH * PX_PER_FT * scale;

  // Minor grid (1 ft)
  ctx.strokeStyle = "rgba(42,53,72,0.45)";
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= planW; x++) {
    const px = ftToPx(x, offX, scale);
    ctx.beginPath(); ctx.moveTo(px, offY); ctx.lineTo(px, offY + pxH); ctx.stroke();
  }
  for (let y = 0; y <= planH; y++) {
    const py = ftToPx(y, offY, scale);
    ctx.beginPath(); ctx.moveTo(offX, py); ctx.lineTo(offX + pxW, py); ctx.stroke();
  }

  // Major grid (5 ft)
  ctx.strokeStyle = "rgba(42,53,72,0.85)";
  ctx.lineWidth = 0.75;
  for (let x = 0; x <= planW; x += 5) {
    const px = ftToPx(x, offX, scale);
    ctx.beginPath(); ctx.moveTo(px, offY - 5); ctx.lineTo(px, offY + pxH + 5); ctx.stroke();
  }
  for (let y = 0; y <= planH; y += 5) {
    const py = ftToPx(y, offY, scale);
    ctx.beginPath(); ctx.moveTo(offX - 5, py); ctx.lineTo(offX + pxW + 5, py); ctx.stroke();
  }

  // Plan boundary
  ctx.strokeStyle = "rgba(0,212,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(offX, offY, pxW, pxH);
  ctx.setLineDash([]);

  // Axis labels
  ctx.fillStyle = "rgba(200,208,224,0.4)";
  ctx.font = `10px 'JetBrains Mono', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let x = 0; x <= planW; x += 5) {
    ctx.fillText(`${x}'`, ftToPx(x, offX, scale), offY - 12);
  }
  ctx.textAlign = "right";
  for (let y = 0; y <= planH; y += 5) {
    ctx.fillText(`${y}'`, offX - 8, ftToPx(y, offY, scale));
  }

  // Rooms
  rooms.forEach((room) => {
    const rx = ftToPx(room.x, offX, scale);
    const ry = ftToPx(room.y, offY, scale);
    const rw = room.w * PX_PER_FT * scale;
    const rh = room.h * PX_PER_FT * scale;
    const col = roomColor(room.type);
    const isSel = selected === room.id;

    // Fill
    ctx.fillStyle = isSel ? col.fill.replace(/[\d.]+\)$/, "0.42)") : col.fill;
    ctx.fillRect(rx, ry, rw, rh);

    // Border
    ctx.strokeStyle = isSel ? "#ffffff" : col.stroke;
    ctx.lineWidth = isSel ? 2 : 1.5;
    ctx.strokeRect(rx, ry, rw, rh);

    // Label
    if (rw > 18 && rh > 18) {
      const fs = Math.max(8, Math.min(13, rw / 8));
      ctx.fillStyle = col.stroke;
      ctx.font = `600 ${fs}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(room.label, rx + rw / 2, ry + rh / 2 - fs * 0.55);
      ctx.fillStyle = "rgba(200,208,224,0.5)";
      ctx.font = `${Math.max(7, fs - 2)}px 'JetBrains Mono', monospace`;
      ctx.fillText(`${room.w}×${room.h}`, rx + rw / 2, ry + rh / 2 + fs * 0.55);
    }

    // Resize handles (selected only)
    if (isSel) {
      ctx.fillStyle = "#00d4ff";
      ctx.strokeStyle = "#0a0e17";
      ctx.lineWidth = 1;
      handlePositions(rx, ry, rw, rh).forEach((h) => {
        ctx.fillRect(h.x - HSZ, h.y - HSZ, HSZ * 2, HSZ * 2);
        ctx.strokeRect(h.x - HSZ, h.y - HSZ, HSZ * 2, HSZ * 2);
      });
    }
  });

  // Draw preview
  if (preview) {
    const rx = ftToPx(preview.x, offX, scale);
    const ry = ftToPx(preview.y, offY, scale);
    const rw = preview.w * PX_PER_FT * scale;
    const rh = preview.h * PX_PER_FT * scale;
    const col = roomColor(preview.type);
    ctx.fillStyle = col.fill;
    ctx.fillRect(rx, ry, rw, rh);
    ctx.strokeStyle = col.stroke;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);
    if (rw > 28 && rh > 16) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.font = `bold 11px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${preview.w}' × ${preview.h}'`, rx + rw / 2, ry + rh / 2);
    }
  }
}

/* ────────────────────── Hit testing ─────────────────────────── */

function hitHandle(mx, my, room, offX, offY, scale) {
  const rx = ftToPx(room.x, offX, scale);
  const ry = ftToPx(room.y, offY, scale);
  const rw = room.w * PX_PER_FT * scale;
  const rh = room.h * PX_PER_FT * scale;
  for (const h of handlePositions(rx, ry, rw, rh)) {
    if (Math.abs(mx - h.x) <= HSZ + 2 && Math.abs(my - h.y) <= HSZ + 2) return h.id;
  }
  return null;
}

function hitRoom(mx, my, room, offX, offY, scale) {
  const rx = ftToPx(room.x, offX, scale);
  const ry = ftToPx(room.y, offY, scale);
  return mx >= rx && mx <= rx + room.w * PX_PER_FT * scale &&
         my >= ry && my <= ry + room.h * PX_PER_FT * scale;
}

/* ─────────────────────── Label helpers ─────────────────────── */

function autoLabel(type, rooms) {
  const sameType = rooms.filter((r) => r.type === type);
  const info = TYPE_MAP[type];
  if (!info) return type;
  if (type === "bedroom" && sameType.length === 0) return "Primary Bedroom";
  if (sameType.length === 0) return info.label;
  return `${info.label} ${sameType.length + 1}`;
}

function initFromPlan(plan) {
  if (!plan?.rooms?.length) return [];
  return plan.rooms.map((r) => ({
    id: uid(),
    type: r.type || "bedroom",
    label: r.label || r.type,
    x: r.x ?? 0, y: r.y ?? 0,
    w: r.w ?? 10, h: r.h ?? 10,
  }));
}

/* ─────────────────── Story data helpers ────────────────────── */

function makeStory(plan) {
  return {
    rooms:  initFromPlan(plan),
    planW:  plan?.width  || 60,
    planH:  plan?.depth  || 80,
  };
}

function makeEmptyStory(ref) {
  // New story copies canvas size from story 1 (ref), starts with empty rooms
  return { rooms: [], planW: ref?.planW || 60, planH: ref?.planH || 80 };
}

/* ═══════════════════════ Component ══════════════════════════════ */

export default function FloorPlanDraw({ onSave }) {
  const project = useProject();
  const canvasRef    = useRef(null);
  const containerRef = useRef(null);
  const iaRef        = useRef(null);
  const txRef        = useRef({ offX: 55, offY: 55, scale: 1 });

  // Multi-story state ─────────────────────────────────────────────
  const initStories = () => {
    // Restore from project if already saved
    if (project.storyPlans?.length > 0) {
      return project.storyPlans.map(makeStory);
    }
    return [makeStory(project.floorPlan)];
  };

  const [numStories,    setNumStoriesRaw] = useState(() => project.storyPlans?.length || project.generateParams?.stories || 1);
  const [storyData,     setStoryData]     = useState(initStories);
  const [currentStory,  setCurrentStory]  = useState(0);

  // When numStories changes, grow/shrink storyData
  const setNumStories = (n) => {
    setNumStoriesRaw(n);
    setStoryData((prev) => {
      const copy = [...prev];
      while (copy.length < n) copy.push(makeEmptyStory(copy[0]));
      return copy.slice(0, n);
    });
    setCurrentStory((s) => Math.min(s, n - 1));
  };

  // Per-story setters that operate on currentStory
  const setCurrent = (updater) =>
    setStoryData((prev) => prev.map((sd, i) => i === currentStory ? { ...sd, ...updater(sd) } : sd));

  const setRooms = (updater) =>
    setCurrent((sd) => ({ rooms: typeof updater === "function" ? updater(sd.rooms) : updater }));
  const setPlanW = (v) => setCurrent(() => ({ planW: v }));
  const setPlanH = (v) => setCurrent(() => ({ planH: v }));

  // Convenience accessors for current story
  const rooms = storyData[currentStory]?.rooms ?? [];
  const planW = storyData[currentStory]?.planW ?? 60;
  const planH = storyData[currentStory]?.planH ?? 80;

  // ─────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState(null);
  const [tool,     setTool]     = useState("select");
  const [roomType, setRoomType] = useState("bedroom");
  const [preview,  setPreview]  = useState(null);
  const [editLabel, setEditLabel] = useState(null); // {id, value}

  /* ── Render ── */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderCanvas(canvas, {
      rooms,
      selected,
      preview,
      planW,
      planH,
    });
  }, [rooms, selected, preview, planW, planH]);

  useEffect(() => {
    render();
    const obs = new ResizeObserver(render);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [render]);

  /* ── Mouse helpers ── */
  const getTx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return txRef.current;
    const t = computeTransform(canvas, planW, planH);
    txRef.current = t;
    return t;
  }, [planW, planH]);

  const canvasPt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  };

  const toFt = (mx, my) => {
    const t = getTx();
    return { ftX: snap(pxToFt(mx, t.offX, t.scale)), ftY: snap(pxToFt(my, t.offY, t.scale)) };
  };

  /* ── Mouse handlers ── */
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const { mx, my } = canvasPt(e);
    const t = getTx();

    if (tool === "erase") {
      const hit = [...rooms].reverse().find((r) => hitRoom(mx, my, r, t.offX, t.offY, t.scale));
      if (hit) { setRooms((p) => p.filter((r) => r.id !== hit.id)); setSelected(null); }
      return;
    }

    if (tool === "room") {
      const { ftX, ftY } = toFt(mx, my);
      iaRef.current = { mode: "drawing", sx: ftX, sy: ftY };
      return;
    }

    if (tool === "select") {
      // Handle-first (resize)
      if (selected) {
        const selRoom = rooms.find((r) => r.id === selected);
        if (selRoom) {
          const h = hitHandle(mx, my, selRoom, t.offX, t.offY, t.scale);
          if (h) {
            iaRef.current = { mode: "resize", id: selected, handle: h, orig: { ...selRoom }, smx: mx, smy: my };
            return;
          }
        }
      }
      // Room hit
      const hit = [...rooms].reverse().find((r) => hitRoom(mx, my, r, t.offX, t.offY, t.scale));
      if (hit) {
        setSelected(hit.id);
        iaRef.current = { mode: "move", id: hit.id, orig: { ...hit }, smx: mx, smy: my };
      } else {
        setSelected(null);
      }
    }
  }, [tool, rooms, selected, getTx]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMouseMove = useCallback((e) => {
    const { mx, my } = canvasPt(e);
    const t = getTx();
    const ia = iaRef.current;
    const canvas = canvasRef.current;

    // Cursor
    if (!ia) {
      if (tool === "select" && selected) {
        const sel = rooms.find((r) => r.id === selected);
        if (sel) {
          const h = hitHandle(mx, my, sel, t.offX, t.offY, t.scale);
          if (h) { canvas.style.cursor = RESIZE_CURSORS[h]; return; }
        }
      }
      const hit = rooms.find((r) => hitRoom(mx, my, r, t.offX, t.offY, t.scale));
      canvas.style.cursor = tool === "erase" ? "crosshair" : hit ? (tool === "select" ? "move" : "default") : "default";
      return;
    }

    if (ia.mode === "drawing") {
      const { ftX, ftY } = toFt(mx, my);
      const x = Math.min(ia.sx, ftX), y = Math.min(ia.sy, ftY);
      const w = Math.max(1, Math.abs(ftX - ia.sx)), h = Math.max(1, Math.abs(ftY - ia.sy));
      setPreview({ x, y, w, h, type: roomType });
      return;
    }

    if (ia.mode === "move") {
      const dftX = (mx - ia.smx) / (PX_PER_FT * t.scale);
      const dftY = (my - ia.smy) / (PX_PER_FT * t.scale);
      const nx = snap(ia.orig.x + dftX), ny = snap(ia.orig.y + dftY);
      setRooms((p) => p.map((r) => r.id === ia.id ? { ...r, x: nx, y: ny } : r));
      return;
    }

    if (ia.mode === "resize") {
      const dfx = (mx - ia.smx) / (PX_PER_FT * t.scale);
      const dfy = (my - ia.smy) / (PX_PER_FT * t.scale);
      const o = ia.orig;
      let { x, y, w, h } = o;
      const hd = ia.handle;
      if (hd.includes("e")) w = snap(Math.max(2, o.w + dfx));
      if (hd.includes("s")) h = snap(Math.max(2, o.h + dfy));
      if (hd.includes("w")) { const nx = snap(o.x + dfx); w = snap(Math.max(2, o.x + o.w - nx)); x = o.x + o.w - w; }
      if (hd.includes("n")) { const ny = snap(o.y + dfy); h = snap(Math.max(2, o.y + o.h - ny)); y = o.y + o.h - h; }
      setRooms((p) => p.map((r) => r.id === ia.id ? { ...r, x, y, w, h } : r));
    }
  }, [tool, rooms, selected, roomType, getTx]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMouseUp = useCallback(() => {
    const ia = iaRef.current;
    if (!ia) return;
    if (ia.mode === "drawing" && preview) {
      const { x, y, w, h } = preview;
      if (w >= 2 && h >= 2) {
        const r = { id: uid(), type: roomType, label: autoLabel(roomType, rooms), x, y, w, h };
        setRooms((p) => [...p, r]);
        setSelected(r.id);
      }
      setPreview(null);
    }
    iaRef.current = null;
  }, [preview, roomType, rooms]);

  /* ── Keyboard ── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT") return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        setRooms((p) => p.filter((r) => r.id !== selected));
        setSelected(null);
      }
      if (e.key === "Escape") { setSelected(null); setPreview(null); setEditLabel(null); iaRef.current = null; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  /* ── Double-click to rename ── */
  const onDblClick = useCallback((e) => {
    const { mx, my } = canvasPt(e);
    const t = getTx();
    const hit = [...rooms].reverse().find((r) => hitRoom(mx, my, r, t.offX, t.offY, t.scale));
    if (hit) setEditLabel({ id: hit.id, value: hit.label });
  }, [rooms, getTx]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitLabel = () => {
    if (!editLabel) return;
    const trimmed = editLabel.value.trim();
    if (trimmed) setRooms((p) => p.map((r) => r.id === editLabel.id ? { ...r, label: trimmed } : r));
    setEditLabel(null);
  };

  /* ── Save all stories ── */
  const totalAllRooms = storyData.slice(0, numStories).reduce((s, sd) => s + sd.rooms.length, 0);

  const handleSave = () => {
    const plans = storyData.slice(0, numStories).map((sd, i) => ({
      id: `draw-s${i + 1}-${Date.now()}`,
      width: sd.planW, depth: sd.planH,
      rooms: sd.rooms.map((r) => ({ ...r })),
      doors: [], windows: [],
      totalSF: sd.rooms.reduce((s, r) => s + r.w * r.h, 0),
      score: 0.85,
      stories: numStories,
      storyIndex: i,
      style: project.generateParams?.style || "Custom",
    }));
    onSave(plans);
  };

  const selectedRoom = rooms.find((r) => r.id === selected) || null;

  /* ── Styles ── */
  const panelBg  = colors.panel || "#111827";
  const bdColor  = colors.cardBorder || "#2a3548";
  const accent   = colors.accent;

  const toolBtn = (active) => ({
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 12px", borderRadius: radii.md,
    border: `1px solid ${active ? accent : bdColor}`,
    background: active ? "rgba(0,212,255,0.1)" : "transparent",
    color: active ? accent : colors.textDim,
    cursor: "pointer", fontFamily: fonts.label, fontSize: 13, fontWeight: active ? 600 : 400,
    transition: "all 0.15s",
    width: "100%", textAlign: "left",
  });

  const typeBtn = (active, col) => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 9px", borderRadius: radii.sm,
    border: `1px solid ${active ? col.stroke : bdColor}`,
    background: active ? col.fill : "transparent",
    color: active ? "#fff" : colors.textDim,
    cursor: "pointer", fontFamily: fonts.label, fontSize: 11,
    transition: "all 0.15s", width: "100%", textAlign: "left",
    marginBottom: 3,
  });

  const canSave = totalAllRooms > 0;

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", background: colors.bg, overflow: "hidden" }}>

      {/* ── Canvas + story tabs ── */}
      <div style={{ flex: "1 1 70%", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Story tab bar */}
        {numStories > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px",
            background: colors.surface, borderBottom: `1px solid ${bdColor}`, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.data, marginRight: 6 }}>STORY</span>
            {Array.from({ length: numStories }, (_, i) => (
              <button key={i} onClick={() => { setCurrentStory(i); setSelected(null); }} style={{
                padding: "4px 14px", borderRadius: radii.md,
                border: `1px solid ${currentStory === i ? accent : bdColor}`,
                background: currentStory === i ? "rgba(0,212,255,0.12)" : "transparent",
                color: currentStory === i ? accent : colors.textDim,
                fontFamily: fonts.data, fontSize: 12, fontWeight: currentStory === i ? 700 : 400,
                cursor: "pointer",
              }}>
                {i + 1}{storyData[i]?.rooms.length > 0 ? ` (${storyData[i].rooms.length})` : " · empty"}
              </button>
            ))}
          </div>
        )}

        <div ref={containerRef} style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block",
            cursor: tool === "room" ? "crosshair" : tool === "erase" ? "cell" : "default" }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onDoubleClick={onDblClick}
        />

        {/* Floating tool hint */}
        <div style={{ position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
          fontFamily: fonts.data, fontSize: 10, color: colors.textDim,
          background: "rgba(10,14,23,0.85)", padding: "4px 12px", borderRadius: 8,
          border: `1px solid ${bdColor}`, pointerEvents: "none" }}>
          { tool === "select" ? "Click to select · Drag to move · Corner handles to resize · Dbl-click to rename · Del to delete"
          : tool === "room"   ? "Click and drag to draw a room · Release to place"
          : "Click a room to delete it" }
        </div>

        {/* Rename overlay */}
        {editLabel && (() => {
          const t  = getTx();
          const rm = rooms.find((r) => r.id === editLabel.id);
          if (!rm) return null;
          const rx = ftToPx(rm.x, t.offX, t.scale) + (rm.w * PX_PER_FT * t.scale) / 2;
          const ry = ftToPx(rm.y, t.offY, t.scale) + (rm.h * PX_PER_FT * t.scale) / 2;
          return (
            <input
              autoFocus
              value={editLabel.value}
              onChange={(e) => setEditLabel((p) => ({ ...p, value: e.target.value }))}
              onBlur={commitLabel}
              onKeyDown={(e) => { if (e.key === "Enter") commitLabel(); if (e.key === "Escape") setEditLabel(null); }}
              style={{
                position: "absolute",
                left: rx - 60, top: ry - 12, width: 120,
                background: colors.bg, color: "#fff", border: `1px solid ${accent}`,
                borderRadius: 4, padding: "2px 6px", fontFamily: fonts.label, fontSize: 12,
                textAlign: "center", outline: "none",
              }}
            />
          );
        })()}
        </div>{/* end inner containerRef div */}
      </div>{/* end canvas column */}

      {/* ── Right Panel ── */}
      <div style={{ flex: "0 0 260px", background: panelBg, borderLeft: `1px solid ${bdColor}`,
        display: "flex", flexDirection: "column", overflowY: "auto" }}>

        {/* Tools */}
        <div style={{ padding: "16px 16px 8px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase",
            color: accent, fontFamily: fonts.data, marginBottom: 10 }}>Tools</div>
          {[
            { key: "select", label: "Select / Move", icon: "↖" },
            { key: "room",   label: "Draw Room",     icon: "⬜" },
            { key: "erase",  label: "Erase Room",    icon: "✕" },
          ].map((t) => (
            <button key={t.key} style={toolBtn(tool === t.key)} onClick={() => setTool(t.key)}>
              <span style={{ fontFamily: fonts.data, fontSize: 14, width: 18 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Room type (only when draw tool is active) */}
        {tool === "room" && (
          <div style={{ padding: "8px 16px 8px", borderTop: `1px solid ${bdColor}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase",
              color: accent, fontFamily: fonts.data, marginBottom: 8 }}>Room Type</div>
            {ROOM_TYPES.map((rt) => (
              <button key={rt.key} style={typeBtn(roomType === rt.key, rt)} onClick={() => setRoomType(rt.key)}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: rt.stroke, flexShrink: 0 }} />
                {rt.label}
              </button>
            ))}
          </div>
        )}

        {/* Selected room properties */}
        {tool === "select" && selectedRoom && (
          <div style={{ padding: "8px 16px", borderTop: `1px solid ${bdColor}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase",
              color: accent, fontFamily: fonts.data, marginBottom: 10 }}>Selected Room</div>

            {/* Type picker */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 5 }}>Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {ROOM_TYPES.map((rt) => (
                  <button key={rt.key}
                    onClick={() => setRooms((p) => p.map((r) => r.id === selected ? { ...r, type: rt.key } : r))}
                    style={{ padding: "3px 7px", borderRadius: radii.sm, border: `1px solid ${selectedRoom.type === rt.key ? rt.stroke : bdColor}`,
                      background: selectedRoom.type === rt.key ? rt.fill : "transparent",
                      color: selectedRoom.type === rt.key ? "#fff" : colors.textDim,
                      cursor: "pointer", fontSize: 10, fontFamily: fonts.label }}>
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            {[
              { label: "X (ft)", key: "x", min: 0, max: planW - 1 },
              { label: "Y (ft)", key: "y", min: 0, max: planH - 1 },
              { label: "Width (ft)", key: "w", min: 2, max: planW },
              { label: "Depth (ft)", key: "h", min: 2, max: planH },
            ].map((field) => (
              <div key={field.key} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: colors.textDim }}>{field.label}</span>
                  <span style={{ fontSize: 12, color: colors.textBright, fontFamily: fonts.data, fontWeight: 600 }}>
                    {selectedRoom[field.key]}'
                  </span>
                </div>
                <input type="range" min={field.min} max={field.max} step={1}
                  value={selectedRoom[field.key]}
                  onChange={(e) => setRooms((p) => p.map((r) => r.id === selected ? { ...r, [field.key]: Number(e.target.value) } : r))}
                  style={{ width: "100%", accentColor: accent, cursor: "pointer" }} />
              </div>
            ))}

            {/* Rename */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: colors.textDim, marginBottom: 4 }}>Label</div>
              <input
                value={selectedRoom.label}
                onChange={(e) => setRooms((p) => p.map((r) => r.id === selected ? { ...r, label: e.target.value } : r))}
                style={{ width: "100%", background: colors.cardSurface || "#1a2233", color: "#fff",
                  border: `1px solid ${bdColor}`, borderRadius: radii.sm, padding: "5px 8px",
                  fontFamily: fonts.label, fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Area */}
            <div style={{ padding: "6px 0", borderTop: `1px solid ${bdColor}`, fontSize: 12, color: colors.textDim,
              display: "flex", justifyContent: "space-between" }}>
              <span>Area</span>
              <span style={{ color: colors.textBright, fontFamily: fonts.data, fontWeight: 600 }}>
                {selectedRoom.w * selectedRoom.h} sf
              </span>
            </div>

            {/* Delete */}
            <button
              onClick={() => { setRooms((p) => p.filter((r) => r.id !== selected)); setSelected(null); }}
              style={{ width: "100%", marginTop: 8, padding: "7px", borderRadius: radii.md,
                border: `1px solid ${colors.danger || "#ff4757"}`, background: "rgba(255,71,87,0.1)",
                color: colors.danger || "#ff4757", cursor: "pointer", fontFamily: fonts.label, fontSize: 12 }}>
              Delete Room
            </button>
          </div>
        )}

        {/* Stories */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${bdColor}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase",
            color: accent, fontFamily: fonts.data, marginBottom: 8 }}>Stories</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3].map((n) => (
              <button key={n} onClick={() => setNumStories(n)} style={{
                flex: 1, padding: "6px 0", borderRadius: radii.sm,
                border: `1px solid ${numStories === n ? accent : bdColor}`,
                background: numStories === n ? "rgba(0,212,255,0.12)" : "transparent",
                color: numStories === n ? accent : colors.textDim,
                fontFamily: fonts.data, fontSize: 13, fontWeight: numStories === n ? 700 : 400,
                cursor: "pointer",
              }}>{n}</button>
            ))}
          </div>
          {numStories > 1 && (
            <div style={{ fontSize: 10, color: colors.textDim, marginTop: 6 }}>
              Each story has its own independent floor plan. Use the tabs above the canvas to switch.
            </div>
          )}
        </div>

        {/* Canvas Size */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${bdColor}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase",
            color: accent, fontFamily: fonts.data, marginBottom: 10 }}>Canvas Size</div>
          {[
            { label: "Width", val: planW, set: setPlanW, min: 20, max: 200 },
            { label: "Depth", val: planH, set: setPlanH, min: 20, max: 200 },
          ].map((f) => (
            <div key={f.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: colors.textDim }}>{f.label}</span>
                <span style={{ fontSize: 12, color: colors.textBright, fontFamily: fonts.data, fontWeight: 600 }}>{f.val}'</span>
              </div>
              <input type="range" min={f.min} max={f.max} step={5} value={f.val}
                onChange={(e) => f.set(Number(e.target.value))}
                style={{ width: "100%", accentColor: accent, cursor: "pointer" }} />
            </div>
          ))}
        </div>

        {/* Stats + Save */}
        <div style={{ marginTop: "auto", padding: "12px 16px", borderTop: `1px solid ${bdColor}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
            <span style={{ color: colors.textDim }}>Story {currentStory + 1} Rooms</span>
            <span style={{ color: colors.textBright, fontFamily: fonts.data, fontWeight: 600 }}>{rooms.length}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontSize: 12 }}>
            <span style={{ color: colors.textDim }}>Total Area (all stories)</span>
            <span style={{ color: colors.textBright, fontFamily: fonts.data, fontWeight: 600 }}>
              {storyData.slice(0, numStories).reduce((s, sd) => s + sd.rooms.reduce((a, r) => a + r.w * r.h, 0), 0).toLocaleString()} sf
            </span>
          </div>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{ width: "100%", padding: "11px", borderRadius: radii.md, border: "none",
              background: canSave ? `linear-gradient(135deg, ${accent}, #0099cc)` : bdColor,
              color: canSave ? "#fff" : colors.textDim,
              fontFamily: fonts.label, fontSize: 13, fontWeight: 700,
              cursor: canSave ? "pointer" : "default",
              boxShadow: canSave ? "0 2px 10px rgba(0,212,255,0.25)" : "none",
              letterSpacing: "0.4px" }}>
            Save {numStories > 1 ? `${numStories} Stories` : "Floor Plan"} →
          </button>
          {!canSave && (
            <div style={{ fontSize: 10, color: colors.textDim, textAlign: "center", marginTop: 6 }}>
              Draw at least one room to save
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
