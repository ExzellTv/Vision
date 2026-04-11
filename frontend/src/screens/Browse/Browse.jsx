import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  secondary: "#3b82f6",
};

// Sample builders data
const BUILDERS = [
  {
    id: 1,
    name: "Highland Custom Homes",
    company: "Highland Development Group",
    avatar: null,
    initials: "HC",
    specialty: "Luxury Residential",
    location: "Highland Park, TX",
    distance: "2.3 mi",
    rating: 4.9,
    reviews: 127,
    projectsCompleted: 84,
    verified: true,
    description: "Award-winning custom home builder specializing in luxury residences throughout the Park Cities and Preston Hollow.",
    tags: ["Luxury", "Custom Homes", "Modern"],
  },
  {
    id: 2,
    name: "Dallas Urban Builders",
    company: "DUB Construction LLC",
    avatar: null,
    initials: "DU",
    specialty: "Urban Infill",
    location: "Uptown, TX",
    distance: "4.1 mi",
    rating: 4.7,
    reviews: 89,
    projectsCompleted: 156,
    verified: true,
    description: "Experts in urban infill development and modern townhome construction in Dallas's most desirable neighborhoods.",
    tags: ["Urban", "Townhomes", "Infill"],
  },
  {
    id: 3,
    name: "Prestige Home Builders",
    company: "Prestige Residential Inc.",
    avatar: null,
    initials: "PH",
    specialty: "Estate Homes",
    location: "University Park, TX",
    distance: "3.7 mi",
    rating: 5.0,
    reviews: 42,
    projectsCompleted: 31,
    verified: true,
    description: "Boutique builder focused on estate-quality homes with exceptional craftsmanship and attention to detail.",
    tags: ["Estate", "Premium", "Craftsmanship"],
  },
  {
    id: 4,
    name: "Metro Construction Co",
    company: "Metro Builders Group",
    avatar: null,
    initials: "MC",
    specialty: "Production Homes",
    location: "Frisco, TX",
    distance: "18.5 mi",
    rating: 4.5,
    reviews: 312,
    projectsCompleted: 420,
    verified: true,
    description: "Large-scale production builder delivering quality homes across the DFW metroplex with competitive pricing.",
    tags: ["Production", "Affordable", "New Communities"],
  },
  {
    id: 5,
    name: "Artisan Home Studios",
    company: "Artisan Design Build",
    avatar: null,
    initials: "AH",
    specialty: "Modern Architecture",
    location: "Oak Lawn, TX",
    distance: "5.2 mi",
    rating: 4.8,
    reviews: 67,
    projectsCompleted: 48,
    verified: true,
    description: "Architectural design-build firm creating stunning modern homes with sustainable features and innovative design.",
    tags: ["Modern", "Sustainable", "Design-Build"],
  },
  {
    id: 6,
    name: "Heritage Homes Texas",
    company: "Heritage Construction Partners",
    avatar: null,
    initials: "HH",
    specialty: "Traditional & Transitional",
    location: "Lakewood, TX",
    distance: "6.8 mi",
    rating: 4.6,
    reviews: 94,
    projectsCompleted: 112,
    verified: false,
    description: "Family-owned builder specializing in traditional and transitional style homes with timeless appeal.",
    tags: ["Traditional", "Family-Owned", "Transitional"],
  },
];

const SPECIALTIES = ["All Specialties", "Luxury Residential", "Urban Infill", "Estate Homes", "Production Homes", "Modern Architecture", "Traditional & Transitional"];

export default function Browse() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("All Specialties");
  const [sortBy, setSortBy] = useState("distance");

  const filteredBuilders = BUILDERS
    .filter((b) => {
      const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSpecialty = selectedSpecialty === "All Specialties" || b.specialty === selectedSpecialty;
      return matchesSearch && matchesSpecialty;
    })
    .sort((a, b) => {
      if (sortBy === "distance") return parseFloat(a.distance) - parseFloat(b.distance);
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "projects") return b.projectsCompleted - a.projectsCompleted;
      return 0;
    });

  const handleChat = (builder) => {
    navigate("/chat", { state: { builder } });
  };

  return (
    <div
      style={{
        height: "100%",
        background: C.bg,
        padding: "32px",
        overflowY: "auto",
        fontFamily: fonts.label,
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: 28,
            fontWeight: 700,
            color: C.textBright,
            fontFamily: "'DM Serif Display', Georgia, serif",
          }}
        >
          Browse Builders
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: C.text }}>
          Find trusted residential builders near you in the Dallas area
        </p>
      </div>

      {/* Search/Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 24,
          padding: "16px 20px",
          background: C.card,
          border: `1px solid ${C.cardBorder}`,
          borderRadius: 10,
          flexWrap: "wrap",
        }}
      >
        {/* Search input */}
        <div style={{ flex: 1, minWidth: 240, position: "relative" }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
          >
            <circle cx="7" cy="7" r="5" stroke={C.text} strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke={C.text} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search builders, companies, or locations..."
            style={{
              width: "100%",
              padding: "10px 14px 10px 38px",
              background: "rgba(0,0,0,0.3)",
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 6,
              color: C.textBright,
              fontSize: 13,
              fontFamily: fonts.label,
              outline: "none",
            }}
          />
        </div>

        {/* Specialty filter */}
        <select
          value={selectedSpecialty}
          onChange={(e) => setSelectedSpecialty(e.target.value)}
          style={{
            padding: "10px 14px",
            background: "rgba(0,0,0,0.3)",
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 6,
            color: C.text,
            fontSize: 13,
            fontFamily: fonts.label,
            cursor: "pointer",
          }}
        >
          {SPECIALTIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          style={{
            padding: "10px 14px",
            background: "rgba(0,0,0,0.3)",
            border: `1px solid ${C.cardBorder}`,
            borderRadius: 6,
            color: C.text,
            fontSize: 13,
            fontFamily: fonts.label,
            cursor: "pointer",
          }}
        >
          <option value="distance">Nearest First</option>
          <option value="rating">Highest Rated</option>
          <option value="projects">Most Projects</option>
        </select>
      </div>

      {/* Results count */}
      <div style={{ marginBottom: 16, fontSize: 13, color: C.textDim }}>
        Showing {filteredBuilders.length} builders
      </div>

      {/* Builders list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {filteredBuilders.map((builder) => (
          <div
            key={builder.id}
            style={{
              display: "flex",
              gap: 20,
              padding: "24px",
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 12,
              transition: "border-color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.cardBorder)}
          >
            {/* Avatar */}
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 12,
                background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 24,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {builder.initials}
            </div>

            {/* Info */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: C.textBright }}>
                  {builder.name}
                </h3>
                {builder.verified && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px",
                      background: "rgba(46,213,115,0.1)",
                      border: "1px solid rgba(46,213,115,0.25)",
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      color: C.success,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2 2 4-4" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    VERIFIED
                  </div>
                )}
              </div>

              <div style={{ fontSize: 13, color: C.text, marginBottom: 8 }}>
                {builder.company}
              </div>

              <p style={{ margin: "0 0 12px", fontSize: 13, color: C.textDim, lineHeight: 1.5 }}>
                {builder.description}
              </p>

              {/* Tags */}
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {builder.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      padding: "4px 10px",
                      background: "rgba(59,130,246,0.1)",
                      border: "1px solid rgba(59,130,246,0.2)",
                      borderRadius: 4,
                      fontSize: 11,
                      color: C.secondary,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1l1.5 3.5L12 5l-2.5 2.5.5 3.5L7 9.5 4 11l.5-3.5L2 5l3.5-.5L7 1z" fill="#fbbf24" />
                  </svg>
                  <span style={{ color: C.textBright, fontWeight: 600 }}>{builder.rating}</span>
                  <span style={{ color: C.textDim }}>({builder.reviews} reviews)</span>
                </div>
                <div style={{ color: C.textDim }}>
                  <span style={{ color: C.text, fontWeight: 500 }}>{builder.projectsCompleted}</span> projects completed
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, color: C.textDim }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1C4.067 1 2.5 2.567 2.5 4.5 2.5 7 6 11 6 11s3.5-4 3.5-6.5C9.5 2.567 7.933 1 6 1z" stroke={C.text} strokeWidth="1.2" />
                    <circle cx="6" cy="4.5" r="1.5" stroke={C.text} strokeWidth="1.2" />
                  </svg>
                  {builder.distance}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
              <button
                onClick={() => handleChat(builder)}
                style={{
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                  border: "none",
                  borderRadius: 8,
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 16px rgba(59,130,246,0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M12 7c0 2.5-2.239 4.5-5 4.5-.657 0-1.283-.11-1.857-.31L2 12.5l1.1-2.643A4.252 4.252 0 0 1 2 7c0-2.5 2.239-4.5 5-4.5s5 2 5 4.5z" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Message
              </button>
              <button
                style={{
                  padding: "12px 24px",
                  background: "transparent",
                  border: `1px solid ${C.cardBorder}`,
                  borderRadius: 8,
                  color: C.text,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = C.accent;
                  e.currentTarget.style.color = C.textBright;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = C.cardBorder;
                  e.currentTarget.style.color = C.text;
                }}
              >
                View Profile
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
