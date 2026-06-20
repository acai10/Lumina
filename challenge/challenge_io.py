"""Read, write, and validate challenge-result HDF5 files.

This module implements the exact submission format required by the
"Einführung in Medizintechnische Systeme" PBL challenge (SoSe 2026). The
graded deliverable is one ``*.h5`` file per evaluated dataset, sent by e-mail.

Required HDF5 layout (matches the ``h5disp`` example from the assignment)::

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

Notes:
    * Both datasets are stored as ``float64`` ("double") — the assignment's
      ``h5disp`` shows the binary ``mask`` as ``H5T_IEEE_F64LE`` too, not uint8.
    * ``dx`` / ``dy`` are **attributes of the ``surface`` dataset**, exactly
      where the example displays them — not a separate dataset, not on the root.
    * The two 3D-print phantom datasets have **no** ``mask``; the tissue dataset
      has all three (``surface`` + ``mask`` + ``dx``/``dy``).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import h5py
import numpy as np

# ── Format constants (single source of truth for names / labels) ──────────────
SURFACE_DATASET = "surface"
MASK_DATASET = "mask"
DX_ATTR = "dx"
DY_ATTR = "dy"
FAT_LABEL = 0.0
MUSCLE_LABEL = 1.0
#: Datatype every dataset must use — float64 == HDF5 H5T_IEEE_F64LE ("double").
REQUIRED_DTYPE = np.float64


@dataclass
class ChallengeResult:
    """In-memory representation of a challenge-result file.

    Attributes:
        surface: 2D float64 array of depth values in millimetres.
        dx: Pixel spacing along x in millimetres.
        dy: Pixel spacing along y in millimetres.
        mask: Optional 2D float64 binary segmentation (0 = fat, 1 = muscle).
            ``None`` for the 3D-print phantom datasets.
    """

    surface: np.ndarray
    dx: float
    dy: float
    mask: np.ndarray | None = None

    @property
    def has_mask(self) -> bool:
        """Whether a segmentation mask is present (tissue dataset)."""
        return self.mask is not None


def save_challenge_result(
    path: str | Path,
    surface: np.ndarray,
    dx: float,
    dy: float,
    mask: np.ndarray | None = None,
) -> Path:
    """Write a challenge result to *path* in the required HDF5 format.

    Args:
        path: Output ``.h5`` file path (overwritten if it exists).
        surface: 2D array of depth values in millimetres (stored as float64).
        dx: Pixel spacing along x in millimetres (> 0).
        dy: Pixel spacing along y in millimetres (> 0).
        mask: Optional 2D binary segmentation (0 = fat, 1 = muscle). Omit
            (``None``) for the two 3D-print phantom datasets.

    Returns:
        The path written, as a :class:`~pathlib.Path`.

    Raises:
        ValueError: If *surface* is not 2D, *dx*/*dy* are not positive, or
            *mask* is given but is not the same shape or not strictly binary.
    """
    surface = np.ascontiguousarray(surface, dtype=REQUIRED_DTYPE)
    if surface.ndim != 2:
        raise ValueError(f"surface must be 2D (H x W), got shape {surface.shape}")
    if not (dx > 0 and dy > 0):
        raise ValueError(f"dx and dy must be > 0, got dx={dx}, dy={dy}")

    if mask is not None:
        mask = np.ascontiguousarray(mask, dtype=REQUIRED_DTYPE)
        if mask.shape != surface.shape:
            raise ValueError(
                f"mask shape {mask.shape} must match surface shape {surface.shape}"
            )
        labels = set(np.unique(mask).tolist())
        if not labels <= {FAT_LABEL, MUSCLE_LABEL}:
            raise ValueError(
                f"mask must be binary ({FAT_LABEL}=fat, {MUSCLE_LABEL}=muscle); "
                f"found values {sorted(labels)}"
            )

    path = Path(path)
    with h5py.File(path, "w") as f:
        ds = f.create_dataset(SURFACE_DATASET, data=surface)  # H5T_IEEE_F64LE
        ds.attrs[DX_ATTR] = float(dx)
        ds.attrs[DY_ATTR] = float(dy)
        if mask is not None:
            f.create_dataset(MASK_DATASET, data=mask)
    return path


def load_challenge_result(path: str | Path) -> ChallengeResult:
    """Read a challenge-result file back into a :class:`ChallengeResult`.

    Args:
        path: Path to an ``.h5`` file written by :func:`save_challenge_result`.

    Returns:
        A :class:`ChallengeResult` with ``surface``, ``dx``, ``dy`` and an
        optional ``mask``.

    Raises:
        FileNotFoundError: If *path* does not exist.
        ValueError: If the required ``surface`` dataset or ``dx``/``dy``
            attributes are missing.
    """
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"No such file: {path}")

    with h5py.File(path, "r") as f:
        if SURFACE_DATASET not in f:
            raise ValueError(f"Missing required dataset '{SURFACE_DATASET}'")
        surf_ds = f[SURFACE_DATASET]
        surface = np.asarray(surf_ds, dtype=REQUIRED_DTYPE)
        if DX_ATTR not in surf_ds.attrs or DY_ATTR not in surf_ds.attrs:
            raise ValueError(
                f"'{SURFACE_DATASET}' must carry '{DX_ATTR}' and '{DY_ATTR}' attributes"
            )
        dx = float(surf_ds.attrs[DX_ATTR])
        dy = float(surf_ds.attrs[DY_ATTR])
        mask = (
            np.asarray(f[MASK_DATASET], dtype=REQUIRED_DTYPE)
            if MASK_DATASET in f
            else None
        )

    return ChallengeResult(surface=surface, dx=dx, dy=dy, mask=mask)


def check_challenge_file(
    path: str | Path, *, expect_mask: bool | None = None
) -> list[str]:
    """Validate a file against the submission spec without raising.

    Args:
        path: Path to the ``.h5`` file to check.
        expect_mask: If ``True`` the file must contain a ``mask`` (tissue
            dataset); if ``False`` it must not (phantom dataset); if ``None``
            (default) either is accepted.

    Returns:
        A list of human-readable problem descriptions. An empty list means the
        file is a valid submission.
    """
    path = Path(path)
    problems: list[str] = []
    if not path.is_file():
        return [f"File does not exist: {path}"]

    with h5py.File(path, "r") as f:
        # ── surface ──────────────────────────────────────────────────────────
        if SURFACE_DATASET not in f:
            problems.append(f"missing required dataset '{SURFACE_DATASET}'")
            surf = None
        else:
            surf = f[SURFACE_DATASET]
            if surf.ndim != 2:
                problems.append(f"'{SURFACE_DATASET}' must be 2D, is {surf.shape}")
            if surf.dtype != REQUIRED_DTYPE:
                problems.append(
                    f"'{SURFACE_DATASET}' must be float64 (double), is {surf.dtype}"
                )
            for attr in (DX_ATTR, DY_ATTR):
                if attr not in surf.attrs:
                    problems.append(f"'{SURFACE_DATASET}' missing attribute '{attr}'")
                elif not float(surf.attrs[attr]) > 0:
                    problems.append(
                        f"attribute '{attr}' must be > 0, is {surf.attrs[attr]}"
                    )

        # ── mask (optional) ──────────────────────────────────────────────────
        has_mask = MASK_DATASET in f
        if expect_mask is True and not has_mask:
            problems.append(
                f"expected a '{MASK_DATASET}' dataset (tissue) but none found"
            )
        if expect_mask is False and has_mask:
            problems.append(
                f"unexpected '{MASK_DATASET}' dataset (phantom should have none)"
            )
        if has_mask:
            mask = f[MASK_DATASET]
            if mask.ndim != 2:
                problems.append(f"'{MASK_DATASET}' must be 2D, is {mask.shape}")
            if mask.dtype != REQUIRED_DTYPE:
                problems.append(
                    f"'{MASK_DATASET}' must be float64 (double), is {mask.dtype}"
                )
            if surf is not None and mask.shape != surf.shape:
                problems.append(
                    f"'{MASK_DATASET}' shape {mask.shape} != "
                    f"'{SURFACE_DATASET}' shape {surf.shape}"
                )
            labels = set(np.unique(np.asarray(mask)).tolist())
            if not labels <= {FAT_LABEL, MUSCLE_LABEL}:
                problems.append(
                    f"'{MASK_DATASET}' must be binary ({FAT_LABEL}/{MUSCLE_LABEL}), "
                    f"found {sorted(labels)}"
                )

    return problems


def validate_challenge_file(
    path: str | Path, *, expect_mask: bool | None = None
) -> None:
    """Like :func:`check_challenge_file` but raise on the first set of problems.

    Args:
        path: Path to the ``.h5`` file to validate.
        expect_mask: See :func:`check_challenge_file`.

    Raises:
        ValueError: If the file does not satisfy the submission spec; the
            message lists every problem found.
    """
    problems = check_challenge_file(path, expect_mask=expect_mask)
    if problems:
        joined = "\n  - ".join(problems)
        raise ValueError(f"Invalid challenge file '{path}':\n  - {joined}")


def describe_h5(path: str | Path) -> str:
    """Return an ``h5disp``-style description, for eyeballing a file.

    Args:
        path: Path to any ``.h5`` file.

    Returns:
        A multi-line string listing datasets (size, dtype) and attributes,
        mirroring the assignment's ``h5disp`` output so the format is easy to
        compare by eye.
    """
    path = Path(path)
    lines = [f"HDF5 {path.name}", "Group '/'"]
    with h5py.File(path, "r") as f:
        for name, ds in f.items():
            size = "x".join(str(d) for d in ds.shape)
            dtype = "double" if ds.dtype == REQUIRED_DTYPE else str(ds.dtype)
            lines.append(f"    Dataset '{name}'")
            lines.append(f"        Size:     {size}")
            lines.append(f"        Datatype: {ds.dtype}  ({dtype})")
            if ds.attrs:
                lines.append("        Attributes:")
                for key, value in ds.attrs.items():
                    try:
                        lines.append(f"            '{key}': {float(value):.6f}")
                    except (TypeError, ValueError):
                        lines.append(f"            '{key}': {value}")
    return "\n".join(lines)


def _write_demo(out_dir: Path) -> list[Path]:
    """Write one phantom and one tissue example file into *out_dir*.

    Used by the ``demo`` CLI sub-command to produce reference files that match
    the assignment format exactly (good for testing your mailer / checker).
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    h, w = 823, 855

    phantom_surface = rng.random((h, w)) * 5.0  # depths in mm
    phantom = save_challenge_result(
        out_dir / "phantom_example.h5", phantom_surface, 0.1, 0.08
    )

    tissue_surface = rng.random((h, w)) * 5.0
    tissue_mask = (rng.random((h, w)) > 0.5).astype(np.float64)  # 0 = fat, 1 = muscle
    tissue = save_challenge_result(
        out_dir / "tissue_example.h5", tissue_surface, 0.1, 0.08, mask=tissue_mask
    )
    return [phantom, tissue]


def _main(argv: list[str] | None = None) -> int:
    """Tiny CLI: ``show``, ``validate`` and ``demo`` sub-commands."""
    import argparse

    parser = argparse.ArgumentParser(description="Challenge-result HDF5 tools.")
    sub = parser.add_subparsers(dest="command", required=True)

    p_show = sub.add_parser("show", help="print an h5disp-style description")
    p_show.add_argument("path")

    p_val = sub.add_parser("validate", help="check a file against the submission spec")
    p_val.add_argument("path")
    grp = p_val.add_mutually_exclusive_group()
    grp.add_argument("--phantom", action="store_true", help="require NO mask")
    grp.add_argument("--tissue", action="store_true", help="require a mask")

    p_demo = sub.add_parser("demo", help="write example phantom + tissue files")
    p_demo.add_argument("out_dir", nargs="?", default=".")

    args = parser.parse_args(argv)

    if args.command == "show":
        print(describe_h5(args.path))
        return 0

    if args.command == "validate":
        expect = True if args.tissue else False if args.phantom else None
        problems = check_challenge_file(args.path, expect_mask=expect)
        if problems:
            print(f"INVALID: {args.path}")
            for problem in problems:
                print(f"  - {problem}")
            return 1
        print(f"OK: {args.path} is a valid submission file")
        return 0

    if args.command == "demo":
        for written in _write_demo(Path(args.out_dir)):
            print(f"wrote {written}")
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(_main())
