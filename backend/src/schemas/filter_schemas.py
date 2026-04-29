from pydantic import BaseModel


class FilterResponse(BaseModel):
    result: str  # base64 PNG
