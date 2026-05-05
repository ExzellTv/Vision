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

### `FirstTimeHint.jsx`

One-shot orientation card shown the first time a homeowner lands on a screen.

```jsx
<FirstTimeHint
  storageKey="develop"                   // unique per screen
  title="Floor Plan Studio"
  steps={[
    { text: "Drag a room from the left library …" },
    { text: "Drop doors and windows onto walls …" },
    { text: "Each square on the grid is half a foot." },
  ]}
/>
```

Behavior:
- Persists via `localStorage["vision:tutorial:<storageKey>"]`. Set value to clear → user sees it again.
- Mobile: bottom-sheet that slides up. Desktop: centered modal that pops.
- Always wrap in `{isHomeowner && (…)}` — builders should never see it.

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

| Screen | File | Tips added |
|---|---|---|
| Dashboard | `screens/Dashboard/Dashboard.jsx` | FirstTimeHint + Score & Est. Acq. Cost (mobile + desktop) |
| Projects | `screens/Projects/ProjectsScreen.jsx` | FirstTimeHint + title, Layers, Ready-to-Build badge, Assess Plot of Land, Import Structural Model |
| Floor Plan Editor | `screens/FloorPlanEditor/FloorPlanEditor.jsx` | FirstTimeHint + Component Library header |
| 3D Preview | `screens/House3DPreview/House3DPreview.jsx` | FirstTimeHint + AI Render header |
| Layer Editor | `screens/LayerEditor/LayerEditor.jsx` | FirstTimeHint + Cost Breakdown header |
| Feasibility | `screens/FeasibilityDashboard/FeasibilityDashboard.jsx` | FirstTimeHint + "How Your Score Is Calculated" |
| Executive View | `screens/ExecutiveView/ExecutiveView.jsx` | FirstTimeHint + IRR, Capital Cost, Market Value, Profit Margin, Cash-on-Cash, Debt Coverage, Risk Assessment |
| Schedule | `screens/ScheduleTimeline/ScheduleTimeline.jsx` | FirstTimeHint + Construction Schedule title |
| Browse | `screens/Browse/Browse.jsx` | FirstTimeHint + Verified badge |

### Adding a new tip

1. **Identify a complicated thing.** Don't tip everything — only domain jargon, opaque metrics, multi-step interactions. Three similar tips on one screen is the ceiling.
2. Import: `import HelpTip from "../../components/shared/HelpTip";`
3. Drop a `<HelpTip … />` adjacent to the label, gated with `{isHomeowner && (…)}`.
4. Pick a `size` that matches the surrounding font (10–12 for small caps labels, 14 for body text).
5. Keep `body` plain-English and under ~30 words. Define the term, then say what to do with it.

### Adding a new screen-level intro

1. Pick a unique `storageKey` (mirror the route name: `develop`, `feasibility`, etc.).
2. Mount `<FirstTimeHint storageKey="…" title="…" steps={[…]} />` near the top of the screen's JSX, **before** the layout div.
3. Wrap in `{isHomeowner && (…)}`.
4. Keep `steps` to 3–4 entries, each one short imperative sentence.

### Resetting tutorials in dev

Open DevTools console:

```js
Object.keys(localStorage).filter(k => k.startsWith("vision:tutorial:")).forEach(k => localStorage.removeItem(k));
```

---

## Conventions worth knowing

- **Inline styles only.** No CSS files for components, no styled-components, no Tailwind. Style objects live next to their JSX.
- **`createPortal` for overlays.** Modals, popovers, and FirstTimeHints all portal to `document.body`. Existing modal z-index is 1000; the tip system uses 1100/1200 to layer above.
- **Builder/homeowner divergence is conditional, not separate components.** Use `isHomeowner` ternaries inside the same screen rather than forking files.
- **localStorage prefix `vision:`.** Established by the chat unread-badge system — follow it for any new persisted UI state.
- **No CLAUDE.md or AI-specific docs.** This file (`context.md`) is the primary onboarding doc.

## Running locally

```bash
# Frontend (Vite, port 5173)
cd frontend && npm install && npm run dev

# Backend (FastAPI)
cd backend && uvicorn app.main:app --reload
```

The frontend will start without the backend, but data-fetching screens (projects list, AI render, cost predictions) will show empty states or proxy errors.

## AI render

The 3D preview's "Generate AI Render" sends a viewport screenshot to Replicate. Model defined at `backend/app/services/image_generation.py:6`:

```python
FLUX_MODEL = "black-forest-labs/flux-kontext-pro"
```

Called from `frontend/src/screens/House3DPreview/House3DPreview.jsx:136` via `imageApi.renderWithFlux`.
