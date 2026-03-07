import React from "react";
import { colors, fonts } from "../../theme/tokens";

export default function FeatureImportanceBars({ features = [] }) {
  const sorted = [...features].sort((a, b) => b.importance - a.importance);
  const maxImportance = sorted.length > 0 ? sorted[0].importance : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map((feature, i) => {
        const pct = (feature.importance / maxImportance) * 100;
        // Fade from accent to dim as rank decreases
        const opacity = 1 - (i / sorted.length) * 0.6;

        return (
          <div
            key={feature.name}
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr 40px",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Feature label */}
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 11,
                color: colors.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {feature.name}
            </span>

            {/* Bar */}
            <div
              style={{
                height: 8,
                background: colors.cardBorder,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: colors.accent,
                  opacity,
                  borderRadius: 4,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            {/* Value */}
            <span
              style={{
                fontFamily: fonts.data,
                fontSize: 10,
                color: colors.textDim,
                textAlign: "right",
              }}
            >
              {(feature.importance * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
