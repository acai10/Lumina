import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from src.config import settings
from src.processing.volume_cache import clear as clear_volume_cache

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
        # `is_symlink()` also covers dangling links (registered source removed); for a
        # symlink, `unlink()` only removes the link, never the target under data_dir.
        if p.is_file() or p.is_symlink():
            try:
                p.unlink()
                deleted += 1
            except OSError:
                logger.warning("Could not delete %s", p)
                errors += 1
    # Drop cached arrays so we never serve data backed by a now-deleted file.
    clear_volume_cache()
    logger.info("cleanup: deleted %d file(s), %d error(s)", deleted, errors)
    return JSONResponse({"deleted": deleted, "errors": errors})
