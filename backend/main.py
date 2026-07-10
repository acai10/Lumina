import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from src.config import settings
from src.routers import (
    cleanup,
    crop,
    jobs,
    measurements,
    results,
    sessions,
    submission,
    volumes,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

#: Top-of-page description rendered in the Swagger UI (`/docs`) and ReDoc (`/redoc`).
API_DESCRIPTION = """
Backend for **Lumina**, an OCT volume viewer & stitching platform. It does all the
heavy computation (reading `.h5` volumes, filtering, stitching, measuring) and
returns render-ready data to the browser frontend.

### Volume format
Fixed HDF5 layout: dataset name `"OCT"`, shape `(512, 250, 250)` =
`(nSlices, height, width)`. Merged (stitched) volumes may be larger laterally.

### Packed binary responses
Most volume endpoints return a *packed binary* instead of JSON, with two headers:

* `X-Shape` — `"<nSlices>,<height>,<width>"`
* `X-VCount` — number of above-threshold voxels

Body layout (one contiguous buffer):
`[vIndices: vCount×uint32][vIntensities: vCount×float32][normalizedVolume: total×uint8]`

### Long-running work
Filter **jobs** (`/jobs`) and stitching **sessions** (`/sessions`) run in the
background: the create call returns immediately with an id; poll the matching
`GET` endpoint until `status` is `done`, then download the result.

See the full project documentation in the repository's `docs/` directory.
"""

#: Per-tag descriptions shown as collapsible groups in the Swagger/ReDoc UI.
OPENAPI_TAGS = [
    {"name": "volumes", "description": "Upload, register, normalise, and filter single volumes."},
    {
        "name": "crop",
        "description": "Extract an axis-aligned sub-volume as a new independent volume.",
    },
    {
        "name": "measurements",
        "description": "Geometric measurements (volume, surface area, thickness, diameter).",
    },
    {
        "name": "submission",
        "description": "Build challenge-submission files (surface depth map + muscle/fat mask).",
    },
    {
        "name": "jobs",
        "description": "Single-volume filter + stitcher comparison jobs (background).",
    },
    {"name": "results", "description": "Download stitcher result volumes produced by jobs."},
    {
        "name": "sessions",
        "description": "Multi-volume stitching sessions: register, merge, filter (background).",
    },
    {"name": "cleanup", "description": "Remove all files from the uploads directory."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(
    title="Lumina Backend",
    version="0.3.0",
    description=API_DESCRIPTION,
    openapi_tags=OPENAPI_TAGS,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Shape", "X-Dtype", "X-VCount"],
)

app.include_router(volumes.router, prefix="/volumes", tags=["volumes"])
app.include_router(submission.router, prefix="/volumes", tags=["submission"])
app.include_router(crop.router, tags=["crop"])
app.include_router(measurements.router, tags=["measurements"])
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(results.router, prefix="/jobs", tags=["results"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(cleanup.router, prefix="/cleanup", tags=["cleanup"])


@app.get("/", summary="Health check")
def health() -> dict:
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception for %s %s", request.method, request.url)
    origin = request.headers.get("origin", "")
    headers: dict[str, str] = {}
    if origin in settings.cors_origins:
        headers["Access-Control-Allow-Origin"] = origin
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error."},
        headers=headers,
    )
