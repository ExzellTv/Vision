import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { colors, fonts } from "../../theme/tokens";
import { chatApi } from "../../services/api";
import { findBuilder } from "../../data/builders";
import BuilderProfileModal from "../../components/shared/BuilderProfileModal";

const C = {
  bg: colors.bg,
  card: "#1a2233",
  cardBorder: "#2a3548",
  accent: "#00d4ff",
  textBright: "#f0f6ff",
  text: "#8b9db8",
  textDim: "#4a5568",
  success: "#2ed573",
};

function initials(name) {
  if (!name) return "??";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Chat() {
  const location = useLocation();
  const builderFromBrowse = location.state?.builder;

  const [activeTab, setActiveTab] = useState("active");
  const [conversations, setConversations] = useState([]);
  const [archivedConvs, setArchivedConvs] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileBuilder, setProfileBuilder] = useState(null);
  const pollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const markSeen = (convs) => {
    if (!convs?.length) return;
    const latest = convs.reduce((max, c) => {
      const t = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
      return t > max ? t : max;
    }, 0);
    if (latest > 0) localStorage.setItem("vision:chat:last_seen:homeowner", latest.toString());
  };

  // Load conversations on mount and mark as seen using server timestamps
  useEffect(() => {
    chatApi.listConversations()
      .then(convs => { setConversations(convs); markSeen(convs); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load archived when tab switches
  useEffect(() => {
    if (activeTab === "archived") {
      chatApi.listArchived().then(setArchivedConvs).catch(() => {});
    }
  }, [activeTab]);

  // Auto-select first conversation (or match builder from browse)
  useEffect(() => {
    if (loading) return;
    if (builderFromBrowse) {
      const match = conversations.find(c =>
        c.builder_id === String(builderFromBrowse.id) || c.builder_name === builderFromBrowse.name
      );
      if (match) { setSelectedConv(match); return; }
    }
    if (!selectedConv && conversations.length > 0) setSelectedConv(conversations[0]);
  }, [conversations, loading]);

  // Load messages + polling when conversation changes
  useEffect(() => {
    stopPolling();
    if (!selectedConv?.id) return;
    chatApi.getMessages(selectedConv.id).then(setMessages).catch(() => {});
    if (activeTab === "active") startPolling(selectedConv.id);
    return stopPolling;
  }, [selectedConv?.id, activeTab]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startPolling = (convId) => {
    pollRef.current = setInterval(async () => {
      try { setMessages(await chatApi.getMessages(convId)); } catch (_) {}
    }, 3000);
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedConv?.id) return;
    const text = input.trim();
    setInput("");
    setMessages(prev => [...prev, { id: `opt-${Date.now()}`, sender_role: "homeowner", text, created_at: new Date().toISOString() }]);
    try { await chatApi.sendMessage(selectedConv.id, text, "homeowner"); } catch (_) {}
  };

  const selectConv = (conv) => { setSelectedConv(conv); setMessages([]); };

  const displayList = activeTab === "active" ? conversations : archivedConvs;

  return (
    <div style={{ height: "100%", display: "flex", background: C.bg, fontFamily: fonts.label }}>
      {/* Sidebar */}
      <div style={{ width: 320, borderRight: `1px solid ${C.cardBorder}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 20px 12px", borderBottom: `1px solid ${C.cardBorder}` }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 600, color: C.textBright }}>Messages</h2>

          {/* Tab toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: 3 }}>
            {["active", "archived"].map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSelectedConv(null); setMessages([]); }}
                style={{
                  flex: 1, padding: "6px 0", border: "none", borderRadius: 6, cursor: "pointer",
                  fontFamily: fonts.label, fontSize: 12, fontWeight: 600,
                  background: activeTab === tab ? "rgba(59,130,246,0.15)" : "transparent",
                  color: activeTab === tab ? "#3b82f6" : C.textDim,
                  transition: "all 0.15s",
                }}
              >
                {tab === "active" ? "Active" : "Archived"}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Search conversations..."
            style={{ width: "100%", padding: "10px 14px", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.cardBorder}`, borderRadius: 8, color: C.textBright, fontSize: 13, fontFamily: fonts.label, outline: "none" }}
          />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && activeTab === "active" && (
            <div style={{ padding: 20, color: C.textDim, fontSize: 13 }}>Loading conversations...</div>
          )}
          {!loading && displayList.length === 0 && (
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
                {activeTab === "active"
                  ? "No active conversations yet.\nRequest a builder to get started."
                  : "No archived conversations."}
              </div>
            </div>
          )}

          {displayList.map((conv) => {
            const active = selectedConv?.id === conv.id;
            const ini = initials(conv.builder_name || "Builder");
            return (
              <div
                key={conv.id}
                onClick={() => selectConv(conv)}
                style={{
                  display: "flex", gap: 12, padding: "16px 20px", cursor: "pointer",
                  background: active ? "rgba(59,130,246,0.08)" : "transparent",
                  borderBottom: `1px solid ${C.cardBorder}`,
                  borderLeft: active ? "2px solid #3b82f6" : "2px solid transparent",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: activeTab === "archived" ? "rgba(75,85,99,0.5)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>
                  {ini}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: activeTab === "archived" ? C.textDim : C.textBright }}>
                      {conv.builder_name || "Builder"}
                    </span>
                    <span style={{ fontSize: 11, color: C.textDim }}>{timeAgo(conv.last_message_at)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: C.textDim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {conv.project_name || "Project"}
                    {activeTab === "archived" && <span style={{ color: "#f59e0b", marginLeft: 6, fontSize: 10, fontWeight: 700 }}>ARCHIVED</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {selectedConv ? (
          <>
            {/* Header */}
            <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.cardBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: activeTab === "archived" ? "rgba(75,85,99,0.5)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 700, color: "#fff",
                }}>
                  {initials(selectedConv.builder_name || "Builder")}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.textBright }}>
                    {selectedConv.builder_name || "Builder"}
                  </h3>
                  <p style={{ margin: 0, fontSize: 11, color: activeTab === "archived" ? "#f59e0b" : C.textDim }}>
                    {activeTab === "archived" ? "Archived conversation" : selectedConv.project_name}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ padding: "8px 12px", background: "transparent", border: `1px solid ${C.cardBorder}`, borderRadius: 6, color: C.text, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M1 3.5A2.5 2.5 0 0 1 3.5 1h7A2.5 2.5 0 0 1 13 3.5v5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 1 8.5v-5z" stroke={C.text} strokeWidth="1.2" />
                    <path d="M9 6l4-2v6l-4-2" stroke={C.text} strokeWidth="1.2" strokeLinejoin="round" />
                  </svg>
                  Video Call
                </button>
                <button
                  onClick={() => {
                    const found = findBuilder({ id: selectedConv.builder_id, name: selectedConv.builder_name });
                    setProfileBuilder(found || {
                      id: selectedConv.builder_id,
                      name: selectedConv.builder_name || "Builder",
                      initials: initials(selectedConv.builder_name || "Builder"),
                      description: "No additional profile details are available for this builder yet.",
                    });
                  }}
                  style={{ padding: "8px 12px", background: "transparent", border: `1px solid ${C.cardBorder}`, borderRadius: 6, color: C.text, fontSize: 12, cursor: "pointer" }}
                >
                  View Profile
                </button>
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
              {messages.map((msg) => {
                const isMe = msg.sender_role === "homeowner";
                return (
                  <div key={msg.id} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                    <div style={{
                      maxWidth: "65%", padding: "12px 16px",
                      borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: isMe ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : C.card,
                      border: isMe ? "none" : `1px solid ${C.cardBorder}`,
                      color: isMe ? "#fff" : C.textBright,
                      fontSize: 14, lineHeight: 1.5,
                    }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input — disabled on archived */}
            {activeTab === "active" ? (
              <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.cardBorder}`, background: C.card }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <button style={{ width: 40, height: 40, borderRadius: 8, background: "transparent", border: `1px solid ${C.cardBorder}`, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M15 9.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5.5" stroke={C.text} strokeWidth="1.3" strokeLinecap="round" />
                      <path d="M7 11l4-4M11 11V7h-4" stroke={C.text} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <input
                    type="text" value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Type a message..."
                    style={{ flex: 1, padding: "12px 16px", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.cardBorder}`, borderRadius: 10, color: C.textBright, fontSize: 14, fontFamily: fonts.label, outline: "none" }}
                  />
                  <button onClick={handleSend} style={{ padding: "12px 20px", background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", border: "none", borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M14 2L7 9M14 2l-4 12-3-5-5-3 12-4z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.cardBorder}`, background: C.card, textAlign: "center", fontSize: 12, color: C.textDim }}>
                This conversation is archived — read only
              </div>
            )}
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center", color: C.textDim, fontSize: 14 }}>
              {loading ? "Loading..." : "Select a conversation to start chatting"}
            </div>
          </div>
        )}
      </div>

      {profileBuilder && (
        <BuilderProfileModal
          builder={profileBuilder}
          onClose={() => setProfileBuilder(null)}
        />
      )}
    </div>
  );
}
