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
    volumes,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.uploads_dir.mkdir(exist_ok=True)
    yield


app = FastAPI(title="Lumina Backend", version="0.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Shape", "X-Dtype", "X-VCount"],
)

app.include_router(volumes.router, prefix="/volumes", tags=["volumes"])
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
