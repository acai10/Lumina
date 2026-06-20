"""Print a built submission `.h5` as text (structure + depth/mask stats).

Usage (from the backend/ directory):

    uv run python show_submission.py <path/to/submission.h5>
    uv run python show_submission.py <volume_id>     # resolves uploads/<id>_submission.h5

This is the command-line way to verify the contents of a generated submission.
"""

import sys
from pathlib import Path

from src.config import settings
from src.processing.submission import describe_submission


def _resolve(arg: str) -> Path | None:
    candidates = [
        Path(arg),
        settings.uploads_dir / arg,
        settings.uploads_dir / f"{arg}.h5",
        settings.uploads_dir / f"{arg}_submission.h5",
    ]
    return next((c for c in candidates if c.is_file()), None)


def main(argv: list[str]) -> int:
    if not argv:
        sys.stderr.write("usage: python show_submission.py <file.h5 | volume_id>\n")
        return 2
    path = _resolve(argv[0])
    if path is None:
        sys.stderr.write(f"not found: {argv[0]}\n")
        return 1
    sys.stdout.write(describe_submission(path) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
