import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import filters, oct, segmentation, stl

app = FastAPI(title="OCT Medical Imaging API", version="0.1.0")

_origins_env = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
origins = [o.strip() for o in _origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(oct.router, prefix="/oct", tags=["oct"])
app.include_router(filters.router, prefix="/filters", tags=["filters"])
app.include_router(segmentation.router, prefix="/segmentation", tags=["segmentation"])
app.include_router(stl.router, prefix="/stl", tags=["stl"])


@app.get("/")
def health() -> dict:
    return {"status": "ok"}
