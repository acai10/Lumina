import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.delete(
    "/",
    summary="Delete all files in the uploads directory",
    description="Removes every file under ``uploads/``. Call after all jobs and sessions complete.",
)
def cleanup_uploads() -> JSONResponse:
    deleted = 0
    errors = 0
    for p in settings.uploads_dir.iterdir():
        if p.is_file():
            try:
                p.unlink()
                deleted += 1
            except OSError:
                logger.warning("Could not delete %s", p)
                errors += 1
    logger.info("cleanup: deleted %d file(s), %d error(s)", deleted, errors)
    return JSONResponse({"deleted": deleted, "errors": errors})
