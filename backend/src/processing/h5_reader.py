from pathlib import Path

import h5py
import numpy as np

OCT_DIMS = (512, 250, 250)  # nSlices, height, width — fixed for all files


def load_volume_flexible(path: Path) -> np.ndarray:
    """Load an OCT volume without shape constraints (for merged results).

    Args:
        path: Path to the ``.h5`` file containing an ``"OCT"`` dataset.

    Returns:
        Float32 array with the dataset's native shape.

    Raises:
        ValueError: If the ``"OCT"`` dataset is missing.
    """
    with h5py.File(path, "r") as f:
        ds = f.get("OCT")
        if ds is None:
            raise ValueError('Dataset "OCT" not found in file')
        return np.asarray(ds, dtype=np.float32)


def load_volume(path: Path) -> np.ndarray:
    """Load an OCT volume from an HDF5 file.

    Reads the ``"OCT"`` dataset from *path*, validates its size against
    :data:`OCT_DIMS`, and reshapes flat arrays if necessary.

    Args:
        path: Path to the ``.h5`` file.

    Returns:
        Float32 array of shape ``(512, 250, 250)``.

    Raises:
        ValueError: If the ``"OCT"`` dataset is missing or the array size
            does not match the expected element count.
    """
    with h5py.File(path, "r") as f:
        ds = f.get("OCT")
        if ds is None:
            raise ValueError('Dataset "OCT" not found in file')
        arr = np.asarray(ds, dtype=np.float32)
    expected = OCT_DIMS[0] * OCT_DIMS[1] * OCT_DIMS[2]
    if arr.shape != OCT_DIMS:
        if arr.size != expected:
            raise ValueError(f"Expected {expected} elements {OCT_DIMS}, got shape {arr.shape}")
        arr = arr.reshape(OCT_DIMS)
    return arr
