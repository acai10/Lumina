"""Tiny bounded cache for repeated volume reads from disk.

Interactive operations (measurement, segmentation, filter tuning) repeatedly
re-read the *same* on-disk volume. Re-decoding a 128 MB HDF5 on every request
is wasteful, so this module memoises recently-loaded arrays keyed by
``(path, mtime)`` — the mtime makes the entry self-invalidate if the file is
replaced (e.g. an upload overwrites a registered symlink target).

Only volumes at or below :data:`_MAX_CACHEABLE_BYTES` are cached, so a giant
stitched montage (multiple GB) never sits resident in RAM; those fall straight
through to the loader on every call. The cache holds at most
:data:`_MAX_ENTRIES` arrays (LRU eviction).
"""

import logging
import threading
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

#: Max number of volumes kept resident simultaneously.
_MAX_ENTRIES = 2
#: Volumes larger than this are never cached (one OCT tile is ~128 MB).
_MAX_CACHEABLE_BYTES = 256 * 1024 * 1024

_cache: "OrderedDict[tuple[str, float], np.ndarray]" = OrderedDict()
#: Sync routes run in Starlette's threadpool, so concurrent requests hit this
#: module-global OrderedDict in parallel — its mutation is not thread-safe.
_lock = threading.Lock()


def load_volume_cached(path: Path, loader: Callable[[Path], np.ndarray]) -> np.ndarray:
    """Return ``loader(path)`` result, served from cache when possible.

    Args:
        path: Volume file to read.
        loader: Function that actually decodes the file into an ndarray. Called
            only on a cache miss.

    Returns:
        The decoded volume array. The returned array may be shared with other
        callers — treat it as read-only.
    """
    key = (str(path), path.stat().st_mtime)
    with _lock:
        cached = _cache.get(key)
        if cached is not None:
            _cache.move_to_end(key)
            return cached

    # Decode outside the lock — loading takes seconds and must not serialise
    # unrelated requests. Two concurrent misses may both decode; last one wins.
    arr = loader(path)
    if arr.nbytes <= _MAX_CACHEABLE_BYTES:
        with _lock:
            _cache[key] = arr
            _cache.move_to_end(key)
            while len(_cache) > _MAX_ENTRIES:
                evicted_key, _ = _cache.popitem(last=False)
                logger.debug("volume_cache: evicted %s", evicted_key[0])
    return arr


def clear() -> None:
    """Drop all cached volumes (used by tests and the cleanup endpoint)."""
    with _lock:
        _cache.clear()
