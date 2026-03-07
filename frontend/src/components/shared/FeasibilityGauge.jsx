import React from "react";
import { colors, fonts } from "../../theme/tokens";

function getColor(score) {
  if (score < 40) return colors.danger;
  if (score < 60) return colors.warn;
  if (score < 80) return colors.accent;
  return colors.success;
}

function getRating(score) {
  if (score < 40) return "Poor";
  if (score < 60) return "Fair";
  if (score < 80) return "Good";
  return "Excellent";
}

export default function FeasibilityGauge({ score = 0, size = 120 }) {
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - clampedScore / 100);
  const color = getColor(clampedScore);
  const rating = getRating(clampedScore);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.cardBorder}
          strokeWidth={strokeWidth}
        />
        {/* Score arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>

      {/* Score text overlaid on center */}
      <div
        style={{
          position: "relative",
          marginTop: -size - 6,
          height: size,
          width: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: fonts.data,
            fontSize: size * 0.28,
            fontWeight: 700,
            color,
            lineHeight: 1,
          }}
        >
          {clampedScore}
        </span>
      </div>

      <span
        style={{
          fontFamily: fonts.label,
          fontSize: 12,
          fontWeight: 600,
          color,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {rating}
      </span>
    </div>
  );
}
