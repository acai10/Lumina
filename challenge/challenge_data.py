"""Load the raw challenge input volumes.

The challenge datasets (provided separately, not in git — see ``challenge/data/``)
are organised as::

    Challenge_Dataset/
        5_DataSet_1/   Vol_1_1.h5 … Vol_5_5.h5   (5×5 grid, 25 volumes)
        5_DataSet_2/   Vol_1_1.h5 … Vol_5_5.h5
        5_DataSet_3/   Vol_1_1.h5 … Vol_5_5.h5

Each ``Vol_<row>_<col>.h5`` holds one OCT tile:

    Dataset 'OCT'  : shape (1, 32_000_000), float64  — flat volume
    root attr 'vol_size' : [width, height, n_slices]  e.g. [250, 250, 512]

The flat array reshapes (C-order) to ``(n_slices, height, width)`` =
``(512, 250, 250)`` — i.e. the reverse of ``vol_size`` — which is the same
``(z, y, x)`` layout Lumina's backend uses. (Verified empirically: only this
ordering yields a structured depth/A-scan profile; the alternative is flat noise.)

The ``Vol_<row>_<col>`` filename encodes the **grid position** used for stitching.
"""

from __future__ import annotations

import re
from pathlib import Path

import h5py
import numpy as np

OCT_DATASET = "OCT"
VOL_SIZE_ATTR = "vol_size"
#: Default (z, y, x) shape when a file carries no ``vol_size`` attribute.
DEFAULT_SHAPE = (512, 250, 250)
_GRID_RE = re.compile(r"Vol_(\d+)_(\d+)", re.IGNORECASE)


def parse_grid_position(name: str | Path) -> tuple[int, int]:
    """Extract the ``(row, col)`` grid position from a ``Vol_<row>_<col>`` name.

    Args:
        name: A filename or path such as ``"Vol_2_5.h5"``.

    Returns:
        The 1-based ``(row, col)`` exactly as written in the filename.

    Raises:
        ValueError: If the name does not contain a ``Vol_<row>_<col>`` pattern.
    """
    stem = Path(name).name
    match = _GRID_RE.search(stem)
    if match is None:
        raise ValueError(
            f"Cannot parse grid position from {stem!r} (expected 'Vol_<row>_<col>')"
        )
    return int(match.group(1)), int(match.group(2))


def _target_shape(vol_size: np.ndarray | None, n_elements: int) -> tuple[int, int, int]:
    """Resolve the ``(z, y, x)`` reshape target from a ``vol_size`` attribute."""
    if vol_size is None:
        shape = DEFAULT_SHAPE
    else:
        # vol_size is [width, height, n_slices] = [x, y, z]; numpy wants (z, y, x).
        dims = [int(round(float(v))) for v in np.asarray(vol_size).ravel()]
        if len(dims) != 3:
            raise ValueError(f"'{VOL_SIZE_ATTR}' must have 3 entries, got {dims}")
        shape = (dims[2], dims[1], dims[0])
    if shape[0] * shape[1] * shape[2] != n_elements:
        raise ValueError(
            f"shape {shape} ({shape[0] * shape[1] * shape[2]} elems) does not match "
            f"dataset element count {n_elements}"
        )
    return shape


def load_input_volume(path: str | Path) -> np.ndarray:
    """Load one challenge tile as a 3D ``(z, y, x)`` float64 volume.

    Reads the flat ``OCT`` dataset and reshapes it to ``(n_slices, height, width)``
    using the file's ``vol_size`` attribute (falling back to ``(512, 250, 250)``).

    Args:
        path: Path to a ``Vol_<row>_<col>.h5`` file.

    Returns:
        A C-contiguous float64 array of shape ``(z, y, x)`` (e.g. ``(512, 250, 250)``).

    Raises:
        ValueError: If the ``OCT`` dataset is missing or its size is inconsistent
            with ``vol_size``.
    """
    path = Path(path)
    with h5py.File(path, "r") as f:
        if OCT_DATASET not in f:
            raise ValueError(f"Missing '{OCT_DATASET}' dataset in {path}")
        flat = np.asarray(f[OCT_DATASET], dtype=np.float64).ravel()
        vol_size = f.attrs.get(VOL_SIZE_ATTR)
    shape = _target_shape(vol_size, flat.size)
    return np.ascontiguousarray(flat.reshape(shape))


def dataset_grid(folder: str | Path) -> dict[tuple[int, int], Path]:
    """Map every ``Vol_<row>_<col>.h5`` in *folder* to its grid position.

    Args:
        folder: A dataset directory (e.g. ``.../5_DataSet_1``).

    Returns:
        Dict ``{(row, col): path}``. Paths are returned (not loaded) because a
        full 5×5 grid is ~6 GB in memory — load tiles on demand with
        :func:`load_input_volume`.

    Raises:
        FileNotFoundError: If *folder* does not exist.
    """
    folder = Path(folder)
    if not folder.is_dir():
        raise FileNotFoundError(f"No such dataset folder: {folder}")
    grid: dict[tuple[int, int], Path] = {}
    for h5 in sorted(folder.glob("Vol_*.h5")):
        grid[parse_grid_position(h5)] = h5
    return grid


def list_datasets(root: str | Path) -> dict[str, Path]:
    """List dataset sub-folders under a challenge root.

    Args:
        root: Either a ``Challenge_Dataset`` directory or a parent containing it.

    Returns:
        Dict ``{dataset_name: folder_path}`` for each sub-folder that holds at
        least one ``Vol_*.h5`` tile, sorted by name.
    """
    root = Path(root)
    base = root / "Challenge_Dataset"
    if not base.is_dir():
        base = root
    datasets: dict[str, Path] = {}
    for child in sorted(p for p in base.iterdir() if p.is_dir()):
        if any(child.glob("Vol_*.h5")):
            datasets[child.name] = child
    return datasets
