import React from "react";
import { colors, fonts } from "../../theme/tokens";

const STATUS_MAP = {
  pass: { bg: colors.successDim, text: colors.success },
  warning: { bg: colors.warnDim, text: colors.warn },
  fail: { bg: colors.dangerDim, text: colors.danger },
  active: { bg: colors.accentDim, text: colors.accent },
  planned: { bg: "rgba(90, 101, 128, 0.2)", text: colors.textDim },
  complete: { bg: colors.successDim, text: colors.success },
  delayed: { bg: colors.dangerDim, text: colors.danger },
};

export default function StatusBadge({ status = "active", size = "sm" }) {
  const config = STATUS_MAP[status.toLowerCase()] || STATUS_MAP.active;
  const isLarge = size === "lg";

  return (
    <span
      style={{
        display: "inline-block",
        padding: isLarge ? "4px 10px" : "2px 8px",
        borderRadius: 999,
        background: config.bg,
        color: config.text,
        fontFamily: fonts.label,
        fontSize: isLarge ? 12 : 10,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.6px",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}
