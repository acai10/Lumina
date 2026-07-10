"""Per-slice volume normalization for frontend rendering.

The frontend previously downloaded raw float32 volumes and ran a Web Worker to
produce vIndices, vIntensities, and a Uint8 normalizedVolume.  This module
does the same work on the backend so the frontend receives render-ready binary
and requires no worker or heavy JS computation for backend-originated volumes.

Binary response layout (packed, returned by ``pack_normalized_response``):
    [vIndices   : vCount × uint32]
    [vIntensities: vCount × float32]
    [normalizedVolume: nSlices × H × W × uint8]

Response headers:
    X-Shape  : "<nSlices>,<height>,<width>"
    X-VCount : "<number of above-threshold voxels>"

Frontend parses via typed-array views into a single ArrayBuffer — no copy needed.

For stitched volumes the packed binary is pre-computed inside the session runner
(during the "processing" phase) and saved to disk so the download endpoint simply
reads a file.  ``save_packed`` / ``load_packed`` handle that caching layer.
"""

import json
import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

#: Must match ``PRE_FILTER_THRESHOLD`` in ``shared/h5/h5Reader.ts``.
PRE_FILTER_THRESHOLD: float = 0.05

#: Upper bound on the number of voxels exported in the 3-D point-cloud arrays
#: (``vIndices`` / ``vIntensities``). For a large stitched montage, per-slice
#: normalization can push nearly every voxel above ``PRE_FILTER_THRESHOLD``,
#: producing 200 M+ point-cloud entries (1.5 GB+ of float32) — far beyond any
#: useful render density and enough to exhaust browser memory. Because the
#: arrays are sorted by intensity descending, truncating to the brightest
#: ``MAX_POINTCLOUD_VOXELS`` keeps every meaningful voxel and drops only the
#: dim noise tail. The full-resolution ``norm_u8`` volume (used by the slice
#: viewer and measurements) is never truncated. ~60 M voxels ≈ 480 MB of packed
#: point-cloud data, which stays under the frontend's IndexedDB persist ceiling.
MAX_POINTCLOUD_VOXELS: int = 60_000_000


def normalize_for_frontend(
    vol: np.ndarray,
    threshold: float = PRE_FILTER_THRESHOLD,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Normalize a 3-D OCT volume for direct frontend consumption.

    Uses a memory-efficient approach:

    * Converts to ``uint8`` *per slice* so only one slice-sized float32 buffer
      is alive at a time instead of a full 256 MB float32 copy of the volume.
    * Extracts and sorts above-threshold voxels on ``uint8`` values, which is
      3–5× faster than sorting ``float32`` and uses 4× less temporary memory.
    * Uses ``int32`` for intermediate flat indices (half the size of ``int64``).

    Args:
        vol: Float32 array of shape ``(nSlices, height, width)``.
        threshold: Intensity cut-off — voxels below this are excluded from the
            point-cloud arrays.  Must be in ``[0, 1]``.

    Returns:
        Tuple ``(vIndices, vIntensities, normalizedVolume_u8)`` where:
        - *vIndices* — uint32 array of length *vCount*: flat voxel indices
          sorted by intensity descending.
        - *vIntensities* — float32 array of length *vCount*: corresponding
          normalised intensities in ``[0, 1]``.
        - *normalizedVolume_u8* — uint8 array of shape ``(nSlices, H, W)``:
          full per-slice normalised volume quantised to 0–255.
    """
    nSlices, H, W = vol.shape
    threshold_u8 = max(1, round(threshold * 255))

    # Per-slice normalisation → uint8.  A single reusable float32 slice buffer
    # avoids allocating the full float32 normalised volume (256 MB for 512×250×500).
    norm_u8 = np.empty((nSlices, H, W), dtype=np.uint8)
    tmp = np.empty((H, W), dtype=np.float32)

    for s in range(nSlices):
        sl = vol[s]
        # NaN-tolerant range: a corrupted slice must not poison `scale` (a NaN
        # scale would cast undefined garbage into uint8 without any warning).
        mn = float(np.nanmin(sl))
        mx = float(np.nanmax(sl))
        if not np.isfinite(mn) or not np.isfinite(mx) or mx <= mn:
            norm_u8[s] = 0
            continue
        scale = 255.0 / (mx - mn)
        np.subtract(sl, mn, out=tmp)
        np.multiply(tmp, scale, out=tmp)
        np.nan_to_num(tmp, copy=False)  # stray NaN voxels → 0 instead of UB on cast
        np.clip(tmp, 0, 255, out=tmp)
        norm_u8[s] = tmp

    # ── Chunked above-threshold extraction ───────────────────────────────────
    # Building a single bool mask over the full volume (e.g. 248 MB for a
    # 512×697×694 merge of 25 volumes) blows up peak memory.  Process in
    # chunks of CHUNK slices so the per-chunk mask stays small (~15 MB).
    CHUNK = 32
    idx_chunks: list[np.ndarray] = []
    int_chunks: list[np.ndarray] = []

    for s0 in range(0, nSlices, CHUNK):
        s1 = min(s0 + CHUNK, nSlices)
        chunk_flat = norm_u8[s0:s1].ravel()  # view into already-built norm_u8
        mask_chunk = chunk_flat >= threshold_u8  # bool, CHUNK*H*W bytes
        offset = np.int32(s0 * H * W)  # int32 - safe for ≤ 2 G-voxels
        idx_chunk = np.where(mask_chunk)[0].astype(np.int32) + offset
        idx_chunks.append(idx_chunk)
        int_chunks.append(chunk_flat[mask_chunk])  # uint8 intensities

    raw_idx = np.concatenate(idx_chunks)
    raw_int = np.concatenate(int_chunks)

    # Sorting uint8 (256 possible values) is 3-5x faster than float32 and the
    # temporary index array is 4x smaller.  [::-1] reverses to descending order
    # as a zero-copy view.
    order = np.argsort(raw_int, kind="stable")[::-1]

    # Cap the point cloud at the brightest MAX_POINTCLOUD_VOXELS. `order` is
    # descending by intensity, so this keeps every meaningful voxel and discards
    # only the dim noise tail that would otherwise bloat the payload (see the
    # constant's docstring). norm_u8 is untouched, so the slice viewer and
    # measurements still see the full-resolution volume.
    raw_count = len(order)
    if raw_count > MAX_POINTCLOUD_VOXELS:
        order = order[:MAX_POINTCLOUD_VOXELS]
        logger.info(
            "normalize_for_frontend: point cloud capped %d → %d voxels "
            "(dropped %d dimmest of shape %s); slice volume kept at full resolution",
            raw_count,
            MAX_POINTCLOUD_VOXELS,
            raw_count - MAX_POINTCLOUD_VOXELS,
            vol.shape,
        )

    # uint32 (not float32): a full-volume flat index reaches 32M, past float32's
    # exact-integer range (2^24 ≈ 16.7M). The frontend reads these as an integer
    # vertex attribute; 4 bytes each, same stride as the float32 intensities.
    v_indices = raw_idx[order].astype(np.uint32)
    v_intensities = raw_int[order].astype(np.float32) / 255.0

    logger.debug(
        "normalize_for_frontend: shape=%s vCount=%d (%.1f%%)",
        vol.shape,
        len(v_indices),
        100.0 * len(v_indices) / (nSlices * H * W),
    )
    return v_indices, v_intensities, norm_u8


def pack_arrays(
    v_indices: np.ndarray,
    v_intensities: np.ndarray,
    norm_u8: np.ndarray,
    shape: tuple[int, int, int],
) -> tuple[bytes, dict[str, str]]:
    """Assemble the packed binary layout + headers from pre-normalised arrays.

    Single source of truth for the byte layout and header names shared by
    :func:`pack_normalized_response`, :func:`save_packed`, and any route that
    normalises manually (e.g. to free the input volume first).

    Args:
        v_indices: Uint32 flat voxel index array.
        v_intensities: Float32 normalised intensity array.
        norm_u8: Uint8 normalised volume.
        shape: ``(nSlices, height, width)`` of the original volume.

    Returns:
        ``(content, headers)`` ready for ``fastapi.responses.Response``.
    """
    nSlices, H, W = shape
    content = v_indices.tobytes() + v_intensities.tobytes() + norm_u8.tobytes()
    headers = {
        "X-Shape": f"{nSlices},{H},{W}",
        "X-VCount": str(len(v_indices)),
    }
    return content, headers


def pack_normalized_response(
    vol: np.ndarray,
    threshold: float = PRE_FILTER_THRESHOLD,
) -> tuple[bytes, dict[str, str]]:
    """Normalise *vol* and return ``(content_bytes, headers)`` for a FastAPI Response.

    Use :func:`save_packed` / :func:`load_packed` to cache the result on disk
    when pre-computation is possible (e.g. after stitching completes).

    Args:
        vol: Float32 array of shape ``(nSlices, height, width)``.
        threshold: Passed to :func:`normalize_for_frontend`.

    Returns:
        ``(content, headers)`` ready for ``fastapi.responses.Response``.
    """
    v_indices, v_intensities, norm_u8 = normalize_for_frontend(vol, threshold)
    return pack_arrays(v_indices, v_intensities, norm_u8, vol.shape)


# ── Pre-computation helpers ───────────────────────────────────────────────────


def save_packed(
    v_indices: np.ndarray,
    v_intensities: np.ndarray,
    norm_u8: np.ndarray,
    shape: tuple[int, int, int],
    prefix: Path,
) -> None:
    """Persist pre-normalised data to ``{prefix}.bin`` + ``{prefix}.json``.

    The endpoint can then serve the binary without any recomputation.

    Args:
        v_indices: Uint32 flat voxel index array.
        v_intensities: Float32 normalised intensity array.
        norm_u8: Uint8 normalised volume.
        shape: ``(nSlices, height, width)`` of the original volume.
        prefix: Path stem — ``.bin`` / ``.json`` suffixes are appended.
    """
    content, meta = pack_arrays(v_indices, v_intensities, norm_u8, shape)
    Path(prefix).with_suffix(".bin").write_bytes(content)
    with open(Path(prefix).with_suffix(".json"), "w") as fh:
        json.dump(meta, fh)
    logger.info(
        "save_packed: wrote %d MB to %s",
        len(content) // (1024 * 1024),
        prefix,
    )


def load_packed(prefix: Path) -> tuple[bytes | None, dict[str, str] | None]:
    """Load pre-normalised data from ``{prefix}.bin`` + ``{prefix}.json``.

    Args:
        prefix: Path stem used in :func:`save_packed`.

    Returns:
        ``(content, headers)`` if the files exist, otherwise ``(None, None)``.
    """
    bin_path = Path(prefix).with_suffix(".bin")
    json_path = Path(prefix).with_suffix(".json")
    if not bin_path.exists() or not json_path.exists():
        return None, None
    with open(json_path) as fh:
        headers = json.load(fh)
    return bin_path.read_bytes(), headers
