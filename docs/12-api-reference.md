# API Reference

## Overview

This is the consolidated reference for every backend HTTP endpoint, gathered from
the routers in `backend/src/routers/` and the app setup in `backend/main.py`. For
the *why* behind an endpoint, follow the cross-links to the domain documents.

- **Base URL** — the frontend reads it from `VITE_API_URL` (e.g.
  `http://localhost:8000`).
- **Interactive docs** — FastAPI auto-generates browsable API documentation; see
  [Interactive API documentation](#interactive-api-documentation) below.
- **CORS** — allowed origins come from `CORS_ORIGINS` (default
  `http://localhost:5173`); methods `GET, POST, DELETE, OPTIONS`; exposed headers
  `X-Shape`, `X-Dtype`, `X-VCount`.
- **App** — title "Lumina Backend", version 0.3.0 (`main.py:32`).

## Endpoint summary

| Method | Path | Status | Purpose |
|--------|------|--------|---------|
| GET | `/` | 200 | Health check → `{"status":"ok"}` |
| GET | `/docs` | 200 | Interactive Swagger UI (auto-generated) |
| GET | `/redoc` | 200 | ReDoc API documentation (auto-generated) |
| GET | `/openapi.json` | 200 | Machine-readable OpenAPI schema |
| POST | `/volumes/upload` | 200 | Upload an `.h5` volume |
| GET | `/volumes/local` | 200 | List registerable `.h5` files under `data_dir` |
| POST | `/volumes/register` | 200 | Register one local file by path (zero-copy) |
| POST | `/volumes/register-batch` | 200 | Register many local files by path |
| POST | `/volumes/{id}/filter` | 200 | Apply a filter chain → packed binary |
| GET | `/volumes/{id}/normalized` | 200 | Render-ready packed binary of a stored volume |
| POST | `/volumes/{id}/crop` | 200 | Extract a sub-volume → new volume id |
| POST | `/volumes/{id}/measure` | 200 | Geometric measurements |
| POST | `/jobs/` | 201 | Start a single-volume filter+stitcher job |
| GET | `/jobs/{id}` | 200 | Poll job status + metrics |
| GET | `/jobs/{id}/volume/{stitcher}` | 200 | Download a job's stitcher result (packed) |
| POST | `/sessions/` | 201 | Start a multi-volume stitching session |
| GET | `/sessions/{id}` | 200 | Poll session status, offsets, metrics |
| GET | `/sessions/{id}/merged` | 200 | Download the merged volume (packed) |
| POST | `/sessions/{id}/filter` | 200 | Filter the merged volume |
| DELETE | `/cleanup` | 200 | Delete everything in `uploads/` |

## The packed binary format

Several endpoints return the **packed binary** rather than JSON. See
[doc 1](01-architecture-overview.md) and [doc 3](03-normalization-rendering.md)
for full detail. In brief:

```text
Headers: X-Shape = "<nSlices>,<height>,<width>", X-VCount = "<voxel count>"
Body:    [vIndices: vCount×f32][vIntensities: vCount×f32][normalizedVolume: total×u8]
```

The frontend parses it with `parseNormalizedVolume` (`shared/api/client.ts`) into
zero-copy typed-array views.

## Volumes (`routers/volumes.py`, prefix `/volumes`)

### POST `/volumes/upload`
Upload an `.h5` file (multipart). Streamed to disk in 1 MB chunks; validated by
metadata only.
- **Response:** `UploadResponse` = `{ volume_id, n_slices, height, width }`.
- **Errors:** 400 non-`.h5`; 400 invalid dataset/shape.

### GET `/volumes/local`
List `.h5` files discovered under `data_dir`.
- **Response:** `list[LocalVolume]` = `[{ path, name }]` (path relative to
  `data_dir`).

### POST `/volumes/register` · `/volumes/register-batch`
Register local source file(s) by path via symlink (zero-copy).
- **Body:** `{ path }` / `{ paths: [...] }`.
- **Response:** `UploadResponse` / `list[UploadResponse]`.
- **Errors:** 400 path escapes `data_dir`; 400 non-`.h5`; 404 not found.

### POST `/volumes/{id}/filter`
Apply a filter chain ([doc 4](04-preprocessing-filters.md)); no stitching, no
metrics.
- **Body:** `FilterRequest` = `{ filter_chain: [{ type, params }] }`.
- **Response:** packed binary (`X-Shape`, `X-VCount`).

### GET `/volumes/{id}/normalized`
Return the render-ready packed binary for a stored/registered volume.
- **Response:** packed binary.

## Crop (`routers/crop.py`)

### POST `/volumes/{id}/crop`
Extract an axis-aligned sub-volume (optionally cylinder/sphere-masked) as a new
independent volume ([doc 6](06-cropping-object-analysis.md)).
- **Body:** `CropRequest` = `{ x, y, z, width, height, depth, shape }`,
  `shape ∈ {rect, cylinder, sphere}`.
- **Response:** `UploadResponse` for the new crop.
- **Errors:** 404 source not found; 422 box out of bounds.

## Measurements (`routers/measurements.py`)

### POST `/volumes/{id}/measure`
Geometric measurements of the thresholded tissue
([doc 5](05-slice-viewer-measurements.md)).
- **Body:** `{ threshold (0.05), voxel_size_um: [dz, dy, dx] }`.
- **Response:** `{ voxel_count, volume_um3, surface_area_um2, mean_thickness_um,
  max_thickness_um, lateral_diameter_um }`.
- **Errors:** 404 not found; 422 invalid result.

## Jobs (`routers/jobs.py` + `routers/results.py`, prefix `/jobs`)

### POST `/jobs/` → **201**
Submit a single-volume job: filter chain + stitcher algorithms + metrics
([doc 9](09-jobs-sessions-lifecycle.md)). Returns immediately.
- **Body:** `JobRequest`:
  ```json
  {
    "volume_id": "uuid",
    "filter_chain": [{ "type": "gaussian", "params": { "sigma": 1.0 } }],
    "stitchers": ["phase_correlation", "simpleitk_affine"],
    "stitcher_params": { "phase_correlation": { "upsample_factor": 20 } }
  }
  ```
- **Response:** `{ job_id }`.
- **Errors:** 404 volume not found; 400 unknown stitcher(s).

### GET `/jobs/{id}`
Poll a job.
- **Response:** `JobStatusResponse` = `{ status, results, error }` where `status ∈
  {pending, running, done, error}` and `results` maps stitcher name → metrics
  (`{ ncc, mi, mse, rmse }`, plus `dice` when masks given).

### GET `/jobs/{id}/volume/{stitcher}`
Download a stitcher's result volume as packed binary (memory-mapped read).
- **Errors:** 404 job/result not found; 409 job not `done`.

## Sessions (`routers/sessions.py`, prefix `/sessions`)

### POST `/sessions/` → **201**
Create a multi-volume stitching session ([doc 8](08-stitching-registration.md),
[doc 9](09-jobs-sessions-lifecycle.md)). Returns immediately.
- **Body:** `SessionRequest`:
  ```json
  {
    "volumes": [{ "volume_id": "a", "row": 0, "col": 0 },
                { "volume_id": "b", "row": 0, "col": 1 }],
    "method": "phase_correlation",
    "method_params": {}
  }
  ```
  `method ∈ {phase_correlation, cross_correlation}`.
- **Response:** `{ session_id }`.
- **Errors:** 400 fewer than 2 volumes.

### GET `/sessions/{id}`
Poll a session.
- **Response:** `SessionStatusResponse` = `{ status, offsets, metrics,
  merged_volume_id, error }`. `offsets` maps volume_id → `[dy, dx]`; `metrics`
  holds e.g. `{ rmse }`.

### GET `/sessions/{id}/merged`
Download the merged volume as packed binary (served from the pre-computed file
when available, else computed on demand).
- **Errors:** 404 session not found; 404 merged not available yet.

### POST `/sessions/{id}/filter`
Apply a filter chain to the merged volume.
- **Body:** `SessionFilterRequest` = `{ filter_chain }`.
- **Response:** packed binary.
- **Errors:** 404 merged HDF5 not found.

## Cleanup (`routers/cleanup.py`, prefix `/cleanup`)

### DELETE `/cleanup`
Delete every file/symlink in `uploads_dir` and clear the volume cache. Symlinks to
`data_dir` sources are unlinked without touching the originals.
- **Response:** `{ deleted, errors }`.

## Interactive API documentation

FastAPI builds browsable, always-up-to-date API documentation directly from the
route definitions and Pydantic models — no separate spec is maintained by hand,
so these pages can never drift out of sync with the actual endpoints. The app is
created with default doc URLs (`main.py:32`), so three routes are available:

| Path | What it serves | Use it to |
| ---- | -------------- | --------- |
| `/docs` | **Swagger UI** — an interactive HTML page listing every endpoint with its parameters, schemas, and a "Try it out" button. | Explore and manually call the API from a browser. |
| `/redoc` | **ReDoc** — a clean, read-oriented rendering of the same API. | Read the API as reference documentation. |
| `/openapi.json` | The raw **OpenAPI 3.x** schema (JSON). | Generate client code, import into Postman/Insomnia, or drive automated tooling. |

What appears on these pages comes straight from the code: the endpoint `summary`
strings, path/query/body parameters, and the request/response models documented
throughout this reference. To enrich what `/docs` shows, edit the corresponding
router decorator (`summary=…`) or the Pydantic schema in `backend/src/schemas/`;
the change is reflected automatically the next time the page loads. (To disable
the pages in a hardened deployment, pass `docs_url=None` / `redoc_url=None` to
`FastAPI(...)` in `main.py`.)

## Enums and shared models

- **`JobStatus`** (`schemas/enums.py`) — string enum: `pending`, `running`,
  `done`, `error`.
- **`FilterStep`** — `{ type: str, params: dict }`; `type ∈ {gaussian, median,
  mean, normalize, edge}`.
- **`UploadResponse`** — `{ volume_id, n_slices, height, width }`.
- **`LocalVolume`** — `{ path, name }`.
- **Stitcher names** — `phase_correlation`, `simpleitk_affine`, `elastix_bspline`,
  `bigstitcher`.

## Error model

Validation/lookup failures return the standard FastAPI `{"detail": "..."}` with
the status codes noted above. Any unhandled exception is caught by a global
handler (`main.py:57`) that logs it and returns a CORS-aware **500**
`{"detail": "Internal server error."}`.

## Related documents

- The data flow that strings these calls together:
  [Architecture Overview](01-architecture-overview.md).
- The processing behind each endpoint: docs
  [3](03-normalization-rendering.md)–[9](09-jobs-sessions-lifecycle.md).
