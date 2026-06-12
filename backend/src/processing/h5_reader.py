from pathlib import Path

import h5py
import numpy as np

OCT_DIMS = (512, 250, 250)  # nSlices, height, width — fixed for all files


def load_volume_flexible(path: Path) -> np.ndarray:
    """Load an OCT volume without strict shape constraints (for merged results).

    Accepts any 3D shape. Flat or 2D datasets whose total element count matches
    :data:`OCT_DIMS` are automatically reshaped to ``(512, 250, 250)``.

    Args:
        path: Path to the ``.h5`` file containing an ``"OCT"`` dataset.

    Returns:
        Float32 array, guaranteed to be 3-dimensional.

    Raises:
        ValueError: If the ``"OCT"`` dataset is missing or cannot be made 3D.
    """
    with h5py.File(path, "r") as f:
        ds = f.get("OCT")
        if ds is None:
            raise ValueError('Dataset "OCT" not found in file')
        arr = np.asarray(ds, dtype=np.float32)
    if arr.ndim != 3:
        expected = OCT_DIMS[0] * OCT_DIMS[1] * OCT_DIMS[2]
        if arr.size == expected:
            arr = arr.reshape(OCT_DIMS)
        else:
            raise ValueError(
                f'Dataset "OCT" has shape {arr.shape} and cannot be interpreted as a 3D volume'
            )
    return arr


def save_oct_volume(path: Path, arr: np.ndarray) -> None:
    """Write *arr* to *path* as an HDF5 file with the standard ``"OCT"`` dataset.

    Used for derived volumes (e.g. crops) so they are persisted in exactly the
    same on-disk layout as uploaded files and can be read back by
    :func:`load_volume_flexible`.

    Args:
        path: Destination ``.h5`` path. Overwritten if it exists.
        arr: 3-D volume array; stored as float32.
    """
    with h5py.File(path, "w") as f:
        f.create_dataset("OCT", data=arr.astype(np.float32))


def validate_volume_file(path: Path) -> None:
    """Validate an OCT ``.h5`` file using metadata only — no bulk read.

    Opens *path* and checks that the ``"OCT"`` dataset exists and its element
    count matches :data:`OCT_DIMS`, inspecting only ``ds.shape`` / ``ds.size``.
    Unlike :func:`load_volume` this never materialises the ~128 MB array, so it
    is cheap enough to run on every upload/registration.

    Args:
        path: Path to the ``.h5`` file.

    Raises:
        ValueError: If the ``"OCT"`` dataset is missing or its element count
            does not match the expected :data:`OCT_DIMS` size.
    """
    expected = OCT_DIMS[0] * OCT_DIMS[1] * OCT_DIMS[2]
    with h5py.File(path, "r") as f:
        ds = f.get("OCT")
        if ds is None:
            raise ValueError('Dataset "OCT" not found in file')
        if ds.shape != OCT_DIMS and ds.size != expected:
            raise ValueError(f"Expected {expected} elements {OCT_DIMS}, got shape {ds.shape}")


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
