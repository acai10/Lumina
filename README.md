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
| --- | ----------- |
| <http://localhost:5173> | Frontend |
| <http://localhost:8000> | Backend API |
| <http://localhost:8000/docs> | Swagger / OpenAPI |

### Loading source files by path (no upload)

If your `.h5` files live on the same machine as the backend, you can skip the
~128 MB upload entirely: the backend registers a file by **symlink** (zero-copy,
instant) and serves it pre-normalised.

Set `LUMINA_DATA_DIR` to the absolute host path containing your source files,
then restart:

```bash
LUMINA_DATA_DIR=/abs/path/to/h5 docker compose up --build
# or add it to a .env file next to docker-compose.yml:
# LUMINA_DATA_DIR=/abs/path/to/h5
```

The directory is bind-mounted **read-only** at `/data` inside the backend
container — original files are never modified.
Once running, use **Load H5 → From server…** in the toolbar or
**From Server** in the Stitch panel to browse and pick files or whole folders
without any upload. The classic browser-based file picker continues to work as a
fallback regardless of this setting.

---

## Features

### Single-volume workflow

1. **Load H5** — three ways to load volumes:
   - **File / Folder** (browser picker) — picks local files; volumes are read
     in-browser via h5wasm, no upload needed for viewing.
   - **From server…** — when `LUMINA_DATA_DIR` is set (see above), browse
     server-side files and folders without uploading. Clicking a folder loads
     all `.h5` files inside it at once.
   Memory-safe: only the active tab's buffers (~150–210 MB) stay on the JS heap;
   inactive tabs are automatically evicted to IndexedDB and reloaded on demand.
2. **3-D point-cloud view** — Three.js WebGL renderer with threshold, opacity,
   brightness, contrast, point-size, and spatial range sliders. The green bounding
   box scales with the volume-spacing slider.
3. **2-D slice viewer** — three orthogonal panels (X/Y/Z) with per-panel
   brightness/contrast and zoom/pan.
4. **Preprocessing filters** — apply a filter chain on the backend and stream
   back a render-ready result. When a volume was loaded via **From server…**, the
   filter job skips the upload step entirely. Filtered results survive tab eviction
   and are restored correctly on reactivation.
5. **Crop** — define an axis-aligned sub-region with the X/Y/Z range sliders (a
   live orange box in 3D) or by dragging a rectangle on any 2-D slice panel, then
   **Open Crop** extracts it server-side (non-destructive) and opens it as a NEW
   tab. The crop is a fully independent dataset — filters, 2-D/3-D viewers,
   measurements and projections all work on it without restriction. The crop panel
   shows the selection's physical size (mm) and a threshold-based signal-content
   readout for the region (% above threshold, voxel count, signal volume in mm³),
   plus an on-demand **object count** (3D connected components: number of distinct
   structures with each one's volume in mm³). The tab title records the source
   volume and crop coordinates.

### Multi-volume stitching

1. Open the **Stitch** panel → add H5 files using any combination of:
   - **Add Files** / **Add Folder** — browser file picker
   - **From Server** — server-side folder browser (no upload); select individual
     files or tick an entire folder to add all volumes inside it at once.
2. Set each volume's grid position (row, col). Grid positions are auto-detected
   from filenames ending in `_row_col.h5`.
3. Choose a registration method: **Phase Correlation** or **Cross-Correlation**.
4. Backend registers adjacent pairs, computes global offsets via BFS, and merges
   with max-intensity blending.
5. The merged result loads as a new tab — full 3-D and 2-D slice views,
   correct slider extents.
6. Apply filters or revert on the merged result.
7. **Clear** empties the uploads folder on the server (symlinks to `DATA_DIR`
   source files are removed; the originals are never touched).

### STL overlay

- Load STL files — they appear as separate tabs (blue tint) alongside H5 tabs.
- While viewing an H5 tab, select an STL overlay from the **STL Overlay** dropdown;
  the mesh is rendered in the same Three.js scene with shared camera and OrbitControls.
- Per-file opacity slider.

### Tab management

- All H5 and STL files share a single scrollable tab bar.
- Tabs can be freely dragged to any position regardless of file type.
- Closing a tab cleans up the corresponding server-side uploads and the IndexedDB entry.

---

## Algorithms

### Preprocessing filters

All filters run on the backend per-slice (normalize scales globally from
per-volume percentiles), then return a render-ready binary to the frontend.

#### Gaussian blur

Convolves each 2-D slice with a Gaussian kernel of standard deviation σ:

$$G(x,y) = \frac{1}{2\pi\sigma^2}\,\exp\!\left(-\frac{x^2+y^2}{2\sigma^2}\right)$$

Smooth, isotropic noise reduction. Larger σ → more blur.
**Parameter:** `sigma` (default 1.0)

#### Median filter

Replaces each pixel with the median of its n×n neighbourhood.
Non-linear — excellent at removing salt-and-pepper noise without blurring edges.
**Parameter:** `size` (default 3)

#### Mean filter

Replaces each pixel with the average of its n×n neighbourhood (`scipy.ndimage.uniform_filter`).
Simple linear smoothing.
**Parameter:** `size` (default 3)

#### Percentile normalise

Clips intensities to the [p_low, p_high] percentile range, then scales to [0, 1]:

$$x_\text{norm} = \text{clip}\!\left(\frac{x - p_\text{low}}{p_\text{high} - p_\text{low}},\ 0,\ 1\right)$$

Removes outlier intensities that would otherwise dominate the display range.
**Parameters:** `low_percentile` (default 1.0), `high_percentile` (default 99.0)

#### Edge highlight

Per-slice Sobel gradient magnitude, normalised to [0, 1]. Highlights structural
boundaries; can be stacked in a pipeline alongside the other filters.
**Parameter:** none

---

### Registration & stitching

#### Phase correlation (and cross-correlation)

Finds the translational shift (dy, dx) between two 2-D MIP images in the
frequency domain. The cross-power spectrum is:

$$S = \frac{F_A \cdot \overline{F_B}}{|F_A \cdot \overline{F_B}|}$$

The shift is the location of the peak in `IFFT(S)`.
Lumina zero-pads both images to size ≥ 2N−1 before the FFT so the correlation
is *linear* (not circular). Without padding, the standard approach aliases shifts
larger than N/2 pixels to the wrong direction — a common bug in large-field stitching.
Cross-correlation omits the magnitude normalisation in the denominator, making it
more sensitive to intensity differences between tiles.

#### Global offset computation

After pairwise registration of all adjacent grid pairs, global offsets are
computed by Breadth-First Search (BFS) starting from the top-left volume.
Each volume's absolute (dy, dx) is accumulated along the BFS path, so the
result is consistent even if any individual pair registration is noisy.

#### Merging

The merged volume is assembled in a zero-initialised output array sized to fit
all tiles at their computed offsets, using max-intensity blending in overlapping
regions:

$$\text{merged}[s,y,x] = \max_i\ V_i[s,\ y-\Delta y_i,\ x-\Delta x_i]$$

Max-blending preserves bright features from every tile and is appropriate for
OCT data where high intensity = signal.

#### Quality metrics

After stitching, **RMSE** is computed on each pair's overlapping region and
averaged across all pairs:

| Metric       | Formula                       | Meaning                          |
| ------------ | ----------------------------- | -------------------------------- |
| **RMSE**     | √(mean((A−B)²))               | Intensity agreement in overlap   |

Lower is better. (The job-pipeline `compute_all` additionally reports NCC, MI,
MSE, and Dice when segmentation masks are supplied.)

---

## Data format

| Property | Value |
| -------- | ----- |
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
| ------ | ---- | ----------- |
| `POST` | `/volumes/upload` | Upload `.h5` → `{ volume_id, n_slices, height, width }` |
| `GET` | `/volumes/local` | List `.h5` files under `DATA_DIR` (relative paths + names) |
| `POST` | `/volumes/register` | Register a local file by path → `{ volume_id, … }` (zero-copy symlink, no upload) |
| `POST` | `/volumes/register-batch` | Register many local files by path in one round-trip |
| `GET` | `/volumes/{id}/info` | Shape/dtype of a stored/registered volume |
| `GET` | `/volumes/{id}/normalized` | Render-ready binary of a stored/registered volume (same format as job results) |
| `POST` | `/volumes/{id}/filter` | Apply a filter chain (no stitcher, no metrics) → render-ready binary |
| `POST` | `/volumes/{id}/measure` | Geometric measurements (area, volume, thickness, diameter) |
| `POST` | `/volumes/{id}/crop` | Extract a sub-volume (x/y/z + w/h/d) → new independent volume id (non-destructive) |

### Filter jobs

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/jobs/` | Submit filter job → `{ job_id }` |
| `GET` | `/jobs/{id}` | Poll status + metrics |
| `GET` | `/jobs/{id}/volume/{stitcher}` | Render-ready binary result (pre-normalised) |

### Stitching sessions

| Method | Path | Description |
| ------ | ---- | ----------- |
| `POST` | `/sessions/` | Create multi-volume session → `{ session_id }` |
| `GET` | `/sessions/{id}` | Poll status, offsets, metrics, `merged_volume_id` |
| `GET` | `/sessions/{id}/merged` | Merged volume — render-ready binary (pre-computed) |
| `GET` | `/sessions/{id}/mip` | Maximum Intensity Projection (2-D, float32) |
| `POST` | `/sessions/{id}/filter` | Apply filter chain to merged volume |

### Utility

| Method | Path | Description |
| ------ | ---- | ----------- |
| `DELETE` | `/cleanup` | Delete all files in `uploads/` |

#### Render-ready binary format

All volume endpoints return a packed binary instead of raw float32:

```text
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
uv sync --extra elastix      # + itk-elastix B-spline stitcher (optional)
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
│   ├── pyproject.toml            # deps + optional extra: elastix
│   └── src/
│       ├── config.py             # Pydantic BaseSettings (uploads_dir, cors_origins)
│       ├── schemas/
│       │   ├── enums.py          # JobStatus
│       │   ├── jobs.py           # FilterStep, JobRequest, …
│       │   ├── sessions.py       # VolumeEntry, SessionRequest, …
│       │   └── volumes.py        # UploadResponse, VolumeInfo
│       ├── routers/
│       │   ├── volumes.py        # upload, register(-batch), info, normalized, filter
│       │   ├── jobs.py           # POST /jobs/
│       │   ├── results.py        # GET /jobs/{id}/volume/{stitcher}
│       │   ├── sessions.py       # POST+GET /sessions/, GET /merged, /mip, POST /filter
│       │   ├── measurements.py   # POST /volumes/{id}/measure
│       │   ├── crop.py           # POST /volumes/{id}/crop → new sub-volume
│       │   └── cleanup.py        # DELETE /cleanup
│       └── processing/
│           ├── h5_reader.py      # load_volume(), load_volume_flexible()
│           ├── filters.py        # apply_filter_chain() — Gaussian/Median/Mean/Normalize/Edge
│           ├── normalizer.py     # normalize_for_frontend(); save/load_packed
│           ├── multi_volume.py   # MIP, phase/cross correlation, merge
│           ├── metrics.py        # NCC, MI, MSE, RMSE, Dice
│           ├── measurements.py   # geometric measurements (area, volume, thickness)
│           ├── runner.py         # JobStore, async run_job
│           └── session_runner.py # SessionStore, async run_session
│
└── frontend/
    └── src/
        ├── App.tsx               # top-level layout; dispatches on active tab type + viewMode
        ├── app/store/
        │   └── viewerSlice.ts    # Zustand: unified tabs[], LRU hydration, per-file state
        ├── shared/
        │   ├── api/              # client.ts — typed fetch helpers, parseNormalizedVolume
        │   ├── h5/               # h5wasm worker, normalizeVolume (Uint8, two-pass),
        │   │                     #   volumeCache.ts (IndexedDB off-heap eviction)
        │   ├── three/            # createScene() — persistent canvas ref (avoids ctx limit)
        │   └── types/
        │       └── viewer.types.ts  # TabEntry (H5TabEntry | StlTabEntry); H5TabEntry.data
        │                            #   is null when evicted, meta/hasSlices always present
        └── features/
            ├── h5/               # H5Viewer (3-D), H5SliceViewer (2-D), H5FileTabs
            ├── stl/              # STLViewer
            ├── controls/         # ControlsPanel, PreprocessingSection, SliderRow (LUT)
            ├── stitcher/         # StitcherPanel, useStitchSession, StitchResults
            ├── toolbar/          # Toolbar, useFileLoad
            └── notifications/    # AppSnackbar
```

---

## Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Python 3.11 · FastAPI · h5py · NumPy · SciPy · scikit-image · SimpleITK |
| Backend (optional) | itk-elastix |
| Frontend | React 18 · TypeScript · Three.js · MUI v6 · Zustand · Vite |
| Infra | Docker Compose · uv · Node 20 |

### Performance notes

- **Browser memory**: inactive tabs are evicted from the JS heap to IndexedDB
  (`shared/h5/volumeCache.ts`); at most 2 volumes (~400 MB) reside in RAM at once,
  regardless of how many files are open. Filtered results are re-persisted so
  eviction never loses a processed volume.
- **Backend normalisation** uses a Uint8-first two-pass approach (peak ~260 MB
  for 512×250×250). Large merged volumes are processed in 32-slice chunks to
  avoid a full-volume boolean mask in RAM.
- **Stitching memory**: individual volumes are freed before normalisation;
  the merged array is freed and reloaded via `mmap_mode='r'` so only OS page
  cache stays in RAM during the normalisation step.
- **Render-ready binary**: volume data from all backend endpoints arrives
  pre-normalised — no Web Worker, no JS sorting, near-instant parse via
  typed-array views into the response `ArrayBuffer`.
- **Bundle splitting**: Three.js, h5wasm, and MUI are in separate Vite chunks
  (`manualChunks`), so browser-cached library builds are not invalidated by
  app-code changes. App-code chunk is ~75 KB gzipped.
- **Slice rendering**: 256-entry LUT replaces per-pixel `Math.pow()` calls;
  canvas updates are coalesced with `requestAnimationFrame`.
- **WebGL contexts**: each viewer keeps a persistent canvas `useRef` so React
  StrictMode's double-mount reuses the same WebGL context instead of allocating
  a second one (browsers cap active contexts at ~16).
