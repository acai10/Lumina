# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend

```bash
cd backend
uv sync                                                        # install / sync deps from uv.lock
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000   # start (port 8000)
uv run black . && uv run isort .                               # format
uv add <package>                                               # add dep (updates uv.lock — commit it)
```

### Frontend

```bash
cd frontend
npm install
npm run dev      # start dev server (port 5173)
npm run build    # tsc + vite build (TypeScript errors fail the build)
npm run lint     # eslint src/
npm run format   # prettier --write
```

### Both at once

```bash
make format   # runs black+isort (backend) and prettier (frontend)
docker compose up --build   # full stack via Docker
```

No test suite exists yet.

---

## Architecture

Two independent services, no shared code. All communication is HTTP REST.

**Frontend** (`frontend/src/`): React + TypeScript SPA. View switching is **state-based** (`mode: 'none' | 'stl' | 'h5'` in Zustand) — there is no URL routing. MUI is the sole styling system; no CSS files. All color tokens are in `shared/theme/palette.ts`; the MUI theme is in `shared/theme/theme.ts` (consumed by `main.tsx`). Complex component styles with pseudo-selectors are extracted to co-located `.styles.ts` files; simple 1–3 property overrides stay inline as `sx` props.

**Backend** (`backend/`): FastAPI. Single router at `/h5`. The uploaded volume is held in a **module-level in-memory dict** (`_volume_cache` in `src/routers/h5.py`) — only one volume is cached at a time (cache is cleared on each new upload). No database, no filesystem persistence.

---

## Key Architectural Details

**H5 upload flow**: `POST /h5/upload` reads the entire `.h5` file, calls `load_volume()` (HDF5 → numpy 3-D array), then `volume_to_slices()` (per-slice normalization → PNG → base64). All slices are returned in a single JSON response. The frontend stores them in React state as `string[]`.

**HDF5 parsing** (`src/imaging/h5_reader.py`): `load_volume()` tries multiple strategies to find a 3-D dataset — named keys (`volume`, `data`, `oct`), attribute-based reshape, sibling scalar datasets, and a heuristic OCT depth guesser. This is intentionally broad to support diverse vendor file layouts.

**H5Viewer rendering**: Stacked `THREE.PlaneGeometry` meshes, one per B-scan, with `transparent: true` / `depthWrite: false`. Camera is positioned mostly overhead `(0, maxDim×1.8, maxDim×0.4)` to minimise perspective shadow accumulation from transparent plane blending. Slice selection hides earlier planes and raises selected plane opacity to 0.9.

**Normalization**: `volume_to_slices()` normalises **per slice** (local min/max). `slice_to_base64()` (used by `GET /h5/slice/:index`) also normalises per slice. Do not switch either to global normalisation — boundary slices have lower OCT signal and would appear artificially dark.

**CORS**: configured via `CORS_ORIGINS` env var (default `http://localhost:5173`). Set it when deploying to a different origin.

**`palette.bgDeepHex`** (`0x0a0f1e`) is the Three.js integer form of `palette.bgDeep` (`#0a0f1e`). Both viewers use it for `renderer.setClearColor()`. Add new Three.js background colors here if needed — don't hardcode hex integers in viewer files.
