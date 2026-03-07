import React, { useState } from "react";
import { colors, fonts } from "../../theme/tokens";

export default function CostBreakdownBar({ layers = [] }) {
  const [hovered, setHovered] = useState(null);

  const total = layers.reduce((sum, l) => sum + (l.cost || 0), 0);
  if (total === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Stacked bar */}
      <div
        style={{
          display: "flex",
          height: 24,
          borderRadius: 6,
          overflow: "hidden",
          border: `1px solid ${colors.cardBorder}`,
          position: "relative",
        }}
      >
        {layers.map((layer, i) => {
          const pct = (layer.cost / total) * 100;
          return (
            <div
              key={layer.name || i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{
                width: `${pct}%`,
                background: layer.color || colors.accent,
                position: "relative",
                cursor: "pointer",
                transition: "opacity 0.15s",
                opacity: hovered !== null && hovered !== i ? 0.6 : 1,
              }}
            >
              {/* Tooltip */}
              {hovered === i && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 6px)",
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: colors.bg,
                    border: `1px solid ${colors.cardBorder}`,
                    borderRadius: 4,
                    padding: "4px 8px",
                    whiteSpace: "nowrap",
                    zIndex: 10,
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: fonts.label,
                      fontSize: 11,
                      color: colors.text,
                    }}
                  >
                    {layer.name}
                  </span>
                  <span
                    style={{
                      fontFamily: fonts.data,
                      fontSize: 11,
                      color: colors.textBright,
                      marginLeft: 6,
                    }}
                  >
                    ${layer.cost.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px 14px",
        }}
      >
        {layers.map((layer, i) => (
          <div
            key={layer.name || i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: layer.color || colors.accent,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: fonts.label,
                fontSize: 11,
                color: colors.textDim,
              }}
            >
              {layer.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
