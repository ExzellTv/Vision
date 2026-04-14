import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { colors, fonts } from "../../theme/tokens";

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

// Sample conversations list from the builder's perspective
const CONVERSATIONS = [
  {
    id: 1,
    name: "Rosa Martinez",
    initials: "RM",
    lastMessage: "Thanks for the update on the framing!",
    time: "2m ago",
    unread: 2,
    online: true,
  },
  {
    id: 2,
    name: "David Chen",
    initials: "DC",
    lastMessage: "I'll review the new cost estimate tonight.",
    time: "1h ago",
    unread: 0,
    online: true,
  },
  {
    id: 3,
    name: "Priya Patel",
    initials: "PP",
    lastMessage: "Looking forward to seeing the finished kitchen.",
    time: "Yesterday",
    unread: 0,
    online: false,
  },
];

export default function BuilderChat() {
  const location = useLocation();
  const clientFromProject = location.state?.client;
  
  // Prevent duplicate chats if client is already in the list
  const existingConv = clientFromProject ? CONVERSATIONS.find(c => c.name === clientFromProject.name) : null;

  const [selectedConversation, setSelectedConversation] = useState(
    existingConv ? existingConv : (clientFromProject ? { id: "new", name: clientFromProject.name, initials: clientFromProject.initials } : CONVERSATIONS[0])
  );
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  // Initialize messages based on selected conversation
  useEffect(() => {
    if (clientFromProject && selectedConversation?.id === "new") {
      setMessages([
        {
          id: 1,
          role: "system",
          content: `Starting new conversation with ${clientFromProject.name}`,
        },
        {
          id: 2,
          role: "user",
          content: `Hi ${clientFromProject.name}, I wanted to reach out regarding your project. Do you have any questions about the recent report?`,
        },
      ]);
    } else {
      setMessages([
        {
          id: 1,
          role: "assistant",
          content: `Hi! Thanks, everything looks good. ${selectedConversation?.lastMessage}`,
        },
      ]);
    }
  }, [selectedConversation, clientFromProject]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = { id: Date.now(), role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    // Simulate response from the client
    setTimeout(() => {
      const responses = [
        "Sounds good to me!",
        "Let me talk it over with my partner and get back to you.",
        "When do you think you'll need a decision by?",
        "That works perfectly. Thanks for the quick update.",
      ];
      const aiMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: responses[Math.floor(Math.random() * responses.length)],
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 1000);
  };

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        background: C.bg,
        fontFamily: fonts.label,
      }}
    >
      {/* Conversations sidebar */}
      <div
        style={{
          width: 320,
          borderRight: `1px solid ${C.cardBorder}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Sidebar header */}
        <div
          style={{
            padding: "20px 20px 16px",
            borderBottom: `1px solid ${C.cardBorder}`,
          }}
        >
          <h2 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: C.textBright }}>
            Client Messages
          </h2>
          <input
            type="text"
            placeholder="Search clients..."
            style={{
              width: "100%",
              padding: "10px 14px",
              background: "rgba(0,0,0,0.3)",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 8,
              color: C.textBright,
              fontSize: 13,
              fontFamily: fonts.label,
              outline: "none",
            }}
          />
        </div>

        {/* Conversations list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* New conversation from client project page */}
          {clientFromProject && !existingConv && (
            <div
              onClick={() => setSelectedConversation({ id: "new", name: clientFromProject.name, initials: clientFromProject.initials })}
              style={{
                display: "flex",
                gap: 12,
                padding: "16px 20px",
                cursor: "pointer",
                background: selectedConversation?.id === "new" ? "rgba(0,212,255,0.08)" : "transparent",
                borderBottom: `1px solid ${C.cardBorder}`,
                borderLeft: selectedConversation?.id === "new" ? `2px solid ${C.accent}` : "2px solid transparent",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #00d4ff, #0099cc)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                {clientFromProject.initials}
                <div
                  style={{
                    position: "absolute",
                    bottom: -2,
                    right: -2,
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    background: C.success,
                    border: `2px solid ${C.bg}`,
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.textBright }}>
                    {clientFromProject.name}
                  </span>
                  <span style={{ fontSize: 11, color: C.accent }}>New</span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: C.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Start a new conversation...
                </p>
              </div>
            </div>
          )}

          {/* Existing conversations */}
          {CONVERSATIONS.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setSelectedConversation(conv)}
              style={{
                display: "flex",
                gap: 12,
                padding: "16px 20px",
                cursor: "pointer",
                background: selectedConversation?.id === conv.id ? "rgba(59,130,246,0.08)" : "transparent",
                borderBottom: `1px solid ${C.cardBorder}`,
                borderLeft: selectedConversation?.id === conv.id ? `2px solid #3b82f6` : "2px solid transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (selectedConversation?.id !== conv.id) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                }
              }}
              onMouseLeave={(e) => {
                if (selectedConversation?.id !== conv.id) {
                  e.currentTarget.style.background = "transparent";
                }
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #f59e0b, #d97706)", /* distinct color for clients */
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                  position: "relative",
                }}
              >
                {conv.initials}
                {conv.online && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: -2,
                      right: -2,
                      width: 12,
                      height: 12,
                      borderRadius: "50%",
                      background: C.success,
                      border: `2px solid ${C.bg}`,
                    }}
                  />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: conv.unread > 0 ? 700 : 500, color: C.textBright }}>
                    {conv.name}
                  </span>
                  <span style={{ fontSize: 11, color: C.textDim }}>{conv.time}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: conv.unread > 0 ? C.text : C.textDim,
                      fontWeight: conv.unread > 0 ? 500 : 400,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      flex: 1,
                    }}
                  >
                    {conv.lastMessage}
                  </p>
                  {conv.unread > 0 && (
                    <span
                      style={{
                        minWidth: 18,
                        height: 18,
                        borderRadius: 9,
                        background: "#f59e0b",
                        fontSize: 10,
                        fontWeight: 700,
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 5px",
                      }}
                    >
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Chat header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: `1px solid ${C.cardBorder}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: selectedConversation?.id === "new"
                  ? "linear-gradient(135deg, #00d4ff, #0099cc)"
                  : "linear-gradient(135deg, #f59e0b, #d97706)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {selectedConversation?.initials}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.textBright }}>
                {selectedConversation?.name}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: C.success }}>
                Online
              </p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={{
                padding: "8px 12px",
                background: "transparent",
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 6,
                color: C.text,
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 3.5A2.5 2.5 0 0 1 3.5 1h7A2.5 2.5 0 0 1 13 3.5v5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 1 8.5v-5z" stroke={C.text} strokeWidth="1.2" />
                <path d="M9 6l4-2v6l-4-2" stroke={C.text} strokeWidth="1.2" strokeLinejoin="round" />
              </svg>
              Video Call
            </button>
            <button
              style={{
                padding: "8px 12px",
                background: "transparent",
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 6,
                color: C.text,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              View Client Profile
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.map((msg) => {
            if (msg.role === "system") {
              return (
                <div
                  key={msg.id}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    color: C.textDim,
                    padding: "8px 0",
                  }}
                >
                  {msg.content}
                </div>
              );
            }
            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "65%",
                    padding: "12px 16px",
                    borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: msg.role === "user" ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : C.card,
                    border: msg.role === "user" ? "none" : `1px solid ${C.cardBorder}`,
                    color: msg.role === "user" ? "#fff" : C.textBright,
                    fontSize: 14,
                    lineHeight: 1.5,
                  }}
                >
                  {msg.content}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input area */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${C.cardBorder}`,
            background: C.card,
          }}
        >
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: "transparent",
                border: `1px solid ${C.cardBorder}`,
                color: C.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M15 9.5V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5.5" stroke={C.text} strokeWidth="1.3" strokeLinecap="round" />
                <path d="M7 11l4-4M11 11V7h-4" stroke={C.text} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Message client..."
              style={{
                flex: 1,
                padding: "12px 16px",
                background: "rgba(0,0,0,0.3)",
                border: `1px solid ${C.cardBorder}`,
                borderRadius: 10,
                color: C.textBright,
                fontSize: 14,
                fontFamily: fonts.label,
                outline: "none",
              }}
            />
            <button
              onClick={handleSend}
              style={{
                padding: "12px 20px",
                background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                border: "none",
                borderRadius: 10,
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L7 9M14 2l-4 12-3-5-5-3 12-4z" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
