const BASE = "/api";

// Clerk token getter — injected by main.jsx after auth is ready.
// Call setTokenGetter(getToken) once inside the app.
let _getToken = null;
export function setTokenGetter(fn) {
  _getToken = fn;
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };

  // Attach Clerk JWT if available
  if (_getToken) {
    try {
      const token = await _getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
    } catch (_) {
      // Not authenticated — continue without token
    }
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || res.statusText);
  }
  return res.json();
}

// Floor Plan
export const floorplanApi = {
  generate: (params) => request("/floorplan/generate", { method: "POST", body: JSON.stringify(params) }),
  get: (id) => request(`/floorplan/${id}`),
  update: (id, data) => request(`/floorplan/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  exportDxfAll: async (storyPlans, projectName = "Vision Project") => {
    const headers = { "Content-Type": "application/json" };
    if (_getToken) {
      try {
        const token = await _getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      } catch (_) {}
    }
    const res = await fetch(`${BASE}/floorplan/export/dxf-all`, {
      method: "POST",
      headers,
      body: JSON.stringify({ story_plans: storyPlans, project_name: projectName }),
    });
    if (!res.ok) throw new Error(`DXF export failed: ${res.status}`);
    return res.blob();
  },
  exportDxf: async (floorPlan, projectName = "Vision Project") => {
    const headers = { "Content-Type": "application/json" };
    if (_getToken) {
      try {
        const token = await _getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      } catch (_) {}
    }
    const res = await fetch(`${BASE}/floorplan/export/dxf`, {
      method: "POST",
      headers,
      body: JSON.stringify({ floor_plan: floorPlan, project_name: projectName }),
    });
    if (!res.ok) throw new Error(`DXF export failed: ${res.status}`);
    return res.blob();
  },
  importModel: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const headers = {};
    if (_getToken) {
      try {
        const token = await _getToken();
        if (token) headers["Authorization"] = `Bearer ${token}`;
      } catch (_) {}
    }
    const res = await fetch(`${BASE}/floorplan/import`, {
      method: "POST",
      headers,
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Import failed: ${res.status}`);
    }
    return res.json();
  },
};

// Structural
export const structuralApi = {
  analyze: (params) => request("/structural/analyze", { method: "POST", body: JSON.stringify(params) }),
  getSections: () => request("/structural/sections"),
  getSection: (designation) => request(`/structural/sections/${designation}`),
  loadCombinations: (params) => request("/structural/load-combinations", { method: "POST", body: JSON.stringify(params) }),
};

// Cost
export const costApi = {
  calculateLayers: (data) => request("/cost/calculate-layers", { method: "POST", body: JSON.stringify(data) }),
  predict: (features) => request("/cost/predict", { method: "POST", body: JSON.stringify(features) }),
  trainModel: () => request("/cost/train", { method: "POST" }),
  modelStatus: () => request("/cost/model-status"),
  clusterAnalysis: (lat, lng) => request("/cost/cluster-analysis", { method: "POST", body: JSON.stringify({ lat, lng }) }),
};

// Market
export const marketApi = {
  estimate: (data) => request("/market/estimate", { method: "POST", body: JSON.stringify(data) }),
};

// Risk
export const riskApi = {
  simulate: (params) => request("/risk/simulate", { method: "POST", body: JSON.stringify(params) }),
};

// Zoning
export const zoningApi = {
  analyze: (params) => request("/zoning/analyze", { method: "POST", body: JSON.stringify(params) }),
  getTemplates: () => request("/zoning/templates"),
};

// Schedule
export const scheduleApi = {
  create: (specs) => request("/schedule/create", { method: "POST", body: JSON.stringify(specs) }),
  get: (id) => request(`/schedule/${id}`),
  updatePhase: (id, phase, data) =>
    request(`/schedule/${id}/phase/${phase}`, { method: "PATCH", body: JSON.stringify(data) }),
};

// Map Data (MongoDB-backed + live HasData/Redfin search)
export const mapApi = {
  getComparables:  () => request("/map/comparables"),
  getLandListings: () => request("/map/land-listings"),
  getMarketStats:  () => request("/map/market-stats"),
  searchByCity:    (city, state) =>
    request(`/map/search?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`),
};

// Compliance
// NOTE: project_id is always 1 (int) because the backend schema expects int and falls
// back to the default context when building_context is provided — per-project
// differentiation comes entirely from building_context (derived from real project data).
export const complianceApi = {
  check: (_projectId, buildingContext) => request("/compliance/check", {
    method: "POST",
    body: JSON.stringify({ project_id: 1, ...(buildingContext && { building_context: buildingContext }) }),
  }),
  diagnose: (analysisType, results, _projectId, buildingContext) => request("/compliance/ai-diagnosis", {
    method: "POST",
    body: JSON.stringify({ analysis_type: analysisType, results, project_id: 1, ...(buildingContext && { building_context: buildingContext }) }),
  }),
  fix: (violations, rooms, location) => request("/compliance/fix", {
    method: "POST",
    body: JSON.stringify({ violations, rooms, location }),
  }),
};

// Projects (MongoDB-backed, requires auth)
export const projectsApi = {
  list: () => request("/projects"),
  available: () => request("/projects/available"),
  create: (data) => request("/projects", { method: "POST", body: JSON.stringify(data) }),
  get: (id) => request(`/projects/${id}`),
  getPublic: (id) => request(`/projects/${id}/public`),
  update: (id, data) => request(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  updateSchedule: (id, schedule) => request(`/projects/${id}/schedule`, { method: "PATCH", body: JSON.stringify({ schedule }) }),
  delete: (id) => request(`/projects/${id}`, { method: "DELETE" }),
  finish: (id) => request(`/projects/${id}/finish`, { method: "PATCH" }),
  completedCount: () => request("/projects/completed-count"),
};

export const chatApi = {
  role: (role) => role || localStorage.getItem("vision_user_type") || "homeowner",
  listConversations: (role) => request(`/chat/conversations?role=${encodeURIComponent(chatApi.role(role))}`),
  listArchived: (role) => request(`/chat/conversations/archived?role=${encodeURIComponent(chatApi.role(role))}`),
  getMessages: (convId) => request(`/chat/conversations/${convId}/messages`),
  sendMessage: (convId, text, senderRole) =>
    request(`/chat/conversations/${convId}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, sender_role: senderRole }),
    }),
  archiveConversation: (convId, role) =>
    request(`/chat/conversations/${convId}/archive?role=${encodeURIComponent(chatApi.role(role))}`, { method: "PATCH" }),
  unarchiveConversation: (convId, role) =>
    request(`/chat/conversations/${convId}/unarchive?role=${encodeURIComponent(chatApi.role(role))}`, { method: "PATCH" }),
  deleteConversation: (convId, role) =>
    request(`/chat/conversations/${convId}?role=${encodeURIComponent(chatApi.role(role))}`, { method: "DELETE" }),
};

export const imageApi = {
  renderWithFlux: (screenshotBase64, style = "modern exterior") =>
    request("/image/render", {
      method: "POST",
      body: JSON.stringify({ screenshot_base64: screenshotBase64, style }),
    }),
};

export const builderRequestsApi = {
  create: (data) => request("/builder-requests", { method: "POST", body: JSON.stringify(data) }),
  list: () => request("/builder-requests"),
  allPending: () => request("/builder-requests/all-pending"),
  allApproved: () => request("/builder-requests/all-approved"),
  updateStatus: (id, status) => request(`/builder-requests/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
