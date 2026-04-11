/**
 * MyArchitectAI Integration — Photorealistic rendering from 3D screenshots.
 *
 * API: https://api.myarchitectai.com/v1/render
 * Auth: Bearer token via VITE_MYARCHITECTAI_API_KEY
 *
 * Takes a base64 PNG screenshot of the 3D house and returns a
 * photorealistic render in the selected architectural style.
 */

const API_URL = "https://api.myarchitectai.com/v1/render";

const STYLES = {
  "modern exterior": {
    label: "Modern Exterior",
    prompt: "modern exterior architectural visualization, clean lines, large windows, flat or low-slope roof, contemporary landscaping",
  },
  "contemporary": {
    label: "Contemporary",
    prompt: "contemporary residential exterior, mixed materials, warm lighting, professional architectural photography",
  },
  "traditional": {
    label: "Traditional",
    prompt: "traditional american residential exterior, brick and siding, gable roof, mature landscaping, warm sunset lighting",
  },
  "minimalist": {
    label: "Minimalist",
    prompt: "minimalist residential exterior, white walls, simple geometry, zen landscaping, soft natural light",
  },
};

export const RENDER_STYLES = Object.entries(STYLES).map(([key, val]) => ({
  key,
  label: val.label,
}));

/**
 * Send a screenshot to MyArchitectAI for photorealistic rendering.
 *
 * @param {string} screenshotBase64 - base64 PNG (with or without data URI prefix)
 * @param {string} style - one of the STYLES keys
 * @returns {Promise<{ url: string, base64?: string }>}
 */
export async function renderWithAI(screenshotBase64, style = "modern exterior") {
  const apiKey = import.meta.env.VITE_MYARCHITECTAI_API_KEY;

  if (!apiKey) {
    // Demo fallback — return the original screenshot with a filter overlay
    console.warn("[Vision] No MYARCHITECTAI_API_KEY set — using demo fallback");
    return {
      url: screenshotBase64.startsWith("data:")
        ? screenshotBase64
        : `data:image/png;base64,${screenshotBase64}`,
      demo: true,
    };
  }

  const styleConfig = STYLES[style] || STYLES["modern exterior"];

  // Strip data URI prefix if present
  const base64Clean = screenshotBase64.replace(/^data:image\/\w+;base64,/, "");

  const body = {
    image: base64Clean,
    style: styleConfig.prompt,
    output_format: "png",
    output_width: 1024,
    output_height: 1024,
  };

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    throw new Error("Rate limited — please wait a moment and try again.");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "Unknown error");
    throw new Error(`MyArchitectAI error (${response.status}): ${errText}`);
  }

  const data = await response.json();

  return {
    url: data.image_url || data.url || (data.image ? `data:image/png;base64,${data.image}` : null),
    base64: data.image || null,
    demo: false,
  };
}
