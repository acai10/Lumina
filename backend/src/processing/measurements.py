import logging

import numpy as np
import scipy.ndimage as ndi

logger = logging.getLogger(__name__)


def compute_measurements(
    volume: np.ndarray,
    threshold: float = 0.05,
    voxel_size_um: tuple[float, float, float] = (1.0, 1.0, 1.0),
) -> dict[str, float]:
    """Compute geometric measurements of the thresholded OCT tissue region.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        threshold: Intensity threshold that defines the tissue mask.
        voxel_size_um: Physical size of one voxel in micrometres as
            ``(dz, dy, dx)`` — i.e. (slice spacing, row spacing, col spacing).

    Returns:
        Dict with keys:
        - ``voxel_count`` (int): Number of above-threshold voxels.
        - ``volume_um3`` (float): Total tissue volume in µm³.
        - ``surface_area_um2`` (float): Surface area of the tissue mask (µm²),
          estimated via the voxel face-count method.
        - ``mean_thickness_um`` (float): Mean tissue depth per lateral column in µm.
        - ``max_thickness_um`` (float): Maximum tissue depth in µm.
        - ``lateral_diameter_um`` (float): Lateral extent — longest axis of the
          projected mask bounding box — in µm.
    """
    dz, dy, dx = float(voxel_size_um[0]), float(voxel_size_um[1]), float(voxel_size_um[2])
    mask = (volume > threshold).astype(np.uint8)

    # ── Volume ─────────────────────────────────────────────────────────────────
    voxel_count = int(mask.sum())
    voxel_vol_um3 = dz * dy * dx
    volume_um3 = voxel_count * voxel_vol_um3

    # ── Surface area (face-count heuristic) ────────────────────────────────────
    # Each exposed face of a boundary voxel contributes one face-area unit.
    # Erode the mask by 1 voxel; the shell is mask - eroded_mask.
    eroded = ndi.binary_erosion(mask).astype(np.uint8)
    shell = mask - eroded
    face_xy = float(dx * dy)
    face_xz = float(dx * dz)
    face_yz = float(dy * dz)
    # Count exposed faces along each axis using diff — exposed if neighbour is outside.
    def _exposed_faces(arr: np.ndarray, axis: int) -> int:
        return int(np.abs(np.diff(arr, axis=axis, prepend=0, append=0)).clip(0).sum())

    sa_um2 = (
        _exposed_faces(shell, 0) * face_xy  # top/bottom faces (XY plane)
        + _exposed_faces(shell, 1) * face_xz  # front/back faces (XZ plane)
        + _exposed_faces(shell, 2) * face_yz  # left/right faces (YZ plane)
    )

    # ── Thickness per lateral column ───────────────────────────────────────────
    # Thickness = number of above-threshold voxels stacked along the slice axis.
    col_counts = mask.sum(axis=0).astype(np.float32)  # shape (height, width)
    lateral_mask = col_counts > 0
    if lateral_mask.any():
        mean_thick_um = float(col_counts[lateral_mask].mean()) * dz
        max_thick_um = float(col_counts.max()) * dz
    else:
        mean_thick_um = 0.0
        max_thick_um = 0.0

    # ── Lateral diameter ───────────────────────────────────────────────────────
    proj_y = lateral_mask.any(axis=1)  # (height,) — rows with tissue
    proj_x = lateral_mask.any(axis=0)  # (width,)  — cols with tissue
    extent_y = float(proj_y.sum()) * dy
    extent_x = float(proj_x.sum()) * dx
    lateral_diameter_um = max(extent_y, extent_x)

    return {
        "voxel_count": voxel_count,
        "volume_um3": round(volume_um3, 3),
        "surface_area_um2": round(sa_um2, 3),
        "mean_thickness_um": round(mean_thick_um, 3),
        "max_thickness_um": round(max_thick_um, 3),
        "lateral_diameter_um": round(lateral_diameter_um, 3),
    }
