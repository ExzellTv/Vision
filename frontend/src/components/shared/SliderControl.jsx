import React from "react";
import { colors, fonts } from "../../theme/tokens";

const SLIDER_ID_PREFIX = "vision-slider-";
let sliderCounter = 0;

export default function SliderControl({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit = "",
  onChange,
}) {
  const [sliderId] = React.useState(() => SLIDER_ID_PREFIX + sliderCounter++);

  // Inject scoped styles for the range input thumb/track
  React.useEffect(() => {
    const styleId = "vision-slider-styles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      input[type="range"].vision-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 4px;
        border-radius: 2px;
        outline: none;
        cursor: pointer;
        background: ${colors.panelBorder};
      }
      input[type="range"].vision-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: ${colors.accent};
        border: 2px solid ${colors.bg};
        cursor: pointer;
      }
      input[type="range"].vision-slider::-moz-range-thumb {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: ${colors.accent};
        border: 2px solid ${colors.bg};
        cursor: pointer;
      }
      input[type="range"].vision-slider::-moz-range-track {
        height: 4px;
        border-radius: 2px;
        background: ${colors.panelBorder};
      }
    `;
    document.head.appendChild(style);
  }, []);

  const pct = ((value - min) / (max - min)) * 100;
  const trackBackground = `linear-gradient(to right, ${colors.accent} 0%, ${colors.accent} ${pct}%, ${colors.panelBorder} ${pct}%, ${colors.panelBorder} 100%)`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <label
          htmlFor={sliderId}
          style={{
            fontFamily: fonts.label,
            fontSize: 12,
            fontWeight: 500,
            color: colors.text,
          }}
        >
          {label}
        </label>
        <span
          style={{
            fontFamily: fonts.data,
            fontSize: 13,
            fontWeight: 600,
            color: colors.textBright,
          }}
        >
          {value}
          {unit && (
            <span style={{ fontSize: 10, color: colors.textDim, marginLeft: 2 }}>
              {unit}
            </span>
          )}
        </span>
      </div>
      <input
        id={sliderId}
        type="range"
        className="vision-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(parseFloat(e.target.value))}
        style={{ background: trackBackground }}
      />
    </div>
  );
}
