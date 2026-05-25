# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

**Backend**

- Dev tooling: `ruff`, `mypy`, `pytest`, `pytest-asyncio`, `httpx` added to `[dependency-groups] dev` in `pyproject.toml`, with `[tool.ruff]`, `[tool.mypy]`, and `[tool.pytest.ini_options]` config sections.
- Test suite in `backend/tests/`: `test_filters.py`, `test_metrics.py`, `test_job_store.py` with shared `conftest.py` fixture.
- `src/schemas/` directory: `enums.py` (JobStatus), `jobs.py` (FilterStep, JobRequest, JobCreated, JobStatusResponse), `volumes.py` (UploadResponse, VolumeInfo).
- Google-style docstrings (Args / Returns / Raises) on all public functions in `src/processing/`.
- `pydantic-settings` added to production dependencies.

**Frontend**

- `SlicePanel.tsx` — `SlicePanel` component extracted from `H5SliceViewer.tsx` into its own file.
- `H5SliceViewer.styles.ts` — `slicePanelSliderSx` style object extracted (has MUI pseudo-selectors).
- `h5ViewerShaders.ts` — GLSL3 `vertexShader` and `fragmentShader` strings extracted from `H5Viewer.tsx`.
- `createAxisLabels.ts` — axis label sprite factory extracted from `H5Viewer.tsx`.
- Barrel `index.ts` files in every feature and shared folder: `features/h5`, `features/controls`, `features/toolbar`, `features/stl`, `features/notifications`, `shared/api`, `shared/h5`, `shared/three`, `shared/theme`.

### Changed

**Backend**

- `src/config.py` replaced with Pydantic `BaseSettings`; `uploads_dir` and `cors_origins` are now typed, validated, and env-var-driven. `CORS_ORIGINS` (previously hardcoded in `main.py`) is now part of settings.
- Job status values migrated from raw strings to `JobStatus` (str Enum) in `src/schemas/enums.py`. API response JSON is unchanged (`"pending"` not `<JobStatus.PENDING>`).
- Pydantic models moved from inline router definitions into `src/schemas/` directory; routers import from there.
- `_jobs: dict` global in `runner.py` replaced with `JobStore` class; `job_store` module-level singleton preserves the existing import surface (`create_job`, `get_job`).
- `main.py` now calls `logging.basicConfig()` to configure structured log output on startup; all processing modules use `logging.getLogger(__name__)`.
- Per-stitcher error messages in `runner.py` now include the exception type prefix: `"ValueError: ..."`.
- `POST /jobs/` now returns HTTP 201 (was 200).
- All router endpoints annotated with `summary`, `description`, `tags`, and `responses` for richer Swagger docs.

**Frontend**

- `H5SliceViewer.tsx` trimmed from 418 lines to ~65 lines after `SlicePanel` extraction.
- `H5Viewer.tsx` trimmed by ~90 lines after shader and axis-label extraction.
- `SlicePanel.tsx` uses `slicePanelSliderSx` from `H5SliceViewer.styles.ts` instead of inline constant.

### Removed

**Backend**

- Inline `os.environ.get("CORS_ORIGINS", ...)` logic removed from `main.py` (now in `Settings`).
- Inline Pydantic model definitions removed from `src/routers/volumes.py` and `src/routers/jobs.py`.
