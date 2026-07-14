"""Structured logging helpers.

Rotating file handler at ``<userData>/logs/avs-backend.log`` (5 MiB × 5).
The location is resolved via the ``AVS_LOG_DIR`` environment variable set
by the Electron main process before spawning us.
"""

from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

_LOG_FORMAT = "[%(asctime)s.%(msecs)03d] [%(levelname)s] %(name)s: %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def configure_logging(level: str = "INFO") -> logging.Logger:
    """Configure root logging once; return the ``avs`` logger."""
    root = logging.getLogger()
    if getattr(root, "_avs_configured", False):
        return logging.getLogger("avs")

    root.setLevel(level)

    log_dir = Path(os.environ.get("AVS_LOG_DIR", "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)

    file_handler = RotatingFileHandler(
        log_dir / "avs-backend.log", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    file_handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    root.addHandler(file_handler)

    # stderr is captured by the Electron parent; keep this concise.
    stderr_handler = logging.StreamHandler()
    stderr_handler.setFormatter(logging.Formatter("[%(levelname)s] %(name)s: %(message)s"))
    root.addHandler(stderr_handler)

    root._avs_configured = True  # type: ignore[attr-defined]
    return logging.getLogger("avs")
