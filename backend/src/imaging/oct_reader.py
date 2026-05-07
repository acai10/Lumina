import base64
import io
import logging
import os
import tempfile
from typing import Optional

import numpy as np
from PIL import Image

log = logging.getLogger(__name__)

_scan_cache: dict[str, np.ndarray] = {}


def load_scan(data: bytes) -> np.ndarray:
    # Try DICOM
    try:
        import pydicom

        with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            ds = pydicom.dcmread(tmp)
            return ds.pixel_array.astype(np.float32)
        finally:
            os.unlink(tmp)
    except (Exception,) as exc:
        log.debug("DICOM parse failed: %s", exc)

    # Try SimpleITK (handles MHA, NRRD, MHD, …)
    try:
        import SimpleITK as sitk

        with tempfile.NamedTemporaryFile(suffix=".mha", delete=False) as f:
            f.write(data)
            tmp = f.name
        try:
            img = sitk.ReadImage(tmp)
            return sitk.GetArrayFromImage(img).astype(np.float32)
        finally:
            os.unlink(tmp)
    except (Exception,) as exc:
        log.debug("SimpleITK parse failed: %s", exc)

    # Fallback: interpret as raw float32 byte stream
    arr = np.frombuffer(data, dtype=np.float32).copy()
    return arr


def detect_scan_type(array: np.ndarray) -> str:
    if array.ndim == 1:
        return "A"
    if array.ndim == 2:
        return "B"
    return "C"


def store_scan(array: np.ndarray) -> None:
    _scan_cache["current"] = array


def get_stored_scan() -> Optional[np.ndarray]:
    return _scan_cache.get("current")


def array_to_base64_png(array: np.ndarray) -> str:
    arr = array.astype(np.float32)
    mn, mx = float(arr.min()), float(arr.max())
    if mx > mn:
        arr = (arr - mn) / (mx - mn) * 255.0
    arr = arr.clip(0, 255).astype(np.uint8)
    img = Image.fromarray(arr, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def ascan_to_base64_png(array: np.ndarray) -> str:
    """Render a 1-D A-scan signal as a small PNG waveform image."""
    h = 64
    w = max(len(array), 1)
    canvas = np.zeros((h, w), dtype=np.uint8)
    mn, mx = float(array.min()), float(array.max())
    norm = (array - mn) / (mx - mn) if mx > mn else np.zeros_like(array, dtype=np.float32)
    rows = ((1.0 - norm) * (h - 1)).astype(int).clip(0, h - 1)
    canvas[rows, np.arange(len(rows))] = 255
    img = Image.fromarray(canvas, mode="L")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")
