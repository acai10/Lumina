from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from src.imaging import oct_reader
from src.schemas.oct_schemas import AScanResponse, SliceResponse, UploadResponse

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
async def upload_scan(file: UploadFile = File(...)) -> UploadResponse:
    data = await file.read()
    try:
        array = oct_reader.load_scan(data)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    scan_type = oct_reader.detect_scan_type(array)
    oct_reader.store_scan(array)

    if array.ndim == 1:
        preview = oct_reader.ascan_to_base64_png(array)
        n_slices, height, width = 1, 1, int(array.shape[0])
    elif array.ndim == 2:
        preview = oct_reader.array_to_base64_png(array)
        n_slices, height, width = 1, int(array.shape[0]), int(array.shape[1])
    else:
        preview = oct_reader.array_to_base64_png(array[0])
        n_slices, height, width = int(array.shape[0]), int(array.shape[1]), int(array.shape[2])

    return UploadResponse(
        scan_type=scan_type,
        n_slices=n_slices,
        width=width,
        height=height,
        preview=preview,
    )


@router.get("/slice/{index}", response_model=SliceResponse)
def get_slice(index: int) -> SliceResponse:
    array = oct_reader.get_stored_scan()
    if array is None or array.ndim < 3:
        raise HTTPException(status_code=404, detail="No C-scan loaded")
    if index < 0 or index >= array.shape[0]:
        raise HTTPException(status_code=404, detail="Slice index out of range")
    return SliceResponse(slice_index=index, image=oct_reader.array_to_base64_png(array[index]))


@router.get("/ascan", response_model=AScanResponse)
def get_ascan(x: int = Query(...), slice_index: int = Query(0, alias="slice")) -> AScanResponse:
    array = oct_reader.get_stored_scan()
    if array is None:
        raise HTTPException(status_code=404, detail="No scan loaded")

    if array.ndim == 1:
        signal = array.tolist()
    elif array.ndim == 2:
        col = min(max(x, 0), array.shape[1] - 1)
        signal = array[:, col].tolist()
    else:
        s = min(max(slice_index, 0), array.shape[0] - 1)
        col = min(max(x, 0), array.shape[2] - 1)
        signal = array[s, :, col].tolist()

    return AScanResponse(signal=signal, depth_axis=list(range(len(signal))))
