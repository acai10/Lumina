"""Baseline evaluation pipeline: raw challenge grid -> submission ``.h5``.

For one dataset (a 5x5 grid of OCT tiles) this:

    1. loads each tile and computes its MIP + a surface depth map,
    2. registers neighbouring tiles (phase correlation) and solves global
       offsets (BFS) to stitch the tiles into one mosaic,
    3. (tissue dataset only) produces a binary muscle/fat mask,
    4. writes the result via :func:`challenge_io.save_challenge_result` and
       validates it.

⚠️  THIS IS A BASELINE / STARTING POINT, not a finished method:

    * The physical spacings ``dx`` / ``dy`` / ``dz`` (mm) are **not stored in the
      data**. They default to Lumina's own system constant — 4 µm/px = 0.004 mm,
      isotropic (``DEFAULT_VOXEL_SIZE_UM`` in ``frontend/src/shared/constants.ts``,
      from "250 px = 1 mm") — which is what the system uses for all measurements.
      Override on the CLI if the project description states different values.
    * The surface extractor ("brightest reflection per A-scan") and the
      muscle/fat segmentation ("Otsu on surface brightness") are simple,
      defensible baselines meant to be replaced by your system's real methods.

Memory note: tiles are loaded one at a time (~256 MB each) and reduced to small
2D maps immediately, so peak RAM stays around one tile.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np

from challenge_data import dataset_grid, list_datasets, load_input_volume
from challenge_io import save_challenge_result, validate_challenge_file

# ── Which dataset is the tissue one (the only one that gets a muscle/fat mask) ─
# Confirmed by the course: DataSet_3 is tissue; DataSet_1 / DataSet_2 are the
# 3D-print phantoms (surface only). Matched case-insensitively by folder name.
TISSUE_DATASETS = frozenset({"5_dataset_3"})

# ── Default voxel spacing [mm], from Lumina's own system constant ─────────────
# frontend/src/shared/constants.ts: DEFAULT_VOXEL_SIZE_UM = [4, 4, 4] µm/px
# ("250 px = 1 mm grid → 4 µm/px"), i.e. 0.004 mm/px, isotropic. This is what the
# Lumina system itself uses for every measurement, so it is the consistent value
# for the submission. Override on the CLI if the project description states
# different values. (The assignment slide's 0.1 / 0.08 were only an illustrative
# example file, not the challenge's real spacing.)
DEFAULT_DX_MM = 0.004  # lateral pixel spacing x [mm]
DEFAULT_DY_MM = 0.004  # lateral pixel spacing y [mm]
DEFAULT_DZ_MM = 0.004  # axial spacing [mm per depth pixel]

_EPS = 1e-10


# ── per-tile feature extraction (baseline methods) ────────────────────────────


def compute_mip(volume: np.ndarray) -> np.ndarray:
    """Maximum-intensity projection along the depth (z) axis -> 2D map."""
    return volume.max(axis=0)


def extract_surface_index(volume: np.ndarray) -> np.ndarray:
    """Surface depth per A-scan, as a fractional z-index (baseline method).

    Baseline = index of the **brightest** voxel along depth for each lateral
    ``(y, x)`` position. Replace with your real surface detector (e.g. first
    threshold crossing or max-gradient) if needed.

    Args:
        volume: ``(z, y, x)`` OCT volume.

    Returns:
        2D float array ``(y, x)`` of z-indices in ``[0, z-1]``.
    """
    return volume.argmax(axis=0).astype(np.float64)


def _otsu_threshold(values: np.ndarray) -> float:
    """Otsu's threshold for a 1D/2D array of intensities (numpy-only)."""
    finite = values[np.isfinite(values)]
    if finite.size == 0:
        return 0.0
    hist, edges = np.histogram(finite, bins=256)
    centers = (edges[:-1] + edges[1:]) / 2.0
    weight = np.cumsum(hist)
    total = weight[-1]
    if total == 0 or weight[0] == total:
        return float(finite.mean())
    cum_mean = np.cumsum(hist * centers)
    global_mean = cum_mean[-1] / total
    w0 = weight / total
    w1 = 1.0 - w0
    with np.errstate(divide="ignore", invalid="ignore"):
        mean0 = cum_mean / weight
        mean1 = (cum_mean[-1] - cum_mean) / (total - weight)
    between = w0 * w1 * (mean0 - mean1) ** 2
    between[~np.isfinite(between)] = 0.0
    return (
        float(centers[int(np.argmax(between))]) if between.any() else float(global_mean)
    )


def segment_from_mip(mip: np.ndarray) -> np.ndarray:
    """Baseline muscle/fat segmentation from a tile's MIP (STUB — replace me).

    Splits the surface-brightness map at Otsu's threshold and labels the
    brighter class as muscle (1), the dimmer as fat (0). This is a placeholder;
    real muscle/fat discrimination is the group's actual method.

    Args:
        mip: 2D surface-brightness map ``(y, x)``.

    Returns:
        2D float array ``(y, x)`` with values in {0.0, 1.0}.
    """
    thr = _otsu_threshold(mip)
    return (mip >= thr).astype(np.float64)


# ── stitching (self-contained, mirrors Lumina's approach) ─────────────────────


def _phase_corr(ref: np.ndarray, mov: np.ndarray) -> tuple[float, float]:
    """Zero-padded phase correlation -> ``(dy, dx)`` shift of *mov* vs *ref*."""
    h, w = ref.shape
    h2, w2 = 2 * h, 2 * w  # pad to make the correlation linear, not circular
    fa = np.fft.fft2(ref, s=(h2, w2))
    fb = np.fft.fft2(mov, s=(h2, w2))
    cross = fa * np.conj(fb)
    cross /= np.abs(cross) + _EPS
    cc = np.fft.ifft2(cross).real
    peak = np.unravel_index(int(np.argmax(cc)), cc.shape)
    dy, dx = float(peak[0]), float(peak[1])
    if dy > h2 // 2:
        dy -= h2
    if dx > w2 // 2:
        dx -= w2
    return dy, dx


def _global_offsets(
    positions: list[tuple[int, int]],
    shifts: dict[tuple[tuple[int, int], tuple[int, int]], tuple[float, float]],
) -> dict[tuple[int, int], tuple[float, float]]:
    """Turn pairwise neighbour shifts into absolute offsets via BFS from origin."""
    origin = min(positions)  # top-left grid cell
    offsets: dict[tuple[int, int], tuple[float, float]] = {origin: (0.0, 0.0)}
    queue: deque[tuple[int, int]] = deque([origin])
    while queue:
        cur = queue.popleft()
        cy, cx = offsets[cur]
        for (a, b), (dy, dx) in shifts.items():
            if a == cur and b not in offsets:
                offsets[b] = (cy + dy, cx + dx)
                queue.append(b)
            elif b == cur and a not in offsets:
                offsets[a] = (cy - dy, cx - dx)
                queue.append(a)
    for pos in positions:
        offsets.setdefault(pos, (0.0, 0.0))
    return offsets


def _stitch_2d(
    tiles: dict[tuple[int, int], np.ndarray],
    offsets: dict[tuple[int, int], tuple[float, float]],
    *,
    binary: bool = False,
) -> np.ndarray:
    """Place per-tile 2D maps into one mosaic, averaging overlaps.

    Args:
        tiles: ``{(row, col): 2D map}`` (all the same shape).
        offsets: ``{(row, col): (dy, dx)}`` in pixels.
        binary: If True, round the averaged result to {0, 1} (for masks).

    Returns:
        The mosaic 2D array.
    """
    int_off = {p: (int(round(dy)), int(round(dx))) for p, (dy, dx) in offsets.items()}
    min_dy = min(o[0] for o in int_off.values())
    min_dx = min(o[1] for o in int_off.values())
    norm = {p: (dy - min_dy, dx - min_dx) for p, (dy, dx) in int_off.items()}

    h, w = next(iter(tiles.values())).shape
    total_h = max(o[0] for o in norm.values()) + h
    total_w = max(o[1] for o in norm.values()) + w

    acc = np.zeros((total_h, total_w), dtype=np.float64)
    cnt = np.zeros((total_h, total_w), dtype=np.float64)
    for pos, tile in tiles.items():
        dy, dx = norm[pos]
        acc[dy : dy + h, dx : dx + w] += tile
        cnt[dy : dy + h, dx : dx + w] += 1.0

    out = np.divide(acc, cnt, out=np.zeros_like(acc), where=cnt > 0)
    if binary:
        out = (out >= 0.5).astype(np.float64)
    return out


# ── full pipeline ─────────────────────────────────────────────────────────────


def evaluate_dataset(
    folder: str | Path,
    out_path: str | Path,
    *,
    dx: float = DEFAULT_DX_MM,
    dy: float = DEFAULT_DY_MM,
    dz: float = DEFAULT_DZ_MM,
    with_mask: bool = False,
) -> Path:
    """Run the baseline pipeline on one dataset folder and write the submission.

    Args:
        folder: Dataset directory holding ``Vol_<row>_<col>.h5`` tiles.
        out_path: Output ``.h5`` path for the submission.
        dx: Lateral pixel spacing x [mm] (stored as a ``surface`` attribute).
        dy: Lateral pixel spacing y [mm] (stored as a ``surface`` attribute).
        dz: Axial spacing [mm per depth pixel] — scales surface indices to mm.
        with_mask: If True (tissue dataset), also compute and store a binary
            muscle/fat ``mask``.

    Returns:
        The written submission path.
    """
    grid = dataset_grid(folder)
    if not grid:
        raise ValueError(f"No Vol_*.h5 tiles found in {folder}")

    mips: dict[tuple[int, int], np.ndarray] = {}
    surfaces: dict[tuple[int, int], np.ndarray] = {}
    masks: dict[tuple[int, int], np.ndarray] = {}

    # Per-tile reduction to 2D — load and free one volume at a time.
    for pos, path in grid.items():
        vol = load_input_volume(path)
        mip = compute_mip(vol)
        mips[pos] = mip
        surfaces[pos] = extract_surface_index(vol)
        if with_mask:
            masks[pos] = segment_from_mip(mip)
        del vol

    # Pairwise registration of right/below neighbours.
    positions = list(grid.keys())
    pos_set = set(positions)
    shifts: dict[tuple[tuple[int, int], tuple[int, int]], tuple[float, float]] = {}
    for r, c in positions:
        for nb in ((r, c + 1), (r + 1, c)):
            if nb in pos_set:
                shifts[((r, c), nb)] = _phase_corr(mips[(r, c)], mips[nb])

    offsets = _global_offsets(positions, shifts)

    surface_mm = _stitch_2d(surfaces, offsets) * float(dz)
    mask_mosaic = _stitch_2d(masks, offsets, binary=True) if with_mask else None

    written = save_challenge_result(out_path, surface_mm, dx, dy, mask=mask_mosaic)
    validate_challenge_file(written, expect_mask=with_mask)
    return written


def is_tissue_dataset(name: str) -> bool:
    """Whether a dataset folder is the tissue set (gets a mask). See above."""
    return name.lower() in TISSUE_DATASETS


def evaluate_all(
    root: str | Path,
    out_dir: str | Path,
    *,
    dx: float = DEFAULT_DX_MM,
    dy: float = DEFAULT_DY_MM,
    dz: float = DEFAULT_DZ_MM,
) -> dict[str, Path]:
    """Evaluate every dataset under *root*, masking only the tissue set.

    Args:
        root: A ``Challenge_Dataset`` directory (or its parent).
        out_dir: Directory for the ``submission_<dataset>.h5`` files.
        dx, dy, dz: Voxel spacing [mm] (see module defaults).

    Returns:
        ``{dataset_name: written_path}``.
    """
    datasets = list_datasets(root)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, Path] = {}
    for name, folder in datasets.items():
        out = out_dir / f"submission_{name}.h5"
        written[name] = evaluate_dataset(
            folder, out, dx=dx, dy=dy, dz=dz, with_mask=is_tissue_dataset(name)
        )
    return written


def _main(argv: list[str] | None = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "path",
        help="a dataset folder, or (with --all) the Challenge_Dataset root",
    )
    parser.add_argument(
        "-o",
        "--out",
        required=True,
        help="output .h5 path (single mode) or output directory (--all)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="process every dataset under PATH (tissue set auto-detected)",
    )
    parser.add_argument(
        "--dx", type=float, default=DEFAULT_DX_MM, help="lateral spacing x [mm]"
    )
    parser.add_argument(
        "--dy", type=float, default=DEFAULT_DY_MM, help="lateral spacing y [mm]"
    )
    parser.add_argument(
        "--dz", type=float, default=DEFAULT_DZ_MM, help="axial spacing [mm/pixel]"
    )
    parser.add_argument(
        "--tissue",
        action="store_true",
        help="single mode: force a muscle/fat mask for this dataset",
    )
    args = parser.parse_args(argv)

    if args.all:
        results = evaluate_all(args.path, args.out, dx=args.dx, dy=args.dy, dz=args.dz)
        for name, out in results.items():
            tag = "tissue+mask" if is_tissue_dataset(name) else "phantom"
            print(f"wrote {out}  [{tag}]")
    else:
        out = evaluate_dataset(
            args.path,
            args.out,
            dx=args.dx,
            dy=args.dy,
            dz=args.dz,
            with_mask=args.tissue,
        )
        print(f"wrote {out}  (mask={args.tissue})")

    print(
        f"spacing dx={args.dx}, dy={args.dy}, dz={args.dz} mm "
        "(Lumina default 4 µm/px; pass --dx/--dy/--dz to override)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
