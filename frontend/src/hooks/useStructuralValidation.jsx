import { useMemo } from "react";

/**
 * Structural Validation Rules for Residential Construction
 * Based on IRC (International Residential Code) and common engineering practices
 */

// ─── Validation Rule Definitions ─────────────────────────────────────────────

const ROOM_MIN_DIMENSIONS = {
  bedroom: { minW: 7, minH: 7, minSF: 70, label: "Bedroom" },
  bathroom: { minW: 5, minH: 5, minSF: 35, label: "Bathroom" },
  kitchen: { minW: 7, minH: 7, minSF: 50, label: "Kitchen" },
  living: { minW: 10, minH: 10, minSF: 120, label: "Living Room" },
  dining: { minW: 8, minH: 8, minSF: 80, label: "Dining Room" },
  garage: { minW: 10, minH: 20, minSF: 200, label: "Garage" },
  laundry: { minW: 5, minH: 5, minSF: 25, label: "Laundry" },
  closet: { minW: 2, minH: 2, minSF: 6, label: "Closet" },
  hallway: { minW: 3, minH: 3, minSF: 0, label: "Hallway" },
  entry: { minW: 4, minH: 4, minSF: 16, label: "Entry" },
  office: { minW: 7, minH: 7, minSF: 70, label: "Office" },
};

const ROOM_MAX_DIMENSIONS = {
  bedroom: { maxW: 24, maxH: 24, label: "Bedroom" },
  bathroom: { maxW: 15, maxH: 15, label: "Bathroom" },
  kitchen: { maxW: 25, maxH: 25, label: "Kitchen" },
  living: { maxW: 30, maxH: 30, label: "Living Room" },
  dining: { maxW: 20, maxH: 20, label: "Dining Room" },
  garage: { maxW: 30, maxH: 40, label: "Garage" },
  laundry: { maxW: 12, maxH: 12, label: "Laundry" },
  closet: { maxW: 12, maxH: 12, label: "Closet" },
  hallway: { maxW: 15, maxH: 60, label: "Hallway" },
  entry: { maxW: 15, maxH: 15, label: "Entry" },
  office: { maxW: 20, maxH: 20, label: "Office" },
};

// Maximum clear span without intermediate support (wood frame construction)
const MAX_CLEAR_SPAN_FT = 20;

// Maximum total home size without special engineering
const MAX_TOTAL_SF = 8000;

// Severity levels
const SEVERITY = {
  ERROR: "error",     // Blocks progress - structurally impossible
  WARNING: "warning", // Needs attention - may cause issues
  INFO: "info",       // Suggestion for improvement
};

// ─── Validation Functions ────────────────────────────────────────────────────

function validateRoomDimensions(rooms) {
  const issues = [];

  rooms.forEach((room, idx) => {
    const type = (room.type || "").toLowerCase();
    const w = room.w || room.width || 0;
    const h = room.h || room.depth || 0;
    const sf = w * h;
    const roomName = room.name || room.label || `${type} ${idx + 1}`;

    // Check minimum dimensions
    const minRules = ROOM_MIN_DIMENSIONS[type];
    if (minRules) {
      if (w < minRules.minW) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: "dimensions",
          roomId: room.id,
          roomName,
          message: `${roomName} width (${w}') is below minimum ${minRules.minW}' required by code`,
          suggestion: `Increase width to at least ${minRules.minW}'`,
        });
      }
      if (h < minRules.minH) {
        issues.push({
          severity: SEVERITY.ERROR,
          category: "dimensions",
          roomId: room.id,
          roomName,
          message: `${roomName} depth (${h}') is below minimum ${minRules.minH}' required by code`,
          suggestion: `Increase depth to at least ${minRules.minH}'`,
        });
      }
      if (sf < minRules.minSF && minRules.minSF > 0) {
        issues.push({
          severity: SEVERITY.WARNING,
          category: "dimensions",
          roomId: room.id,
          roomName,
          message: `${roomName} area (${sf} SF) is below recommended ${minRules.minSF} SF`,
          suggestion: `Consider increasing room size for functionality`,
        });
      }
    }

    // Check maximum dimensions (structural span limits)
    const maxRules = ROOM_MAX_DIMENSIONS[type];
    if (maxRules) {
      if (w > maxRules.maxW) {
        issues.push({
          severity: SEVERITY.WARNING,
          category: "dimensions",
          roomId: room.id,
          roomName,
          message: `${roomName} width (${w}') exceeds typical maximum of ${maxRules.maxW}'`,
          suggestion: `Consider adding interior walls or reducing width`,
        });
      }
      if (h > maxRules.maxH) {
        issues.push({
          severity: SEVERITY.WARNING,
          category: "dimensions",
          roomId: room.id,
          roomName,
          message: `${roomName} depth (${h}') exceeds typical maximum of ${maxRules.maxH}'`,
          suggestion: `Consider adding interior walls or reducing depth`,
        });
      }
    }
  });

  return issues;
}

function validateStructuralSpans(rooms) {
  const issues = [];

  rooms.forEach((room) => {
    const type = (room.type || "").toLowerCase();
    const w = room.w || room.width || 0;
    const h = room.h || room.depth || 0;
    const roomName = room.name || room.label || type;
    const maxDim = Math.max(w, h);

    // Check for spans exceeding structural limits
    if (maxDim > MAX_CLEAR_SPAN_FT) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: "structural",
        roomId: room.id,
        roomName,
        message: `${roomName} has a ${maxDim}' clear span exceeding the ${MAX_CLEAR_SPAN_FT}' maximum for wood frame`,
        suggestion: `Add a load-bearing wall or beam to reduce span to under ${MAX_CLEAR_SPAN_FT}'`,
      });
    } else if (maxDim > MAX_CLEAR_SPAN_FT - 4) {
      // Warning when approaching limits
      issues.push({
        severity: SEVERITY.WARNING,
        category: "structural",
        roomId: room.id,
        roomName,
        message: `${roomName} has a ${maxDim}' span approaching structural limits`,
        suggestion: `Consider LVL beams or steel support for spans over ${MAX_CLEAR_SPAN_FT - 4}'`,
      });
    }
  });

  return issues;
}

function validateTotalArea(rooms, params = {}) {
  const issues = [];

  const totalSF = rooms.reduce((sum, room) => {
    const w = room.w || room.width || 0;
    const h = room.h || room.depth || 0;
    return sum + (w * h);
  }, 0);

  // Check if total exceeds typical residential limits
  if (totalSF > MAX_TOTAL_SF) {
    issues.push({
      severity: SEVERITY.WARNING,
      category: "overall",
      message: `Total floor area (${totalSF.toLocaleString()} SF) exceeds ${MAX_TOTAL_SF.toLocaleString()} SF`,
      suggestion: `Large homes may require special engineering review`,
    });
  }

  // Check against target SF if provided
  const targetSF = params.targetSF || 0;
  if (targetSF > 0) {
    const deviation = Math.abs(totalSF - targetSF) / targetSF;
    if (deviation > 0.2) {
      issues.push({
        severity: SEVERITY.INFO,
        category: "overall",
        message: `Actual area (${totalSF} SF) differs from target (${targetSF} SF) by ${Math.round(deviation * 100)}%`,
        suggestion: `Adjust room sizes to meet target square footage`,
      });
    }
  }

  return issues;
}

function validateRoomPlacement(rooms) {
  const issues = [];

  // Check for overlapping rooms
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];

      const ax = a.x || 0, ay = a.y || 0;
      const aw = a.w || a.width || 0, ah = a.h || a.depth || 0;
      const bx = b.x || 0, by = b.y || 0;
      const bw = b.w || b.width || 0, bh = b.h || b.depth || 0;

      const overlapX = ax < bx + bw && ax + aw > bx;
      const overlapY = ay < by + bh && ay + ah > by;

      if (overlapX && overlapY) {
        const aName = a.name || a.label || a.type || `Room ${i + 1}`;
        const bName = b.name || b.label || b.type || `Room ${j + 1}`;
        issues.push({
          severity: SEVERITY.ERROR,
          category: "placement",
          roomId: a.id,
          message: `${aName} overlaps with ${bName}`,
          suggestion: `Move or resize rooms to eliminate overlap`,
        });
      }
    }
  }

  return issues;
}

function validateCodeCompliance(rooms, params = {}) {
  const issues = [];

  // Count bedrooms - need at least one egress window per bedroom
  const bedrooms = rooms.filter(r => (r.type || "").toLowerCase() === "bedroom");
  const bathrooms = rooms.filter(r => (r.type || "").toLowerCase() === "bathroom");

  // Check bedroom to bathroom ratio
  if (bedrooms.length > 0 && bathrooms.length === 0) {
    issues.push({
      severity: SEVERITY.ERROR,
      category: "code",
      message: `No bathroom found - at least one bathroom required`,
      suggestion: `Add a bathroom to the floor plan`,
    });
  } else if (bedrooms.length > bathrooms.length * 3) {
    issues.push({
      severity: SEVERITY.WARNING,
      category: "code",
      message: `${bedrooms.length} bedrooms with only ${bathrooms.length} bathroom(s)`,
      suggestion: `Consider adding more bathrooms for functionality`,
    });
  }

  // Check for kitchen
  const hasKitchen = rooms.some(r => (r.type || "").toLowerCase() === "kitchen");
  if (!hasKitchen && rooms.length > 2) {
    issues.push({
      severity: SEVERITY.WARNING,
      category: "code",
      message: `No kitchen found in floor plan`,
      suggestion: `Add a kitchen for a complete residential layout`,
    });
  }

  // Multi-story requirements
  const stories = params.stories || 1;
  if (stories > 1) {
    const hasStair = rooms.some(r => (r.type || "").toLowerCase() === "stair");
    if (!hasStair) {
      issues.push({
        severity: SEVERITY.ERROR,
        category: "code",
        message: `Multi-story home requires stairway access`,
        suggestion: `Add a stairway for access between floors`,
      });
    }
  }

  return issues;
}

function validateProportions(rooms) {
  const issues = [];

  rooms.forEach((room) => {
    const type = (room.type || "").toLowerCase();
    const w = room.w || room.width || 0;
    const h = room.h || room.depth || 0;
    const roomName = room.name || room.label || type;

    if (w === 0 || h === 0) return;

    const ratio = Math.max(w, h) / Math.min(w, h);

    // Very narrow/long rooms are impractical
    if (ratio > 4 && type !== "hallway") {
      issues.push({
        severity: SEVERITY.WARNING,
        category: "proportions",
        roomId: room.id,
        roomName,
        message: `${roomName} has extreme proportions (${w}' × ${h}', ratio ${ratio.toFixed(1)}:1)`,
        suggestion: `Consider more balanced dimensions for usability`,
      });
    }
  });

  return issues;
}

// ─── Main Validation Hook ────────────────────────────────────────────────────

export function useStructuralValidation(rooms, params = {}) {
  const validation = useMemo(() => {
    if (!rooms || rooms.length === 0) {
      return { issues: [], errors: [], warnings: [], infos: [], isValid: true };
    }

    // Filter to only room items (not furniture)
    const roomItems = rooms.filter(item => item.isRoom);

    // Run all validation checks
    const allIssues = [
      ...validateRoomDimensions(roomItems),
      ...validateStructuralSpans(roomItems),
      ...validateTotalArea(roomItems, params),
      ...validateRoomPlacement(roomItems),
      ...validateCodeCompliance(roomItems, params),
      ...validateProportions(roomItems),
    ];

    // Categorize by severity
    const errors = allIssues.filter(i => i.severity === SEVERITY.ERROR);
    const warnings = allIssues.filter(i => i.severity === SEVERITY.WARNING);
    const infos = allIssues.filter(i => i.severity === SEVERITY.INFO);

    return {
      issues: allIssues,
      errors,
      warnings,
      infos,
      isValid: errors.length === 0,
      hasWarnings: warnings.length > 0,
      totalIssues: allIssues.length,
    };
  }, [rooms, params]);

  return validation;
}

// ─── Validation Panel Component ──────────────────────────────────────────────

export function ValidationPanel({ validation, onIssueClick, style = {} }) {
  if (!validation || validation.totalIssues === 0) {
    return (
      <div style={{
        padding: "12px 16px",
        background: "rgba(46, 213, 115, 0.08)",
        border: "1px solid rgba(46, 213, 115, 0.2)",
        borderRadius: 8,
        display: "flex",
        alignItems: "center",
        gap: 10,
        ...style,
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="#2ed573" strokeWidth="1.5" />
          <path d="M5 8l2 2 4-4" stroke="#2ed573" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 12, color: "#2ed573", fontWeight: 500 }}>
          All structural checks passed
        </span>
      </div>
    );
  }

  const { errors, warnings, infos } = validation;

  return (
    <div style={{
      background: "#1a2233",
      border: "1px solid #2a3548",
      borderRadius: 8,
      overflow: "hidden",
      ...style,
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        background: errors.length > 0 ? "rgba(255, 71, 87, 0.1)" : "rgba(255, 159, 67, 0.1)",
        borderBottom: "1px solid #2a3548",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 1L13 12H1L7 1Z"
            stroke={errors.length > 0 ? "#ff4757" : "#ff9f43"}
            strokeWidth="1.3"
            fill="none"
          />
          <path d="M7 5v3M7 9.5v.5" stroke={errors.length > 0 ? "#ff4757" : "#ff9f43"} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: errors.length > 0 ? "#ff4757" : "#ff9f43",
        }}>
          {errors.length > 0 ? `${errors.length} Error${errors.length > 1 ? "s" : ""}` : ""}
          {errors.length > 0 && warnings.length > 0 ? " • " : ""}
          {warnings.length > 0 ? `${warnings.length} Warning${warnings.length > 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {/* Issues list */}
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {errors.map((issue, i) => (
          <IssueRow key={`e${i}`} issue={issue} onClick={onIssueClick} />
        ))}
        {warnings.map((issue, i) => (
          <IssueRow key={`w${i}`} issue={issue} onClick={onIssueClick} />
        ))}
        {infos.map((issue, i) => (
          <IssueRow key={`i${i}`} issue={issue} onClick={onIssueClick} />
        ))}
      </div>
    </div>
  );
}

function IssueRow({ issue, onClick }) {
  const colors = {
    error: { bg: "rgba(255,71,87,0.06)", border: "#ff4757", text: "#ff6b7a" },
    warning: { bg: "rgba(255,159,67,0.06)", border: "#ff9f43", text: "#ffb76b" },
    info: { bg: "rgba(59,130,246,0.06)", border: "#3b82f6", text: "#60a5fa" },
  };
  const c = colors[issue.severity] || colors.info;

  return (
    <div
      onClick={() => onClick?.(issue)}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid #2a354822",
        cursor: onClick ? "pointer" : "default",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => e.currentTarget.style.background = c.bg}
      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: c.border,
          marginTop: 5,
          flexShrink: 0,
        }} />
        <div>
          <div style={{ fontSize: 12, color: "#e8ecf4", lineHeight: 1.4 }}>
            {issue.message}
          </div>
          {issue.suggestion && (
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, lineHeight: 1.4 }}>
              💡 {issue.suggestion}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Compact Status Badge ────────────────────────────────────────────────────

export function ValidationBadge({ validation, onClick }) {
  if (!validation) return null;

  const { errors, warnings, isValid } = validation;

  if (isValid && warnings.length === 0) {
    return (
      <div
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          background: "rgba(46, 213, 115, 0.1)",
          border: "1px solid rgba(46, 213, 115, 0.25)",
          borderRadius: 6,
          cursor: onClick ? "pointer" : "default",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="4.5" stroke="#2ed573" strokeWidth="1.2" />
          <path d="M4 6l1.5 1.5 3-3" stroke="#2ed573" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ fontSize: 11, color: "#2ed573", fontWeight: 500 }}>Valid</span>
      </div>
    );
  }

  const hasErrors = errors.length > 0;

  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 12px",
        background: hasErrors ? "rgba(255, 71, 87, 0.1)" : "rgba(255, 159, 67, 0.1)",
        border: `1px solid ${hasErrors ? "rgba(255, 71, 87, 0.25)" : "rgba(255, 159, 67, 0.25)"}`,
        borderRadius: 6,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M6 1L11 10H1L6 1Z"
          stroke={hasErrors ? "#ff4757" : "#ff9f43"}
          strokeWidth="1.2"
          fill="none"
        />
      </svg>
      <span style={{ fontSize: 11, color: hasErrors ? "#ff4757" : "#ff9f43", fontWeight: 500 }}>
        {errors.length > 0 && `${errors.length} error${errors.length > 1 ? "s" : ""}`}
        {errors.length > 0 && warnings.length > 0 && ", "}
        {warnings.length > 0 && `${warnings.length} warning${warnings.length > 1 ? "s" : ""}`}
      </span>
    </div>
  );
}

export default useStructuralValidation;
