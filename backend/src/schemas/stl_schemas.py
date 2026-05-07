from pydantic import BaseModel


class STLUploadResponse(BaseModel):
    vertices: list[list[float]]
    faces: list[list[int]]
    face_normals: list[list[float]]
