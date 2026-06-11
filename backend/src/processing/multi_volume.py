import logging

import numpy as np
from scipy.fft import fft2, ifft2, next_fast_len
from scipy.spatial import KDTree
from scipy.spatial.distance import directed_hausdorff

logger = logging.getLogger(__name__)

_SURFACE_SAMPLE_MAX = 10_000
_ICP_MAX_ITER = 50
_ICP_TOLERANCE = 1e-4


def compute_mip(vol: np.ndarray) -> np.ndarray:
    """Maximum Intensity Projection along the depth (z) axis.

    Args:
        vol: Float32 array of shape (n_slices, height, width).

    Returns:
        2D float32 array of shape (height, width).
    """
    return np.max(vol, axis=0).astype(np.float32)


def segment_surface(vol: np.ndarray, threshold: float = 0.05) -> np.ndarray:
    """Find the depth index of the first high-intensity voxel for each lateral position.

    Args:
        vol: Float32 array of shape (n_slices, height, width).
        threshold: Minimum intensity to be considered surface.

    Returns:
        Int32 height map of shape (height, width). Positions with no value above
        threshold receive index 0.
    """
    mask = vol > threshold
    height_map = np.argmax(mask, axis=0).astype(np.int32)
    # Positions with no above-threshold voxel get sentinel -1 so the frontend
    # overlay check (map[i] === sliceIndex, sliceIndex >= 0) never matches them.
    height_map[~mask.any(axis=0)] = -1
    return height_map


def extract_surface_pointcloud(
    vol: np.ndarray,
    max_points: int = _SURFACE_SAMPLE_MAX,
) -> np.ndarray:
    """Extract a 3D point cloud from the OCT surface height map.

    Args:
        vol: Float32 array of shape (n_slices, height, width).
        max_points: Maximum number of points to return (random subsample).

    Returns:
        Float32 array of shape (N, 3) with columns [z, y, x].
    """
    height_map = segment_surface(vol)
    ys, xs = np.meshgrid(np.arange(vol.shape[1]), np.arange(vol.shape[2]), indexing="ij")
    pts = np.stack([height_map.ravel(), ys.ravel(), xs.ravel()], axis=1).astype(np.float32)

    if len(pts) > max_points:
        rng = np.random.default_rng(seed=0)
        idx = rng.choice(len(pts), size=max_points, replace=False)
        pts = pts[idx]

    return pts


def icp_translation(
    source: np.ndarray,
    target: np.ndarray,
    max_iter: int = _ICP_MAX_ITER,
    tolerance: float = _ICP_TOLERANCE,
) -> np.ndarray:
    """Translation-only ICP: align source point cloud to target.

    Args:
        source: Float32 array of shape (N, 3) — the moving cloud.
        target: Float32 array of shape (M, 3) — the fixed cloud.
        max_iter: Maximum number of ICP iterations.
        tolerance: Stop when the update norm is below this value.

    Returns:
        Float32 array of shape (3,) representing [dz, dy, dx] total translation
        that moves *source* towards *target*.
    """
    pts = source.copy().astype(np.float64)
    total_t = np.zeros(3, dtype=np.float64)
    tree = KDTree(target.astype(np.float64))

    for _ in range(max_iter):
        _, indices = tree.query(pts)
        delta = np.mean(target[indices].astype(np.float64) - pts, axis=0)
        pts += delta
        total_t += delta
        if np.linalg.norm(delta) < tolerance:
            break

    logger.debug("icp_translation converged with total shift %s", total_t)
    return total_t.astype(np.float32)


def hausdorff_distance(pts_a: np.ndarray, pts_b: np.ndarray) -> float:
    """Symmetric Hausdorff distance between two point clouds.

    Args:
        pts_a: Float array of shape (N, D).
        pts_b: Float array of shape (M, D).

    Returns:
        Symmetric Hausdorff distance (max of both directed distances).
    """
    d_ab = directed_hausdorff(pts_a, pts_b)[0]
    d_ba = directed_hausdorff(pts_b, pts_a)[0]
    return float(max(d_ab, d_ba))


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
        method: One of ``"phase_correlation"``, ``"cross_correlation"``, ``"icp"``.
        params: Method-specific keyword overrides.

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

    if method == "icp":
        pts_a = extract_surface_pointcloud(vol_a)
        pts_b = extract_surface_pointcloud(vol_b)
        t = icp_translation(pts_b, pts_a)
        logger.debug("register_pair [icp]: (dz=%f, dy=%f, dx=%f)", t[0], t[1], t[2])
        return float(t[1]), float(t[2])

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
