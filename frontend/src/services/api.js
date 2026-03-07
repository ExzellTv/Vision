const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
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
