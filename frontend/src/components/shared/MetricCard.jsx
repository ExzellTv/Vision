import React from "react";
import { colors, fonts, card } from "../../theme/tokens";

export default function MetricCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  color = colors.textBright,
}) {
  const isPositive = typeof delta === "number" ? delta >= 0 : false;

  return (
    <div
      style={{
        ...card,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <span
        style={{
          fontFamily: fonts.label,
          fontSize: 10,
          fontWeight: 600,
          color: colors.textDim,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
        }}
      >
        {label}
      </span>

      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          style={{
            fontFamily: fonts.data,
            fontSize: 22,
            fontWeight: 700,
            color,
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: fonts.data,
              fontSize: 11,
              color: colors.textDim,
            }}
          >
            {unit}
          </span>
        )}
      </div>

      {delta != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span
            style={{
              fontFamily: fonts.data,
              fontSize: 11,
              fontWeight: 600,
              color: isPositive ? colors.success : colors.danger,
            }}
          >
            {isPositive ? "+" : ""}
            {typeof delta === "number" ? delta.toFixed(1) : delta}%
          </span>
          {deltaLabel && (
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 10,
                color: colors.textDim,
              }}
            >
              {deltaLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
