import React from "react";
import { colors, fonts, DISCLAIMER } from "../../theme/tokens";

export default function DisclaimerBanner({ compact = false }) {
  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "rgba(255, 159, 67, 0.1)",
          border: "1px solid rgba(255, 159, 67, 0.3)",
          borderRadius: 6,
          fontFamily: fonts.label,
          fontSize: 10,
          color: colors.warn,
          lineHeight: 1.4,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        <span style={{ flexShrink: 0 }}>&#9888;</span>
        <span
          style={{ overflow: "hidden", textOverflow: "ellipsis" }}
          title={DISCLAIMER}
        >
          {DISCLAIMER}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "12px 14px",
        background: "rgba(255, 159, 67, 0.1)",
        border: "1px solid rgba(255, 159, 67, 0.3)",
        borderRadius: 6,
        fontFamily: fonts.label,
        fontSize: 11,
        color: colors.warn,
        lineHeight: 1.5,
      }}
    >
      <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>&#9888;</span>
      <span>{DISCLAIMER}</span>
    </div>
  );
}
