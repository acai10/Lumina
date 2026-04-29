from pydantic import BaseModel


class SegmentationResponse(BaseModel):
    result: str  # base64 PNG
    mask: str  # base64 PNG
