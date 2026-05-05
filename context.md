# Vision — Project Context

A working notebook for engineers and reviewers landing in this repo. Captures the homeowner self-service tutorial system added on the `Redbull` branch, plus the design conventions you'll need to extend it.

## What this app is

Vision is an early-stage residential build planning tool with two distinct user types:

- **Homeowner** — non-technical, planning one home. Walks through floor plan → 3D preview → material/cost layers → land feasibility → financial summary → construction schedule, then connects to a verified builder.
- **Builder** — professional, manages multiple projects, sees engineering-mode metrics and CAD imports.

User type lives in `frontend/src/context/UserTypeContext.jsx` (persisted to `localStorage` under `vision_user_type`). Most homeowner-only behavior is gated with `const { isHomeowner } = useUserType()`.

## Repo layout

```
backend/                 FastAPI + Python services (cost prediction, image gen, etc.)
frontend/                Vite + React 18 (no Tailwind, no styled-components — inline styles)
  src/
    components/shared/   Reusable UI primitives
    context/             React contexts
    hooks/               useBreakpoint, useProjectStore, …
    screens/             One folder per route
    theme/tokens.js      Single source of truth for colors / fonts / radii
```

## Design tokens

All colors, fonts, and radii come from `frontend/src/theme/tokens.js`. Don't hardcode hex values in new components — import from there. Notable pieces:

- Background `#0d1117`, card surface `#1a2233`, accent cyan `#00d4ff`, secondary blue `#3b82f6`
- Fonts: `Inter` for labels, `JetBrains Mono` for numbers/data
- Radii: `sm 4 / md 6 / lg 8 / xl 12`

## Mobile responsiveness

There are no media queries. The pattern is:

```js
import useBreakpoint from "../../hooks/useBreakpoint";
const isMobile = useBreakpoint(768);  // or 640 for the tip system
// then conditionally style with inline objects
```

Two breakpoints in active use: **768px** for major layout shifts (NavBar, Dashboard grid) and **640px** for the tutorial overlay system below.

---

## Homeowner tutorial system (added in `Redbull`)

Goal: make the homeowner side fully self-sufficient. Two new primitives, both in `frontend/src/components/shared/`.

### `HelpTip.jsx`

A small `?` icon that opens a contextual popover.

```jsx
<HelpTip
  size={12}                              // optional, default 14
  tone="info"                            // "info" | "warn" | "muted"
  align="auto"                           // "auto" | "left" | "right" | "center"
  title="Internal Rate of Return"
  body="The yearly return your money is projected to earn …"
/>
```

Behavior:
- Desktop: anchored popover, auto-flips up if it would clip the viewport.
- Mobile (`<640px`): centered overlay with a backdrop and a "Got it" button.
- Closes on outside click, Escape, or `Got it`.
- `body` accepts a string or any React node (use JSX for multi-line / formatted content).
- Renders via `createPortal` to `document.body` at z-index 1100.

Use it for **single concepts** that need a one-line definition — domain jargon (IRR, MEP, zoning), score badges, opaque labels, anything where a homeowner would otherwise have to Google.

### `GuidedTour.jsx`

Multi-step spotlight walkthrough shown the first time a homeowner lands on a screen. Replaces the
older `FirstTimeHint` (deleted). Each step targets a real DOM element via a CSS selector, dims the
rest of the screen, draws an animated arrow at the target, and renders a tooltip card with
title/body + Back / Next / Skip controls. Auto-scrolls the target into view, re-positions on resize.

```jsx
<GuidedTour
  storageKey="develop"                   // unique per screen — used as localStorage key
  title="Floor Plan Studio"              // shown in every step header
  steps={[
    {
      // No `target` → centered modal-style step (good for intros & outros)
      title: "Welcome to your drafting table",
      body: <>Vision drafted a starter plan. We&rsquo;ll show you everything…</>,
    },
    {
      target: '[data-tour="library"]',   // CSS selector → spotlights this element
      placement: "right",                // "auto" | "top" | "bottom" | "left" | "right"
      title: "Component Library",
      body: <>Drag any tile onto the canvas to add it.</>,
    },
    {
      target: '[data-tour="story-tabs"]',
      placement: "bottom",
      title: "Multi-story homes",
      body: <>Switch between floors here.</>,
      optional: true,                    // auto-skip if target missing after 600ms
    },
  ]}
/>
```

Behavior:
- Auto-opens 350ms after mount on first visit, persisted via `localStorage["vision:tour:<storageKey>"]`.
- Keyboard nav: <kbd>←</kbd>/<kbd>→</kbd> to step, <kbd>Esc</kbd> to skip. Progress dots at bottom are clickable.
- Spotlight uses 4 dim divs around the target (no SVG mask) — pointer events still pass through inside
  the cutout, so users can try clicking the highlighted element mid-tour.
- Mobile (<640px): tooltip docks to the bottom or top of the viewport based on which half the target is in.
- Replay: dispatch `new CustomEvent("vision:tour:replay", { detail: "<storageKey>" })` to re-open the tour.
- Always wrap in `{isHomeowner && (…)}` — builders see neither tours nor tips.

#### Adding a tour to a new screen

1. Sprinkle `data-tour="my-anchor"` on the elements you want spotlighted (no styling, just the attribute).
2. Mount `<GuidedTour storageKey="…" title="…" steps={[…]} />` near the top of the screen's JSX.
3. Steps without a `target` render as centered modals — use them for the intro and outro.
4. Mark conditional UI (multi-story tabs, status panels that may not render) with `optional: true` so
   the tour silently skips them when missing.
5. Keep step body content under ~40 words. Use JSX with `<b>` for emphasis on key terms.

### `MetricCard.jsx` (extended)

Got a new `help` prop so finance KPIs can carry inline tips without restyling:

```jsx
<MetricCard
  label="Project IRR"
  value="14.2%"
  delta={2.1}
  help={isHomeowner ? { title: "…", body: "…" } : undefined}
/>
```

When `help` is provided, a small `?` appears next to the label and opens a `HelpTip`.

### Where tips currently live

Tours are gated by user type. A screen with both audiences mounts both `<GuidedTour>`s and lets
`isHomeowner` / `!isHomeowner` decide which one fires. The two tours use **different `storageKey`**s
(e.g. `edit` vs `edit-builder`) so completion state doesn't leak between roles when a user switches.

#### Homeowner

| Screen | File | GuidedTour anchors (data-tour) | HelpTip count |
|---|---|---|---|
| Dashboard | `screens/Dashboard/Dashboard.jsx` | `new-floor-plan`, `module-launchpad`, `floor-plan-module`, `recent-projects` | 2 (Score, Est. Acq. Cost) |
| Projects | `screens/Projects/ProjectsScreen.jsx` | `new-project-btn`, `project-card`, `ready-badge`, `edit-floor-plan-btn`, `schedule-btn`, `assess-land-btn` | 4+ |
| Floor Plan Editor | `screens/FloorPlanEditor/FloorPlanEditor.jsx` | `library`, `library-tabs`, `canvas`, `story-tabs`, `continue-btn` | 1 |
| 3D Preview | `screens/House3DPreview/House3DPreview.jsx` | `viewport`, `view-controls`, `wall-color`, `ai-render`, `continue-3d` | 1 |
| Layer Editor | `screens/LayerEditor/LayerEditor.jsx` | `viewport-3d`, `viz-modes`, `total-cost`, `cost-breakdown` | 1 |
| Feasibility | `screens/FeasibilityDashboard/FeasibilityDashboard.jsx` | `map`, `feas-gauge`, `score-breakdown` | 1 |
| Executive View | `screens/ExecutiveView/ExecutiveView.jsx` | `map-area`, `metric-cards`, `risk-card`, `continue-schedule` | 7 |
| Schedule | `screens/ScheduleTimeline/ScheduleTimeline.jsx` | `schedule-header`, `gantt`, `time-slider`, `phase-list` | 1 |
| Browse | `screens/Browse/Browse.jsx` | `search-bar`, `builder-card`, `verified-badge`, `view-profile-btn`, `send-request-btn` | 1 |

#### Builder

| Screen | File | storageKey | GuidedTour anchors | HelpTips |
|---|---|---|---|---|
| Builder Dashboard | `screens/BuilderDashboard/BuilderDashboard.jsx` | `builder-dashboard` | `builder-stats`, `builder-project-card`, `builder-view-project` | 3 (each stat) |
| Builder Requests | `screens/BuilderRequests/BuilderRequests.jsx` | `builder-requests` | `request-row`, `approve-btn`, `request-expansion` | 3 (3D & Plan, Financial Setup, Feasibility Scan) |
| Client Project | `screens/ClientProject/ClientProject.jsx` | `client-project` | `cp-message-client`, `cp-generate-report`, `cp-architecture`, `cp-schedule`, `cp-financial`, `cp-feasibility` | 2 (Total Budget, Spent to date) |
| Builder Reviews | `screens/BuilderReviews/BuilderReviews.jsx` | `builder-reviews` | `reviews-summary`, `review-reply` | 0 |
| Layer Editor (builder) | `screens/LayerEditor/LayerEditor.jsx` | `edit-builder` | `viz-modes`, `material-picker`, `ml-intelligence`, `cost-breakdown` | 2 (Material Picker layers, ML cluster tier) |
| 3D Preview (builder) | `screens/House3DPreview/House3DPreview.jsx` | `preview3d-builder` | `viewport`, `roof-style`, `wall-material`, `ai-render` | 2 (Roof Style, Exterior Cladding) |
| Executive View (builder) | `screens/ExecutiveView/ExecutiveView.jsx` | `executive-builder` | `exec-mode-toggle`, `metric-cards`, `financial-breakdown`, `risk-card`, `key-ratios` | 0 (existing HelpTips on metrics) |
| Schedule (builder) | `screens/ScheduleTimeline/ScheduleTimeline.jsx` | `schedule-builder` | `start-date-edit`, `view-client-model`, `gantt`, `phase-list`, `time-slider` | 0 |

### Adding a new tip

1. **Identify a complicated thing.** Don't tip everything — only domain jargon, opaque metrics, multi-step interactions. Three similar tips on one screen is the ceiling.
2. Import: `import HelpTip from "../../components/shared/HelpTip";`
3. Drop a `<HelpTip … />` adjacent to the label, gated with `{isHomeowner && (…)}`.
4. Pick a `size` that matches the surrounding font (10–12 for small caps labels, 14 for body text).
5. Keep `body` plain-English and under ~30 words. Define the term, then say what to do with it.

### Resetting tutorials in dev

Open DevTools console:

```js
// Reset all GuidedTour completions:
Object.keys(localStorage).filter(k => k.startsWith("vision:tour:")).forEach(k => localStorage.removeItem(k));
// Replay a single tour without reload:
window.dispatchEvent(new CustomEvent("vision:tour:replay", { detail: "develop" }));
```

---

## Conventions worth knowing

- **Inline styles only.** No CSS files for components, no styled-components, no Tailwind. Style objects live next to their JSX.
- **`createPortal` for overlays.** Modals, popovers, and GuidedTour all portal to `document.body`. Existing modal z-index is 1000; HelpTip popovers use 1100, GuidedTour uses 1300 to layer above everything.
- **Builder/homeowner divergence is conditional, not separate components.** Use `isHomeowner` ternaries inside the same screen rather than forking files.
- **localStorage prefix `vision:`.** Established by the chat unread-badge system — follow it for any new persisted UI state.
- **Canvas redraw on remount.** [FloorPlanEditor's](frontend/src/screens/FloorPlanEditor/FloorPlanEditor.jsx) post-mount redraw goes through `renderLatestRef` + double `requestAnimationFrame` — never `setTimeout(render, 0)` directly. The setTimeout form captures the initial `render` closure (with empty `placedItems`) and overwrites the canvas with stale state right after the placedItems-loading effect repaints it correctly. The ref + rAF defers until the loading effect has run AND layout has settled, so the deferred call uses the current closure. This is the fix for "floor 1 is blank when I come back from the 3D preview."
- **Door snap from `placedItems`.** `extractOpeningsFromPlacedItems` uses the door's *actual* edge coordinate, not a forced snap to the building's bounding box. Doors near (but not on) an exterior wall would otherwise get rewritten to sit on the bbox edge, where the cutout punched a hole through the exterior. Now they're rejected by `findWallForOpening`'s 0.75 ft tolerance instead.

## Running locally

```bash
# Frontend (Vite, port 5173)
cd frontend && npm install && npm run dev

# Backend (FastAPI)
cd backend && uvicorn app.main:app --reload
```

The frontend will start without the backend, but data-fetching screens (projects list, AI render, cost predictions) will show empty states or proxy errors.

## Floor plan generation (chat-driven)

The homeowner describes their dream home in [`HomeownerProjectModal.jsx`](frontend/src/components/shared/HomeownerProjectModal.jsx) (frontend-only chat against Cerebras `llama3.1-8b`). The model is prompted to emit a fenced JSON block listing the actual rooms the user asked for:

```json
{ "style": "Modern", "garage": "2-car", "total_sqft_estimate": 2200,
  "rooms": [{ "type": "bedroom", "label": "Master Bedroom", "furniture": ["bed","dresser"] }, …] }
```

That `rooms` array becomes `generateParams.aiRooms` in the project store. From there:

- **Layout** — [`_buildFromAiRooms`](frontend/src/screens/FloorPlanEditor/FloorPlanEditor.jsx) places those exact rooms (with their labels) into a tile-perfect footprint. The chosen `style` selects a zoning strategy: Ranch/Craftsman = public front / private back, Colonial = three horizontal strips, Modern = public column / private column, Mediterranean = hallway spine. Master suite is detected by label keywords (`master`/`primary` for the bedroom, `master bath`/`ensuite` for the bath, `walk-in` for the closet) and anchored at one end of the private zone.
- **Variation** — a seeded RNG (`_mulberry32` + `_hashSeed`) jitters aspect ratio, master-suite side L↔R, kitchen/dining order, and bedroom interleaving. Each regenerate produces a visibly different plan; the two variants in the editor get distinct seeds. The seed is stored on the returned plan so a saved layout is reproducible.
- **Multi-story** — `_splitAiRoomsByFloor` keeps public rooms + service rooms + the master suite on floor 1 and round-robins secondary bedrooms / baths / closets / offices across upper floors. Floor 2 reuses floor 1's `planSeed` so the RNG-driven zone breakpoints (front/back split, master-side, hallway widths) line up — load-bearing walls stack instead of drifting. A synthetic "Bonus Room" is injected at the head of floor 2's `aiRooms` so upstairs has a real public zone too; without it floor 2 would collapse to a single full-width column. Stairs are stamped on floor 2 at floor 1's exact coords (their all-false `bearing` array tells the wall classifier to ignore their edges, so the bonus-room slab below renders cleanly).
- **Furniture** — `buildFurnitureFromAiRooms` matches each AI room to the generated room of the same type and drops the requested furniture along its bottom edge. In 3D each piece is a composite [Three.js Group](frontend/src/lib/buildHouseGeometry.js) (sofa = base + backrest + arms + cushions; bed = mattress + headboard + pillows; toilet = bowl + tank + seat; shower = walls + glass door + showerhead; etc.) — visible via Remove Roof.
- **Stairs** — `placeStairs()` in [FloorPlanEditor.jsx](frontend/src/screens/FloorPlanEditor/FloorPlanEditor.jsx) carves a stair rect out of a hallway / kitchen / living. The 3D builder (`buildStairsFromRooms`) emits 8 ascending step boxes per stair room on the foundation story only; `_isStairPerimeterSegment` filters interior wall segments along the stair's perimeter so the staircase isn't boxed in by phantom walls (exterior segments are kept so a back-of-house stair doesn't open the building's south wall).
- **Fallback** — if `aiRooms` is missing or has fewer than 3 entries (manual dropdown demo, no chat), the original 5 style template builders run instead and the rest of the pipeline behaves as before.

## AI render

The 3D preview's "Generate AI Render" sends a viewport screenshot to Replicate. Model defined at `backend/app/services/image_generation.py:6`:

```python
FLUX_MODEL = "black-forest-labs/flux-kontext-pro"
```

Called from `frontend/src/screens/House3DPreview/House3DPreview.jsx:136` via `imageApi.renderWithFlux`.
