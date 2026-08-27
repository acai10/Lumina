"""Enumerations shared across the schemas.

:class:`JobStatus` is the single source of truth for the lifecycle of a job or a
session. It is a ``StrEnum`` so it serialises as a plain string in JSON while still
being compared as an enum in code; never compare against raw string literals.
"""
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
