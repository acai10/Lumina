from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.routers import filters, oct, segmentation, stl

app = FastAPI(title="OCT Medical Imaging API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(oct.router, prefix="/oct", tags=["oct"])
app.include_router(filters.router, prefix="/filters", tags=["filters"])
app.include_router(segmentation.router, prefix="/segmentation", tags=["segmentation"])
app.include_router(stl.router, prefix="/stl", tags=["stl"])


@app.get("/")
def health() -> dict:
    return {"status": "ok"}
