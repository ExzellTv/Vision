import { useState } from "react";
import { colors, fonts, radii } from "../../theme/tokens";

function Label({ children }) {
  return (
    <div style={{
      fontFamily: fonts.label,
      fontSize: 10,
      fontWeight: 600,
      color: colors.textDim,
      letterSpacing: "0.1em",
      marginBottom: 10,
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

export default function NewProjectModal({ onClose, onGenerate }) {
  const [projectName, setProjectNameLocal] = useState("");
  const [targetSF, setTargetSF] = useState(2450);
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(2);
  const [stories, setStories] = useState(2);

  const pct = ((targetSF - 1500) / (5000 - 1500)) * 100;

  const BtnGroup = ({ options, value, onChange }) => (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "10px 4px",
            borderRadius: radii.lg,
            border: `1px solid ${value === opt.value ? colors.secondary : colors.cardBorder}`,
            background: value === opt.value ? "rgba(59,130,246,0.2)" : colors.bg,
            color: value === opt.value ? colors.secondary : colors.text,
            fontFamily: fonts.label,
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        .vision-modal-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          border-radius: 2px;
          background: linear-gradient(to right, #3b82f6 0%, #3b82f6 ${pct}%, #2a3548 ${pct}%, #2a3548 100%);
          outline: none;
          cursor: pointer;
        }
        .vision-modal-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #3b82f6;
          cursor: pointer;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.2);
        }
        .vision-modal-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: white;
          border: 2px solid #3b82f6;
          cursor: pointer;
          box-shadow: 0 0 0 4px rgba(59,130,246,0.2);
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(7,11,18,0.85)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Modal Card */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#111827",
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: "16px",
            padding: "40px 44px",
            width: 496,
            maxWidth: "92vw",
            position: "relative",
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "none",
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: radii.md,
              color: colors.textDim,
              cursor: "pointer",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ✕
          </button>

          {/* Step badge row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
            <span style={{
              fontFamily: fonts.label,
              fontSize: 11,
              fontWeight: 700,
              color: "white",
              background: colors.secondary,
              borderRadius: "4px",
              padding: "3px 10px",
              letterSpacing: "0.06em",
              flexShrink: 0,
            }}>
              STEP 1
            </span>
            <div style={{ flex: 1, height: 1, background: colors.cardBorder }} />
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: colors.textDim,
              letterSpacing: "0.1em",
              fontFamily: fonts.label,
              flexShrink: 0,
            }}>
              PROJECT PARAMETERS
            </span>
          </div>

          {/* Heading */}
          <h2 style={{
            margin: "0 0 28px",
            fontSize: 30,
            fontWeight: 700,
            color: colors.textBright,
            letterSpacing: "-0.4px",
            lineHeight: 1.2,
          }}>
            Create New Development
          </h2>

          {/* Project Name */}
          <div style={{ marginBottom: 26 }}>
            <Label>Project Name</Label>
            <input
              value={projectName}
              onChange={(e) => setProjectNameLocal(e.target.value)}
              placeholder="e.g. Skyline Residence A-1"
              style={{
                width: "100%",
                padding: "12px 16px",
                background: colors.bg,
                border: `1px solid ${colors.cardBorder}`,
                borderRadius: radii.lg,
                color: colors.text,
                fontFamily: fonts.label,
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = colors.secondary)}
              onBlur={(e) => (e.target.style.borderColor = colors.cardBorder)}
            />
          </div>

          {/* Target SF */}
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <Label>Target Square Footage</Label>
              <span style={{ fontFamily: fonts.data, fontSize: 22, fontWeight: 700, color: colors.secondary, lineHeight: 1 }}>
                {targetSF.toLocaleString()}
                <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 3, color: colors.secondary }}>sf</span>
              </span>
            </div>
            <input
              type="range"
              className="vision-modal-slider"
              min={1500}
              max={5000}
              step={50}
              value={targetSF}
              onChange={(e) => setTargetSF(Number(e.target.value))}
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
              <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.data }}>1,500 SF</span>
              <span style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.data }}>5,000 SF</span>
            </div>
          </div>

          {/* Bedrooms + Bathrooms */}
          <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>Bedrooms</Label>
              <BtnGroup
                options={[{value:1,label:"1"},{value:2,label:"2"},{value:3,label:"3"},{value:4,label:"4"},{value:5,label:"5+"}]}
                value={bedrooms}
                onChange={setBedrooms}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Label>Bathrooms</Label>
              <BtnGroup
                options={[{value:1,label:"1"},{value:2,label:"2"},{value:3,label:"3"},{value:4,label:"4+"}]}
                value={bathrooms}
                onChange={setBathrooms}
              />
            </div>
          </div>

          {/* Stories */}
          <div style={{ marginBottom: 32 }}>
            <Label>Stories</Label>
            <BtnGroup
              options={[{value:1,label:"1"},{value:2,label:"2"}]}
              value={stories}
              onChange={setStories}
            />
          </div>

          {/* CTA */}
          <button
            onClick={() => onGenerate({ projectName, targetSF, bedrooms, bathrooms, stories })}
            style={{
              width: "100%",
              padding: "15px",
              background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
              border: "none",
              borderRadius: radii.lg,
              color: "white",
              fontFamily: fonts.label,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              letterSpacing: "0.2px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "0 4px 20px rgba(37,99,235,0.45)",
            }}
          >
            Generate Initial Floor Plan
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L9.2 5.8L14 7L9.2 8.2L8 13L6.8 8.2L2 7L6.8 5.8L8 1Z" fill="white"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
