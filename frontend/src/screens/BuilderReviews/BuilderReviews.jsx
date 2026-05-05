import { useState } from "react";
import { colors, fonts, radii, card } from "../../theme/tokens";
import GuidedTour from "../../components/shared/GuidedTour";
import { useUserType } from "../../context/UserTypeContext";

const MOCK_REVIEWS = [
  {
    id: 1,
    client: "John Simmons",
    rating: 5,
    date: "March 12, 2026",
    text: "The team did a fantastic job on our newly constructed property. Their attention to detail during the framing phase really stood out and they kept us updated constantly.",
    reply: null,
  },
  {
    id: 2,
    client: "Samantha Carter",
    rating: 4,
    date: "February 28, 2026",
    text: "Overall very satisfied with the build. We had some slight delays getting the permits approved, but once construction started, they moved fast and the quality is excellent.",
    reply: "Thanks Samantha! We appreciate the understanding on the permit delays and loved building your home.",
  },
  {
    id: 3,
    client: "Ethan Wright",
    rating: 5,
    date: "February 15, 2026",
    text: "The 3D home preview tool they provided made it incredibly easy to visualize our floorplan before they even broke ground. Highly recommend them for a seamless experience.",
    reply: null,
  },
  {
    id: 4,
    client: "Oliver Nguyen",
    rating: 5,
    date: "January 22, 2026",
    text: "Absolutely stunning craftsmanship. We asked for some custom cabinetry in the kitchen during the last phase and they accommodated it without any complaints. A+ builders.",
    reply: null,
  },
];

function StarRating({ rating }) {
  return (
    <div style={{ display: "flex", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill={star <= rating ? "#f59e0b" : "rgba(255,255,255,0.1)"}
          stroke={star <= rating ? "#f59e0b" : "rgba(255,255,255,0.2)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

export default function BuilderReviews() {
  const { isBuilder } = useUserType();
  const [reviews, setReviews] = useState(MOCK_REVIEWS);
  const [replyScores, setReplyScores] = useState({});

  const handleReplySubmit = (reviewId) => {
    const text = replyScores[reviewId] || "";
    if (!text.trim()) return;

    setReviews(prev =>
      prev.map(r => (r.id === reviewId ? { ...r, reply: text } : r))
    );
    setReplyScores(prev => ({ ...prev, [reviewId]: "" }));
  };

  const averageRating = (
    reviews.reduce((acc, rev) => acc + rev.rating, 0) / reviews.length
  ).toFixed(1);

  return (
    <div
      style={{
        background: colors.bgGradient,
        fontFamily: "'Manrope', sans-serif",
        color: colors.text,
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
      }}
    >
      {/* Ambient glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: "radial-gradient(1000px 400px at 50% 0%, rgba(245,158,11,0.06) 0%, transparent 60%)",
        }}
      />

      {isBuilder && (
        <GuidedTour
          storageKey="builder-reviews"
          title="Client Reviews"
          steps={[
            {
              title: "Your reputation, in one place",
              body: (
                <>
                  Every star a past client has left you, plus the public replies you&rsquo;ve written. Your
                  rolling average drives ranking on the homeowner-facing <b>Browse Builders</b> page.
                </>
              ),
            },
            {
              target: '[data-tour="reviews-summary"]',
              placement: "bottom",
              title: "Average rating",
              body: (
                <>
                  Headline rating across all reviews, plus the count. Homeowners see this exact number
                  on your public profile &mdash; respond to negative reviews quickly to keep it healthy.
                </>
              ),
            },
            {
              target: '[data-tour="review-reply"]',
              placement: "top",
              title: "Reply once, publicly",
              body: (
                <>
                  Replies are <b>public</b> &mdash; visible on your Browse Builders profile alongside the
                  original review. Be professional; thank positive reviewers, address concerns directly
                  on negative ones. You can&rsquo;t edit a reply once submitted, so draft carefully.
                </>
              ),
              optional: true,
            },
          ]}
        />
      )}

      <main style={{ position: "relative", zIndex: 1, margin: "0 auto", width: "100%", maxWidth: "900px", padding: "40px 24px" }}>

        {/* Header Component */}
        <div style={{
          background: `linear-gradient(160deg, ${colors.panel} 0%, ${colors.surface} 100%)`,
          borderRadius: radii.lg,
          border: `1px solid ${colors.cardBorder}`,
          padding: "32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "40px",
          boxShadow: "0 14px 30px rgba(0,0,0,0.15)",
        }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: 32,
                fontWeight: 800,
                color: colors.textBright,
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
              }}
            >
              Client Reviews
            </h1>
            <p style={{ margin: 0, fontSize: "1rem", color: colors.textDim }}>
              See what your past clients are saying about your builds.
            </p>
          </div>
          <div data-tour="reviews-summary" style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", justifyContent: "flex-end" }}>
              <span style={{ fontSize: "3.5rem", fontWeight: "bold", color: colors.textBright, fontFamily: fonts.data, lineHeight: 1 }}>
                {averageRating}
              </span>
              <span style={{ fontSize: "1.25rem", color: colors.textDim }}>/ 5.0</span>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px", marginBottom: "4px" }}>
              <StarRating rating={Math.round(averageRating)} />
            </div>
            <div style={{ fontSize: "0.875rem", color: colors.textDim }}>
              Based on {reviews.length} reviews
            </div>
          </div>
        </div>

        {/* Reviews List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {reviews.map((review, reviewIdx) => (
            <div
              key={review.id}
              data-tour={reviewIdx === 0 && !review.reply ? "review-reply" : undefined}
              style={{
                ...card,
                padding: "24px",
                borderRadius: radii.md,
                background: "rgba(13, 17, 23, 0.4)",
                border: `1px solid ${colors.cardBorder}`,
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontWeight: "bold",
                    fontSize: "1.125rem",
                  }}>
                    {review.client.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <div style={{ fontSize: "1.125rem", fontWeight: "bold", color: colors.textBright }}>
                      {review.client}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: colors.textDim }}>
                      {review.date}
                    </div>
                  </div>
                </div>
                <StarRating rating={review.rating} />
              </div>

              <div style={{ fontSize: "1rem", color: colors.textBright, lineHeight: 1.6 }}>
                "{review.text}"
              </div>

              {/* Reply Section */}
              <div style={{ borderTop: `1px solid ${colors.cardBorder}`, paddingTop: "16px", marginTop: "8px" }}>
                {review.reply ? (
                  <div style={{ display: "flex", gap: "12px" }}>
                    <div style={{ width: "2px", background: colors.accent, borderRadius: "2px" }} />
                    <div>
                      <div style={{ fontSize: "0.875rem", fontWeight: "bold", color: colors.accent, marginBottom: "4px" }}>
                        Your Reply
                      </div>
                      <div style={{ fontSize: "0.95rem", color: colors.textDim, lineHeight: 1.5 }}>
                        {review.reply}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                    <input
                      type="text"
                      placeholder="Write a public reply..."
                      value={replyScores[review.id] || ""}
                      onChange={(e) => setReplyScores({ ...replyScores, [review.id]: e.target.value })}
                      style={{
                        flex: 1,
                        padding: "10px 14px",
                        background: "rgba(0,0,0,0.2)",
                        border: `1px solid ${colors.cardBorder}`,
                        borderRadius: radii.md,
                        color: colors.textBright,
                        fontSize: "0.875rem",
                        fontFamily: fonts.label,
                        outline: "none",
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleReplySubmit(review.id);
                      }}
                    />
                    <button
                      onClick={() => handleReplySubmit(review.id)}
                      disabled={!(replyScores[review.id] || "").trim()}
                      style={{
                        padding: "10px 20px",
                        background: (replyScores[review.id] || "").trim() ? "linear-gradient(135deg, #3b82f6, #1d4ed8)" : "rgba(255,255,255,0.05)",
                        border: "none",
                        borderRadius: radii.md,
                        color: (replyScores[review.id] || "").trim() ? "#fff" : colors.textDim,
                        fontWeight: "bold",
                        cursor: (replyScores[review.id] || "").trim() ? "pointer" : "not-allowed",
                        transition: "all 0.2s ease",
                      }}
                    >
                      Reply
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
