"""Registration and merging of overlapping OCT tiles into one large scan.

This is the core of the stitching pipeline, in the order the session runner calls it:

1. :func:`compute_mip` flattens each 3-D tile to a 2-D maximum-intensity projection,
   because registration only has to recover a lateral shift.
2. :func:`_phase_corr_padded` estimates the shift between two projections by phase
   correlation. The zero-padding is the important detail; see its docstring.
3. :func:`compute_global_offsets` turns the pairwise shifts into one absolute
   position per tile by breadth-first traversal from the origin tile.
4. :func:`merge_volumes` blends the tiles onto a common canvas by taking the
   per-voxel maximum, which suits OCT because bright voxels carry signal.

The tiles are assumed to differ by lateral translation only: no rotation or scale is
estimated. Full derivations and worked examples are in
``docs/08-stitching-registration.md``.
"""
import logging

import numpy as np
from scipy.fft import fft2, ifft2, next_fast_len

logger = logging.getLogger(__name__)


def compute_mip(vol: np.ndarray) -> np.ndarray:
    """Maximum Intensity Projection along the depth (z) axis.

    Args:
        vol: Float32 array of shape (n_slices, height, width).

    Returns:
        2D float32 array of shape (height, width).
    """
    return np.max(vol, axis=0).astype(np.float32)


def _phase_corr_padded(img_a: np.ndarray, img_b: np.ndarray) -> tuple[float, float]:
    """Non-circular phase correlation via zero-padding.

    Standard phase_cross_correlation wraps shifts into [-N/2, N/2), which aliases
    large lateral offsets (> N/2 pixels) to the wrong sign.  Zero-padding to
    ≥ 2N-1 makes the correlation linear so every shift maps to a unique peak.

    Args:
        img_a: 2-D reference image (float32).
        img_b: 2-D moving image (float32).

    Returns:
        Tuple ``(dy, dx)`` — pixel shift of *img_b* relative to *img_a*.
    """
    H, W = img_a.shape
    H2 = next_fast_len(2 * H - 1)
    W2 = next_fast_len(2 * W - 1)

    fa = fft2(img_a.astype(np.float64), s=(H2, W2))
    fb = fft2(img_b.astype(np.float64), s=(H2, W2))
    cross = fa * np.conj(fb)
    cross /= np.abs(cross) + 1e-10
    cc = np.real(ifft2(cross))
    peak = np.unravel_index(np.argmax(cc), cc.shape)
    dy, dx = float(peak[0]), float(peak[1])
    if dy > H2 // 2:
        dy -= H2
    if dx > W2 // 2:
        dx -= W2
    return dy, dx


def register_pair(
    vol_a: np.ndarray,
    vol_b: np.ndarray,
    method: str = "phase_correlation",
) -> tuple[float, float]:
    """Estimate the lateral (dy, dx) translation of vol_b relative to vol_a.

    The depth (z) axis is assumed identical for all volumes; only in-plane
    translation is returned.

    Args:
        vol_a: Reference float32 volume (n_slices, height, width).
        vol_b: Moving float32 volume (n_slices, height, width).
        method: One of ``"phase_correlation"``, ``"cross_correlation"``.

    Returns:
        Tuple ``(dy, dx)`` — pixel shift of vol_b relative to vol_a.

    Raises:
        ValueError: If *method* is not recognised.
    """
    mip_a = compute_mip(vol_a)
    mip_b = compute_mip(vol_b)

    if method in ("phase_correlation", "cross_correlation"):
        dy, dx = _phase_corr_padded(mip_a, mip_b)
        logger.debug("register_pair [%s]: (dy=%f, dx=%f)", method, dy, dx)
        return dy, dx

    raise ValueError(f"Unknown registration method: {method!r}")


def compute_global_offsets(
    volume_ids: list[str],
    grid_positions: dict[str, tuple[int, int]],
    pairwise_shifts: dict[tuple[str, str], tuple[float, float]],
) -> dict[str, tuple[float, float]]:
    """Convert pairwise shifts into absolute (dy, dx) offsets via BFS from the origin.

    Args:
        volume_ids: All volume IDs in the session.
        grid_positions: Maps ``volume_id → (row, col)`` for each volume.
        pairwise_shifts: Maps ``(id_a, id_b) → (dy, dx)`` shift of *b* relative to *a*.

    Returns:
        Maps each ``volume_id → (dy, dx)`` absolute offset. Volumes not reached
        by BFS default to ``(0.0, 0.0)``.
    """
    sorted_ids = sorted(volume_ids, key=lambda vid: grid_positions[vid])
    origin = sorted_ids[0]

    offsets: dict[str, tuple[float, float]] = {origin: (0.0, 0.0)}
    queue = [origin]

    while queue:
        current = queue.pop(0)
        cur_dy, cur_dx = offsets[current]

        for (a, b), (dy, dx) in pairwise_shifts.items():
            if a == current and b not in offsets:
                offsets[b] = (cur_dy + dy, cur_dx + dx)
                queue.append(b)
            elif b == current and a not in offsets:
                offsets[a] = (cur_dy - dy, cur_dx - dx)
                queue.append(a)

    for vid in volume_ids:
        if vid not in offsets:
            logger.warning("Volume %s not reachable from origin; using (0, 0)", vid)
            offsets[vid] = (0.0, 0.0)

    return offsets


def merge_volumes(
    volumes: list[np.ndarray],
    offsets: list[tuple[float, float]],
) -> np.ndarray:
    """Merge multiple OCT volumes at given lateral offsets using max-intensity blending.

    Args:
        volumes: List of float32 arrays, each ``(n_slices, height, width)``.
        offsets: List of ``(dy, dx)`` pixel offsets, one per volume.

    Returns:
        Merged float32 array of shape ``(n_slices, total_height, total_width)``.

    Raises:
        ValueError: If *volumes* is empty or contains volumes with different shapes.
    """
    if not volumes:
        raise ValueError("volumes list is empty")

    n_slices, h, w = volumes[0].shape
    for i, vol in enumerate(volumes[1:], start=1):
        if vol.shape != (n_slices, h, w):
            raise ValueError(
                f"All volumes must share one shape: volume 0 is {(n_slices, h, w)}, "
                f"volume {i} is {vol.shape}"
            )
    int_offsets = [(int(round(dy)), int(round(dx))) for dy, dx in offsets]

    min_dy = min(o[0] for o in int_offsets)
    min_dx = min(o[1] for o in int_offsets)
    norm = [(dy - min_dy, dx - min_dx) for dy, dx in int_offsets]

    total_h = max(o[0] for o in norm) + h
    total_w = max(o[1] for o in norm) + w

    merged = np.zeros((n_slices, total_h, total_w), dtype=np.float32)

    for vol, (dy, dx) in zip(volumes, norm, strict=True):
        region = merged[:, dy : dy + h, dx : dx + w]
        merged[:, dy : dy + h, dx : dx + w] = np.maximum(region, vol)

    logger.info("merge_volumes: %d volumes → shape %s", len(volumes), merged.shape)
    return merged


def overlap_crop(
    vol_a: np.ndarray,
    vol_b: np.ndarray,
    dy: float,
    dx: float,
) -> tuple[np.ndarray, np.ndarray] | None:
    """Crop the overlapping region between vol_a and vol_b given their relative shift.

    Args:
        vol_a: Float32 array (n_slices, height, width).
        vol_b: Float32 array (n_slices, height, width).
        dy: Vertical pixel shift of vol_b relative to vol_a.
        dx: Horizontal pixel shift of vol_b relative to vol_a.

    Returns:
        Tuple ``(crop_a, crop_b)`` or ``None`` if there is no overlap.
    """
    h, w = vol_a.shape[1], vol_a.shape[2]
    dy_i, dx_i = int(round(dy)), int(round(dx))

    a_y0 = max(0, dy_i)
    a_y1 = min(h, h + dy_i)
    b_y0 = max(0, -dy_i)
    b_y1 = min(h, h - dy_i)

    a_x0 = max(0, dx_i)
    a_x1 = min(w, w + dx_i)
    b_x0 = max(0, -dx_i)
    b_x1 = min(w, w - dx_i)

    ov_h = min(a_y1 - a_y0, b_y1 - b_y0)
    ov_w = min(a_x1 - a_x0, b_x1 - b_x0)

    if ov_h <= 0 or ov_w <= 0:
        return None

    return (
        vol_a[:, a_y0 : a_y0 + ov_h, a_x0 : a_x0 + ov_w],
        vol_b[:, b_y0 : b_y0 + ov_h, b_x0 : b_x0 + ov_w],
    )
