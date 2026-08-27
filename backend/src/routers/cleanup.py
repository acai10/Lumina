"""Route for clearing the uploads directory.

Deletes everything under ``settings.uploads_dir``. It refuses with 409 while a job or
session is still running, since those hold volume ids that would stop resolving
mid-run.
"""
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from src.config import settings
from src.processing.runner import job_store
from src.processing.session_runner import session_store
from src.processing.volume_cache import clear as clear_volume_cache

logger = logging.getLogger(__name__)

router = APIRouter()


@router.delete(
    "/",
    summary="Delete all files in the uploads directory",
    description=(
        "Removes every file under ``uploads/`` and drops finished job/session "
        "state. Rejected with 409 while a job or session is still running, since "
        "deleting its source files would abort it."
    ),
    responses={409: {"description": "A job or session is still running"}},
)
def cleanup_uploads() -> JSONResponse:
    """Delete every file under ``uploads/`` and drop finished job/session state.

    Returns:
        JSON with the number of deleted files and deletion errors.

    Raises:
        HTTPException 409: A job or session is still PENDING/RUNNING.
    """
    # Deleting source/intermediate files under a running pipeline would make it
    # fail asynchronously — refuse instead of corrupting in-flight work.
    if job_store.any_running() or session_store.any_running():
        raise HTTPException(
            status_code=409, detail="A job or session is still running; retry once it finishes."
        )

    deleted = 0
    errors = 0
    for p in settings.uploads_dir.iterdir():
        # `is_symlink()` also covers dangling links (registered source removed); for a
        # symlink, `unlink()` only removes the link, never the target under data_dir.
        if p.is_file() or p.is_symlink():
            try:
                p.unlink()
                deleted += 1
            except OSError as exc:
                logger.warning("Could not delete %s: %s", p, exc)
                errors += 1
    # Drop cached arrays so we never serve data backed by a now-deleted file,
    # and release finished job/session state (the stores otherwise grow
    # monotonically — nothing else ever removes entries).
    clear_volume_cache()
    job_store.clear_finished()
    session_store.clear_finished()
    logger.info("cleanup: deleted %d file(s), %d error(s)", deleted, errors)
    return JSONResponse({"deleted": deleted, "errors": errors})
