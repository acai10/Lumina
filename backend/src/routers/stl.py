import io

import trimesh
from fastapi import APIRouter, File, HTTPException, UploadFile

from src.schemas.stl_schemas import STLUploadResponse

router = APIRouter()


@router.post("/upload", response_model=STLUploadResponse)
async def upload_stl(file: UploadFile = File(...)) -> STLUploadResponse:
    data = await file.read()
    try:
        mesh = trimesh.load(io.BytesIO(data), file_type="stl", force="mesh")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse STL: {exc}") from exc

    if not isinstance(mesh, trimesh.Trimesh):
        raise HTTPException(status_code=422, detail="File did not produce a valid triangle mesh")

    return STLUploadResponse(
        vertices=mesh.vertices.tolist(),
        faces=mesh.faces.tolist(),
        face_normals=mesh.face_normals.tolist(),
    )
