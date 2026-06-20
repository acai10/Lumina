# Lumina — OCT Volume Viewer & Stitching Platform

Browser-based tool for loading, filtering, measuring, and stitching **OCT
volumes** (Optical Coherence Tomography). A Python/FastAPI backend handles all
heavy computation; a React/Three.js frontend renders 3-D point clouds and 2-D
slice views entirely in the browser.

## Quick start (Docker)

```bash
docker compose up --build
```

| URL | Description |
| --- | ----------- |
| <http://localhost:5173> | Frontend |
| <http://localhost:8000> | Backend API |
| <http://localhost:8000/docs> | Swagger / OpenAPI |

### Optional: load source files by path (no upload)

If your `.h5` files live on the backend machine, you can skip uploads entirely:
the backend registers a file by **symlink** (zero-copy, instant) and serves it
pre-normalised. Point it at the host directory of your source files:

```bash
LUMINA_DATA_DIR=/abs/path/to/h5 docker compose up --build
# or persist it in a .env file next to docker-compose.yml:
# LUMINA_DATA_DIR=/abs/path/to/h5
```

The directory is bind-mounted **read-only** at `/data` inside the backend
container, so originals are never modified. Then use **Load H5 → From server…**
in the toolbar (or **From Server** in the Stitch panel). The classic browser file
picker works regardless.

## Development (without Docker)

```bash
# Backend (Python 3.11, uv package manager)
cd backend
uv sync                      # CPU-only (default)
uv sync --extra elastix      # + itk-elastix B-spline stitcher (optional)
uv run uvicorn main:app --reload --port 8000

# Frontend (Node 20)
cd frontend
npm install
npm run dev        # dev server on port 5173
npm run build      # TypeScript check + Vite production build
```

## Testing & quality

```bash
# Backend
cd backend
uv run pytest                  # test suite
uv run ruff check src/ --fix   # lint + auto-fix
uv run mypy src/               # type check

# Frontend
cd frontend
npm run lint       # ESLint
npm run format     # Prettier
npm run build      # tsc --noEmit + Vite build

# Both (formatting)
make format
```

## Configuration

The backend reads settings from environment variables (or a `.env` file). See
`backend/src/config.py`.

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `DATA_DIR` | `data` | Root of registerable source `.h5` files (`/data` in Docker). |
| `LUMINA_DATA_DIR` | `./data` | **Host** path bind-mounted to `/data` (Docker Compose only). |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed browser origins (comma-separated). |
| `VITE_API_URL` | `http://localhost:8000` | Backend base URL the frontend calls. |

## Data format

| Property | Value |
| -------- | ----- |
| Dataset name | `"OCT"` (fixed) |
| Standard shape | `(512, 250, 250)` — nSlices × height × width |
| Accepted dtypes | float32/64, int16/32, uint8/16/32 (auto-converted) |

Merged (stitched) volumes may be larger along height/width; sliders and slice
indices adapt automatically.

## Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Python 3.11 · FastAPI · NumPy · SciPy · h5py · scikit-image · SimpleITK |
| Backend (optional) | itk-elastix |
| Frontend | React 18 · TypeScript · Three.js · MUI v6 · Zustand · Vite |
| Infra | Docker Compose · uv · Node 20 |

## Documentation

Detailed documentation lives in [`docs/`](docs/README.md) — one file per domain,
each explaining the features, the functions behind them, and every formula in
plain language with worked examples.

| Document | Covers |
| -------- | ------ |
| [Architecture Overview](docs/01-architecture-overview.md) | System design, tech stack, the packed-binary data format, end-to-end data flow. |
| [Volume Ingestion & Storage](docs/02-volume-ingestion-storage.md) | Upload, register-by-path, HDF5 format, in-browser reading, memory management. |
| [Normalization, Rendering & Shaders](docs/03-normalization-rendering.md) | Backend/frontend normalization, radix sort, GPU shaders, colormaps, tone mapping. |
| [Preprocessing Filters](docs/04-preprocessing-filters.md) | Gaussian, median, mean, normalize, edge — math and filter chains. |
| [Slice Viewer & Measurements](docs/05-slice-viewer-measurements.md) | 2-D panels, coordinate transforms, distance/area tools, volumetric measurements. |
| [Cropping & Object Analysis](docs/06-cropping-object-analysis.md) | Sub-volume crops (rect/cylinder/sphere), 3-D connected-component counting. |
| [Annotation](docs/07-annotation.md) | Non-destructive brush/eraser painting and label storage. |
| [Stitching & Registration](docs/08-stitching-registration.md) | Phase correlation, global offsets (BFS), max-blend merging, quality metrics. |
| [Jobs, Sessions & Lifecycle](docs/09-jobs-sessions-lifecycle.md) | Background execution, polling, and the memory-management strategy. |
| [STL Viewer & Overlay](docs/10-stl-viewer-overlay.md) | 3-D mesh viewing and STL-on-volume registration. |
| [Frontend Shell, State & Theming](docs/11-frontend-shell-state.md) | App layout, Zustand store, tabs, eviction, MUI theme. |
| [API Reference](docs/12-api-reference.md) | Every endpoint, request/response, status codes, headers. |

## Project layout

```text
Lumina/
├── docker-compose.yml
├── docs/            # detailed documentation (see above)
├── backend/         # Python 3.11 · FastAPI · uv
│   ├── main.py      # app, CORS, routers
│   └── src/         # config, routers/, processing/, schemas/
└── frontend/        # React · TypeScript · Vite
    └── src/         # App.tsx, app/store/, features/, shared/
```
