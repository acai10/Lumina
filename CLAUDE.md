# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentation

Comprehensive, domain-by-domain documentation lives in [`docs/`](docs/README.md) —
one file per domain (architecture, ingestion, normalization/rendering, filters,
slice viewer & measurements, cropping, annotation, stitching, jobs/sessions, STL,
frontend shell, API reference). Each explains the features, the functions behind
them, and **every formula** with variable definitions and worked numeric examples.
Start at [`docs/README.md`](docs/README.md). When you change behaviour or a formula,
update the matching `docs/` file.

The backend also serves auto-generated, always-accurate API docs from the running
app: Swagger UI at `/docs`, ReDoc at `/redoc`, and the raw schema at
`/openapi.json`. These are generated from the route decorators (`summary`/
`description`), the Pydantic schemas, and the app-level `description`/`openapi_tags`
in `backend/main.py` — keep those current so the live docs never drift.

## Commands

### Docker (recommended)

```bash
docker compose up --build   # start backend + frontend
docker compose down         # stop services
```

#### Loading local source volumes by path (no upload)

To make on-disk `.h5` files selectable via **Load H5 → From server…** (registered by
path, zero-copy, no ~128 MB upload), point the backend at the host directory holding them
via a `.env` file next to `docker-compose.yml` (cross-platform — Compose reads `.env`
automatically, so no inline shell vars that only work on bash):

```bash
cp .env.example .env          # Windows: copy .env.example .env
# then edit LUMINA_DATA_DIR in .env to the absolute path of your .h5 folder, e.g.
#   LUMINA_DATA_DIR=/Users/you/oct-data   (macOS/Linux)
#   LUMINA_DATA_DIR=C:\Users\you\oct-data  (Windows)
docker compose up --build
```

The directory is bind-mounted read-only at `/data` (`DATA_DIR=/data`), so originals are
never modified. Running the backend directly (without Docker) needs only `DATA_DIR=…`, no
mount. The classic upload path works regardless.

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

### Backend quality tools

```bash
cd backend
uv run ruff check src/          # lint (includes unused-import, print() detection)
uv run ruff check src/ --fix    # auto-fix safe issues
uv run mypy src/                # type checking
uv run pytest                   # run test suite
make format                     # black + isort (both sides)
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
├── main.py                   # FastAPI app, CORS (from settings), router registration, lifespan
├── show_submission.py        # CLI: print a built submission .h5 (structure + stats)
├── tests/
│   ├── conftest.py           # TestClient fixture
│   ├── test_config.py        # Settings: comma-separated + JSON CORS_ORIGINS (env & .env)
│   ├── test_filters.py       # Unit tests for apply_filter_chain()
│   ├── test_h5_reader.py     # validate/load/reshape guards at the upload boundary
│   ├── test_metrics.py       # Unit tests for NCC/MI/MSE/Dice
│   ├── test_job_store.py     # Unit tests for JobStore
│   ├── test_jobs_sessions_api.py # jobs/sessions/cleanup routers: fail-fast validation paths
│   ├── test_crop.py          # Crop endpoint: dims, bounds, non-destructiveness
│   ├── test_measurements.py  # compute_measurements(): volume/area/thickness/diameter
│   ├── test_multi_volume.py  # register_pair, merge_volumes, global offsets, overlap
│   ├── test_normalizer.py    # normalize_for_frontend + pack/save/load roundtrip
│   ├── test_submission.py    # surface/mask extraction + .h5 writer format
│   ├── test_volume_cache.py  # LRU cache: hits, mtime invalidation, eviction, size cap
│   ├── test_volumes_api.py   # upload/register/filter endpoints incl. traversal + id collision
│   └── test_mask_endpoint.py # POST /volumes/{id}/mask (standalone segmentation)
└── src/
    ├── config.py             # Pydantic BaseSettings: uploads_dir, cors_origins, data_dir (env vars)
    ├── schemas/
    │   ├── enums.py          # JobStatus (str Enum): PENDING, RUNNING, DONE, ERROR
    │   ├── jobs.py           # FilterStep, FilterRequest, JobRequest, JobCreated, JobStatusResponse
    │   ├── sessions.py       # VolumeEntry, SessionRequest, SessionStatusResponse
    │   ├── submission.py     # SubmissionRequest/Response + MaskResponse (challenge .h5 build)
    │   └── volumes.py        # UploadResponse, LocalVolume, Register(Batch)Request
    ├── routers/
    │   ├── volumes.py        # upload, register(-batch), normalized, filter
    │   ├── jobs.py           # POST /jobs/ (201), GET /jobs/{id}
    │   ├── results.py        # GET /jobs/{id}/volume/{stitcher} → normalised binary
    │   ├── sessions.py       # POST+GET /sessions/, /merged, POST /filter
    │   ├── measurements.py   # POST /volumes/{id}/measure
    │   ├── crop.py           # POST /volumes/{id}/crop → new independent sub-volume
    │   ├── submission.py     # POST /volumes/{id}/submission (challenge) + /mask (segmentation)
    │   └── cleanup.py        # DELETE /cleanup
    └── processing/
        ├── h5_reader.py      # load_volume(), load_volume_flexible(), OCT_DIMS constant
        ├── filters.py        # apply_filter_chain(); _FILTER_REGISTRY
        ├── stitchers.py      # STITCHER_REGISTRY: phase_correlation, simpleitk_affine, elastix_bspline, bigstitcher
        ├── multi_volume.py   # MIP, phase/cross correlation, global offsets, merge
        ├── normalizer.py     # normalize_for_frontend(); pack_arrays/save/load_packed
        ├── measurements.py   # compute_measurements(): area, volume, thickness, diameter
        ├── metrics.py        # compute_all() -> dict[str, float]: NCC, MI, MSE, RMSE, Dice
        ├── submission.py     # extract_surface/segment_muscle_fat/write_submission (challenge)
        ├── volume_cache.py   # load_volume_cached(): thread-safe LRU of decoded volumes
        ├── runner.py         # JobStore class + job_store singleton; async run_job
        └── session_runner.py # SessionStore + session_store singleton; async run_session
```

### Backend conventions

- **Config**: Import `from src.config import settings` everywhere. Use `settings.uploads_dir` and `settings.cors_origins`. Never redeclare env var reads.
- **Job status**: Always use `JobStatus.PENDING` / `.RUNNING` / `.DONE` / `.ERROR` from `src.schemas.enums`. Never compare against raw strings.
- **Type hints**: Always use `list[dict[str, Any]]` and `dict[str, dict[str, Any]]` — never bare `list[dict]` or `dict[str, dict]`.
- **Pydantic mutable defaults**: Always `Field(default_factory=dict)` / `Field(default_factory=list)`, never `{}` / `[]`.
- **Optional heavy dependencies** (`itk-elastix`): listed under `[project.optional-dependencies]`; guarded with `try: import X except (ImportError, OSError)` inside the function.
- **Logging**: Every module in `src/processing/` uses `logger = logging.getLogger(__name__)`. No `print()` anywhere — ruff rule T201 catches this.
- **Docstrings**: Google style for all public functions. Sections: Args, Returns, Raises.
- **Background tasks**: Pass async `run_job` directly to `background_tasks.add_task(run_job, ...)` — Starlette awaits coroutines automatically.

### API endpoints

| Method | Path | Status | Description |
| --- | --- | --- | --- |
| POST | `/volumes/upload` | 200 | Upload `.h5` → `{ volume_id, n_slices, height, width }` |
| GET | `/volumes/local` | 200 | List `.h5` files under `data_dir` (relative path + name) |
| POST | `/volumes/register` · `/volumes/register-batch` | 200 | Register local file(s) by path (zero-copy, no upload) |
| GET | `/volumes/{id}/normalized` | 200 | Render-ready normalised binary |
| POST | `/volumes/{id}/filter` | 200 | Apply filter chain → normalised binary (no stitch/metrics) |
| POST | `/volumes/{id}/measure` | 200 | Geometric measurements |
| POST | `/volumes/{id}/crop` | 200 | Extract sub-volume (x/y/z + w/h/d) → new volume id; non-destructive, persisted + cached |
| POST | `/volumes/{id}/submission` | 200 | Build challenge `.h5` (surface + optional tissue mask) + base64 PNG previews + stats |
| POST | `/volumes/{id}/mask` | 200 | Standalone muscle/fat segmentation → base64 PNG + muscle % (no file written) |
| POST | `/jobs/` | **201** | Start job → `{ job_id }` (immediate) |
| GET | `/jobs/{id}` | 200 | Poll status + metric results |
| GET | `/jobs/{id}/volume/{stitcher}` | 200 | Normalised binary result volume |
| POST/GET | `/sessions/` · `/sessions/{id}` | 200/201 | Multi-volume stitch session + poll |
| GET | `/sessions/{id}/merged` | 200 | Merged volume |
| POST | `/sessions/{id}/filter` | 200 | Filter the merged volume |
| DELETE | `/cleanup` | 200 / **409** | Delete all files in `uploads/`; 409 while a job/session is still running |

Full request/response shapes, status codes, and headers: [`docs/12-api-reference.md`](docs/12-api-reference.md). Most volume endpoints return the packed binary (`X-Shape`/`X-VCount` headers) described there.

### Job request body

```json
{
  "volume_id": "uuid",
  "filter_chain": [
    { "type": "gaussian", "params": { "sigma": 1.0 } },
    { "type": "normalize", "params": {} }
  ],
  "stitchers": ["phase_correlation", "simpleitk_affine"],
  "stitcher_params": { "phase_correlation": { "upsample_factor": 20 } }
}
```

Filter types: `"gaussian"`, `"median"`, `"mean"`, `"normalize"`, `"edge"`.
Stitcher names: `"phase_correlation"`, `"simpleitk_affine"`, `"elastix_bspline"`, `"bigstitcher"`.
Session registration methods: `"phase_correlation"`, `"cross_correlation"`.

---

## Frontend Architecture

Loaded files (H5 and STL, mixed freely) live in a single unified `tabs: TabEntry[]` array in Zustand with an `activeTabIndex`; view switching is state-based off the active tab's `type` (`'h5' | 'stl'`) and, for H5, its per-file `viewMode` (`'pointcloud' | 'slice'`) — no URL routing. **Crop** (`features/controls/CropSection.tsx`, per-file `cropBox`/`cropMode`/`cropShape`; box drawn in 3D via `H5Viewer` and as a draggable shape in `SlicePanel`) extracts a sub-volume server-side (`POST /volumes/{id}/crop` with `shape` ∈ `rect`/`cylinder`/`sphere`) and adds it through the normal `loadH5` path as a brand-new tab keyed by a unique name (`Crop N: …`), registered via `registeredVolumeId` so filtering, measurement and re-cropping all work — full parity with a loaded file. The crop panel shows the selection's physical size (mm), a strided client-side signal-content readout at the render visibility threshold (`renderControls.h5Threshold` — the same threshold that gates the 3D cloud, so "signal" means "currently visible"), and an on-demand object count (`cropObjectAnalysis.ts`: 3D 6-connectivity flood fill over the in-memory normalised volume → distinct structures + per-object mm³, optionally coloured in both viewers). **Annotation** (`features/annotation/`, `AnnotationToolbar.tsx`) adds non-destructive per-tab brush/eraser painting over the 2D slice view, with the mask stored per-file in Zustand and mirrored into the 3D voxel overlay. MUI is the sole styling system; no CSS files. All colour tokens are in `frontend/src/shared/theme/palette.ts`.

Complex component styles with pseudo-selectors go in co-located `.styles.ts` files; simple 1–3 property overrides stay as inline `sx` props.

**H5 viewer flow** (local): user selects `.h5` → Web Worker runs h5wasm off main thread → per-slice normalisation → zero-copy `Float32Array` transfer → Three.js point-cloud rendering with custom GLSL3 shaders. Files are loaded sequentially (not via `Promise.all`) to avoid OOM on batch/folder uploads.

**Off-heap volume eviction** (memory): each volume's heavy buffers (`vIndices`, `vIntensities`, `normalizedVolume`, ~150–210 MB) are mirrored to IndexedDB via `shared/h5/volumeCache.ts`. The store keeps at most `MAX_HYDRATED_FILES` (2) hydrated on the JS heap (LRU); inactive tabs carry `data: null` and are rehydrated on activation (`ensureHydrated`). This bounds heap growth so loading many files / whole folders no longer crashes the tab. `H5TabEntry` therefore always carries lightweight `meta` + `hasSlices`, and `data` only when hydrated. Backend filter results are re-persisted on `applyBackendFilter`, so eviction never loses a filtered volume.

**Backend filter flow**: `PreprocessingSection` → `useFilterJob` → (upload via `/volumes/upload` only if the volume isn't already server-side) → single POST `/volumes/{id}/filter` (or `/sessions/{id}/filter` for merged volumes) → `parseNormalizedVolume` → `applyBackendFilter` in Zustand. This lean endpoint applies the chain and returns the render-ready normalised binary in one request — no stitcher, no metrics, no polling. (The `/jobs/` create-and-poll pipeline still exists for stitcher comparison runs but is no longer used by the preprocessing UI.)

Stitcher-comparison UI lives in `frontend/src/features/stitcher/`.

### Frontend structure

```text
frontend/src/
├── main.tsx
├── App.tsx
├── app/
│   └── store/viewerSlice.ts          # Zustand: unified tabs[], per-file H5 state, camera, LRU hydration, notifications
├── shared/
│   ├── api/
│   │   ├── index.ts                  # barrel — public API surface (values + types)
│   │   ├── client.ts                 # uploadVolume, register*, filterVolume, measureVolume, session helpers
│   │   └── types.ts                  # FilterStep, Session*, Submission*, Measure*, JOB_STATUS
│   ├── components/
│   │   ├── index.ts                  # barrel
│   │   ├── ServerVolumeDialog.tsx    # server .h5 picker (folder-grouped, single/multi select)
│   │   ├── ZoomModeButton.tsx        # zoom-to-cursor toggle shared by the 3D viewers
│   │   └── useServerVolumes.ts       # Hook: GET /volumes/local with loading/error state
│   ├── constants.ts                  # DEFAULT_VOXEL_SIZE_UM, UM_PER_MM, UINT8_MAX, DEFAULT_COLORMAP_RANGE
│   ├── h5/
│   │   ├── index.ts                  # barrel
│   │   ├── h5Constants.ts            # VOLUME_DIMS, PRE_FILTER_THRESHOLD
│   │   ├── h5Reader.ts               # h5wasm decode (runs inside the worker)
│   │   ├── h5WorkerClient.ts         # loadH5FileInWorker: request/response protocol, worker reuse
│   │   ├── h5Normalizer.ts           # normalizeVolume(raw, dims, threshold) → H5VolumeData
│   │   ├── volumeCache.ts            # IndexedDB off-heap store: putVolume/getVolume/deleteVolume/clearVolumes
│   │   └── h5.worker.ts              # Web Worker entry point
│   ├── hooks/
│   │   ├── index.ts                  # barrel
│   │   └── useResolveVolumeId.ts     # Hook: reuse/lazily upload a tab's server volume id
│   ├── three/
│   │   ├── index.ts                  # barrel
│   │   └── sceneUtils.ts             # createScene(), disposeSceneGeometry()
│   ├── types/
│   │   └── viewer.types.ts           # TabEntry/H5TabEntry, H5VolumeData, per-file state types
│   ├── utils/
│   │   ├── index.ts                  # barrel
│   │   └── groupByFolder.ts          # group server volumes by folder for the pickers
│   └── theme/
│       ├── index.ts                  # barrel
│       ├── palette.ts                # all colour tokens
│       ├── layout.ts                 # layout dimensions (panel widths, rail width, PANEL_PADDING)
│       ├── uiTokens.ts               # shared UI text styles: eyebrowSx, microLabelSx, compactButtonSx
│       └── theme.ts                  # MUI medicalTheme (light mode)
└── features/
    ├── controls/
    │   ├── index.ts                  # barrel
    │   ├── ControlsPanel.tsx         # right sidebar; delegates to hooks + sub-components
    │   ├── ControlsPanel.styles.ts   # panel/slider/input styles (pseudo-selectors)
    │   ├── PreprocessingSection.tsx  # filter pipeline UI; uses useFilterJob + useFilterParams
    │   ├── CropSection.tsx           # crop shape/range/threshold UI + object count; uses useOpenCrop
    │   ├── MaskDialog.tsx            # muscle/fat segmentation preview dialog
    │   ├── cropObjectAnalysis.ts     # analyzeRegionObjects(): 3D connected-component labelling
    │   ├── SliderRow.tsx             # SliderRow + RangeSliderRow (named exports)
    │   ├── renderControlLimits.ts    # RENDER_CONTROL_LIMITS; derived from VOLUME_DIMS
    │   ├── useFilterJob.ts           # Hook: lean filter apply/revert (single request, no polling)
    │   ├── useFilterParams.ts        # Hook: filter pipeline steps + buildFilterChain()
    │   ├── useOpenCrop.ts            # Hook: resolve volume → POST /crop → open as new tab
    │   └── useNumberInput.ts         # Hook: controlled number input with clamping
    ├── h5/
    │   ├── index.ts                  # barrel (H5Viewer, H5SliceViewer, H5FileTabs)
    │   ├── H5Viewer.tsx              # Three.js point-cloud viewer
    │   ├── H5SliceViewer.tsx         # 2D slice viewer layout (3 panels)
    │   ├── H5SliceViewer.styles.ts   # slicePanelSliderSx (pseudo-selectors)
    │   ├── SlicePanel.tsx            # single-axis 2D canvas panel with zoom/pan
    │   ├── H5FileTabs.tsx            # tab bar for multiple loaded files
    │   ├── H5FileTabs.styles.ts      # tab bar styles (drag/STL tint)
    │   ├── h5ViewerShaders.ts        # GLSL3 vertexShader + fragmentShader strings
    │   ├── h5DrawUtils.ts            # draw-range helpers over the intensity-sorted cloud
    │   └── createAxisLabels.ts       # factory for X/Y/Z axis + tick label sprites
    ├── stl/
    │   ├── index.ts                  # barrel
    │   └── STLViewer.tsx             # Three.js STL mesh viewer
    ├── toolbar/
    │   ├── index.ts                  # barrel
    │   ├── Toolbar.tsx               # top toolbar; delegates to useFileLoad
    │   └── useFileLoad.ts            # Hook: file input refs + H5/STL load handlers
    ├── annotation/
    │   ├── AnnotationToolbar.tsx     # foldable 2D brush/eraser toolbar over the slice view
    │   ├── annotationMask.ts         # per-tab voxel mask: paintStroke/clear/annotatedCount
    │   └── annotationPalette.ts      # fixed label-colour palette + tint alpha
    ├── files/
    │   └── FileListPanel.tsx         # left sidebar: server .h5 files grouped by folder
    ├── onboarding/
    │   ├── index.ts                  # barrel
    │   └── EmptyState.tsx            # drag-and-drop landing screen when no file is loaded
    ├── stitcher/
    │   ├── index.ts                  # barrel
    │   ├── StitcherPanel.tsx         # right-docked multi-volume stitch UI
    │   ├── StitcherPanel.styles.ts   # panel/table styles
    │   ├── StitchResults.tsx         # quality-metric + offset tables
    │   ├── SubmissionDialog.tsx      # build + preview the challenge submission
    │   └── useStitchSession.ts       # Hook: session create/poll/download
    └── notifications/
        ├── index.ts                  # barrel
        └── AppSnackbar.tsx           # notification snackbar
```

### Frontend conventions

- **Barrel exports**: Every feature and shared folder has an `index.ts`. Import from the barrel (`'../../features/h5'`) not from deep paths, unless the file is internal to the same folder. Internal helpers (e.g. `SlicePanel`, `h5ViewerShaders`, `createAxisLabels`) are NOT exported from the barrel.
- **Magic numbers**: module-level named constants in `SCREAMING_SNAKE_CASE` in the file that uses them (e.g. `POLL_INTERVAL_MS`, `MAX_VERTS_PER_DRAW`). Only promote to a shared `constants.ts` if used in 3+ files (e.g. `UINT8_MAX`, `DEFAULT_VOXEL_SIZE_UM`). Shared semantic defaults live with their type (e.g. `DEFAULT_COLORMAP` in `shared/types/viewer.types.ts`).
- **UI text styles**: shared label/header `sx` objects live in `shared/theme/uiTokens.ts` — use `eyebrowSx` (uppercase section/eyebrow headers), `microLabelSx` (`0.625rem` sub-captions), and `compactButtonSx` (dense buttons) instead of hand-rolling font sizes/weights, so the type scale stays consistent across panels.
- **Custom hooks**: extract side-effectful logic from components into `use*.ts` files. Hooks own state and async operations; components own only layout and event wiring.
- **Three.js cleanup**: call `disposeSceneGeometry(scene)` from `shared/three/sceneUtils.ts` before `disposeBase()`. Sprite materials with canvas textures need explicit disposal before that call.
- **VOLUME_DIMS** from the `shared/h5` barrel (defined in `h5Constants.ts`) is the single source of truth for `[512, 250, 250]` — derive all slider maxima from it, never hardcode.
- **Volume memory**: never assume `H5TabEntry.data` is present — it is `null` for evicted (inactive) tabs. Read dimensions from `meta` / slice availability from `hasSlices`, and only touch `data` after hydration. Keep `MAX_HYDRATED_FILES` small; do not retain every loaded volume's buffers on the heap.
- **Bundle**: heavy deps are split into separate chunks via `manualChunks` in `vite.config.ts` (`three`, `mui`, `vendor`) — keep that split so app-code edits don't bust their cache. `h5wasm` is deliberately NOT listed: it is only imported by `h5.worker.ts`, which Vite bundles separately (listing it would ship a duplicate ~4.4 MB copy).

---

## Conventions

- **Backend formatting**: `black` + `isort`, line-length 100. Run `cd backend && uv run ruff check src/ --fix`. No bare `# type: ignore` without a comment explaining why.
- **Frontend formatting**: Prettier via `npm run format`. No new CSS files, MUI only.
- **Uploads**: `backend/uploads/` is in `.gitignore` — never commit it.
- **Tests**: Backend tests live in `backend/tests/`. Frontend tests go in `frontend/src/__tests__/` when added.
