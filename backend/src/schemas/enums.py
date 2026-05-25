from enum import StrEnum


class JobStatus(StrEnum):
    """Job execution states.

    StrEnum ensures FastAPI/Pydantic serialises values as plain strings
    ("pending") rather than enum representations.
    """

    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"
