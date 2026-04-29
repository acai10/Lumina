import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from src.imaging import filters as img_filters
from src.imaging import oct_reader
from src.schemas.filter_schemas import FilterResponse

router = APIRouter()


@router.post("/apply", response_model=FilterResponse)
async def apply_filter(
    filter_type: str = Form(...),
    params: str = Form("{}"),
    file: UploadFile | None = File(None),
) -> FilterResponse:
    array = oct_reader.get_stored_scan()
    if array is None:
        if file is None:
            raise HTTPException(status_code=422, detail="No scan loaded and no file provided")
        data = await file.read()
        array = oct_reader.load_scan(data)

    if array.ndim == 3:
        slice_array = array[0]
    elif array.ndim == 2:
        slice_array = array
    else:
        raise HTTPException(status_code=422, detail="Filter requires a 2D image")

    try:
        p: dict = json.loads(params)
    except json.JSONDecodeError:
        p = {}

    try:
        result = img_filters.apply_filter(slice_array, filter_type, p)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return FilterResponse(result=oct_reader.array_to_base64_png(result))
