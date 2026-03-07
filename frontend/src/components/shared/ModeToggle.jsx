import React from "react";
import { colors, fonts } from "../../theme/tokens";

export default function ModeToggle({ options = [], active, onChange }) {
  return (
    <div
      style={{
        display: "inline-flex",
        background: colors.cardSurface,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {options.map((option) => {
        const key = typeof option === "string" ? option : option.value;
        const label = typeof option === "string" ? option : option.label;
        const isActive = key === active;

        return (
          <button
            key={key}
            onClick={() => onChange?.(key)}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              fontFamily: fonts.label,
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s",
              background: isActive ? colors.accent : "transparent",
              color: isActive ? colors.bg : colors.textDim,
              outline: "none",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
