from pathlib import Path

import h5py
import numpy as np

OCT_DIMS = (512, 250, 250)  # nSlices, height, width — fixed for all files


def load_volume(path: Path) -> np.ndarray:
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
