# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Vision** — AI-Powered Land Feasibility Intelligence Platform. A full-stack web application for building development intelligence: generate/import floor plans, customize construction materials with real-time cost feedback across 7 building layers, define construction schedules, and run feasibility analysis. Targets the Dallas, TX residential market.

Core workflow: **DEVELOP → EDIT → SCHEDULE**

## Build & Run Commands

### Backend (FastAPI + PostgreSQL)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000    # Dev server
alembic upgrade head                          # Run migrations
```

### Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev       # Dev server on :5173 (proxies /api to :8000)
npm run build     # Production build
```

### Environment
Copy `backend/.env.example` to `backend/.env` and fill in credentials. Required: `DATABASE_URL` (PostgreSQL).

## Architecture

```
V/
├── structural-intelligence-viz.jsx   # Original prototype component (standalone)
├── vision-prd-v3-updated.docx        # PRD source document
├── vision_*.png                       # UI mockup prototypes
├── backend/                           # FastAPI Python backend
│   ├── app/
│   │   ├── main.py                    # App entry, router registration, CORS
│   │   ├── config.py                  # Pydantic settings from .env
│   │   ├── database.py                # SQLAlchemy engine + Base + get_db
│   │   ├── models/                    # 9 SQLAlchemy ORM models
│   │   ├── schemas/api.py             # Pydantic request/response models
│   │   ├── services/                  # 8 pure-computation service modules
│   │   ├── routers/                   # 7 FastAPI router modules
│   │   └── seed/                      # AISC sections, zoning templates, comparable sales
│   └── alembic/                       # Database migrations
└── frontend/                          # React + Vite SPA
    ├── src/
    │   ├── App.jsx                    # Router with 6 Tier 1 routes
    │   ├── theme/tokens.js            # Design system tokens (colors, fonts, radii)
    │   ├── services/api.js            # API client for all 7 backend modules
    │   ├── components/shared/         # 10 reusable components
    │   └── screens/                   # 6 Tier 1 screen components
    └── index.html
```

## Backend Services (Strict Separation)

Each service is a standalone pure-computation module with no cross-dependencies:

| Module | File | Key Functions | PRD Section |
|--------|------|---------------|-------------|
| Structural Engine | `structural_engine.py` | `analyze()`, `get_sections()`, `compute_load_combinations()` | 4.2 |
| Layer Cost Engine | `cost_engine.py` | `calculate_layers()` | 4.3 |
| ML Cost Prediction | `ml_predictor.py` | `predict()` | 4.4 |
| Market Valuation | `market_model.py` | `estimate()` | 4.5 |
| Risk Simulator | `risk_simulator.py` | `simulate()` | 4.6 |
| Zoning Service | `zoning_service.py` | `analyze()`, `get_templates()` | 4.7 |
| Floor Plan Service | `floorplan_service.py` | `generate()` | 4.1 |
| Schedule Service | `schedule_service.py` | `create_schedule()` | 4.8 |

## Structural Engine: Critical Constraints

- **Closed-form analytical only** — `M = wL²/8`, `V = wL/2`, `Δ = 5wL⁴/(384EI)`. No FEA.
- **Solver diagnostics must be honest**: Method=Analytical, Iterations=N/A, Convergence=Exact, Residual=0.000%
- **LRFD load combinations**: 6 combos per ASCE 7-22 (LC1–LC6), governing combo auto-selected
- **AISC sections**: 7 W-shapes (W14x22 through W24x84), Fy=50 ksi, E=29000 ksi
- **Code compliance**: 6 checks (flexural, shear, deflection L/360, soil bearing, seismic drift, wind uplift)
- **SCI**: 0–10 weighted index (span 35%, stories 25%, foundation 20%, load 20%)
- All outputs are advisory — legal disclaimer required on every engineering screen

## Database Schema (PostgreSQL, 9 tables)

`projects`, `floor_plans` (JSONB), `material_selections` (7 layers per plan), `schedules` (5 phases), `structural_analyses`, `predictions`, `sections` (AISC lookup), `zoning_districts` (10 Dallas templates), `comparable_sales`

## Frontend Design System

- **Dark theme**: bg `#0d1117`, cards `#1a2233` with `1px #2a3548` border, accent `#00d4ff`
- **Typography**: JetBrains Mono for data/numbers, Inter for labels/text
- **Inline styles only** — no CSS files, matches original prototype pattern
- **Colors**: success `#2ed573`, warn `#ff9f43`, danger `#ff4757`, secondary `#3b82f6`
- **Layout**: high density, 6–8px radii, no drop shadows, 1px borders

## Tier 1 Screens (6 screens, routes in App.jsx)

| # | Screen | Route | File |
|---|--------|-------|------|
| 1 | Floor Plan Editor | `/develop` | `screens/FloorPlanEditor/` |
| 2 | Layer Editor (3D) | `/edit` | `screens/LayerEditor/` |
| 3 | Feasibility Dashboard | `/feasibility` | `screens/FeasibilityDashboard/` |
| 4 | Structural Intelligence | `/structural` | `screens/StructuralIntelligence/` |
| 5 | Executive View | `/executive` | `screens/ExecutiveView/` |
| 6 | Schedule & Timeline | `/schedule` | `screens/ScheduleTimeline/` |

## Shared Components (10 components in `components/shared/`)

NavBar, MetricCard, FeasibilityGauge, SliderControl, StatusBadge, ModeToggle, ComplianceRow, CostBreakdownBar, FeatureImportanceBars, DisclaimerBanner

## Legal Disclaimer (Mandatory)

Must appear: persistent footer on every page, banner on engineering screens, first page of PDFs, `disclaimer` field in all structural API responses. Text defined in `frontend/src/theme/tokens.js` as `DISCLAIMER` constant and in `backend/app/services/structural_engine.py` as `DISCLAIMER`.
