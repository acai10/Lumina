# Lumina — OCT Volume Stitcher Comparison Tool

Browser-based tool for comparing OCT volume stitching algorithms.
Python backend for computation, React/Three.js frontend for visualisation.

## Quick start

```bash
docker compose up --build
```

- Frontend: <http://localhost:5173>
- Backend API: <http://localhost:8000>
- API docs (Swagger): <http://localhost:8000/docs>

## What it does

1. Upload an `.h5` OCT volume → receive a `volume_id`
2. Configure a preprocessing filter chain (Gaussian, Median, Lee, BM3D, Normalize, Anisotropy)
3. Select stitching algorithms to compare (Phase Correlation, SimpleITK Affine, Elastix B-Spline, BigStitcher)
4. Submit a job — runs concurrently in the backend
5. Poll for results: NCC, MI, MSE, (Dice if a segmentation mask is provided)
6. Fetch result volumes as raw float32 for visualisation

## Data format

All `.h5` files must contain a dataset named `"OCT"` with shape `(512, 250, 250)` — nSlices × height × width. The backend validates this on upload.

## Development

See [CLAUDE.md](CLAUDE.md) for all commands.

### Direct (without Docker)

```bash
# Backend
cd backend && uv sync
uv run uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm install
npm run dev
```

## Stack

| Service | Tech |
|---------|------|
| Backend | Python 3.11, FastAPI, h5py, numpy, scipy, scikit-image, SimpleITK, itk-elastix, bm3d |
| Frontend | React 18, TypeScript, Three.js, MUI, Zustand, Vite |
| Infra | Docker Compose, uv (Python package manager), Node 20 |
