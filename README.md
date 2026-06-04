# Lumina — OCT Volume Viewer & Stitching Platform

Browser-based tool for loading, filtering, and stitching OCT volumes.
Python backend handles all heavy computation; React/Three.js frontend renders
3-D point clouds and 2-D slice views entirely in the browser.

---

## Quick start

```bash
docker compose up --build
```

| URL | Description |
|-----|-------------|
| <http://localhost:5173> | Frontend |
| <http://localhost:8000> | Backend API |
| <http://localhost:8000/docs> | Swagger / OpenAPI |

---

## Features

### Single-volume workflow

1. **Load H5** — pick individual files or an entire folder; volumes are read
   locally via h5wasm (no upload needed for viewing).
2. **3-D point-cloud view** — Three.js WebGL renderer with threshold, opacity,
   brightness, contrast, point-size, and spatial range sliders.
3. **2-D slice viewer** — three orthogonal panels (X/Y/Z) with per-panel
   brightness/contrast and zoom/pan.
4. **Preprocessing filters** — apply a filter chain on the backend and stream
   back a render-ready result:
   - Gaussian · Median · Lee speckle · BM3D · Percentile-normalize · Anisotropy zoom

### Multi-volume stitching

1. Open the **Stitch** panel → add H5 files (individual or folder) and set
   each volume's grid position (row, col).
2. Choose a registration method: **Phase Correlation**, **Cross-Correlation**,
   or **ICP (point-cloud)**.
3. Backend registers adjacent pairs with zero-padded phase correlation
   (avoids the aliasing problem of standard `phase_cross_correlation` for
   large lateral offsets), computes global offsets via BFS, and merges with
   max-intensity blending.
4. After processing the merged result loads directly into the H5 viewer as a
   new tab — full 3-D and 2-D slice views, correct slider extents.
5. Apply filters or revert to original on the merged result.
6. **Clear** empties the uploads folder on the server.

### STL overlay

- Load one or more STL files — they appear as separate tabs in the unified
  tab bar (blue tint) alongside H5 tabs.
- While viewing an H5 tab, select an STL overlay from the **STL Overlay**
  dropdown; the mesh is rendered inside the same Three.js scene sharing the
  same camera and OrbitControls.
- Per-file STL opacity slider.

### Tab management

- All H5 and STL files share a single scrollable tab bar.
- Tabs can be freely dragged to any position regardless of file type.
- Closing a tab also cleans up the corresponding server-side uploads.

---

## Data format

| Property | Value |
|----------|-------|
| Dataset name | `"OCT"` (fixed) |
| Standard shape | `(512, 250, 250)` — nSlices × height × width |
| Accepted dtypes | float32, float64, int16/32, uint8/16/32 (auto-converted) |

The backend validates dataset name and element count on upload.
Merged (stitched) volumes can be larger along the height/width axes;
sliders and slice indices adapt automatically.

---

## API overview

### Volumes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/volumes/upload` | Upload `.h5` → `{ volume_id, n_slices, height, width }` |
| `GET`  | `/volumes/{id}/info` | Shape/dtype of an uploaded volume |

### Filter jobs

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/jobs/` | Submit filter job → `{ job_id }` |
| `GET`  | `/jobs/{id}` | Poll status + metrics |
| `GET`  | `/jobs/{id}/volume/{stitcher}` | Render-ready binary result (pre-normalised) |

### Stitching sessions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions/` | Create multi-volume session → `{ session_id }` |
| `GET`  | `/sessions/{id}` | Poll status, offsets, metrics, `merged_volume_id` |
| `GET`  | `/sessions/{id}/merged` | Merged volume — render-ready binary (pre-computed, fast) |
| `GET`  | `/sessions/{id}/mip` | Maximum Intensity Projection (2-D, float32) |
| `POST` | `/sessions/{id}/filter` | Apply filter chain to merged volume |

### Utility

| Method | Path | Description |
|--------|------|-------------|
| `DELETE` | `/cleanup` | Delete all files in `uploads/` |

#### Render-ready binary format

All volume endpoints return a packed binary instead of raw float32:

```
Headers:  X-Shape  = "<nSlices>,<height>,<width>"
          X-VCount = "<above-threshold voxel count>"

Body:     [vIndices    : vCount × float32]
          [vIntensities: vCount × float32]
          [normalizedVolume: total × uint8]
```

The frontend parses this as three zero-copy typed-array views into a single
`ArrayBuffer` — no Web Worker or JS normalisation step needed.

---

## Development

### Without Docker

```bash
# Backend
cd backend
uv sync                      # CPU-only (default)
uv sync --extra bm3d         # + BM3D denoising
uv run uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev        # port 5173
npm run build      # TypeScript check + Vite production build
```

### Backend quality tools

```bash
cd backend
uv run ruff check src/ --fix   # lint + auto-fix
uv run mypy src/               # type check
uv run pytest                  # test suite
```

---

## Project structure

```text
Lumina/
├── docker-compose.yml
│
├── backend/
│   ├── Dockerfile
│   ├── main.py                   # FastAPI app, CORS, router registration
│   ├── pyproject.toml            # deps + optional extras: bm3d, elastix
│   └── src/
│       ├── config.py             # Pydantic BaseSettings (uploads_dir, cors_origins)
│       ├── schemas/
│       │   ├── enums.py          # JobStatus
│       │   ├── jobs.py           # FilterStep, JobRequest, …
│       │   ├── sessions.py       # VolumeEntry, SessionRequest, SessionFilterRequest, …
│       │   └── volumes.py        # UploadResponse, VolumeInfo
│       ├── routers/
│       │   ├── volumes.py        # POST /volumes/upload, GET /volumes/{id}/info
│       │   ├── jobs.py           # POST /jobs/
│       │   ├── results.py        # GET /jobs/{id}/volume/{stitcher}
│       │   ├── sessions.py       # POST+GET /sessions/, GET /merged, POST /filter
│       │   └── cleanup.py        # DELETE /cleanup
│       └── processing/
│           ├── h5_reader.py      # load_volume(), load_volume_flexible()
│           ├── filters.py        # apply_filter_chain() — Gaussian/Median/Lee/BM3D/…
│           ├── normalizer.py     # normalize_for_frontend(); save/load_packed
│           ├── multi_volume.py   # MIP, surface seg, ICP, phase correlation, merge
│           ├── metrics.py        # NCC, MI, MSE, RMSE, Hausdorff
│           ├── runner.py         # JobStore, async run_job
│           └── session_runner.py # SessionStore, async run_session
│
└── frontend/
    └── src/
        ├── App.tsx               # top-level layout, unified tab routing
        ├── app/store/
        │   └── viewerSlice.ts    # Zustand: unified tabs[], activeTabIndex, stlOverlay
        ├── shared/
        │   ├── api/              # client.ts — fetch + parseNormalizedVolume helper
        │   ├── h5/               # h5wasm worker, normalizeVolume (Uint8, two-pass)
        │   ├── three/            # createScene() — persistent canvas ref
        │   └── types/
        │       └── viewer.types.ts  # TabEntry (H5TabEntry | StlTabEntry), Uint8 normalizedVolume
        └── features/
            ├── h5/               # H5Viewer (3-D), H5SliceViewer (2-D), H5FileTabs
            ├── stl/              # STLViewer
            ├── controls/         # ControlsPanel, PreprocessingSection, SlicePanel (LUT)
            ├── stitcher/         # StitcherPanel, useStitchSession
            ├── toolbar/          # Toolbar (scrollable), useFileLoad
            └── notifications/    # AppSnackbar
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 · FastAPI · h5py · NumPy · SciPy · scikit-image · SimpleITK |
| Backend (optional) | BM3D · itk-elastix |
| Frontend | React 18 · TypeScript · Three.js · MUI v5 · Zustand · Vite |
| Infra | Docker Compose · uv · Node 20 |

### Performance notes

- **Backend normalisation** uses a two-pass Uint8-first approach (peak ~260 MB
  for a standard 512×250×250 volume). Large merged volumes are processed in
  32-slice chunks to avoid a full-volume boolean mask in RAM.
- **Stitching memory**: individual volumes are freed before normalisation;
  the merged array is freed and reloaded via `mmap_mode='r'` so only OS page
  cache stays in RAM during the normalisation step.
- **Render-ready binary**: volume data from all backend endpoints arrives
  pre-normalised — no Web Worker, no JS sorting, near-instant parse via
  typed-array views into the response `ArrayBuffer`.
- **Slice rendering**: 256-entry LUT replaces per-pixel `Math.pow()` calls;
  canvas updates are scheduled with `requestAnimationFrame`.
- **WebGL contexts**: each viewer keeps a persistent canvas `useRef` so React
  StrictMode's double-mount reuses the same WebGL context instead of allocating
  a second one.
