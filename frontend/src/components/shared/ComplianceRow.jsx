import React from "react";
import { colors, fonts } from "../../theme/tokens";
import StatusBadge from "./StatusBadge";

function barColor(status) {
  const s = (status || "").toLowerCase();
  if (s === "pass") return colors.success;
  if (s === "warning") return colors.warn;
  return colors.danger;
}

export default function ComplianceRow({
  label,
  standard,
  utilization = 0,
  status = "pass",
}) {
  const clampedUtil = Math.max(0, Math.min(100, utilization));

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr 1.6fr auto",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${colors.cardBorder}`,
      }}
    >
      {/* Label */}
      <span
        style={{
          fontFamily: fonts.label,
          fontSize: 12,
          fontWeight: 500,
          color: colors.text,
        }}
      >
        {label}
      </span>

      {/* Standard reference */}
      <span
        style={{
          fontFamily: fonts.data,
          fontSize: 11,
          color: colors.textDim,
        }}
      >
        {standard}
      </span>

      {/* Utilization bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            flex: 1,
            height: 6,
            background: colors.cardBorder,
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${clampedUtil}%`,
              height: "100%",
              background: barColor(status),
              borderRadius: 3,
              transition: "width 0.3s ease",
            }}
          />
        </div>
        <span
          style={{
            fontFamily: fonts.data,
            fontSize: 11,
            color: colors.textDim,
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {clampedUtil}%
        </span>
      </div>

      {/* Status badge */}
      <StatusBadge status={status} />
    </div>
  );
}
