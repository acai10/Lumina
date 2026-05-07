# Lumina — Claude Code Project Guide

## Project Overview

Browser-based medical imaging viewer. React + TypeScript frontend, Python FastAPI backend. No shared code between them — all communication via HTTP REST.

Supported formats: `.h5` (OCT volumetric C-scan, HDF5) and `.stl` (3D surface mesh).

---

## Stack

### Frontend (`frontend/`)
- **React 18** + **TypeScript** + **Vite**
- **MUI v6** — component library and sole styling system (no CSS files)
- **Three.js** — 3D rendering for STL and H5 viewers
- **Zustand** — global state (`mode`, `h5Meta`, `currentSliceIndex`, `isLoading`)
- **Emotion** — MUI's CSS-in-JS engine (installed as peer dep, not used directly)

### Backend (`backend/`)
- **FastAPI** + **Uvicorn**
- **h5py** + **numpy** — HDF5 reading and array processing
- **Pillow** — PNG encoding for base64 slice responses
- **uv** — package manager (`uv sync` installs from `uv.lock`)

---

## Dev Commands

### Docker (recommended)
```bash
docker compose up --build   # first run
docker compose up           # subsequent runs
docker compose down
```

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8000      |
| API Docs | http://localhost:8000/docs |

### Local — Backend
```bash
cd backend
uv sync                                                        # install deps
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000   # start
uv run black . && uv run isort .                               # format
```

### Local — Frontend
```bash
cd frontend
npm install         # install deps
npm run dev         # start (http://localhost:5173)
npm run build       # production build + TypeScript check
npm run format      # prettier
```

### Format both at once
```bash
make format
```

---

## Architecture

```
Lumina/
├── frontend/src/
│   ├── App.tsx                         # root — toolbar, file upload, viewer switching
│   ├── app/
│   │   ├── store/viewerSlice.ts        # Zustand store
│   │   └── App.styles.ts               # shared glowSx for toolbar buttons
│   ├── features/
│   │   ├── stl/STLViewer.tsx           # Three.js STL renderer
│   │   └── h5/
│   │       ├── H5Viewer.tsx            # Three.js H5 volume renderer (stacked planes)
│   │       ├── SliceSlider.tsx         # vertical MUI Slider for slice selection
│   │       └── SliceSlider.styles.ts   # Slider + IconButton sx objects
│   └── shared/
│       ├── api/octAPI.ts               # uploadH5() — POST /h5/upload
│       ├── theme/
│       │   ├── palette.ts              # all color tokens (strings + bgDeepHex for Three.js)
│       │   └── theme.ts                # MUI createTheme() using palette
│       └── types/viewer.types.ts       # H5Meta, H5UploadResponse
└── backend/src/
    ├── routers/h5.py                   # POST /h5/upload → returns slices + meta
    └── imaging/h5_reader.py            # load_volume(), volume_to_slices(), slice_to_base64()
```

---

## Styling Conventions

All styling uses **MUI `sx` prop** only. No CSS files (except a minimal `index.css` if needed for html/body resets).

**Decision rule for `.styles.ts` extraction:**
- Extract when a component has **more than 3–4 non-trivial style rules** OR pseudo-selectors (`:hover`, MUI slot overrides).
- Keep inline with `sx` when 1–3 simple properties.

**Color tokens** live in `shared/theme/palette.ts`. Use them everywhere — no hardcoded hex strings in components. Three.js integer colors use `palette.bgDeepHex` (`0x0a0f1e`). Single-use rendering-specific lighting values (hemisphere, rim lights in STLViewer) stay hardcoded — they are rendering constants, not UI colors.

**No `routes.ts`** — this is a SPA with state-based view switching (`mode: 'none' | 'stl' | 'h5'`), no URL routing.

---

## Key Files

| File | Role |
|---|---|
| `shared/theme/palette.ts` | Single source of truth for all UI colors |
| `shared/theme/theme.ts` | MUI ThemeProvider config — imported by `main.tsx` |
| `app/store/viewerSlice.ts` | All viewer state — mode, slice index, loading |
| `shared/api/octAPI.ts` | Only API call: `uploadH5(file)` → `H5UploadResponse` |
| `imaging/h5_reader.py` | HDF5 → numpy → base64 PNG; `volume_to_slices()` normalizes per-slice |

---

## Backend API

`POST /h5/upload` — multipart form, field `file`, accepts `.h5`.

Response:
```json
{
  "n_slices": 128,
  "width": 512,
  "height": 496,
  "slices": ["data:image/png;base64,...", "..."]
}
```

The frontend maps `snake_case` → `camelCase` in `octAPI.ts`.

---

## Known Rendering Details (H5Viewer)

- Planes are `PlaneGeometry(volW, volH)`, rotated flat (`rotation.x = π/2`), stacked in Y.
- `totalDepth = volH * 0.8` — stack spacing.
- Camera at `(0, maxDim * 1.8, maxDim * 0.4)` — mostly overhead to minimize perspective shadow accumulation from `depthWrite: false` transparent blending.
- `PLANE_OPACITY_ALL = 0.1`, `PLANE_OPACITY_SELECTED = 0.9`.
- Slices before the selected index are hidden (`visible = false`); slices after are shown at 0.1 opacity.

---

## Dependencies

### Backend (`pyproject.toml`)

| Package | Purpose |
|---|---|
| `fastapi` | REST framework |
| `uvicorn[standard]` | ASGI server |
| `python-multipart` | file upload |
| `h5py` | HDF5 reading |
| `numpy` | array processing |
| `Pillow` | PNG encoding |
| `black`, `isort` *(dev)* | formatting |

### Frontend (`package.json`)

| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI |
| `three` | 3D rendering |
| `@mui/material` | components + styling |
| `@emotion/react` + `@emotion/styled` | MUI CSS-in-JS engine |
| `zustand` | state management |
| `vite` | build tool |
| `typescript` | type safety |
| `prettier` | formatting |
