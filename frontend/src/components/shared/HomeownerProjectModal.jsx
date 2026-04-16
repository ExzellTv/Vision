import { useState, useEffect, useRef, useMemo } from "react";
import { colors, fonts, radii } from "../../theme/tokens";

/**
 * Homeowner-flow Create New Development modal.
 *
 * Two-panel layout (880 x 600):
 *   LEFT:  form (project name, location, budget) + Generate button pinned bottom.
 *   RIGHT: AI chat (Gemini) that unlocks once the three fields are complete.
 *
 * On Generate, a silent extraction call converts the conversation into
 * structured params (bedrooms/bathrooms/stories/style/targetSF/garage) and
 * hands them to the parent's onGenerate (same contract as NewProjectModal).
 */

// Cerebras Cloud inference — OpenAI-compatible chat/completions endpoint.
// Note: llama3.1-8b is text-only, so uploaded photos are dropped before the
// request goes out (see toCerebrasMessages image handling below).
const CEREBRAS_MODEL = "llama3.1-8b";
const CEREBRAS_ENDPOINT = "https://api.cerebras.ai/v1/chat/completions";

const STATE_ABBR = {
  "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
  "colorado":"CO","connecticut":"CT","delaware":"DE","florida":"FL","georgia":"GA",
  "hawaii":"HI","idaho":"ID","illinois":"IL","indiana":"IN","iowa":"IA",
  "kansas":"KS","kentucky":"KY","louisiana":"LA","maine":"ME","maryland":"MD",
  "massachusetts":"MA","michigan":"MI","minnesota":"MN","mississippi":"MS",
  "missouri":"MO","montana":"MT","nebraska":"NE","nevada":"NV",
  "new hampshire":"NH","new jersey":"NJ","new mexico":"NM","new york":"NY",
  "north carolina":"NC","north dakota":"ND","ohio":"OH","oklahoma":"OK",
  "oregon":"OR","pennsylvania":"PA","rhode island":"RI","south carolina":"SC",
  "south dakota":"SD","tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT",
  "virginia":"VA","washington":"WA","west virginia":"WV","wisconsin":"WI",
  "wyoming":"WY",
};

function Label({ children }) {
  return (
    <div style={{
      fontFamily: fonts.label,
      fontSize: 10, fontWeight: 600,
      color: "#CBD5E1",
      letterSpacing: "0.1em",
      marginBottom: 8,
      textTransform: "uppercase",
    }}>
      {children}
    </div>
  );
}

function RequiredBadge() {
  return (
    <span style={{
      fontFamily: fonts.label, fontSize: 9, fontWeight: 700,
      color: "#ef4444",
      letterSpacing: "0.1em", textTransform: "uppercase",
      marginBottom: 8,
    }}>
      required
    </span>
  );
}

function LockIcon({ size = 28, color = "#3B82F6" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function SparkleIcon({ size = 11 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 1L9.2 5.8L14 7L9.2 8.2L8 13L6.8 8.2L2 7L6.8 5.8L8 1Z" fill="#3B82F6"/>
    </svg>
  );
}

function TypingDots() {
  return (
    <>
      <style>{`
        @keyframes vision-bounce {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-3px); }
        }
      `}</style>
      <div style={{ display: "inline-flex", gap: 4, padding: "4px 2px" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: "#CBD5E1",
            display: "inline-block",
            animation: `vision-bounce 1.2s infinite ${i * 0.15}s`,
          }} />
        ))}
      </div>
    </>
  );
}

// ── Internal message format → Cerebras (OpenAI-compatible) format ────
// Internal: { role: "user" | "assistant", content: string | [{type, ...}] }
// llama3.1-8b is text-only, so any image parts are flattened into a short
// note.  If we later switch to a vision model (e.g. llama-4-scout), swap
// IMAGES_SUPPORTED to true and images will be sent as image_url parts.
const IMAGES_SUPPORTED = false;
function toCerebrasMessages(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }
    if (Array.isArray(m.content)) {
      let textOnly = "";
      let hadImage = false;
      const parts = [];
      for (const c of m.content) {
        if (c.type === "text") {
          if (IMAGES_SUPPORTED) parts.push({ type: "text", text: c.text });
          else textOnly += (textOnly ? " " : "") + c.text;
        } else if (c.type === "image") {
          hadImage = true;
          if (IMAGES_SUPPORTED) {
            const mime = c.source?.media_type || "image/jpeg";
            const data = c.source?.data || "";
            parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${data}` } });
          }
        }
      }
      if (IMAGES_SUPPORTED) {
        return { role: m.role, content: parts };
      }
      const note = hadImage ? "[I shared a photo with you, but please describe what kinds of styles I might like based on what I've told you so far.] " : "";
      return { role: m.role, content: `${note}${textOnly}`.trim() };
    }
    return { role: m.role, content: "" };
  });
}

export default function HomeownerProjectModal({ onClose, onGenerate }) {
  // ── Form fields ────────────────────────────────────────────────────────
  const [projectName, setProjectName] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");

  const [locationInput, setLocationInput] = useState("");
  const [locationValidated, setLocationValidated] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locLoading, setLocLoading] = useState(false);
  const debounceRef = useRef(null);
  const suggestBoxRef = useRef(null);

  // ── Chat state ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [chatError, setChatError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const autoGenTimerRef = useRef(null);
  const autoGenFiredRef = useRef(false);
  const fileInputRef = useRef(null);
  const threadRef = useRef(null);

  const budgetLabel = useMemo(() => {
    const min = Number(budgetMin), max = Number(budgetMax);
    if (!min || !max) return "";
    return `$${min.toLocaleString()} to $${max.toLocaleString()}`;
  }, [budgetMin, budgetMax]);

  const MIN_BUDGET = 30000;
  const isUnlocked =
    projectName.trim().length > 0 &&
    !!locationValidated &&
    Number(budgetMin) >= MIN_BUDGET &&
    Number(budgetMax) >= MIN_BUDGET &&
    Number(budgetMax) >= Number(budgetMin);

  // Gate: Generate is enabled once the AI has output a valid JSON plan, not on exchange count.
  const canGenerate = isUnlocked && pendingPlan !== null && !isExtracting && !isSending;

  // Tidy up the auto-fire timer on unmount.
  useEffect(() => () => {
    if (autoGenTimerRef.current) clearTimeout(autoGenTimerRef.current);
  }, []);

  // ── Nominatim location autocomplete ────────────────────────────────────
  useEffect(() => {
    const q = locationInput.trim();
    if (!q || locationValidated) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (q.length < 2) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLocLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&countrycodes=us&format=json&limit=6&addressdetails=1`;
        const res = await fetch(url, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        const filtered = data
          .filter((r) => {
            const a = r.address || {};
            return (a.city || a.town || a.village || a.county) && a.state;
          })
          .map((r) => {
            const a = r.address || {};
            const rawCity = a.city || a.town || a.village || a.county || "";
            const stateAbbr = STATE_ABBR[(a.state || "").toLowerCase()] || a.state || "";
            return { label: `${rawCity}, ${stateAbbr}`, city: rawCity, state: stateAbbr };
          });
        const seen = new Set();
        const dedup = filtered.filter((s) => {
          if (seen.has(s.label)) return false;
          seen.add(s.label);
          return true;
        });
        setSuggestions(dedup.slice(0, 5));
        setShowSuggestions(dedup.length > 0);
        setLocationError(dedup.length === 0 ? "Hmm, no US cities match that. Try again?" : "");
      } catch {
        setSuggestions([]);
      } finally {
        setLocLoading(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [locationInput, locationValidated]);

  useEffect(() => {
    const handler = (e) => {
      if (suggestBoxRef.current && !suggestBoxRef.current.contains(e.target))
        setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, isSending]);

  const handleSelectSuggestion = (s) => {
    setLocationInput(s.label);
    setLocationValidated({ city: s.city, state: s.state });
    setSuggestions([]);
    setShowSuggestions(false);
    setLocationError("");
  };

  // ── Cerebras API wrapper (OpenAI-compatible chat/completions) ────────
  const callGemini = async ({ systemPrompt, msgs, maxTokens = 1000 }) => {
    const apiKey = import.meta.env.VITE_CEREBRAS_API_KEY;
    if (!apiKey) {
      throw new Error("I can't find your Cerebras API key. Add VITE_CEREBRAS_API_KEY to frontend/.env and restart the dev server.");
    }
    const res = await fetch(CEREBRAS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CEREBRAS_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...toCerebrasMessages(msgs),
        ],
        max_completion_tokens: maxTokens,
        temperature: 0.8,
      }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        msg = err.error?.message || err.message || JSON.stringify(err) || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  };

  const systemPrompt = useMemo(() => (
    `You are Vision's friendly AI home design helper. You're chatting with a homeowner planning their residential build. Their project is called ${projectName}. They're building in ${locationValidated ? `${locationValidated.city}, ${locationValidated.state}` : "their city"}, and their budget is ${budgetLabel}.

Your entire job is to gather the information needed to produce a real, renderable floor plan. Only ask about things the system can actually render. Here is everything the floor plan system supports:

ROOM TYPES (use these exact strings):
bedroom, bathroom, kitchen, living, dining, garage, hallway, closet, laundry, entry, office

FURNITURE (use these exact strings only, placed inside matching rooms):
  bedroom: bed, dresser
  living: sofa, tv
  kitchen: oven, fridge
  bathroom: toilet, shower
  dining: table
  laundry: washer, dryer

STYLES (pick one): Ranch, Colonial, Modern, Craftsman, Mediterranean
GARAGE (pick one): None, 1-car, 2-car, Detached
FLOORS: 1 or 2
SIZE: total between 1500 and 5000 square feet

Chat with them like a good friend who knows home design. Be warm, curious, and encouraging. Ask about their family, daily life, how they use space, hosting habits, work from home, and design taste. If they share a photo, tell them what you notice about it. Figure out naturally whether they want a garage, whether they need a home office, and whether a second floor would suit them.

Never ask directly "how many bedrooms" or "how many bathrooms". Infer those from context. A family of four with two kids is usually 3 or 4 bedrooms. Empty nesters who host grandkids might want 2 or 3 bedrooms with a flex room.

Keep replies short, two to four sentences, and always end with one follow up question. Write like you're texting a friend. Use simple punctuation only. Do not use em dashes or any long dashes.

After 4 or 5 back and forth exchanges, once you have enough context, reply with a short friendly one or two sentence wrap up, then a fenced JSON block EXACTLY in this shape (this gets parsed by the app, so use only the exact type and furniture strings listed above):

\`\`\`json
{
  "floors": 1,
  "style": "Modern",
  "garage": "2-car",
  "total_sqft_estimate": 2200,
  "rooms": [
    {"type": "bedroom", "label": "Master Bedroom", "furniture": ["bed", "dresser"]},
    {"type": "bedroom", "label": "Bedroom 2", "furniture": ["bed"]},
    {"type": "bathroom", "label": "Master Bath", "furniture": ["shower", "toilet"]},
    {"type": "bathroom", "label": "Guest Bath", "furniture": ["toilet"]},
    {"type": "kitchen", "label": "Kitchen", "furniture": ["fridge", "oven"]},
    {"type": "living", "label": "Living Room", "furniture": ["sofa", "tv"]},
    {"type": "dining", "label": "Dining Room", "furniture": ["table"]},
    {"type": "garage", "label": "2-Car Garage", "furniture": []}
  ]
}
\`\`\`

Never invent room types, furniture, styles, or garage options that aren't in the lists above. Never output this JSON block before you have enough context about the homeowner.`
  ), [projectName, locationValidated, budgetLabel]);

  // Strip a fenced ```json block out of the AI reply and parse it.
  // Returns { plan, prose } where prose is the reply with the block removed.
  const extractPlanFromReply = (text) => {
    if (!text) return { plan: null, prose: "" };
    const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
    const bareMatch  = fenceMatch ? null : text.match(/\{[\s\S]*"rooms"[\s\S]*\}/);
    const raw = fenceMatch ? fenceMatch[1] : (bareMatch ? bareMatch[0] : null);
    if (!raw) return { plan: null, prose: text };
    try {
      const plan = JSON.parse(raw.trim());
      if (!plan || !Array.isArray(plan.rooms) || plan.rooms.length === 0) {
        return { plan: null, prose: text };
      }
      const prose = fenceMatch
        ? text.replace(/```json[\s\S]*?```/i, "").trim()
        : text.replace(bareMatch[0], "").trim();
      return { plan, prose };
    } catch {
      return { plan: null, prose: text };
    }
  };

  // Once the AI emits a plan, replace its displayed text with a friendly summary.
  const summarizePlan = (plan, prose) => {
    const rooms = plan.rooms || [];
    const bedCount  = rooms.filter((r) => r.type === "bedroom").length;
    const bathCount = rooms.filter((r) => r.type === "bathroom").length;
    const floorsWord = (plan.floors || 1) === 1 ? "single-story" : "two-story";
    const base = `Got it! I've designed a ${bedCount}-bedroom, ${bathCount}-bathroom ${floorsWord} home for you. Generating your floor plan now...`;
    return prose ? `${prose}\n\n${base}` : base;
  };

  // Hand a parsed plan to the parent, mapping it onto the existing generator's param shape.
  const handOffPlan = (plan) => {
    if (!plan) return;
    const rooms = Array.isArray(plan.rooms) ? plan.rooms : [];
    const bedCount  = rooms.filter((r) => r.type === "bedroom").length;
    const bathCount = rooms.filter((r) => r.type === "bathroom").length;
    const hasGarage = rooms.some((r) => r.type === "garage");
    const garage = plan.garage || (hasGarage ? "2-car" : "None");
    onGenerate({
      projectName,
      location: locationValidated,
      budget: { min: Number(budgetMin), max: Number(budgetMax), label: budgetLabel },
      conversationHistory: messages,
      bedrooms:  Math.min(5, Math.max(1, bedCount  || 3)),
      bathrooms: Math.min(4, Math.max(1, bathCount || 2)),
      stories:   Math.min(2, Math.max(1, Number(plan.floors) || 1)),
      style:     plan.style || "Modern",
      targetSF:  Math.min(5000, Math.max(1500, Number(plan.total_sqft_estimate) || 2200)),
      garage,
      aiSummary: "",
      // Passed through to FloorPlanEditor so furniture auto-populates on the canvas.
      aiRooms:   rooms,
    });
  };

  // ── Send a chat message ───────────────────────────────────────────────
  const handleSend = async () => {
    if (!isUnlocked || isSending) return;
    if (!input.trim() && !pendingImage) return;

    const userContent = pendingImage
      ? [
          { type: "image", source: { type: "base64", media_type: pendingImage.mediaType, data: pendingImage.data } },
          { type: "text", text: input.trim() || "Here's a photo of a style I love." },
        ]
      : input.trim();

    const newMessages = [...messages, { role: "user", content: userContent }];
    setMessages(newMessages);
    setInput("");
    setPendingImage(null);
    setChatError("");
    setIsSending(true);

    try {
      const text = await callGemini({ systemPrompt, msgs: newMessages, maxTokens: 4096 });
      const { plan, prose } = extractPlanFromReply(text);
      if (plan) {
        // AI has enough context and returned a plan. Hide the raw JSON,
        // show a friendly summary, then auto-fire Generate after a short
        // beat so the user sees the summary before the modal closes.
        const displayText = summarizePlan(plan, prose);
        setMessages([...newMessages, { role: "assistant", content: displayText }]);
        setPendingPlan(plan);
        if (autoGenTimerRef.current) clearTimeout(autoGenTimerRef.current);
        autoGenTimerRef.current = setTimeout(() => {
          if (autoGenFiredRef.current) return;
          autoGenFiredRef.current = true;
          handOffPlan(plan);
        }, 1800);
      } else {
        setMessages([...newMessages, { role: "assistant", content: text }]);
      }
    } catch (err) {
      setChatError(err.message || "Hm, I couldn't reach the AI just now. Want to try again?");
    } finally {
      setIsSending(false);
    }
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setChatError("That doesn't look like an image. Can you try a photo instead?");
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = String(evt.target?.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      setPendingImage({ data: base64, mediaType: file.type });
    };
    reader.readAsDataURL(file);
  };

  // ── Generate → hand the already-parsed plan to the parent ─────────────
  const handleGenerateClick = () => {
    if (!canGenerate || !pendingPlan) return;
    if (autoGenFiredRef.current) return;
    autoGenFiredRef.current = true;
    if (autoGenTimerRef.current) clearTimeout(autoGenTimerRef.current);
    setIsExtracting(true);
    handOffPlan(pendingPlan);
    setIsExtracting(false);
  };

  const welcomeText = "Hey! I'm Vision's AI. Tell me about your dream home. You can describe it in words, share a photo of a style you love, or just talk about your family and how you live. I'll figure out the rest!";

  // ── Message bubble renderer ───────────────────────────────────────────
  const renderMessage = (msg, idx) => {
    const isUser = msg.role === "user";
    let textPart = "";
    let hasImage = false;
    if (typeof msg.content === "string") {
      textPart = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const c of msg.content) {
        if (c.type === "text") textPart = c.text;
        if (c.type === "image") hasImage = true;
      }
    }

    return (
      <div key={idx} style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        alignItems: "flex-start",
        gap: 8,
        marginBottom: 10,
      }}>
        {!isUser && (
          <div style={{
            width: 22, height: 22, borderRadius: "50%",
            background: "rgba(59,130,246,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginTop: 2,
          }}>
            <SparkleIcon size={11} />
          </div>
        )}
        <div style={{
          maxWidth: "82%",
          padding: "10px 13px",
          borderRadius: 12,
          background: isUser ? "#3B82F6" : "#1E293B",
          color: "white",
          fontSize: 13,
          lineHeight: 1.45,
          fontFamily: fonts.label,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}>
          {hasImage && (
            <div style={{
              fontSize: 10, opacity: 0.75, marginBottom: 6,
              textTransform: "uppercase", letterSpacing: "0.08em",
            }}>
              📎 Image attached
            </div>
          )}
          {textPart}
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(7,11,18,0.85)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 880, height: 600,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 40px)",
          background: "#0F172A",
          border: "1px solid #334155",
          borderRadius: 16,
          display: "flex",
          overflow: "hidden",
          position: "relative",
          fontFamily: fonts.label,
        }}
      >
        {/* Close button (floats over both panels) */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14, zIndex: 5,
            background: "rgba(15,23,42,0.85)",
            border: "1px solid #334155",
            borderRadius: radii.md, color: "#CBD5E1",
            cursor: "pointer", width: 28, height: 28,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, lineHeight: 1,
          }}
        >
          ✕
        </button>

        {/* ─────────────── LEFT PANEL (form) ─────────────── */}
        <div style={{
          flex: 1,
          minWidth: 0,
          padding: "26px 30px 22px",
          background: "#0F172A",
          display: "flex", flexDirection: "column",
        }}>
          {/* Step badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{
              fontFamily: fonts.label, fontSize: 11, fontWeight: 700,
              color: "white", background: "#3B82F6",
              borderRadius: 4, padding: "3px 10px",
              letterSpacing: "0.06em", flexShrink: 0,
            }}>
              STEP 1
            </span>
            <div style={{ flex: 1, height: 1, background: "#334155" }} />
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: "#CBD5E1", letterSpacing: "0.1em",
              fontFamily: fonts.label, flexShrink: 0,
            }}>
              PROJECT PARAMETERS
            </span>
          </div>

          <h2 style={{
            margin: "0 0 20px", fontSize: 24, fontWeight: 700,
            color: "white", letterSpacing: "-0.4px", lineHeight: 1.2,
          }}>
            Create New Development
          </h2>

          {/* Scrollable field column so a long validation message doesn't push the button off-screen */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
            {/* Project Name */}
            <div style={{ marginBottom: 18 }}>
              <Label>Project Name</Label>
              <input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Our Forever Home"
                style={{
                  width: "100%", padding: "11px 14px",
                  background: "#1E293B", border: "1px solid #334155",
                  borderRadius: radii.lg, color: "white",
                  fontFamily: fonts.label, fontSize: 13,
                  outline: "none", boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                onBlur={(e) => (e.target.style.borderColor = "#334155")}
              />
            </div>

            {/* Location */}
            <div style={{ marginBottom: 18, position: "relative" }} ref={suggestBoxRef}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Label>Location</Label>
                <RequiredBadge />
              </div>
              <div style={{ position: "relative" }}>
                <input
                  value={locationInput}
                  onChange={(e) => { setLocationInput(e.target.value); setLocationValidated(null); }}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  placeholder="e.g. Austin, Texas"
                  style={{
                    width: "100%", padding: "11px 14px",
                    background: "#1E293B",
                    border: `1px solid ${locationValidated ? "#22c55e" : locationError ? "#ef4444" : "#334155"}`,
                    borderRadius: radii.lg, color: "white",
                    fontFamily: fonts.label, fontSize: 13,
                    outline: "none", boxSizing: "border-box",
                    paddingRight: locLoading ? 36 : 14,
                  }}
                />
                {locLoading && (
                  <span style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    color: "#CBD5E1", fontSize: 11,
                  }}>…</span>
                )}
                {locationValidated && !locLoading && (
                  <span style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    color: "#22c55e", fontSize: 16,
                  }}>✓</span>
                )}
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                  background: "#1E293B", border: "1px solid #334155",
                  borderRadius: radii.lg, zIndex: 2000, overflow: "hidden",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}>
                  {suggestions.map((s) => (
                    <div
                      key={s.label}
                      onMouseDown={() => handleSelectSuggestion(s)}
                      style={{
                        padding: "9px 14px", fontFamily: fonts.label, fontSize: 12,
                        color: "white", cursor: "pointer",
                        borderBottom: "1px solid #334155",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(59,130,246,0.12)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      📍 {s.label}
                    </div>
                  ))}
                </div>
              )}

              {locationError && !locationValidated && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#ef4444" }}>{locationError}</p>
              )}
              {!locationValidated && !locationError && locationInput.length > 0 && !locLoading && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#CBD5E1" }}>
                  Pick one from the suggestions to lock it in.
                </p>
              )}
            </div>

            {/* Budget */}
            <div style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Label>Budget</Label>
                <RequiredBadge />
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                    color: "#CBD5E1", fontSize: 13, pointerEvents: "none",
                  }}>$</span>
                  <input
                    type="number"
                    min={MIN_BUDGET}
                    step={1000}
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    placeholder="Min (30000)"
                    style={{
                      width: "100%", padding: "11px 14px 11px 22px",
                      background: "#1E293B", border: "1px solid #334155",
                      borderRadius: radii.lg, color: "white",
                      fontFamily: fonts.label, fontSize: 13,
                      outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                    onBlur={(e) => (e.target.style.borderColor = "#334155")}
                  />
                </div>
                <span style={{ color: "#CBD5E1", fontSize: 12 }}>to</span>
                <div style={{ flex: 1, position: "relative" }}>
                  <span style={{
                    position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                    color: "#CBD5E1", fontSize: 13, pointerEvents: "none",
                  }}>$</span>
                  <input
                    type="number"
                    min={MIN_BUDGET}
                    step={1000}
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    placeholder="Max (400000)"
                    style={{
                      width: "100%", padding: "11px 14px 11px 22px",
                      background: "#1E293B", border: "1px solid #334155",
                      borderRadius: radii.lg, color: "white",
                      fontFamily: fonts.label, fontSize: 13,
                      outline: "none", boxSizing: "border-box",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                    onBlur={(e) => (e.target.style.borderColor = "#334155")}
                  />
                </div>
              </div>
              {(budgetMin && Number(budgetMin) > 0 && Number(budgetMin) < MIN_BUDGET) && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#ef4444" }}>
                  Minimum budget is ${MIN_BUDGET.toLocaleString()}.
                </p>
              )}
              {(budgetMax && Number(budgetMax) > 0 && Number(budgetMax) < MIN_BUDGET) && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#ef4444" }}>
                  Max budget needs to be at least ${MIN_BUDGET.toLocaleString()}.
                </p>
              )}
              {budgetMin && budgetMax && Number(budgetMax) < Number(budgetMin) && Number(budgetMax) >= MIN_BUDGET && (
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#ef4444" }}>
                  Your max should be at least your min.
                </p>
              )}
            </div>
          </div>

          {/* Generate button pinned to bottom */}
          <div style={{ paddingTop: 14 }}>
            <style>{`
              @keyframes vision-pulse-btn {
                0%, 100% { box-shadow: 0 4px 20px rgba(37,99,235,0.45), 0 0 0 0 rgba(59,130,246,0.55); }
                50%      { box-shadow: 0 4px 26px rgba(37,99,235,0.65), 0 0 0 8px rgba(59,130,246,0); }
              }
            `}</style>
            {isUnlocked && !pendingPlan && (
              <p style={{
                margin: "0 0 10px", fontSize: 11, color: "#CBD5E1", textAlign: "center",
              }}>
                Keep chatting with me on the right. I'll let you know once I have enough to design your home.
              </p>
            )}
            {isUnlocked && pendingPlan && !isExtracting && (
              <p style={{
                margin: "0 0 10px", fontSize: 11, color: "#3B82F6", textAlign: "center", fontWeight: 600,
              }}>
                Ready to build!
              </p>
            )}
            <button
              onClick={handleGenerateClick}
              disabled={!canGenerate}
              style={{
                width: "100%", padding: 13,
                background: canGenerate
                  ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                  : "rgba(37,99,235,0.25)",
                border: "none", borderRadius: radii.lg,
                color: canGenerate ? "white" : "rgba(255,255,255,0.35)",
                fontFamily: fonts.label, fontSize: 14, fontWeight: 600,
                cursor: canGenerate ? "pointer" : "not-allowed",
                letterSpacing: "0.2px",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: canGenerate ? "0 4px 20px rgba(37,99,235,0.45)" : "none",
                animation: canGenerate ? "vision-pulse-btn 1.6s ease-in-out infinite" : "none",
                transition: "all 0.2s ease",
              }}
            >
              {isExtracting ? "Putting your vision together..." : "Generate Initial Floor Plan"}
              {!isExtracting && (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1L9.2 5.8L14 7L9.2 8.2L8 13L6.8 8.2L2 7L6.8 5.8L8 1Z" fill="currentColor"/>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* ─────────────── DIVIDER ─────────────── */}
        <div style={{ width: 1, background: "#334155", flexShrink: 0 }} />

        {/* ─────────────── RIGHT PANEL (chat) ─────────────── */}
        <div style={{
          flex: 1,
          minWidth: 0,
          background: "#0D1117",
          display: "flex", flexDirection: "column",
          position: "relative",
        }}>
          {/* Header */}
          <div style={{
            padding: "22px 26px 14px",
            flexShrink: 0,
          }}>
            <div style={{
              fontFamily: fonts.label, fontSize: 10, fontWeight: 700,
              color: "#CBD5E1", letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}>
              Tell Vision What You Want
            </div>
          </div>

          {/* Thread */}
          <div ref={threadRef} style={{
            flex: 1, minHeight: 0, overflowY: "auto",
            padding: "0 22px 8px",
            opacity: isUnlocked ? 1 : 0.4,
            transition: "opacity 0.2s ease",
          }}>
            {isUnlocked && messages.length === 0 && (
              renderMessage({ role: "assistant", content: welcomeText }, "welcome")
            )}
            {messages.map((m, i) => renderMessage(m, i))}
            {isSending && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(59,130,246,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, marginTop: 2,
                }}>
                  <SparkleIcon size={11} />
                </div>
                <div style={{
                  padding: "8px 14px", borderRadius: 12, background: "#1E293B",
                }}>
                  <TypingDots />
                </div>
              </div>
            )}
            {chatError && (
              <div style={{
                margin: "8px 0", padding: "10px 12px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.35)",
                borderRadius: 10, color: "#fca5a5", fontSize: 12,
              }}>
                {chatError}
              </div>
            )}
          </div>

          {/* Input bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 20px 18px",
            borderTop: "1px solid #334155",
            background: "#0D1117",
            flexShrink: 0,
            opacity: isUnlocked ? 1 : 0.5,
          }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!isUnlocked || isSending}
              title="Upload a photo"
              style={{
                width: 34, height: 34, borderRadius: 8,
                background: pendingImage ? "rgba(59,130,246,0.2)" : "transparent",
                border: `1px solid ${pendingImage ? "#3B82F6" : "#334155"}`,
                color: pendingImage ? "#3B82F6" : "#CBD5E1",
                cursor: isUnlocked && !isSending ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.58a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              style={{ display: "none" }}
            />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={isUnlocked ? (pendingImage ? "Tell me about this photo..." : "Describe your dream home...") : "Fill in the fields to start chatting"}
              disabled={!isUnlocked || isSending}
              style={{
                flex: 1, padding: "10px 14px",
                background: "#1E293B",
                border: "1px solid #334155",
                borderRadius: 8, color: "white",
                fontFamily: fonts.label, fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!isUnlocked || isSending || (!input.trim() && !pendingImage)}
              style={{
                padding: "0 14px", height: 34, borderRadius: 8,
                background: "#3B82F6", border: "none", color: "white",
                fontFamily: fonts.label, fontSize: 13, fontWeight: 600,
                cursor: (!isUnlocked || isSending || (!input.trim() && !pendingImage)) ? "not-allowed" : "pointer",
                opacity: (!isUnlocked || isSending || (!input.trim() && !pendingImage)) ? 0.5 : 1,
                flexShrink: 0,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              Send
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>

          {/* Lock overlay */}
          {!isUnlocked && (
            <div style={{
              position: "absolute",
              top: 52,               // below the "TELL VISION..." header
              left: 0, right: 0, bottom: 66, // above the input bar
              pointerEvents: "none",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 14, padding: 20, textAlign: "center",
            }}>
              <div style={{
                width: 58, height: 58, borderRadius: "50%",
                background: "rgba(59,130,246,0.15)",
                border: "1px solid rgba(59,130,246,0.35)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <LockIcon size={26} color="#3B82F6" />
              </div>
              <div style={{
                fontSize: 13, color: "white", fontWeight: 500,
                maxWidth: 260, lineHeight: 1.4,
              }}>
                Fill in the fields on the left and I'll be ready to chat
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
