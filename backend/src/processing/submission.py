"""Build challenge-submission outputs from a (stitched) OCT volume.

The PBL challenge deliverable is, per dataset, an HDF5 file containing:

    Dataset 'surface'  : 2D float64 depth map [mm]   (+ attrs 'dx', 'dy' in mm)
    Dataset 'mask'     : 2D float64 binary muscle/fat map (tissue dataset only;
                         0 = fat, 1 = muscle)

This module turns a 3D OCT volume (e.g. the merged result of a stitching session,
produced by Lumina's own stitcher) into that file, plus PNG previews. The 3D
loading/stitching is done by the existing project code (``h5_reader`` /
``multi_volume`` / ``session_runner``); this module only adds the surface
extraction, segmentation, writer, and preview rendering that the challenge needs.
"""

import io
import json
import logging
from pathlib import Path

import h5py
import numpy as np
import scipy.ndimage as ndi
from PIL import Image
from skimage.filters import threshold_otsu

logger = logging.getLogger(__name__)

# Voxel spacing [mm]. Mirrors the frontend's DEFAULT_VOXEL_SIZE_UM = [4, 4, 4]
# µm/px ("250 px = 1 mm" -> 0.004 mm/px), the value Lumina uses everywhere.
DEFAULT_DX_MM = 0.004
DEFAULT_DY_MM = 0.004
DEFAULT_DZ_MM = 0.004

SURFACE_DATASET = "surface"
MASK_DATASET = "mask"
#: Median-filter window (px) applied to the raw depth map to suppress speckle.
_SURFACE_MEDIAN_SIZE = 5
#: Percentile window for the grayscale PNG stretch (robust to depth outliers).
_PNG_LOW_PCT, _PNG_HIGH_PCT = 1.0, 99.0


def extract_surface(volume: np.ndarray, dz: float = DEFAULT_DZ_MM) -> np.ndarray:
    """Per-column surface depth in millimetres.

    For every lateral ``(y, x)`` position the surface is taken as the depth of the
    brightest voxel along the A-scan (z axis); the resulting index map is
    median-filtered to suppress speckle, then scaled to mm by *dz*.

    Args:
        volume: 3D OCT volume ``(z, y, x)``.
        dz: Axial spacing in mm per depth pixel.

    Returns:
        2D float64 depth map ``(y, x)`` in millimetres.
    """
    if volume.ndim != 3:
        raise ValueError(f"Expected a 3D volume (z, y, x), got shape {volume.shape}")
    idx = volume.argmax(axis=0).astype(np.float64)
    idx = ndi.median_filter(idx, size=_SURFACE_MEDIAN_SIZE)
    return idx * float(dz)


def segment_muscle_fat(volume: np.ndarray) -> np.ndarray:
    """Binary muscle/fat segmentation from surface reflectivity (Otsu split).

    Uses the maximum-intensity projection (surface brightness) and splits it at
    Otsu's threshold; the brighter class is labelled muscle (1), the dimmer fat (0).

    Args:
        volume: 3D OCT volume ``(z, y, x)``.

    Returns:
        2D float64 mask ``(y, x)`` with values in {0.0, 1.0}.
    """
    mip = volume.max(axis=0)
    finite = mip[np.isfinite(mip)]
    if finite.size == 0 or float(finite.min()) == float(finite.max()):
        return np.zeros(mip.shape, dtype=np.float64)
    thr = float(threshold_otsu(mip))
    return (mip >= thr).astype(np.float64)


def write_submission(
    path: str | Path,
    surface: np.ndarray,
    dx: float = DEFAULT_DX_MM,
    dy: float = DEFAULT_DY_MM,
    mask: np.ndarray | None = None,
) -> Path:
    """Write a submission ``.h5`` in the required format.

    Args:
        path: Output ``.h5`` path.
        surface: 2D depth map [mm] (stored as float64).
        dx: Lateral spacing x [mm] (stored as a ``surface`` attribute).
        dy: Lateral spacing y [mm] (stored as a ``surface`` attribute).
        mask: Optional 2D binary muscle/fat map (tissue dataset only).

    Returns:
        The written path.
    """
    surface = np.ascontiguousarray(surface, dtype=np.float64)
    path = Path(path)
    with h5py.File(path, "w") as f:
        ds = f.create_dataset(SURFACE_DATASET, data=surface)
        ds.attrs["dx"] = float(dx)
        ds.attrs["dy"] = float(dy)
        if mask is not None:
            f.create_dataset(MASK_DATASET, data=np.ascontiguousarray(mask, dtype=np.float64))
    return path


def _jet_rgb(t: np.ndarray) -> np.ndarray:
    """Map normalised values ``t`` in [0, 1] to JET RGB (uint8, last axis = 3).

    Replicates the GLSL ``applyColormap`` JET branch in the frontend viewer
    (``h5ViewerShaders.ts``) so the surface preview matches the viewer's
    "color by depth" rendering: blue = shallow, green/yellow = mid, red = deep.
    """
    r = np.clip(1.5 - np.abs(4.0 * t - 3.0), 0.0, 1.0)
    g = np.clip(1.5 - np.abs(4.0 * t - 2.0), 0.0, 1.0)
    b = np.clip(1.5 - np.abs(4.0 * t - 1.0), 0.0, 1.0)
    return (np.stack([r, g, b], axis=-1) * 255.0).astype(np.uint8)


def _surface_to_png(surface: np.ndarray) -> bytes:
    """Colour PNG of a depth map (JET colormap, robust 1–99% stretch).

    The depth map is contrast-stretched between its 1st/99th percentiles and
    rendered with the viewer's JET depth colormap (shallow = blue, deep = red).
    Uncovered columns (depth == 0) are left black for clear contrast.
    """
    h, w = surface.shape
    rgb = np.zeros((h, w, 3), dtype=np.uint8)
    covered = surface > 0
    if covered.any():
        vals = surface[covered]
        lo, hi = (float(x) for x in np.percentile(vals, [_PNG_LOW_PCT, _PNG_HIGH_PCT]))
        span = hi - lo if hi > lo else 1.0
        t = np.clip((surface - lo) / span, 0.0, 1.0)
        coloured = _jet_rgb(t)
        rgb[covered] = coloured[covered]
    return _encode_png(rgb)


def _mask_to_png(mask: np.ndarray) -> bytes:
    """Colour PNG of a binary mask: muscle = red, fat/background = dark blue."""
    binary = np.asarray(mask) >= 0.5
    rgb = np.empty((*binary.shape, 3), dtype=np.uint8)
    rgb[binary] = (220, 50, 47)  # muscle → red
    rgb[~binary] = (38, 70, 110)  # fat / background → dark blue
    return _encode_png(rgb)


def _encode_png(arr_u8: np.ndarray) -> bytes:
    mode = "RGB" if arr_u8.ndim == 3 else "L"
    buf = io.BytesIO()
    Image.fromarray(arr_u8, mode=mode).save(buf, format="PNG")
    return buf.getvalue()


def build_submission(
    volume: np.ndarray,
    *,
    dx: float = DEFAULT_DX_MM,
    dy: float = DEFAULT_DY_MM,
    dz: float = DEFAULT_DZ_MM,
    with_mask: bool = False,
) -> dict:
    """Compute everything needed for a submission from a 3D volume.

    Args:
        volume: 3D OCT volume ``(z, y, x)``.
        dx, dy, dz: Voxel spacing in mm.
        with_mask: If True (tissue dataset), also compute the muscle/fat mask.

    Returns:
        Dict with ``surface`` (2D), ``mask`` (2D or ``None``), ``surface_png`` and
        ``mask_png`` (PNG bytes; mask png ``None`` when no mask) and ``stats``.
    """
    surface = extract_surface(volume, dz)
    mask = segment_muscle_fat(volume) if with_mask else None

    covered = surface > 0
    depth = surface[covered]
    stats = {
        "shape": list(surface.shape),
        "coverage_pct": round(float(covered.mean()) * 100.0, 1),
        "depth_min_mm": round(float(depth.min()), 4) if depth.size else 0.0,
        "depth_max_mm": round(float(depth.max()), 4) if depth.size else 0.0,
        "depth_mean_mm": round(float(depth.mean()), 4) if depth.size else 0.0,
        "dx_mm": float(dx),
        "dy_mm": float(dy),
        "dz_mm": float(dz),
    }
    if mask is not None:
        stats["muscle_pct"] = round(float((mask >= 0.5).mean()) * 100.0, 1)

    return {
        "surface": surface,
        "mask": mask,
        "surface_png": _surface_to_png(surface),
        "mask_png": _mask_to_png(mask) if mask is not None else None,
        "stats": stats,
    }


def describe_submission(path: str | Path) -> str:
    """Return an ``h5disp``-style text description plus value stats of a file.

    Args:
        path: Path to a submission ``.h5``.

    Returns:
        Multi-line text describing datasets, dtypes, attributes, and depth/mask
        statistics — for quick command-line verification of a built submission.
    """
    path = Path(path)
    lines = [f"HDF5 {path.name}", "Group '/'"]
    with h5py.File(path, "r") as f:
        for name, ds in f.items():
            size = "x".join(str(d) for d in ds.shape)
            dtype = "double" if ds.dtype == np.float64 else str(ds.dtype)
            lines.append(f"    Dataset '{name}'")
            lines.append(f"        Size:     {size}")
            lines.append(f"        Datatype: {ds.dtype}  ({dtype})")
            if ds.attrs:
                lines.append("        Attributes:")
                for key, value in ds.attrs.items():
                    lines.append(f"            '{key}': {float(value):.6f}")
        if SURFACE_DATASET in f:
            s = np.asarray(f[SURFACE_DATASET])
            d = s[s > 0]
            if d.size:
                lines.append(
                    f"  surface depth [mm]: min={d.min():.4f} max={d.max():.4f} "
                    f"mean={d.mean():.4f} coverage={(s > 0).mean() * 100:.0f}%"
                )
        if MASK_DATASET in f:
            m = np.asarray(f[MASK_DATASET])
            lines.append(
                f"  mask: muscle(1)={(m >= 0.5).mean() * 100:.1f}% "
                f"fat/bg(0)={(m < 0.5).mean() * 100:.1f}%"
            )
    return "\n".join(lines)


def submission_metadata(stats: dict) -> str:
    """Compact JSON of the stats dict (for logging / headers)."""
    return json.dumps(stats)
