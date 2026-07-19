"""Unit tests for the volume LRU cache: hits, invalidation, eviction, size cap."""

import os
from pathlib import Path

import numpy as np
import pytest

from src.processing import volume_cache


@pytest.fixture(autouse=True)
def _clean_cache():
    volume_cache.clear()
    yield
    volume_cache.clear()


def _make_file(path: Path, n: int = 4) -> np.ndarray:
    arr = np.arange(n, dtype=np.float32)
    path.write_bytes(arr.tobytes())
    return arr


def _loader_counting(calls: list[Path]):
    def loader(path: Path) -> np.ndarray:
        calls.append(path)
        return np.frombuffer(path.read_bytes(), dtype=np.float32).copy()

    return loader


def test_second_read_is_served_from_cache(tmp_path) -> None:
    p = tmp_path / "a.bin"
    _make_file(p)
    calls: list[Path] = []
    loader = _loader_counting(calls)
    first = volume_cache.load_volume_cached(p, loader)
    second = volume_cache.load_volume_cached(p, loader)
    assert len(calls) == 1
    assert first is second  # same cached array object


def test_mtime_change_invalidates_entry(tmp_path) -> None:
    p = tmp_path / "a.bin"
    _make_file(p)
    calls: list[Path] = []
    loader = _loader_counting(calls)
    volume_cache.load_volume_cached(p, loader)
    # Bump mtime by a full second — a replaced file must be re-decoded.
    st = p.stat()
    os.utime(p, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000_000))
    volume_cache.load_volume_cached(p, loader)
    assert len(calls) == 2


def test_lru_evicts_beyond_max_entries(tmp_path) -> None:
    calls: list[Path] = []
    loader = _loader_counting(calls)
    paths = []
    for i in range(volume_cache._MAX_ENTRIES + 1):
        p = tmp_path / f"v{i}.bin"
        _make_file(p)
        paths.append(p)
        volume_cache.load_volume_cached(p, loader)
    # Oldest entry was evicted → loading it again decodes anew.
    volume_cache.load_volume_cached(paths[0], loader)
    assert calls.count(paths[0]) == 2


def test_oversized_arrays_are_never_cached(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(volume_cache, "_MAX_CACHEABLE_BYTES", 8)
    p = tmp_path / "big.bin"
    _make_file(p, n=16)  # 64 bytes > 8-byte cap
    calls: list[Path] = []
    loader = _loader_counting(calls)
    volume_cache.load_volume_cached(p, loader)
    volume_cache.load_volume_cached(p, loader)
    assert len(calls) == 2
