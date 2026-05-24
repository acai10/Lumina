# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Docker (recommended)

```bash
docker compose up --build   # start backend + frontend
docker compose down         # stop services
```

### Direct development

```bash
# Backend
cd backend
uv sync
uv run uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev      # port 5173
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
npm run format   # Prettier
```

### Format both sides

```bash
make format
```

---

## Architecture

Monorepo with two services:

**`backend/`** — Python 3.11, FastAPI, uv as package manager.
Handles all heavy computation: reading OCT volumes from `.h5`, applying preprocessing filter chains, running stitching algorithms, computing quantitative metrics.
Uploaded files and job results are stored in `backend/uploads/` (never commit this directory).

**`frontend/`** — React + TypeScript SPA, Vite, MUI, Three.js, Zustand.
Visualisation only (WebGL/GPU via Three.js). Job submission, status polling, and result comparison talk to the backend API via `VITE_API_URL` (set by Docker env or local `.env`).

---

## H5 Data Format

Dataset name: `"OCT"` — fixed, no guessing.
Shape: `(512, 250, 250)` — `(nSlices, height, width)` — fixed for all files.
The backend validates both constraints on upload and raises 400 otherwise.

---

## Backend Structure

```text
backend/
├── main.py                   # FastAPI app, CORS, router registration, lifespan (calls shutdown_executor on exit)
└── src/
    ├── config.py             # UPLOADS_DIR — single source of truth; reads UPLOADS_DIR env var
    ├── routers/
    │   ├── volumes.py        # POST /volumes/upload, GET /volumes/{id}/info; volume_id = filename stem
    │   ├── jobs.py           # POST /jobs/, GET /jobs/{id}
    │   └── results.py        # GET /jobs/{id}/volume/{stitcher} → raw float32 (X-Shape, X-Dtype headers)
    └── processing/
        ├── h5_reader.py      # load_volume() — reads "OCT" dataset, reshapes if flat
        ├── filters.py        # apply_filter_chain(); gaussian, median, lee, bm3d (optional), normalize, anisotropy
        ├── stitchers.py      # STITCHER_REGISTRY: phase_correlation, simpleitk_affine, elastix_bspline, bigstitcher
        ├── metrics.py        # compute_all() -> dict[str, float]: NCC, MI, MSE, Dice
        └── runner.py         # asyncio + ProcessPoolExecutor job runner; shutdown_executor() for lifespan cleanup
```

### Backend conventions

- Type hints: always use `list[dict[str, Any]]` and `dict[str, dict[str, Any]]` — never bare `list[dict]` or `dict[str, dict]`.
- Pydantic mutable defaults: always `Field(default_factory=dict)` / `Field(default_factory=list)`, never `{}` / `[]`.
- Optional heavy dependencies (`bm3d`, `itk-elastix`): listed under `[project.optional-dependencies]` in `pyproject.toml`; guarded with `try: import X except (ImportError, OSError)` inside the function that needs them.
- `UPLOADS_DIR`: import from `src.config` — never redeclare locally.
- Background tasks: pass async `run_job` directly to `background_tasks.add_task(run_job, ...)` — Starlette awaits coroutines automatically; do not wrap in `asyncio.ensure_future`.

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/volumes/upload` | Upload `.h5` file → `{ volume_id, n_slices, height, width }` |
| GET | `/volumes/{id}/info` | Volume shape/dtype |
| POST | `/jobs/` | Start job → `{ job_id }` (immediate) |
| GET | `/jobs/{id}` | Poll status + metric results |
| GET | `/jobs/{id}/volume/{stitcher}` | Raw float32 result volume |

### Job request body

```json
{
  "volume_id": "uuid",
  "filter_chain": [
    { "type": "gaussian", "params": { "sigma": 1.5 } },
    { "type": "normalize", "params": {} }
  ],
  "stitchers": ["phase_correlation", "simpleitk_affine"],
  "stitcher_params": { "phase_correlation": { "upsample_factor": 20 } }
}
```

Filter types: `"gaussian"`, `"median"`, `"lee"`, `"bm3d"`, `"normalize"`, `"anisotropy"`.
Stitcher names: `"phase_correlation"`, `"simpleitk_affine"`, `"elastix_bspline"`, `"bigstitcher"`.

---

## Frontend Architecture

View switching is state-based (`mode: 'none' | 'stl' | 'h5'` in Zustand) — no URL routing. MUI is the sole styling system; no CSS files. All colour tokens are in `frontend/src/shared/theme/palette.ts`.

Complex component styles with pseudo-selectors go in co-located `.styles.ts` files; simple 1–3 property overrides stay as inline `sx` props.

**H5 viewer flow** (local): user selects `.h5` → Web Worker runs h5wasm off main thread → per-slice normalisation → zero-copy `Float32Array` transfer → Three.js point-cloud rendering with custom GLSL3 shaders. Files are loaded sequentially (not via `Promise.all`) to avoid OOM on batch/folder uploads.

**Backend filter flow**: `PreprocessingSection` → `useFilterJob(fileKey, sourceFile)` → upload via `/volumes/upload` → POST `/jobs/` → poll `/jobs/{id}` every 2 s → GET `/jobs/{id}/volume/{stitcher}` → `normalizeVolume` → `applyBackendFilter` in Zustand.

New stitcher-comparison UI will live in `frontend/src/features/stitcher/`.

### Frontend structure

```text
frontend/src/
├── app/
│   └── store/viewerSlice.ts        # Zustand: per-file H5 state, camera, notifications
├── shared/
│   ├── api/
│   │   ├── client.ts               # uploadVolume, createJob, pollJob, fetchResultVolume
│   │   └── types.ts                # FilterStep, JobRequest, JobStatus, UploadResponse
│   ├── h5/
│   │   ├── h5Reader.ts             # loadH5FileInWorker; exports VOLUME_DIMS, PRE_FILTER_THRESHOLD
│   │   ├── h5Normalizer.ts         # normalizeVolume(raw, dims, threshold) → H5VolumeData
│   │   └── h5.worker.ts            # Web Worker entry point
│   └── three/
│       └── sceneUtils.ts           # createScene(), disposeSceneGeometry()
└── features/
    ├── controls/
    │   ├── useFilterJob.ts          # Hook: full upload→job→poll→download pipeline
    │   ├── useFilterParams.ts       # Hook: filter type + param state + buildFilterStep()
    │   ├── PreprocessingSection.tsx # Thin UI component using the two hooks above
    │   ├── SliderRow.tsx            # SliderRow + RangeSliderRow (named exports)
    │   └── renderControlLimits.ts  # RENDER_CONTROL_LIMITS; max values derived from VOLUME_DIMS
    ├── h5/H5Viewer.tsx             # Three.js point-cloud viewer; uses disposeSceneGeometry
    ├── stl/STLViewer.tsx           # Three.js STL viewer; uses disposeSceneGeometry
    └── notifications/AppSnackbar.tsx
```

### Frontend conventions

- Magic numbers: module-level named constants in the file that uses them (e.g. `POLL_INTERVAL_MS`, `SNACKBAR_DURATION_MS`). Only promote to a shared `constants.ts` if used in 3+ files.
- Custom hooks: extract side-effectful logic from components into `use*.ts` files. Hooks own state and async operations; components own only layout and event wiring.
- Three.js cleanup: call `disposeSceneGeometry(scene)` from `shared/three/sceneUtils.ts` before `disposeBase()`. Sprite materials with canvas textures need explicit disposal before that call.
- `VOLUME_DIMS` from `shared/h5/h5Reader.ts` is the single source of truth for `[512, 250, 250]` — derive all slider maxima from it, never hardcode.

---

## Conventions

- **Backend formatting**: `black` + `isort`, line-length 100. Run `cd backend && .venv/bin/black . && .venv/bin/isort .`. No bare `# type: ignore` without a comment explaining why.
- **Frontend formatting**: Prettier via `npm run format`. No new CSS files, MUI only.
- **Uploads**: `backend/uploads/` is in `.gitignore` — never commit it.
- **No test suite yet** — add tests under `backend/tests/` and `frontend/src/__tests__/` when needed.
