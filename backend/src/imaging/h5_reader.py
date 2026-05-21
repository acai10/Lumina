import base64
import io
from typing import Dict, List, Optional, Tuple

import h5py
import numpy as np
from PIL import Image

# Attribute key names used by various OCT vendors to encode volume dimensions
_TUPLE_KEYS = ("Sizes", "sizes", "shape", "dims", "dimensions", "image_shape", "Volume_Size")
_SLICE_KEYS = (
    "NumBScans",
    "num_b_scans",
    "Bscans",
    "n_slices",
    "SizeB",
    "frames",
    "NumberOfFrames",
    "num_frames",
)
_HEIGHT_KEYS = ("SizeZ", "SizeY", "height", "Depth", "depth", "ALines", "alines", "axial_size")
_WIDTH_KEYS = ("SizeX", "width", "Width", "x_size", "NumAScans", "lateral_size", "alines_per_bscan")

# Common OCT depth resolution — used as last-resort factorization hint
_OCT_DEPTH = 512


def load_volume(file_bytes: bytes) -> np.ndarray:
    with h5py.File(io.BytesIO(file_bytes), "r") as f:
        return _find_volume_dataset(f)


def _try_as_3d(arr: np.ndarray) -> Optional[np.ndarray]:
    squeezed = np.squeeze(arr)
    return squeezed if squeezed.ndim == 3 else None


def _extract_dims(attrs) -> Optional[Tuple[int, int, int]]:
    """Try to read (n_slices, height, width) from an h5py attrs-like mapping."""
    # Tuple/array attributes that encode all three dims at once
    for key in _TUPLE_KEYS:
        if key in attrs:
            try:
                val = np.asarray(attrs[key]).flatten()
                if val.size >= 3:
                    n, h, w = int(val[0]), int(val[1]), int(val[2])
                    if n > 0 and h > 0 and w > 0:
                        return (n, h, w)
            except (ValueError, TypeError):
                pass

    # Individual dimension attributes (case-insensitive lookup)
    lower_map: Dict[str, str] = {k.lower(): k for k in attrs}
    slices = height = width = None

    for key in _SLICE_KEYS:
        orig = lower_map.get(key.lower())
        if orig is not None:
            try:
                slices = int(np.asarray(attrs[orig]).flat[0])
                break
            except (ValueError, TypeError):
                pass

    for key in _HEIGHT_KEYS:
        orig = lower_map.get(key.lower())
        if orig is not None:
            try:
                height = int(np.asarray(attrs[orig]).flat[0])
                break
            except (ValueError, TypeError):
                pass

    for key in _WIDTH_KEYS:
        orig = lower_map.get(key.lower())
        if orig is not None:
            try:
                width = int(np.asarray(attrs[orig]).flat[0])
                break
            except (ValueError, TypeError):
                pass

    if slices is not None and height is not None and width is not None:
        return (slices, height, width)
    return None


def _reshape_from_attrs(dataset: h5py.Dataset, root: h5py.File) -> Optional[np.ndarray]:
    """Try to reshape a flat dataset into (n_slices, height, width) using attribute metadata."""
    arr = np.squeeze(dataset[()])
    if arr.ndim == 3:
        return arr
    if arr.ndim != 1:
        return None
    total = arr.size

    def _attempt(dims: Optional[Tuple[int, int, int]]) -> Optional[np.ndarray]:
        if dims and dims[0] * dims[1] * dims[2] == total:
            try:
                return arr.reshape(dims)
            except ValueError:
                pass
        return None

    # 1. Dataset's own attributes
    result = _attempt(_extract_dims(dataset.attrs))
    if result is not None:
        return result

    # 2. Root group attributes
    result = _attempt(_extract_dims(root.attrs))
    if result is not None:
        return result

    # 3. Sibling scalar datasets at root level whose names suggest dimensions
    dim_vals: Dict[str, int] = {}
    for name in root:
        item = root[name]
        if not isinstance(item, h5py.Dataset) or item.ndim > 1 or item.size != 1:
            continue
        try:
            val = int(np.asarray(item[()]).flat[0])
        except (ValueError, TypeError):
            continue
        if val <= 0:
            continue
        nl = name.lower()
        if any(k.lower() in nl for k in _SLICE_KEYS):
            dim_vals["slices"] = val
        elif any(k.lower() in nl for k in _HEIGHT_KEYS):
            dim_vals["height"] = val
        elif any(k.lower() in nl for k in _WIDTH_KEYS):
            dim_vals["width"] = val

    if len(dim_vals) == 3:
        result = _attempt((dim_vals["slices"], dim_vals["height"], dim_vals["width"]))
        if result is not None:
            return result

    # 4. Last resort: try common OCT depth values and look for a square lateral factorization
    result = _attempt(_guess_shape(total))
    return result


def _guess_shape(total: int) -> Optional[Tuple[int, int, int]]:
    """Heuristic: assume depth is 512 and lateral plane is square."""
    if total % _OCT_DEPTH != 0:
        return None
    lateral = total // _OCT_DEPTH
    w = round(lateral**0.5)
    if w >= 10 and w * w == lateral:
        return (_OCT_DEPTH, w, w)
    return None


def _encode_slice(arr: np.ndarray) -> str:
    s = arr.astype(np.float32)
    s_min, s_max = s.min(), s.max()
    if s_max > s_min:
        s = (s - s_min) / (s_max - s_min)
    img = Image.fromarray((s * 255).astype(np.uint8))
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()


def _collect_all_info(f: h5py.File) -> str:
    parts: List[str] = []
    if f.attrs:
        parts.append(f"root_attrs={dict(f.attrs)}")

    def _walk(group: h5py.Group, prefix: str = "") -> None:
        for name in group:
            item = group[name]
            path = f"{prefix}/{name}"
            if isinstance(item, h5py.Dataset):
                attrs = {k: np.asarray(v).tolist() for k, v in item.attrs.items()}
                parts.append(f"{path}: shape={item.shape} dtype={item.dtype} attrs={attrs}")
            elif isinstance(item, h5py.Group):
                attrs = {k: np.asarray(v).tolist() for k, v in item.attrs.items()}
                if attrs:
                    parts.append(f"{path}/ group_attrs={attrs}")
                _walk(item, path)

    _walk(f)
    return " | ".join(parts)


def _find_volume_dataset(f: h5py.File) -> np.ndarray:
    # Case-insensitive named-key pass
    ds_lower: Dict[str, str] = {k.lower(): k for k in f if isinstance(f[k], h5py.Dataset)}
    for target in ("volume", "data", "oct"):
        actual = ds_lower.get(target)
        if actual is None:
            continue
        ds = f[actual]
        arr = np.squeeze(ds[()])
        if arr.ndim == 3:
            return arr
        cand = _try_as_3d(arr)
        if cand is not None:
            return cand
        if arr.ndim == 1:
            cand = _reshape_from_attrs(ds, f)
            if cand is not None:
                return cand

    # Full recursive scan
    def _search(group: h5py.Group) -> Optional[np.ndarray]:
        for name in group:
            item = group[name]
            if isinstance(item, h5py.Dataset):
                arr = np.squeeze(item[()])
                if arr.ndim == 3:
                    return arr
                cand = _try_as_3d(arr)
                if cand is not None:
                    return cand
                if arr.ndim == 1 and arr.size >= 1000:
                    cand = _reshape_from_attrs(item, f)
                    if cand is not None:
                        return cand
            elif isinstance(item, h5py.Group):
                result = _search(item)
                if result is not None:
                    return result
        return None

    result = _search(f)
    if result is not None:
        return result

    detail = _collect_all_info(f) if __debug__ else ""
    raise ValueError(f"No suitable 3D dataset found. File contents: {detail}")


def slice_to_base64(slice_array: np.ndarray) -> str:
    return _encode_slice(slice_array)


def volume_to_slices(volume: np.ndarray) -> List[str]:
    return [_encode_slice(volume[i]) for i in range(volume.shape[0])]
