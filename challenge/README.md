# Challenge submission tools

Helpers to produce and verify the **challenge-result `.h5` files** required by the
PBL challenge ("Einführung in Medizintechnische Systeme", SoSe 2026).

The graded data deliverable is one HDF5 file **per evaluated dataset**, sent by
**e-mail** to `maximilian.neidhardt@tuhh.de` **and** `sarah.latus@tuhh.de` by the
**28 June, 23:59** deadline. Late submissions are not accepted.

## Required file format

Each result file must follow this layout (matches the assignment's `h5disp`
example):

```text
HDF5 result.h5
Group '/'
    Dataset 'mask'        # tissue dataset only — 0 = fat, 1 = muscle
        Size:     H x W
        Datatype: H5T_IEEE_F64LE (double)
    Dataset 'surface'     # depth values in millimetres
        Size:     H x W
        Datatype: H5T_IEEE_F64LE (double)
        Attributes:
            'dx': <pixel spacing x [mm]>
            'dy': <pixel spacing y [mm]>
```

- **`surface`** — 2D `double` matrix of depth values in **mm**.
- **`mask`** — 2D `double` binary segmentation, **`0` = fat, `1` = muscle**.
  Present **only** for the tissue dataset; the two 3D-print phantom datasets have
  **no** mask.
- **`dx` / `dy`** — pixel spacing in **mm**, stored as **attributes of the
  `surface` dataset** (not a separate dataset, not on the root group).
- Everything (incl. `mask`) is `float64` ("double"), exactly as the example shows.

## Usage

```python
import numpy as np
from challenge_io import save_challenge_result, validate_challenge_file

# Phantom datasets (no mask):
save_challenge_result("phantom_1.h5", surface=depths_mm, dx=0.1, dy=0.08)
save_challenge_result("phantom_2.h5", surface=depths_mm_2, dx=0.1, dy=0.08)

# Tissue dataset (with binary mask, 0 = fat, 1 = muscle):
save_challenge_result("tissue.h5", surface=depths_mm_3, dx=0.1, dy=0.08, mask=seg)

# Verify before sending:
validate_challenge_file("phantom_1.h5", expect_mask=False)  # raises if invalid
validate_challenge_file("tissue.h5", expect_mask=True)
```

`save_challenge_result` accepts any numeric dtype and converts to `float64`; it
raises early if the surface is not 2D, `dx`/`dy` are not positive, or the mask is
the wrong shape or not strictly binary.

### Reading a file back

```python
from challenge_io import load_challenge_result

r = load_challenge_result("tissue.h5")
r.surface   # (H, W) float64, depth [mm]
r.mask      # (H, W) float64 or None
r.dx, r.dy  # floats [mm]
r.has_mask  # bool
```

## Command line

```bash
# h5disp-style dump to eyeball the format
python challenge_io.py show tissue.h5

# validate against the spec (exit code 1 if invalid)
python challenge_io.py validate tissue.h5 --tissue
python challenge_io.py validate phantom_1.h5 --phantom

# write reference example files (phantom + tissue) to ./out
python challenge_io.py demo out
```

## Input data (`challenge_data.py`)

The raw challenge datasets live under `challenge/data/` (provided separately, **not
in git** — ~8 GB). Layout:

```text
data/Challenge_Dataset/
    5_DataSet_1/   Vol_1_1.h5 … Vol_5_5.h5   (5×5 stitching grid, 25 tiles)
    5_DataSet_2/   …
    5_DataSet_3/   …
```

Each `Vol_<row>_<col>.h5` holds one OCT tile as dataset `OCT` of shape
`(1, 32_000_000)` (float64), plus a root attribute `vol_size = [width, height,
n_slices]` (e.g. `[250, 250, 512]`). The flat array reshapes (C-order) to
`(n_slices, height, width) = (512, 250, 250)` — the **reverse** of `vol_size`,
the same `(z, y, x)` layout Lumina uses. (Verified empirically: only this ordering
yields a structured depth/A-scan profile.) The filename encodes the grid position.

```python
from challenge_data import list_datasets, dataset_grid, load_input_volume

datasets = list_datasets("data")              # {'5_DataSet_1': Path(...), ...}
grid = dataset_grid(datasets["5_DataSet_1"])  # {(row, col): path}
vol = load_input_volume(grid[(1, 1)])         # (512, 250, 250) float64
```

Tiles are returned as **paths** (not loaded), because a full grid is ~6 GB in RAM —
load each tile on demand.

## Baseline evaluation pipeline (`evaluate.py`)

Turns one raw dataset grid into a finished submission file end-to-end: load tiles →
stitch (phase correlation + BFS global offsets) → extract surface depth map →
(tissue only) muscle/fat mask → write + validate.

```bash
# all datasets at once -> submission_<dataset>.h5 in ./out
# (DataSet_3 is auto-detected as the tissue set and gets a mask; the others don't)
python evaluate.py data -o out --all

# a single phantom dataset (surface only)
python evaluate.py data/Challenge_Dataset/5_DataSet_1 -o sub_1.h5

# a single tissue dataset (adds a mask)
python evaluate.py data/Challenge_Dataset/5_DataSet_3 -o sub_3.h5 --tissue

# override the spacing if the project description differs
python evaluate.py data/Challenge_Dataset/5_DataSet_1 -o sub_1.h5 --dx 0.1 --dy 0.08 --dz 0.01
```

Which dataset is tissue is configured in `evaluate.py` via `TISSUE_DATASETS`
(currently `5_DataSet_3`, confirmed by the course); only that one receives a `mask`.

> ⚠️ **This is a baseline / starting point, not a finished method.**
>
> - **Spacing defaults to Lumina's own constant**: 4 µm/px = `0.004` mm,
>   isotropic (`DEFAULT_VOXEL_SIZE_UM` in `frontend/src/shared/constants.ts`,
>   from "250 px = 1 mm") — the value the system already uses for measurements.
>   The spacings are **not stored in the data**; override with `--dx/--dy/--dz`
>   if the project description states other values. (The slide's `0.1 / 0.08`
>   were only an example file.)
> - **Surface** = "depth of the brightest reflection per A-scan"; **mask** =
>   "Otsu split on surface brightness, brighter class = muscle". Both are simple,
>   defensible baselines — replace them with your system's real methods. The
>   functions (`extract_surface_index`, `segment_from_mip`) are isolated so they
>   are easy to swap.
> - You still need to know **which dataset is the tissue one** (the only one that
>   gets a `mask`) — likewise from the project description.

Verified on the real data: each 5×5 grid stitches and writes a valid submission
file (e.g. `surface` 693×665, with `dx`/`dy` attributes) in ~20 s.

## Running the tests

This folder reuses the backend's Python environment (it already provides `numpy`,
`h5py`, and `pytest`):

```bash
cd backend && uv run pytest ../challenge -q
```

## API reference

| Function | Purpose |
| -------- | ------- |
| `save_challenge_result(path, surface, dx, dy, mask=None)` | Write a result file in the required format. |
| `load_challenge_result(path) -> ChallengeResult` | Read a result file back. |
| `check_challenge_file(path, *, expect_mask=None) -> list[str]` | Validate; returns a list of problems (empty = OK). |
| `validate_challenge_file(path, *, expect_mask=None)` | Validate; raises `ValueError` listing all problems. |
| `describe_h5(path) -> str` | `h5disp`-style description string. |
