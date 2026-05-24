import os
from pathlib import Path

UPLOADS_DIR = Path(os.environ.get("UPLOADS_DIR", "uploads"))
