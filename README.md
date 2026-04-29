# OCT Medical Imaging

Browser-based OCT scan viewer and processing tool for medical professionals (ophthalmologists, researchers).

## Supported Scan Types

| Type | Description | Display |
|------|-------------|---------|
| A-Scan | Single 1D depth signal (amplitude vs depth) | Waveform / line plot |
| B-Scan | 2D cross-sectional slice (stack of A-scans) | Grayscale image |
| C-Scan | 3D volumetric scan (stack of B-scans) | Scrollable B-scan slices |

## Dev Setup

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:8000
- API docs: http://localhost:8000/docs

## Architecture

```
medical-imaging-app/
├── docker-compose.yml
├── frontend/   # React + TypeScript + Vite + MUI
└── backend/    # Python FastAPI
```

The frontend and backend share no code. All communication is via HTTP REST.
