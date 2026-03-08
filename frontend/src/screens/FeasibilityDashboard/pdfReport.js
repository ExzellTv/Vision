/**
 * Vision — Feasibility PDF Report Generator
 *
 * Generates a multi-section investment analysis PDF using jsPDF + autoTable.
 * No server dependency — runs entirely in the browser.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BUILD_COST_PSF } from "./valuationEngine";

// ── Design constants ──────────────────────────────────────────────────────
const C = {
  bg:          [13,  17, 23],     // #0d1117
  panel:       [26,  34, 51],     // #1a2233
  border:      [42,  53, 72],     // #2a3548
  accent:      [0,  212, 255],    // #00d4ff
  success:     [46, 213, 115],    // #2ed573
  warn:        [255, 159, 67],    // #ff9f43
  danger:      [255, 71,  87],    // #ff4757
  secondary:   [59,  130, 246],   // #3b82f6
  textBright:  [232, 236, 244],   // #e8ecf4
  text:        [200, 208, 224],   // #c8d0e0
  textDim:     [90,  101, 128],   // #5a6580
  white:       [255, 255, 255],
  purple:      [139, 92,  246],
};

const DISCLAIMER =
  "Vision provides pre-feasibility estimates for early-stage planning purposes only. " +
  "Cost projections and financial forecasts are advisory and do not constitute licensed engineering " +
  "analysis, professional design services, or investment advice. All structural design must be " +
  "reviewed and stamped by a licensed Professional Engineer (PE) before construction. " +
  "This report is not a substitute for a full appraisal or market study conducted by a licensed professional.";

// ── Helpers ───────────────────────────────────────────────────────────────
const usd  = (n) => "$" + Math.round(n).toLocaleString("en-US");
const pct  = (n) => n.toFixed(1) + "%";
const num  = (n) => Math.round(n).toLocaleString("en-US");

function levelColor(level) {
  if (level === "High")  return C.success;
  if (level === "Med")   return C.warn;
  return C.danger;
}
function riskColor(level) {
  if (level === "Low")  return C.secondary;
  if (level === "Med")  return C.warn;
  return C.danger;
}
function scoreColor(score) {
  if (score >= 70) return C.success;
  if (score >= 45) return C.warn;
  return C.danger;
}
function marginColor(margin) {
  if (margin > 15) return C.success;
  if (margin > 5)  return C.warn;
  return C.danger;
}

// ── Section heading helper ────────────────────────────────────────────────
function sectionHeading(doc, y, title, subtitle = "") {
  doc.setFillColor(...C.panel);
  doc.rect(14, y, 182, 8, "F");
  doc.setFillColor(...C.accent);
  doc.rect(14, y, 3, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...C.accent);
  doc.text(title.toUpperCase(), 20, y + 5.5);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...C.textDim);
    doc.text(subtitle, 20 + doc.getTextWidth(title.toUpperCase()) + 6, y + 5.5);
  }
  return y + 12;
}

// ── Metric cell helper (label + big value row) ────────────────────────────
function metricRow(doc, x, y, w, label, value, valueColor, subLabel = "") {
  doc.setFillColor(...C.panel);
  doc.setDrawColor(...C.border);
  doc.roundedRect(x, y, w, 20, 2, 2, "FD");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.textDim);
  doc.text(label.toUpperCase(), x + 5, y + 6);

  doc.setFont("courier", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...(valueColor || C.textBright));
  doc.text(value, x + 5, y + 15);

  if (subLabel) {
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.textDim);
    const vw = doc.getTextWidth(value);
    doc.text(subLabel, x + 5 + vw + 2, y + 15);
  }
}

// ── Progress bar helper ───────────────────────────────────────────────────
function progressBar(doc, x, y, w, h, fillPct, fillColor) {
  doc.setFillColor(...C.border);
  doc.roundedRect(x, y, w, h, 1, 1, "F");
  doc.setFillColor(...fillColor);
  doc.roundedRect(x, y, Math.max(w * fillPct, 2), h, 1, 1, "F");
}

// ── Page header / footer ──────────────────────────────────────────────────
function addPageHeader(doc, projectName, pageNum, totalPages) {
  // Fill entire page with dark bg first — prevents any white showing through
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, 210, 297, "F");

  // Dark header bar (same color, re-affirmed for clarity)
  doc.setFillColor(...C.bg);
  doc.rect(0, 0, 210, 18, "F");

  // Accent line
  doc.setFillColor(...C.accent);
  doc.rect(0, 18, 210, 0.5, "F");

  // "VISION" brand
  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...C.accent);
  doc.text("VISION", 14, 12);

  // Subtitle
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.textDim);
  doc.text("AI-Powered Land Feasibility Intelligence", 38, 12);

  // Project name (right-aligned)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...C.textBright);
  const pnW = doc.getTextWidth(projectName);
  doc.text(projectName, 196 - pnW, 12);

  // Footer
  doc.setFillColor(...C.bg);
  doc.rect(0, 284, 210, 14, "F");
  doc.setFillColor(...C.border);
  doc.rect(14, 284, 182, 0.3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textDim);
  doc.text(`Page ${pageNum} of ${totalPages}`, 14, 292);
  doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), 196 - doc.getTextWidth(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })), 292);
}

// ── Main export ───────────────────────────────────────────────────────────
export function generateFeasibilityPDF({
  projectName,
  loc,
  selLand,
  valuation,
  nearbyComps,
  totalSF,
  stories,
  bedrooms,
  bathrooms,
  style,
  importedModel,
  marketStats,
  // fallback DEMO values used when valuation is null
  demoScore,
  demoCostPSF,
  demoMargin,
  demoARV,
  demoTotalCost,
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  // ── Patch addPage so every page (incl. autoTable overflow pages) is dark ──
  const _origAddPage = doc.addPage.bind(doc);
  doc.addPage = function (...args) {
    _origAddPage(...args);
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, 210, 297, "F");
    return doc;
  };

  const W = 210;

  // --- resolve all display values (live or DEMO) ---
  const score     = valuation ? valuation.feasScore                              : (demoScore   ?? 82);
  const costPSF   = valuation ? Math.round(valuation.totalInvestment / totalSF)  : (demoCostPSF ?? 185);
  const totalCost = valuation ? Math.round(valuation.totalInvestment)            : (demoTotalCost ?? Math.round(BUILD_COST_PSF * totalSF));
  const arv       = valuation ? Math.round(valuation.blended)                    : (demoARV     ?? Math.round(totalCost / (1 - (demoMargin ?? 28.4) / 100)));
  const margin    = valuation ? parseFloat(valuation.margin.toFixed(1))          : (demoMargin  ?? 28.4);
  const roi       = valuation ? parseFloat(valuation.roi.toFixed(1))             : 0;
  const grossProfit = arv - totalCost;
  const landPrice = selLand?.price || valuation?.landPrice || 0;
  const buildCost = valuation ? valuation.buildCost : Math.round(BUILD_COST_PSF * totalSF);
  const lotSf     = selLand?.lot_sf || valuation?.lotSf || 0;
  const isLive    = !!valuation;

  const totalPages = isLive ? 4 : 2;

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 1 — EXECUTIVE SUMMARY
  // ══════════════════════════════════════════════════════════════════════
  addPageHeader(doc, projectName, 1, totalPages);
  let y = 24;

  // Report title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...C.textBright);
  doc.text("FEASIBILITY ANALYSIS REPORT", 14, y + 8);
  // Accent underline beneath title
  doc.setFillColor(...C.accent);
  doc.rect(14, y + 10, 182, 0.4, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...C.textDim);
  {
    const subtitle = isLive
      ? `Live valuation · ${nearbyComps.length} comparable sales · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : `Demo mode · No location pinned · ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    doc.text(subtitle, 14, y + 14);
  }
  y += 20;

  // ── Property info row ──
  y = sectionHeading(doc, y, "Subject Property", isLive ? "Live data" : "Demo fixture");

  const propFields = [
    ["Project",    projectName],
    ["Location",   loc ? `${loc.lat.toFixed(4)}° N, ${Math.abs(loc.lng).toFixed(4)}° W`  : "Dallas, TX (demo)"],
    ["Floor Area", `${totalSF.toLocaleString()} SF`],
    ["Stories",    String(stories)],
    ["Beds / Baths", `${bedrooms} bd / ${bathrooms} ba`],
    ["Style",      style || "Traditional"],
    ["Land Parcel", selLand ? selLand.address : "Not selected"],
    ["Lot Size",   lotSf > 0 ? `${num(lotSf)} SF` : "N/A"],
    ["Zoning",     selLand?.zoning || "N/A"],
    ["Topography", selLand?.topography || "N/A"],
    ["Utilities",  selLand?.utilities || "N/A"],
    ["List Price", selLand ? usd(selLand.price) : "N/A"],
  ];

  // Panel behind property grid
  const propGridH = Math.ceil(propFields.length / 2) * 8 + 8;
  doc.setFillColor(...C.panel);
  doc.setDrawColor(...C.border);
  doc.roundedRect(14, y - 2, 182, propGridH, 2, 2, "FD");

  // Two-column label/value grid
  propFields.forEach(([lbl, val], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx  = 18 + col * 91;
    const cy  = y + row * 8 + 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...C.textDim);
    doc.text(lbl + ":", cx, cy);
    doc.setFont("courier", "bold");
    doc.setTextColor(...C.textBright);
    doc.text(val, cx + 30, cy);
  });
  y += Math.ceil(propFields.length / 2) * 8 + 6;

  // ── Key metrics grid ──
  y = sectionHeading(doc, y, "Key Financial Metrics");

  const cellW = (182 - 3 * 3) / 4;  // 4 cells with 3px gaps
  const metrics = [
    { label: "Land Acquisition",    value: usd(landPrice),      color: C.textBright,       sub: lotSf > 0 ? `${num(lotSf)} sf` : "" },
    { label: "Construction Cost",   value: usd(buildCost),      color: C.textBright,       sub: `$${costPSF}/sf` },
    { label: "After Repair Value",  value: usd(arv),            color: C.success },
    { label: "Net Margin",          value: pct(margin),         color: marginColor(margin), sub: `ROI ${pct(roi)}` },
  ];
  metrics.forEach(({ label, value, color, sub }, i) => {
    metricRow(doc, 14 + i * (cellW + 3), y, cellW, label, value, color, sub);
  });
  y += 26;

  // Second metrics row
  const metrics2 = [
    { label: "Total Investment",    value: usd(totalCost),      color: C.textBright },
    { label: "Gross Profit",        value: usd(grossProfit),    color: grossProfit >= 0 ? C.success : C.danger },
    { label: "Build Cost / SF",     value: `$${costPSF}`,       color: C.textBright, sub: "/sf" },
    { label: "Comp Count",          value: String(nearbyComps.length), color: C.secondary, sub: "sales" },
  ];
  metrics2.forEach(({ label, value, color, sub }, i) => {
    metricRow(doc, 14 + i * (cellW + 3), y, cellW, label, value, color, sub);
  });
  y += 28;

  // ── Valuation approach breakdown ──
  if (isLive) {
    y = sectionHeading(doc, y, "3-Approach Blended Valuation", `50% SCA · 30% Cost · 20% Income`);

    const approaches = [
      {
        name:    "Sales Comparison Approach (SCA)  —  50% weight",
        value:   usd(valuation.scaValue),
        detail:  `Inverse-distance weighted average of ${valuation.compResults.length} adjusted comparable sales within ${nearbyComps.length > 0 ? ((nearbyComps[nearbyComps.length - 1]?._dist ?? 0.75)).toFixed(2) : "0.75"} miles`,
        color:   C.secondary,
        pct:     50,
      },
      {
        name:    "Cost Approach  —  30% weight",
        value:   usd(valuation.costValue),
        detail:  `Land ${usd(landPrice)} + Construction ${usd(valuation.buildCost)} @ $${BUILD_COST_PSF}/SF`,
        color:   C.purple,
        pct:     30,
      },
      {
        name:    "Income Approach (GRM)  —  20% weight",
        value:   usd(valuation.incomeValue),
        detail:  `Monthly rent est. ${usd(valuation.monthlyRent)} → Annual ${usd(valuation.annualRent)} × GRM 15`,
        color:   C.accent,
        pct:     20,
      },
    ];

    approaches.forEach(({ name, value, detail, color, pct: weight }, i) => {
      const ry = y + i * 16;
      doc.setFillColor(...C.panel);
      doc.setDrawColor(...C.border);
      doc.roundedRect(14, ry, 182, 13, 2, 2, "FD");
      // Colored weight bar on left
      doc.setFillColor(...color);
      doc.roundedRect(14, ry, 3, 13, 1, 1, "F");
      // Approach name
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.textBright);
      doc.text(name, 20, ry + 5);
      // Detail
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...C.textDim);
      doc.text(detail, 20, ry + 10);
      // Value right-aligned
      doc.setFont("courier", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...color);
      const vw = doc.getTextWidth(value);
      doc.text(value, 196 - vw, ry + 9);
    });

    // Blended total
    const blendY = y + 3 * 16 + 2;
    doc.setFillColor(...C.accentGlow ?? [0, 212, 255, 0.1]);
    doc.setFillColor(0, 30, 40); // dark teal tint
    doc.setDrawColor(...C.accent);
    doc.roundedRect(14, blendY, 182, 14, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.accent);
    doc.text("BLENDED ARV", 20, blendY + 9);
    doc.setFont("courier", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...C.accent);
    const bvW = doc.getTextWidth(usd(arv));
    doc.text(usd(arv), 196 - bvW, blendY + 10.5);
    y += 3 * 16 + 18;
  } else {
    // Demo mode mini-breakdown
    y = sectionHeading(doc, y, "3-Approach Blended Valuation", "Demo — pin a location for live data");
    const demoApproaches = [
      ["Sales Comparison (SCA)  50%", usd(demoARV * 0.50 / 0.50), C.secondary],
      ["Cost Approach            30%", usd(demoTotalCost ?? totalCost), C.purple],
      ["Income Approach          20%", usd((totalSF * 1.15 * 12 * 15) * 0.20 / 0.20), C.accent],
    ];
    demoApproaches.forEach(([name, val, color], i) => {
      const ry = y + i * 11;
      doc.setFillColor(...C.panel);
      doc.setDrawColor(...C.border);
      doc.roundedRect(14, ry - 2, 182, 9, 2, 2, "FD");
      doc.setFillColor(...color);
      doc.roundedRect(14, ry - 2, 3, 9, 1, 1, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...C.textDim);
      doc.text(name, 20, ry + 4.5);
      doc.setFont("courier", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...color);
      const vw = doc.getTextWidth(val);
      doc.text(val, 196 - vw, ry + 4.5);
    });
    y += 40;
  }

  // ── Disclaimer snippet on page 1 ──
  doc.setFillColor(...C.panel);
  doc.setDrawColor(...C.border);
  doc.roundedRect(14, y, 182, 14, 2, 2, "FD");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.2);
  doc.setTextColor(...C.textDim);
  const disclaimerLines = doc.splitTextToSize(DISCLAIMER, 174);
  doc.text(disclaimerLines.slice(0, 2), 18, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.warn);
  doc.text("ADVISORY ONLY — NOT LICENSED ENGINEERING OR INVESTMENT ADVICE", 18, y + 11.5);

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 2 — COMPARABLE SALES TABLE (only when live)
  // ══════════════════════════════════════════════════════════════════════
  if (isLive) {
    doc.addPage();
    addPageHeader(doc, projectName, 2, totalPages);
    y = 24;

    y = sectionHeading(doc, y, "Comparable Sales Analysis",
      `${valuation.compResults.length} comps · subject: ${totalSF.toLocaleString()} SF · ${bedrooms}bd/${bathrooms}ba`);

    // Summary stats header
    const compValues = valuation.compResults.map((c) => c.adjusted);
    const compMean   = compValues.reduce((a, b) => a + b, 0) / compValues.length;
    const compMin    = Math.min(...compValues);
    const compMax    = Math.max(...compValues);
    const cvPct      = (valuation.cv * 100).toFixed(1);

    const statsGrid = [
      ["Weighted SCA Value",  usd(valuation.scaValue), C.secondary],
      ["Adjusted Mean",       usd(compMean),            C.textBright],
      ["Range Low",           usd(compMin),             C.success],
      ["Range High",          usd(compMax),             C.warn],
      ["Comp CoV",            pct(parseFloat(cvPct)),   parseFloat(cvPct) < 10 ? C.success : parseFloat(cvPct) < 20 ? C.warn : C.danger],
      ["Comps Used",          String(valuation.compResults.length),  C.secondary],
    ];

    const sw = (182 - 5 * 3) / 6;
    statsGrid.forEach(([lbl, val, col], i) => {
      metricRow(doc, 14 + i * (sw + 3), y, sw, lbl, val, col);
    });
    y += 26;

    // Comps table
    y = sectionHeading(doc, y, "Adjusted Comparable Sales", "inverse-distance weighted");

    const compRows = valuation.compResults.map((c) => [
      c.address ? c.address.substring(0, 24) : `Comp #${c._id ?? ""}`.substring(0, 24),
      `${c.sf?.toLocaleString() ?? "–"} sf`,
      c.year_built ?? "–",
      c.bedrooms != null ? `${c.bedrooms}/${c.bathrooms}` : "–",
      c.dist != null ? c.dist.toFixed(2) + " mi" : "–",
      usd(c.sale_price),
      c.totalAdj >= 0 ? "+" + usd(c.totalAdj) : usd(c.totalAdj),
      usd(c.adjusted),
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Address", "Size", "Year", "Bd/Ba", "Dist", "Sale Price", "Adj", "Adj Value"]],
      body: compRows,
      theme: "plain",
      styles: {
        font:       "courier",
        fontSize:   7,
        cellPadding: 2.5,
        textColor:  C.text,
        fillColor:  C.bg,
        lineColor:  C.border,
        lineWidth:  0.2,
      },
      headStyles: {
        fillColor:  C.panel,
        textColor:  C.textDim,
        fontStyle:  "bold",
        fontSize:   6.5,
        font:       "helvetica",
      },
      alternateRowStyles: {
        fillColor: [17, 24, 36],
      },
      columnStyles: {
        0: { cellWidth: 42 },
        5: { textColor: C.textBright },
        6: { textColor: C.warn },
        7: { textColor: C.success, fontStyle: "bold" },
      },
    });
    y = doc.lastAutoTable.finalY + 10;

    // Adjustment methodology footnote — dark panel
    doc.setFillColor(...C.panel);
    doc.setDrawColor(...C.border);
    doc.roundedRect(14, y - 1, 182, 11, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...C.textDim);
    const footLines = [
      "Adjustment methodology: Size @ $125/SF · Age @ $1,200/yr · Bedrooms @ $15,000 each · Bathrooms @ $12,000 each · Lot SF @ $3.50/SF",
      "SCA value is inverse-distance weighted (closer comps carry more weight). All adjusted values are model estimates only.",
    ];
    footLines.forEach((line, i) => {
      doc.text(line, 18, y + i * 4.5 + 3);
    });
    y += 15;

  }

  // ══════════════════════════════════════════════════════════════════════
  // PAGE 3 — RISK & INVESTMENT ANALYSIS (live only)
  // ══════════════════════════════════════════════════════════════════════
  if (isLive) {
    doc.addPage();
    addPageHeader(doc, projectName, 3, totalPages);
    y = 24;

    // ── Sensitivity Analysis ──
    y = sectionHeading(doc, y, "Sensitivity Analysis", "margin impact by scenario");

    const baseCost     = valuation.totalInvestment;
    const baseArv      = valuation.blended;
    const baseMargin   = valuation.margin;

    const scenarios = [
      { name: "Bear Case    (ARV -10%, Cost +5%)",  arv: baseArv * 0.90, cost: baseCost * 1.05 },
      { name: "Conservative (ARV -5%,  Cost +2%)",  arv: baseArv * 0.95, cost: baseCost * 1.02 },
      { name: "Base Case    (Current estimate)",     arv: baseArv,        cost: baseCost        },
      { name: "Optimistic   (ARV +5%,  Cost -2%)",  arv: baseArv * 1.05, cost: baseCost * 0.98 },
      { name: "Bull Case    (ARV +10%, Cost -5%)",  arv: baseArv * 1.10, cost: baseCost * 0.95 },
    ];

    const scenRows = scenarios.map((s) => {
      const gp  = s.arv - s.cost;
      const m   = ((gp / s.arv) * 100).toFixed(1);
      const r   = ((gp / s.cost) * 100).toFixed(1);
      const status = parseFloat(m) > 15 ? "GO" : parseFloat(m) > 5 ? "CAUTION" : "NO-GO";
      return [s.name, usd(s.arv), usd(s.cost), usd(gp), m + "%", r + "%", status];
    });

    autoTable(doc, {
      startY: y,
      head:   [["Scenario", "ARV", "Investment", "Gross Profit", "Margin", "ROI", "Decision"]],
      body:   scenRows,
      theme:  "plain",
      styles: {
        font:        "courier",
        fontSize:    7.5,
        cellPadding: 3,
        textColor:   C.text,
        fillColor:   C.bg,
        lineColor:   C.border,
        lineWidth:   0.2,
      },
      headStyles: {
        fillColor:  C.panel,
        textColor:  C.textDim,
        fontStyle:  "bold",
        fontSize:   7,
        font:       "helvetica",
      },
      alternateRowStyles: { fillColor: [17, 24, 36] },
      columnStyles: {
        0: { cellWidth: 58 },
        1: { cellWidth: 28 },
        2: { cellWidth: 28 },
        3: { textColor: C.success, cellWidth: 28 },
        4: { fontStyle: "bold", cellWidth: 18 },
        5: { cellWidth: 18 },
        6: { fontStyle: "bold", cellWidth: 22 },
      },
      didParseCell: (data) => {
        if (data.column.index === 6 && data.section === "body") {
          const v = data.cell.raw;
          data.cell.styles.textColor =
            v === "GO" ? C.success : v === "CAUTION" ? C.warn : C.danger;
        }
        if (data.column.index === 3 && data.section === "body") {
          const gp = parseFloat(data.cell.raw.replace(/[$,]/g, ""));
          data.cell.styles.textColor = gp >= 0 ? C.success : C.danger;
        }
      },
    });
    y = doc.lastAutoTable.finalY + 10;

    // ── Risk Assessment ──
    y = sectionHeading(doc, y, "Risk Assessment");

    const riskItems = [
      {
        factor: "Market Concentration Risk",
        detail: `Comp CoV: ${(valuation.cv * 100).toFixed(1)}% — measures price dispersion in the local market`,
        level:  valuation.cv < 0.08 ? "Low" : valuation.cv < 0.15 ? "Med" : "High",
        invert: false,
      },
      {
        factor: "Margin of Safety",
        detail: `Net margin ${pct(valuation.margin)} vs. target threshold of 15%`,
        level:  valuation.margin > 20 ? "High" : valuation.margin > 8 ? "Med" : "Low",
        invert: false,
      },
      {
        factor: "Land Acquisition Risk",
        detail: selLand
          ? `DOM ${selLand.days_on_market ?? "N/A"} days · Status: ${selLand.status ?? "N/A"}`
          : "No land parcel selected — using estimated land value",
        level: selLand ? (selLand.days_on_market < 30 ? "Low" : selLand.days_on_market < 90 ? "Med" : "High") : "High",
        invert: false,
      },
      {
        factor: "Infrastructure & Site Risk",
        detail: `Infra score ${valuation.infraScore}/100 · Topography: ${selLand?.topography ?? "Unknown"}`,
        level:  valuation.infrastructureLevel,
        invert: false,
      },
      {
        factor: "Comp Data Quality",
        detail: `${valuation.compResults.length} comps · weighted SCA ${usd(valuation.scaValue)}`,
        level:  valuation.compResults.length >= 5 ? "High" : valuation.compResults.length >= 2 ? "Med" : "Low",
        invert: false,
      },
    ];

    riskItems.forEach(({ factor, detail, level }, i) => {
      const ry = y + i * 14;
      doc.setFillColor(...C.panel);
      doc.setDrawColor(...C.border);
      doc.roundedRect(14, ry, 182, 11, 2, 2, "FD");
      const barColor = level === "High" ? C.success : level === "Med" ? C.warn : C.danger;
      doc.setFillColor(...barColor);
      doc.roundedRect(14, ry, 2.5, 11, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...C.textBright);
      doc.text(factor, 20, ry + 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...C.textDim);
      doc.text(detail, 20, ry + 9);
      doc.setFont("courier", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...barColor);
      const lw = doc.getTextWidth(level);
      doc.text(level, 196 - lw, ry + 7);
    });
    y += riskItems.length * 14 + 6;

    // ── Investment return schedule ──
    if (y < 230) {
      y = sectionHeading(doc, y, "Investment Return Summary");

      const holdPeriods = [6, 12, 18, 24];
      const annMonthly  = valuation.monthlyRent ?? (totalSF * 1.15);

      const returnRows = holdPeriods.map((months) => {
        const rentIncome = annMonthly * months;
        const totalReturn = grossProfit + rentIncome;
        const annROI = baseCost > 0 ? ((totalReturn / baseCost) / (months / 12) * 100).toFixed(1) : "0.0";
        return [
          `${months} months`,
          usd(baseCost),
          usd(grossProfit),
          usd(rentIncome),
          usd(totalReturn),
          annROI + "%",
        ];
      });

      autoTable(doc, {
        startY: y,
        head:   [["Hold Period", "Total Investment", "Resale Profit", "Est. Rental Income", "Total Return", "Ann. ROI"]],
        body:   returnRows,
        theme:  "plain",
        styles: { font: "courier", fontSize: 7, cellPadding: 2.5, textColor: C.text, fillColor: C.bg, lineColor: C.border, lineWidth: 0.2 },
        headStyles: { fillColor: C.panel, textColor: C.textDim, fontStyle: "bold", fontSize: 6.5, font: "helvetica" },
        alternateRowStyles: { fillColor: [17, 24, 36] },
        columnStyles: {
          2: { textColor: C.success },
          3: { textColor: C.accent },
          4: { textColor: C.success, fontStyle: "bold" },
          5: { textColor: C.warn, fontStyle: "bold" },
        },
      });
      y = doc.lastAutoTable.finalY + 6;
    }

    // ── Construction cost breakdown ──
    if (y < 260) {
      y = sectionHeading(doc, y, "Construction Cost Breakdown", `${totalSF.toLocaleString()} SF · $${BUILD_COST_PSF}/SF base`);

      // Rates sum to BUILD_COST_PSF before contingency
      const baseRate  = BUILD_COST_PSF / 1.12;   // back out 12% contingency
      const costItems = [
        ["Foundation & Structural",    usd(totalSF * baseRate * 0.17), "17%"],
        ["Framing & Rough Carpentry",  usd(totalSF * baseRate * 0.21), "21%"],
        ["MEP (Mech / Elec / Plbg)",  usd(totalSF * baseRate * 0.24), "24%"],
        ["Roofing & Exterior Finish",  usd(totalSF * baseRate * 0.13), "13%"],
        ["Interior Finishes",          usd(totalSF * baseRate * 0.25), "25%"],
        ["Contingency (12%)",          usd(totalSF * baseRate * 0.12), "12%"],
      ];
      const totalLine = Math.round(totalSF * BUILD_COST_PSF);

      autoTable(doc, {
        startY: y,
        head:   [["Trade / Category", "Estimated Cost", "Basis"]],
        body:   [...costItems, ["TOTAL", usd(totalLine), ""]],
        theme:  "plain",
        styles: { font: "courier", fontSize: 8, cellPadding: 3, textColor: C.text, fillColor: C.bg, lineColor: C.border, lineWidth: 0.2 },
        headStyles: { fillColor: C.panel, textColor: C.textDim, fontStyle: "bold", fontSize: 7, font: "helvetica" },
        alternateRowStyles: { fillColor: [17, 24, 36] },
        columnStyles: {
          1: { textColor: C.textBright, fontStyle: "bold" },
          2: { textColor: C.textDim },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === costItems.length) {
            data.cell.styles.fillColor = C.panel;
            data.cell.styles.textColor = C.accent;
            data.cell.styles.fontStyle = "bold";
          }
        },
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // LAST PAGE — FULL DISCLAIMER & APPENDIX
  // ══════════════════════════════════════════════════════════════════════
  doc.addPage();
  const lastPage = totalPages;
  addPageHeader(doc, projectName, lastPage, totalPages);
  y = 24;

  y = sectionHeading(doc, y, "Methodology & Assumptions");

  // Methodology entries: [title, body]
  const methodSections = [
    [
      "Sales Comparison Approach  (50% weight)",
      `Comparable sales within the selected radius are adjusted for size ($125/SF), age ($1,200/yr), bedrooms ($15,000), bathrooms ($12,000), and lot size ($3.50/SF). Each comp is weighted by inverse distance so closer sales carry more influence.`,
    ],
    [
      "Cost Approach  (30% weight)",
      `Replacement value = Land Acquisition + New Construction. Base rate: $${BUILD_COST_PSF}/SF for Dallas mid-range residential (2026). No depreciation is applied for new construction.`,
    ],
    [
      "Income Approach  (20% weight)",
      `Monthly rent estimated at $1.15/SF. Annual gross rent × Gross Rent Multiplier (GRM) of 15. Conservative — does not deduct vacancy or operating expenses.`,
    ],
    [
      "Feasibility Score  (0–100)",
      `Weighted index: Margin 30% · Comp count 25% · Price uniformity (1−CoV) 25% · Infrastructure 20%.  Score ≥ 70 = Strong  ·  45–69 = Moderate  ·  < 45 = Low.`,
    ],
    [
      "Sensitivity Analysis",
      `Five scenarios stress-test ±5–10% ARV and ±2–5% cost variance.  GO: margin > 15%  ·  CAUTION: 5–15%  ·  NO-GO: < 5%.`,
    ],
    [
      "Data Sources",
      `Comparable sales and land listings from the Vision MongoDB database (Dallas, TX). Zoning templates from the Dallas Development Code. Market statistics refreshed periodically.`,
    ],
  ];

  const lineH = 5.5;   // height per body line
  const secH  = 22;    // approximate height per section block
  const methodBlockH = methodSections.length * secH + 6;
  doc.setFillColor(...C.panel);
  doc.setDrawColor(...C.border);
  doc.roundedRect(14, y - 3, 182, methodBlockH, 2, 2, "FD");

  methodSections.forEach(([title, body], i) => {
    const sy = y + i * secH;
    // Section title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...C.accent);
    doc.text(title, 18, sy + 4);
    // Body — wrapped
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...C.text);
    const wrapped = doc.splitTextToSize(body, 170);
    wrapped.forEach((ln, li) => doc.text(ln, 18, sy + 10 + li * lineH));
  });
  y += methodBlockH + 8;

  // Full disclaimer
  y = sectionHeading(doc, y < 220 ? y : 220, "Legal Disclaimer");
  doc.setFillColor(40, 20, 0);
  doc.setDrawColor(...C.warn);
  doc.roundedRect(14, y, 182, 36, 2, 2, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...C.warn);
  doc.text("⚠  ADVISORY ONLY — NOT LICENSED ENGINEERING OR INVESTMENT ADVICE", 18, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...C.textDim);
  const disclaimerBlock = doc.splitTextToSize(DISCLAIMER, 174);
  doc.text(disclaimerBlock, 18, y + 14);
  y += 42;

  // Generated-by footer — dark pill
  doc.setFillColor(...C.panel);
  doc.setDrawColor(...C.border);
  doc.roundedRect(14, y - 3, 182, 9, 2, 2, "FD");
  doc.setFillColor(...C.accent);
  doc.roundedRect(14, y - 3, 3, 9, 1, 1, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...C.textDim);
  doc.text(
    `Generated by Vision AI Feasibility Platform · ${new Date().toLocaleString("en-US")} · Dallas, TX Market`,
    20,
    y + 3
  );

  // ── Save ──
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
  const dateStr  = new Date().toISOString().split("T")[0];
  doc.save(`Vision_Feasibility_${safeName}_${dateStr}.pdf`);
}
