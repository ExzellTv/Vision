import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { colors, fonts, radii } from "../../theme/tokens";
import { floorplanApi } from "../../services/api";
import { useProject, normalizeVariant } from "../../hooks/useProjectStore";
import FloorPlanDraw from "./FloorPlanDraw";

/* ───────────────────────── Constants ───────────────────────── */

const ROOM_COLORS = {
  bedroom:  { fill: "rgba(59, 130, 246, 0.2)",  stroke: "#3b82f6" },
  bathroom: { fill: "rgba(0, 212, 255, 0.2)",   stroke: "#00d4ff" },
  kitchen:  { fill: "rgba(255, 159, 67, 0.2)",  stroke: "#ff9f43" },
  living:   { fill: "rgba(46, 213, 115, 0.2)",  stroke: "#2ed573" },
  dining:   { fill: "rgba(138, 155, 176, 0.2)", stroke: "#8a9bb0" },
  garage:   { fill: "rgba(90, 101, 128, 0.2)",  stroke: "#5a6580" },
  hallway:  { fill: "rgba(42, 53, 72, 0.25)",   stroke: "#2a3548" },
  closet:   { fill: "rgba(42, 53, 72, 0.2)",    stroke: "#2a3548" },
  laundry:  { fill: "rgba(138, 155, 176, 0.15)", stroke: "#6b7a90" },
  entry:    { fill: "rgba(0, 212, 255, 0.08)",  stroke: "#1a5c6a" },
};

const STYLE_OPTIONS = ["Ranch", "Colonial", "Modern", "Craftsman", "Mediterranean"];
const GARAGE_OPTIONS = ["None", "1-car", "2-car", "Detached"];

const PX_PER_FT = 4;         // 1 ft = 4 canvas pixels
const GRID_SPACING_FT = 0.5; // 6 inches
const GRID_PX = GRID_SPACING_FT * PX_PER_FT; // 2px per grid cell

const DEFAULT_PARAMS = {
  targetSF: 2200,
  bedrooms: 3,
  bathrooms: 2,
  stories: 1,
  lotWidth: 60,
  lotDepth: 120,
  style: "Ranch",
  garage: "2-car",
  openFloorPlan: true,
};

/* ───────────────────── Local Fallback Generator ────────────── */

function placeCommonRooms(rooms, cursor, width, depth, openFloorPlan, garage) {
  const garageWidths = { "2-car": 22, "1-car": 12 };
  const garageW = garageWidths[garage] || 0;
  if (garageW > 0 && garage !== "Detached") {
    rooms.push({
      type: "garage", label: "Garage",
      x: 0, y: 0, w: garageW, h: 22,
      bearing: [true, true, true, true],
    });
    cursor.x = garageW;
  }

  const livingW = openFloorPlan ? Math.round(width * 0.4) : Math.round(width * 0.28);
  const livingD = openFloorPlan ? Math.round(depth * 0.5) : Math.round(depth * 0.45);
  rooms.push({
    type: "living", label: "Living Room",
    x: cursor.x, y: 0, w: livingW, h: livingD,
    bearing: [true, false, false, true],
  });

  const kitchenW = openFloorPlan ? livingW : Math.round(width * 0.25);
  rooms.push({
    type: "kitchen", label: "Kitchen",
    x: cursor.x, y: livingD, w: kitchenW, h: depth - livingD,
    bearing: [false, false, true, true],
  });

  cursor.x += livingW;

  if (openFloorPlan) return;

  const diningW = Math.round(width * 0.2);
  const diningD = Math.round(depth * 0.4);
  rooms.push(
    {
      type: "dining", label: "Dining",
      x: cursor.x, y: 0, w: diningW, h: diningD,
      bearing: [true, false, false, false],
    },
    {
      type: "hallway", label: "Hall",
      x: cursor.x, y: diningD, w: diningW, h: depth - diningD,
      bearing: [false, false, true, false],
    },
  );
  cursor.x += diningW;
}

function placePrimaryBedroom(cursor, bedroomColW, cellH, bathrooms) {
  const bathW = bathrooms >= 2 ? Math.min(10, Math.round(bedroomColW * 0.45)) : 0;
  const wicW = 7;
  const bw = bedroomColW;
  const bh = Math.round(cellH * 1.4);
  const wicH = 6;

  const result = [
    {
      type: "bedroom", label: "Primary Bedroom",
      x: cursor.x, y: cursor.y, w: bw, h: bh,
      bearing: [cursor.y === 0, true, false, false],
    },
    {
      type: "closet", label: "W.I.C.",
      x: cursor.x, y: cursor.y + bh, w: wicW, h: wicH,
      bearing: [false, false, true, false],
    },
  ];
  if (bathrooms >= 2) {
    result.push({
      type: "bathroom", label: "Primary Bath",
      x: cursor.x + wicW, y: cursor.y + bh, w: bathW, h: wicH,
      bearing: [false, false, true, false],
    });
  }
  return { rooms: result, height: bh + wicH };
}

function placeSecondaryBedrooms(cursor, count, bedroomColW, cellH) {
  const result = [];
  for (let i = 1; i < count; i++) {
    const bw = Math.round(bedroomColW * 0.6);
    result.push({
      type: "bedroom", label: `Bedroom ${i + 1}`,
      x: cursor.x, y: cursor.y, w: bw, h: cellH,
      bearing: [cursor.y === 0, true, false, false],
    });
    cursor.y += cellH;
  }
  return result;
}

function placeRemainingBaths(cursor, bathrooms, bedroomColW, cellH, depth) {
  const remaining = bathrooms - (bathrooms >= 2 ? 1 : 0);
  const result = [];
  for (let i = 0; i < Math.ceil(remaining); i++) {
    const isHalf = remaining - i < 1;
    const bathW = Math.round(bedroomColW * (isHalf ? 0.3 : 0.4));
    const bathH = Math.round(cellH * (isHalf ? 0.6 : 0.8));
    result.push({
      type: "bathroom",
      label: isHalf ? "Half Bath" : `Bath ${i + 2}`,
      x: cursor.x, y: cursor.y, w: bathW, h: bathH,
      bearing: [false, false, cursor.y + bathH >= depth, false],
    });
    cursor.y += bathH;
  }
  return result;
}

function placeBedroomsAndBaths(rooms, cursor, bedrooms, bathrooms, bedroomColW, cellH, depth) {
  const primary = placePrimaryBedroom(cursor, bedroomColW, cellH, bathrooms);
  cursor.y += primary.height;

  const allBedBathRooms = [
    ...primary.rooms,
    ...placeSecondaryBedrooms(cursor, bedrooms, bedroomColW, cellH),
    ...placeRemainingBaths(cursor, bathrooms, bedroomColW, cellH, depth),
  ];
  rooms.push(...allBedBathRooms);

  if (cursor.y < depth) {
    rooms.push({
      type: "laundry", label: "Laundry",
      x: cursor.x, y: cursor.y, w: Math.round(bedroomColW * 0.4), h: depth - cursor.y,
      bearing: [false, true, true, false],
    });
  }
}

function generateDoors(rooms, garage) {
  const doors = [];
  for (const room of rooms) {
    if (room.type === "entry") {
      doors.push({ x: room.x + room.w / 2, y: room.y, side: "top", width: 3, isExterior: true });
    } else if (room.type === "garage" && garage !== "Detached") {
      doors.push(
        { x: room.x + room.w / 2, y: room.y, side: "top", width: 8, isExterior: true },
        { x: room.x + room.w, y: room.h / 2, side: "right", width: 3, isExterior: false },
      );
    } else if (room.type === "living") {
      doors.push({ x: room.x + room.w / 2, y: room.y + room.h, side: "bottom", width: 6, isExterior: false });
    }
  }
  return doors;
}

function generateWindowsForRoom(room, width, depth) {
  const SKIP_TYPES = new Set(["garage", "hallway", "closet"]);
  if (SKIP_TYPES.has(room.type)) return [];

  const wins = [];
  if (room.y === 0 && room.type !== "entry") {
    wins.push({ x: room.x + room.w * 0.3, y: room.y, side: "top", width: Math.min(4, room.w * 0.4) });
    if (room.w > 12) {
      wins.push({ x: room.x + room.w * 0.7, y: room.y, side: "top", width: Math.min(4, room.w * 0.4) });
    }
  }
  if (room.x + room.w >= width) {
    wins.push({ x: room.x + room.w, y: room.y + room.h * 0.4, side: "right", width: Math.min(3, room.h * 0.3) });
  }
  if (room.y + room.h >= depth && room.type !== "laundry") {
    wins.push({ x: room.x + room.w * 0.5, y: room.y + room.h, side: "bottom", width: Math.min(4, room.w * 0.4) });
  }
  if (room.x === 0 && room.type !== "garage") {
    wins.push({ x: room.x, y: room.y + room.h * 0.5, side: "left", width: Math.min(3, room.h * 0.3) });
  }
  return wins;
}

function generateLocalFloorPlan(params) {
  const { targetSF, bedrooms, bathrooms, stories, lotWidth, lotDepth, style, garage, openFloorPlan } = params;

  const storyArea = targetSF / stories;
  const maxBuildWidth = lotWidth - 10;
  const depth = Math.min(Math.round(storyArea / maxBuildWidth), lotDepth - 30);
  const width = Math.round(storyArea / depth);

  const rooms = [];
  const cursor = { x: 0, y: 0 };

  placeCommonRooms(rooms, cursor, width, depth, openFloorPlan, garage);

  const bedroomColW = width - cursor.x;
  const cellH = Math.round(depth / (bedrooms + bathrooms));
  placeBedroomsAndBaths(rooms, cursor, bedrooms, bathrooms, bedroomColW, cellH, depth);

  if (garage === "Detached") {
    rooms.push({
      type: "garage", label: "Detached Garage",
      x: width + 8, y: 0, w: 22, h: 22,
      bearing: [true, true, true, true],
    });
  }

  const doors = generateDoors(rooms, garage);
  const windows = rooms.flatMap((room) => generateWindowsForRoom(room, width, depth));
  const score = Math.round((0.7 + Math.random() * 0.25) * 100) / 100;

  return {
    id: `local-${Date.now()}`,
    width,
    depth,
    rooms,
    doors,
    windows,
    totalSF: rooms.reduce((s, r) => s + r.w * r.h, 0),
    score,
    stories,
    style,
  };
}

/* ── Upper floor generator (story 2+): bedroom/bath focused, no garage ── */
function generateUpperFloorPlan(params, refPlan) {
  const { bedrooms, bathrooms, style, stories } = params;
  const width  = refPlan?.width  || 44;
  const depth  = refPlan?.depth  || 50;

  const rooms = [];
  // Center hallway spine
  const hallW = Math.max(4, Math.round(width * 0.08));
  const hallX = Math.round(width / 2) - Math.round(hallW / 2);
  rooms.push({ type: "hallway", label: "Hall", x: hallX, y: 0, w: hallW, h: depth,
    bearing: [true, false, true, false] });

  // Left side: primary suite
  const leftW = hallX;
  const primaryH = Math.round(depth * 0.55);
  rooms.push({ type: "bedroom", label: "Primary Bedroom",
    x: 0, y: 0, w: leftW, h: primaryH, bearing: [true, false, false, true] });

  const enSuiteH = Math.round(depth * 0.22);
  const wicW = Math.round(leftW * 0.45);
  rooms.push({ type: "bathroom", label: "Primary Bath",
    x: 0, y: primaryH, w: leftW - wicW, h: enSuiteH, bearing: [false, false, false, true] });
  rooms.push({ type: "closet", label: "W.I.C.",
    x: leftW - wicW, y: primaryH, w: wicW, h: enSuiteH, bearing: [false, false, false, false] });
  const leftRemain = depth - primaryH - enSuiteH;
  if (leftRemain > 4) {
    rooms.push({ type: "laundry", label: "Laundry",
      x: 0, y: primaryH + enSuiteH, w: leftW, h: leftRemain, bearing: [false, false, true, true] });
  }

  // Right side: secondary bedrooms + shared bath
  const rightX = hallX + hallW;
  const rightW = width - rightX;
  const secBeds = Math.max(1, bedrooms - 1);
  const bedH = Math.round((depth * 0.65) / secBeds);
  for (let i = 0; i < secBeds; i++) {
    rooms.push({ type: "bedroom", label: `Bedroom ${i + 2}`,
      x: rightX, y: i * bedH, w: rightW, h: bedH,
      bearing: [i === 0, true, false, false] });
  }
  const usedH = secBeds * bedH;
  const sharedBathH = Math.round((depth - usedH) * 0.65);
  if (sharedBathH > 4) {
    rooms.push({ type: "bathroom", label: bathrooms >= 3 ? "Bath 2" : "Full Bath",
      x: rightX, y: usedH, w: rightW, h: sharedBathH, bearing: [false, true, false, false] });
  }
  const rightRemain = depth - usedH - sharedBathH;
  if (rightRemain > 4) {
    rooms.push({ type: "closet", label: "Linen",
      x: rightX, y: usedH + sharedBathH, w: rightW, h: rightRemain, bearing: [false, true, true, false] });
  }

  return {
    id: `upper-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    width, depth, rooms, doors: [],
    windows: rooms.flatMap((r) => generateWindowsForRoom(r, width, depth)),
    totalSF: rooms.reduce((s, r) => s + r.w * r.h, 0),
    score: Math.round((0.7 + Math.random() * 0.25) * 100) / 100,
    stories, style,
  };
}

/* ───────────────────── Canvas Renderer ─────────────────────── */

function renderFloorPlan(canvas, plan, hoveredRoom) {
  if (!canvas || !plan) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const cw = rect.width;
  const ch = rect.height;

  // Fit plan into canvas with padding
  const pad = 60;
  const planPxW = plan.width * PX_PER_FT;
  const planPxH = plan.depth * PX_PER_FT;
  const scaleX = (cw - pad * 2) / planPxW;
  const scaleY = (ch - pad * 2) / planPxH;
  const scale = Math.min(scaleX, scaleY, 3);
  const offX = (cw - planPxW * scale) / 2;
  const offY = (ch - planPxH * scale) / 2;

  const toCanvas = (ftX, ftY) => [offX + ftX * PX_PER_FT * scale, offY + ftY * PX_PER_FT * scale];
  const ftToPx = (ft) => ft * PX_PER_FT * scale;

  // Clear
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, cw, ch);

  // Grid
  ctx.strokeStyle = "rgba(42, 53, 72, 0.3)";
  ctx.lineWidth = 0.5;
  const gridStep = GRID_PX * scale;
  if (gridStep > 1.5) {
    for (let gx = offX; gx <= offX + planPxW * scale; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(gx, offY);
      ctx.lineTo(gx, offY + planPxH * scale);
      ctx.stroke();
    }
    for (let gy = offY; gy <= offY + planPxH * scale; gy += gridStep) {
      ctx.beginPath();
      ctx.moveTo(offX, gy);
      ctx.lineTo(offX + planPxW * scale, gy);
      ctx.stroke();
    }
  }

  // Major grid (every 5ft)
  ctx.strokeStyle = "rgba(42, 53, 72, 0.6)";
  ctx.lineWidth = 0.5;
  const majorStep = 5 * PX_PER_FT * scale;
  for (let gx = offX; gx <= offX + planPxW * scale; gx += majorStep) {
    ctx.beginPath();
    ctx.moveTo(gx, offY - 4);
    ctx.lineTo(gx, offY + planPxH * scale + 4);
    ctx.stroke();
  }
  for (let gy = offY; gy <= offY + planPxH * scale; gy += majorStep) {
    ctx.beginPath();
    ctx.moveTo(offX - 4, gy);
    ctx.lineTo(offX + planPxW * scale + 4, gy);
    ctx.stroke();
  }

  // Rooms
  plan.rooms.forEach((room, idx) => {
    const [rx, ry] = toCanvas(room.x, room.y);
    const rw = ftToPx(room.w);
    const rh = ftToPx(room.h);
    const col = ROOM_COLORS[room.type] || ROOM_COLORS.hallway;
    const isHovered = hoveredRoom === idx;

    // Fill
    ctx.fillStyle = isHovered
      ? col.fill.replace(/[\d.]+\)$/, "0.35)")
      : col.fill;
    ctx.fillRect(rx, ry, rw, rh);

    // Hover glow
    if (isHovered) {
      ctx.shadowColor = col.stroke;
      ctx.shadowBlur = 12;
    }

    // Border — differentiate bearing vs interior
    const wallWeight = (isBearing) => isBearing ? 2.5 : 1;
    const wallColor = (isBearing) => isBearing ? "#e8ecf4" : "#5a6580";
    const b = room.bearing || [false, false, false, false];

    // Top
    ctx.strokeStyle = wallColor(b[0]);
    ctx.lineWidth = wallWeight(b[0]);
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry); ctx.stroke();
    // Right
    ctx.strokeStyle = wallColor(b[1]);
    ctx.lineWidth = wallWeight(b[1]);
    ctx.beginPath(); ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + rh); ctx.stroke();
    // Bottom
    ctx.strokeStyle = wallColor(b[2]);
    ctx.lineWidth = wallWeight(b[2]);
    ctx.beginPath(); ctx.moveTo(rx, ry + rh); ctx.lineTo(rx + rw, ry + rh); ctx.stroke();
    // Left
    ctx.strokeStyle = wallColor(b[3]);
    ctx.lineWidth = wallWeight(b[3]);
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + rh); ctx.stroke();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Room label
    const area = room.w * room.h;
    const labelSize = Math.max(8, Math.min(13, rw / 8));
    ctx.fillStyle = col.stroke;
    ctx.font = `600 ${labelSize}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(room.label, rx + rw / 2, ry + rh / 2 - labelSize * 0.6);

    // Area measurement
    ctx.fillStyle = "rgba(200, 208, 224, 0.55)";
    ctx.font = `${Math.max(7, labelSize - 2)}px 'JetBrains Mono', monospace`;
    ctx.fillText(`${area} sf`, rx + rw / 2, ry + rh / 2 + labelSize * 0.5);

    // Room dimensions along bottom-right edges (subtle)
    ctx.fillStyle = "rgba(200, 208, 224, 0.3)";
    ctx.font = `${Math.max(6, labelSize - 3)}px 'JetBrains Mono', monospace`;
    ctx.textAlign = "center";
    ctx.fillText(`${room.w}'`, rx + rw / 2, ry + rh - 4);
    ctx.save();
    ctx.translate(rx + rw - 4, ry + rh / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${room.h}'`, 0, 0);
    ctx.restore();
  });

  // Doors
  (plan.doors || []).forEach((door) => {
    const [dx, dy] = toCanvas(door.x, door.y);
    const dw = ftToPx(door.width);
    const arcR = dw * 0.8;
    ctx.strokeStyle = door.isExterior ? "#e8ecf4" : colors.textDim;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);

    ctx.beginPath();
    if (door.side === "top" || door.side === "bottom") {
      const dir = door.side === "top" ? 1 : -1;
      ctx.arc(dx - dw / 2, dy, arcR, 0, Math.PI * 0.5 * dir, dir < 0);
    } else {
      const dir = door.side === "right" ? -1 : 1;
      ctx.arc(dx, dy - dw / 2, arcR, Math.PI / 2, Math.PI / 2 + Math.PI * 0.5 * dir, dir < 0);
    }
    ctx.stroke();

    // Door opening gap
    ctx.strokeStyle = "#0d1117";
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (door.side === "top" || door.side === "bottom") {
      ctx.moveTo(dx - dw / 2, dy);
      ctx.lineTo(dx + dw / 2, dy);
    } else {
      ctx.moveTo(dx, dy - dw / 2);
      ctx.lineTo(dx, dy + dw / 2);
    }
    ctx.stroke();
  });

  // Windows
  (plan.windows || []).forEach((win) => {
    const [wx, wy] = toCanvas(win.x, win.y);
    const ww = ftToPx(win.width);

    ctx.strokeStyle = colors.glass;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    if (win.side === "top" || win.side === "bottom") {
      // Double line
      const off = 2;
      ctx.beginPath(); ctx.moveTo(wx - ww / 2, wy - off); ctx.lineTo(wx + ww / 2, wy - off); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx - ww / 2, wy + off); ctx.lineTo(wx + ww / 2, wy + off); ctx.stroke();
      // Center divider
      ctx.beginPath(); ctx.moveTo(wx, wy - off); ctx.lineTo(wx, wy + off); ctx.stroke();
    } else {
      const off = 2;
      ctx.beginPath(); ctx.moveTo(wx - off, wy - ww / 2); ctx.lineTo(wx - off, wy + ww / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx + off, wy - ww / 2); ctx.lineTo(wx + off, wy + ww / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(wx - off, wy); ctx.lineTo(wx + off, wy); ctx.stroke();
    }
  });

  // Exterior dimension annotations
  ctx.setLineDash([]);
  const dimOff = 18;

  // Top dimension
  drawDimension(ctx, offX, offY - dimOff, offX + planPxW * scale, offY - dimOff, `${plan.width}'`);
  // Left dimension
  drawDimension(ctx, offX - dimOff, offY, offX - dimOff, offY + planPxH * scale, `${plan.depth}'`, { horizontal: false });

  // Per-room top dimensions
  const topRooms = plan.rooms
    .filter((r) => r.y === 0)
    .sort((a, b) => a.x - b.x);
  topRooms.forEach((room) => {
    const [rx] = toCanvas(room.x, 0);
    const rw = ftToPx(room.w);
    if (rw > 30) {
      drawDimension(ctx, rx, offY - dimOff * 2.2, rx + rw, offY - dimOff * 2.2, `${room.w}'`, { minor: true });
    }
  });

  // Compass rose
  drawCompass(ctx, cw - 40, ch - 40);
}

function drawDimension(ctx, x1, y1, x2, y2, label, { horizontal = true, minor = false } = {}) {
  const len = horizontal ? x2 - x1 : y2 - y1;
  if (len < 20) return;

  ctx.strokeStyle = minor ? "rgba(200, 208, 224, 0.25)" : "rgba(200, 208, 224, 0.45)";
  ctx.lineWidth = minor ? 0.5 : 0.75;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Tick marks
  const tick = 4;
  ctx.beginPath();
  if (horizontal) {
    ctx.moveTo(x1, y1 - tick); ctx.lineTo(x1, y1 + tick);
    ctx.moveTo(x2, y2 - tick); ctx.lineTo(x2, y2 + tick);
  } else {
    ctx.moveTo(x1 - tick, y1); ctx.lineTo(x1 + tick, y1);
    ctx.moveTo(x2 - tick, y2); ctx.lineTo(x2 + tick, y2);
  }
  ctx.stroke();

  // Label
  ctx.fillStyle = minor ? "rgba(200, 208, 224, 0.4)" : "rgba(200, 208, 224, 0.65)";
  ctx.font = `${minor ? 8 : 10}px 'JetBrains Mono', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (horizontal) {
    ctx.fillText(label, (x1 + x2) / 2, y1 - 8);
  } else {
    ctx.save();
    ctx.translate(x1 - 8, (y1 + y2) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }
}

function drawCompass(ctx, cx, cy) {
  const r = 14;
  ctx.strokeStyle = "rgba(200, 208, 224, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // N arrow
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 2);
  ctx.lineTo(cx - 3, cy - 2);
  ctx.lineTo(cx + 3, cy - 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(200, 208, 224, 0.5)";
  ctx.font = "bold 7px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", cx, cy + 4);
}

/* ───────────────────── Component ───────────────────────────── */

export default function FloorPlanEditor() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const project = useProject();
  const [editorMode, setEditorMode] = useState("generate"); // "generate" | "draw"
  const [params, setParams] = useState(() => project.generateParams ?? { ...DEFAULT_PARAMS });

  // allStoryVariants[storyIndex] = array of variant plans for that story
  const [allStoryVariants, setAllStoryVariants] = useState(() => {
    if (project.storyPlans.length > 0) return project.storyPlans.map((p) => [p]);
    if (project.allVariants.length > 0) return [project.allVariants];
    return [[]];
  });
  const [activeStory, setActiveStory] = useState(0);
  const [activeVariantPerStory, setActiveVariantPerStory] = useState([0]);

  const [loading, setLoading] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [error, setError] = useState(null);

  // Derived — always read from currently-active story
  const variants = allStoryVariants[activeStory] || [];
  const activeVariant = activeVariantPerStory[activeStory] ?? 0;
  const activePlan = variants[activeVariant] || null;
  const numStories = params.stories || 1;

  /* Sync active plan to shared project state */
  useEffect(() => {
    if (activePlan) {
      project.setFloorPlan(activePlan);
      project.setGenerateParams(params);
    }
  }, [activePlan]);

  /* ── Canvas resize + render ── */
  const render = useCallback(() => {
    renderFloorPlan(canvasRef.current, activePlan, hoveredRoom);
  }, [activePlan, hoveredRoom]);

  useEffect(() => {
    render();
    const obs = new ResizeObserver(render);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [render]);

  /* ── Mouse hit-test for room hover ── */
  const handleCanvasMove = useCallback(
    (e) => {
      if (!activePlan || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const cw = rect.width;
      const ch = rect.height;
      const planPxW = activePlan.width * PX_PER_FT;
      const planPxH = activePlan.depth * PX_PER_FT;
      const scaleX = (cw - 120) / planPxW;
      const scaleY = (ch - 120) / planPxH;
      const scale = Math.min(scaleX, scaleY, 3);
      const offX = (cw - planPxW * scale) / 2;
      const offY = (ch - planPxH * scale) / 2;

      let hit = null;
      activePlan.rooms.forEach((room, idx) => {
        const rx = offX + room.x * PX_PER_FT * scale;
        const ry = offY + room.y * PX_PER_FT * scale;
        const rw = room.w * PX_PER_FT * scale;
        const rh = room.h * PX_PER_FT * scale;
        if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) {
          hit = idx;
        }
      });
      setHoveredRoom(hit);
    },
    [activePlan]
  );

  /* ── Generate handler — one set of variants per story ── */
  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    const storiesToGen = params.stories || 1;
    const newAllStoryVariants = [];
    let usedFallback = false;

    for (let si = 0; si < storiesToGen; si++) {
      const isUpper = si > 0;
      const storyParams = isUpper ? { ...params, garage: "None" } : params;

      try {
        const result = await floorplanApi.generate(storyParams);
        const raw = Array.isArray(result) ? result : result.variants || [result];
        let plans = raw.map((v) => normalizeVariant(v, storyParams));
        // For upper floors, replace garage rooms with upper-floor layout if API didn't handle it
        if (isUpper) {
          const refPlan = newAllStoryVariants[0]?.[0];
          plans = plans.map((p) => {
            const hasGarage = p.rooms.some((r) => r.type === "garage");
            return hasGarage ? generateUpperFloorPlan(storyParams, refPlan) : p;
          });
        }
        newAllStoryVariants.push(plans);
      } catch (err) {
        console.error(`[FloorPlanEditor] generate story ${si + 1} failed:`, err);
        usedFallback = true;
        const refPlan = newAllStoryVariants[0]?.[0];
        if (isUpper) {
          newAllStoryVariants.push([
            generateUpperFloorPlan(storyParams, refPlan),
            generateUpperFloorPlan({ ...storyParams, bedrooms: Math.max(1, params.bedrooms - 1) }, refPlan),
            generateUpperFloorPlan(storyParams, refPlan),
          ]);
        } else {
          newAllStoryVariants.push([
            generateLocalFloorPlan(params),
            generateLocalFloorPlan({ ...params, openFloorPlan: !params.openFloorPlan }),
            generateLocalFloorPlan({ ...params, targetSF: Math.round(params.targetSF * 0.9), openFloorPlan: !params.openFloorPlan }),
          ]);
        }
      }
    }

    setAllStoryVariants(newAllStoryVariants);
    setActiveVariantPerStory(newAllStoryVariants.map(() => 0));
    setActiveStory(0);
    if (usedFallback) setError("API unavailable — using local generation");
    setLoading(false);
  };

  /* ── Import handler (stub) ── */
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.dxf,.svg";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const plan = Array.isArray(data) ? data : [data];
        setAllStoryVariants([plan]);
        setActiveVariantPerStory([0]);
        setActiveStory(0);
      } catch {
        setError("Could not parse floor plan file");
      }
    };
    input.click();
  };

  /* ── Save all generated stories & go to Edit ── */
  const handleSaveToEdit = () => {
    // Collect one selected plan per story
    const storyPlans = allStoryVariants.map((svs, si) => svs[activeVariantPerStory[si] ?? 0]).filter(Boolean);
    project.setStoryPlans(storyPlans);
    project.setAllVariants(storyPlans, params);
    project.setMaxStep(Math.max(project.maxStep, 1));
    navigate("/edit");
  };

  /* ── Save drawn plan & go to Edit ── */
  const handleDrawSave = (plans) => {
    const arr = [plans].flat().filter(Boolean);
    if (arr.length === 0) return;
    project.setStoryPlans(arr);       // persists all stories
    project.setAllVariants(arr, params);
    project.setMaxStep(Math.max(project.maxStep, 1));
    navigate("/edit");
  };

  /* ── Param updater ── */
  const setP = (key) => (e) => {
    let val = e.target.value;
    if (e.target.type === "checkbox") {
      val = e.target.checked;
    } else if (e.target.type === "range") {
      val = Number(e.target.value);
    }
    setParams((p) => ({ ...p, [key]: val }));
  };

  /* ── Styles ── */
  const s = {
    wrapper: {
      display: "flex",
      height: "100%",
      width: "100%",
      background: colors.bg,
      fontFamily: fonts.label,
      color: colors.text,
      overflow: "hidden",
    },
    canvasPane: {
      flex: "1 1 70%",
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
    },
    canvasContainer: {
      flex: 1,
      position: "relative",
      overflow: "hidden",
    },
    canvas: {
      width: "100%",
      height: "100%",
      display: "block",
      cursor: hoveredRoom === null ? "crosshair" : "pointer",
    },
    variantBar: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 16px",
      background: colors.surface,
      borderTop: `1px solid ${colors.cardBorder}`,
    },
    variantTab: (active) => ({
      padding: "6px 16px",
      borderRadius: radii.md,
      border: `1px solid ${active ? colors.accent : colors.cardBorder}`,
      background: active ? "rgba(0, 212, 255, 0.1)" : "transparent",
      color: active ? colors.accent : colors.textDim,
      cursor: "pointer",
      fontFamily: fonts.data,
      fontSize: "12px",
      fontWeight: active ? 600 : 400,
      transition: "all 0.15s ease",
    }),
    panel: {
      flex: "0 0 320px",
      background: colors.panel,
      borderLeft: `1px solid ${colors.panelBorder}`,
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      overflowX: "hidden",
    },
    panelHeader: {
      padding: "20px 20px 12px",
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "1.5px",
      textTransform: "uppercase",
      color: colors.accent,
      fontFamily: fonts.data,
    },
    section: {
      padding: "0 20px 16px",
    },
    fieldLabel: {
      display: "block",
      fontSize: "11px",
      color: colors.textDim,
      marginBottom: "6px",
      fontWeight: 500,
    },
    slider: {
      width: "100%",
      appearance: "none",
      WebkitAppearance: "none",
      height: "4px",
      borderRadius: "2px",
      background: colors.cardBorder,
      outline: "none",
      cursor: "pointer",
      accentColor: colors.accent,
    },
    sliderValue: {
      fontFamily: fonts.data,
      fontSize: "13px",
      color: colors.textBright,
      fontWeight: 600,
      float: "right",
    },
    selectorRow: {
      display: "flex",
      gap: "4px",
      flexWrap: "wrap",
    },
    selectorBtn: (active) => ({
      padding: "5px 10px",
      borderRadius: radii.sm,
      border: `1px solid ${active ? colors.accent : colors.cardBorder}`,
      background: active ? "rgba(0, 212, 255, 0.12)" : "transparent",
      color: active ? colors.accent : colors.textDim,
      cursor: "pointer",
      fontFamily: fonts.data,
      fontSize: "12px",
      fontWeight: active ? 600 : 400,
      transition: "all 0.15s ease",
    }),
    select: {
      width: "100%",
      padding: "8px 10px",
      borderRadius: radii.md,
      border: `1px solid ${colors.cardBorder}`,
      background: colors.cardSurface,
      color: colors.text,
      fontFamily: fonts.label,
      fontSize: "13px",
      outline: "none",
      cursor: "pointer",
      appearance: "none",
      WebkitAppearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235a6580'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 10px center",
    },
    toggle: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      cursor: "pointer",
    },
    toggleTrack: (on) => ({
      width: "36px",
      height: "20px",
      borderRadius: "10px",
      background: on ? colors.accent : colors.cardBorder,
      position: "relative",
      transition: "background 0.2s ease",
      flexShrink: 0,
    }),
    toggleThumb: (on) => ({
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      background: "#fff",
      position: "absolute",
      top: "2px",
      left: on ? "18px" : "2px",
      transition: "left 0.2s ease",
    }),
    btnPrimary: {
      width: "100%",
      padding: "12px",
      borderRadius: radii.md,
      border: "none",
      background: `linear-gradient(135deg, ${colors.accent}, #0099cc)`,
      color: "#fff",
      fontFamily: fonts.label,
      fontSize: "14px",
      fontWeight: 700,
      cursor: loading ? "wait" : "pointer",
      letterSpacing: "0.5px",
      transition: "all 0.2s ease",
      opacity: loading ? 0.6 : 1,
      boxShadow: "0 2px 12px rgba(0, 212, 255, 0.25)",
    },
    btnSecondary: {
      width: "100%",
      padding: "10px",
      borderRadius: radii.md,
      border: `1px solid ${colors.cardBorder}`,
      background: "transparent",
      color: colors.text,
      fontFamily: fonts.label,
      fontSize: "13px",
      fontWeight: 500,
      cursor: "pointer",
      marginTop: "8px",
      transition: "all 0.2s ease",
    },
    scoreChip: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 10px",
      borderRadius: radii.sm,
      background: "rgba(46, 213, 115, 0.1)",
      border: "1px solid rgba(46, 213, 115, 0.25)",
      fontFamily: fonts.data,
      fontSize: "12px",
      color: colors.success,
      marginLeft: "auto",
    },
    errorBanner: {
      padding: "8px 16px",
      background: "rgba(255, 159, 67, 0.1)",
      borderBottom: `1px solid rgba(255, 159, 67, 0.25)`,
      color: colors.warn,
      fontSize: "12px",
      fontFamily: fonts.data,
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    emptyState: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      gap: "12px",
      color: colors.textDim,
    },
    emptyIcon: {
      fontSize: "48px",
      opacity: 0.15,
      lineHeight: 1,
    },
    fieldGroup: {
      marginBottom: "14px",
    },
    divider: {
      height: "1px",
      background: colors.panelBorder,
      margin: "4px 20px 16px",
    },
    summaryRow: {
      display: "flex",
      justifyContent: "space-between",
      padding: "4px 0",
      fontSize: "12px",
    },
    summaryLabel: {
      color: colors.textDim,
    },
    summaryVal: {
      fontFamily: fonts.data,
      color: colors.textBright,
      fontWeight: 600,
    },
  };

  /* ── Render ── */
  return (
    <div style={s.wrapper}>
      {/* ────── LEFT: Canvas ────── */}
      <div style={s.canvasPane}>

        {/* Mode toggle bar */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 12px",
          background: colors.surface, borderBottom: `1px solid ${colors.cardBorder}`, flexShrink: 0 }}>
          {[
            { key: "generate", label: "AI Generate" },
            { key: "draw",     label: "Draw" },
          ].map((m) => (
            <button key={m.key} onClick={() => setEditorMode(m.key)} style={{
              padding: "5px 16px", borderRadius: radii.md,
              border: `1px solid ${editorMode === m.key ? colors.accent : colors.cardBorder}`,
              background: editorMode === m.key ? "rgba(0,212,255,0.1)" : "transparent",
              color: editorMode === m.key ? colors.accent : colors.textDim,
              fontFamily: fonts.label, fontSize: "12px", fontWeight: editorMode === m.key ? 700 : 400,
              cursor: "pointer", transition: "all 0.15s",
            }}>{m.label}</button>
          ))}
        </div>

        {/* Draw mode — full canvas */}
        {editorMode === "draw" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <FloorPlanDraw onSave={handleDrawSave} />
          </div>
        )}

        {editorMode === "generate" && error && (
          <div style={s.errorBanner}>
            <span style={{ fontSize: "14px" }}>&#9888;</span>
            {error}
          </div>
        )}

        {editorMode === "generate" && (
          <div ref={containerRef} style={s.canvasContainer}>
            <canvas
              ref={canvasRef}
              style={{ ...s.canvas, background: colors.bg }}
              onMouseMove={handleCanvasMove}
              onMouseLeave={() => setHoveredRoom(null)}
            />
            {!activePlan && (
              <div style={{ ...s.emptyState, position: "absolute", inset: 0 }}>
                <div style={s.emptyIcon}>&#9633;</div>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>
                  No floor plan generated yet
                </div>
                <div style={{ fontSize: "12px", maxWidth: "280px", textAlign: "center", lineHeight: 1.5 }}>
                  Configure parameters in the right panel and click Generate to create a floor plan.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Story tabs — show when more than 1 story has been generated */}
        {editorMode === "generate" && allStoryVariants.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 12px",
            background: colors.bg, borderTop: `1px solid ${colors.cardBorder}`, flexShrink: 0 }}>
            <span style={{ fontSize: "10px", color: colors.textDim, fontFamily: fonts.data,
              textTransform: "uppercase", letterSpacing: "1px", marginRight: "4px" }}>Floor</span>
            {allStoryVariants.map((svs, si) => (
              <button
                key={si}
                onClick={() => setActiveStory(si)}
                style={{
                  padding: "4px 14px",
                  borderRadius: radii.md,
                  border: `1px solid ${activeStory === si ? colors.accent : colors.cardBorder}`,
                  background: activeStory === si ? "rgba(0,212,255,0.12)" : "transparent",
                  color: activeStory === si ? colors.accent : colors.textDim,
                  fontFamily: fonts.data,
                  fontSize: "12px",
                  fontWeight: activeStory === si ? 700 : 400,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {si === 0 ? "Ground" : si === 1 ? "2nd Floor" : si === 2 ? "3rd Floor" : `Floor ${si + 1}`}
                {svs.length > 0 && (
                  <span style={{ marginLeft: "5px", fontSize: "9px", opacity: 0.7 }}>
                    {svs.length}v
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Variant tabs */}
        {editorMode === "generate" && variants.length > 0 && (
          <div style={s.variantBar}>
            {variants.map((v, i) => (
              <button
                key={v.id || `v${i}`}
                style={s.variantTab(i === activeVariant)}
                onClick={() => setActiveVariantPerStory((prev) => {
                  const copy = [...prev];
                  while (copy.length <= activeStory) copy.push(0);
                  copy[activeStory] = i;
                  return copy;
                })}
              >
                V{i + 1}
              </button>
            ))}
            {activePlan && (
              <div style={s.scoreChip}>
                Score: {activePlan.score}
              </div>
            )}
            {activePlan && (
              <span style={{ marginLeft: "8px", fontFamily: fonts.data, fontSize: "11px", color: colors.textDim }}>
                {activePlan.totalSF} sf &middot; {activePlan.rooms.length} rooms &middot; {activePlan.style}
              </span>
            )}
            {activePlan && (
              <button
                onClick={handleSaveToEdit}
                style={{
                  marginLeft: "auto", padding: "6px 16px", borderRadius: radii.md,
                  border: "none", background: `linear-gradient(135deg, ${colors.accent}, #0099cc)`,
                  color: "#fff", fontFamily: fonts.label, fontSize: "12px", fontWeight: 700,
                  cursor: "pointer", letterSpacing: "0.3px",
                  boxShadow: "0 1px 8px rgba(0,212,255,0.3)", whiteSpace: "nowrap",
                }}
              >
                Save {allStoryVariants.length > 1 ? `${allStoryVariants.length} Floors` : "Floor Plan"} →
              </button>
            )}
          </div>
        )}
      </div>

      {/* ────── RIGHT: Parameter Panel (generate mode only) ────── */}
      {editorMode === "generate" && <div style={s.panel}>
        <div style={s.panelHeader}>Generate</div>

        <div style={s.section}>
          {/* Target SF */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>
              Target Square Footage{" "}
              <span style={s.sliderValue}>{params.targetSF.toLocaleString()} sf</span>
            </label>
            <input
              type="range"
              min={800}
              max={5000}
              step={50}
              value={params.targetSF}
              onChange={setP("targetSF")}
              style={s.slider}
            />
          </div>

          {/* Bedrooms */}
          <fieldset style={{ ...s.fieldGroup, border: "none", margin: 0, padding: 0 }}>
            <legend style={s.fieldLabel}>Bedrooms</legend>
            <div style={s.selectorRow}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  style={s.selectorBtn(params.bedrooms === n)}
                  onClick={() => setParams((p) => ({ ...p, bedrooms: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Bathrooms */}
          <fieldset style={{ ...s.fieldGroup, border: "none", margin: 0, padding: 0 }}>
            <legend style={s.fieldLabel}>Bathrooms</legend>
            <div style={s.selectorRow}>
              {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((n) => (
                <button
                  key={n}
                  style={s.selectorBtn(params.bathrooms === n)}
                  onClick={() => setParams((p) => ({ ...p, bathrooms: n }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Stories */}
          <fieldset style={{ ...s.fieldGroup, border: "none", margin: 0, padding: 0 }}>
            <legend style={s.fieldLabel}>Stories</legend>
            <div style={s.selectorRow}>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  style={s.selectorBtn(params.stories === n)}
                  onClick={() => {
                    setParams((p) => ({ ...p, stories: n }));
                    // Ensure allStoryVariants has a slot for each story
                    setAllStoryVariants((prev) => {
                      if (prev.length >= n) return prev;
                      const copy = [...prev];
                      while (copy.length < n) copy.push([]);
                      return copy;
                    });
                    // Jump to the newly selected story (0-indexed)
                    setActiveStory(n - 1);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          <div style={s.divider} />

          {/* Lot Width */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>
              Lot Width{" "}
              <span style={s.sliderValue}>{params.lotWidth} ft</span>
            </label>
            <input
              type="range"
              min={30}
              max={200}
              step={5}
              value={params.lotWidth}
              onChange={setP("lotWidth")}
              style={s.slider}
            />
          </div>

          {/* Lot Depth */}
          <div style={s.fieldGroup}>
            <label style={s.fieldLabel}>
              Lot Depth{" "}
              <span style={s.sliderValue}>{params.lotDepth} ft</span>
            </label>
            <input
              type="range"
              min={50}
              max={300}
              step={5}
              value={params.lotDepth}
              onChange={setP("lotDepth")}
              style={s.slider}
            />
          </div>

          <div style={s.divider} />

          {/* Style */}
          <div style={s.fieldGroup}>
            <label htmlFor="fp-style" style={s.fieldLabel}>Style</label>
            <select id="fp-style" value={params.style} onChange={setP("style")} style={s.select}>
              {STYLE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Garage */}
          <div style={s.fieldGroup}>
            <label htmlFor="fp-garage" style={s.fieldLabel}>Garage</label>
            <select id="fp-garage" value={params.garage} onChange={setP("garage")} style={s.select}>
              {GARAGE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          {/* Open Floor Plan */}
          <div style={s.fieldGroup}>
            <button
              type="button"
              role="switch"
              aria-checked={params.openFloorPlan}
              style={{ ...s.toggle, background: "none", border: "none", padding: 0, width: "100%" }}
              onClick={() => setParams((p) => ({ ...p, openFloorPlan: !p.openFloorPlan }))}
            >
              <span style={{ fontSize: "12px", color: colors.text }}>Open Floor Plan</span>
              <div style={s.toggleTrack(params.openFloorPlan)}>
                <div style={s.toggleThumb(params.openFloorPlan)} />
              </div>
            </button>
          </div>

          <div style={{ height: "8px" }} />

          {/* Buttons */}
          <button
            style={s.btnPrimary}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate Floor Plan"}
          </button>
          <button style={s.btnSecondary} onClick={handleImport}>
            Import Floor Plan
          </button>
        </div>

        {/* Variant summary */}
        {activePlan && (
          <>
            <div style={s.divider} />
            <div style={s.panelHeader}>Variant Summary</div>
            <div style={{ ...s.section, paddingBottom: "24px" }}>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Total Area</span>
                <span style={s.summaryVal}>{activePlan.totalSF.toLocaleString()} sf</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Building</span>
                <span style={s.summaryVal}>
                  {activePlan.width}' x {activePlan.depth}'
                </span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Rooms</span>
                <span style={s.summaryVal}>{activePlan.rooms.length}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Stories</span>
                <span style={s.summaryVal}>{activePlan.stories}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Style</span>
                <span style={s.summaryVal}>{activePlan.style}</span>
              </div>
              <div style={s.summaryRow}>
                <span style={s.summaryLabel}>Layout Score</span>
                <span style={{ ...s.summaryVal, color: colors.success }}>
                  {activePlan.score}
                </span>
              </div>

              <div style={{ marginTop: "12px" }}>
                <span style={{ ...s.fieldLabel, marginBottom: "8px" }}>Room Breakdown</span>
                {activePlan.rooms
                  .filter((r) => r.type !== "hallway" && r.type !== "closet" && r.type !== "entry")
                  .map((room) => {
                    const col = ROOM_COLORS[room.type] || ROOM_COLORS.hallway;
                    return (
                      <div
                        key={`${room.type}-${room.label}-${room.x}-${room.y}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "3px 0",
                          fontSize: "12px",
                        }}
                      >
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "2px",
                            background: col.stroke,
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, color: colors.text }}>{room.label}</span>
                        <span style={{ fontFamily: fonts.data, color: colors.textDim }}>
                          {room.w * room.h} sf
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}
      </div>}
    </div>
  );
}
