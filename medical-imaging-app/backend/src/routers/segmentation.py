from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from src.imaging import oct_reader
from src.imaging import segmentation as img_seg
from src.schemas.segmentation_schemas import SegmentationResponse

router = APIRouter()


@router.post("/run", response_model=SegmentationResponse)
async def run_segmentation(
    method: str = Form(...),
    file: UploadFile | None = File(None),
) -> SegmentationResponse:
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
        raise HTTPException(status_code=422, detail="Segmentation requires a 2D image")

    try:
        result, mask = img_seg.segment(slice_array, method)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return SegmentationResponse(
        result=oct_reader.array_to_base64_png(result),
        mask=oct_reader.array_to_base64_png(mask),
    )
