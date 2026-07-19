"""Structured logging helpers.

Rotating file handlers at ``<userData>/logs/``:
- main.log: General application log (5 MiB × 5)
- backend.log: Backend-specific log (5 MiB × 5)
- memory_optimizer.log: Memory optimization operations (5 MiB × 3)
- startup_manager.log: Startup management operations (5 MiB × 3)
- performance_monitor.log: Performance monitoring data (5 MiB × 3)

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

    # Main application log
    main_handler = RotatingFileHandler(
        log_dir / "main.log", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    main_handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    root.addHandler(main_handler)

    # Backend-specific log
    backend_handler = RotatingFileHandler(
        log_dir / "backend.log", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    backend_handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    # Only log backend-related messages to backend.log
    backend_handler.addFilter(lambda record: record.name.startswith('avs'))
    root.addHandler(backend_handler)

    # Memory Optimizer log
    memory_handler = RotatingFileHandler(
        log_dir / "memory_optimizer.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    memory_handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    memory_handler.addFilter(lambda record: 'memory' in record.name.lower())
    root.addHandler(memory_handler)

    # Startup Manager log
    startup_handler = RotatingFileHandler(
        log_dir / "startup_manager.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    startup_handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    startup_handler.addFilter(lambda record: 'startup' in record.name.lower())
    root.addHandler(startup_handler)

    # Performance Monitor log
    performance_handler = RotatingFileHandler(
        log_dir / "performance_monitor.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    performance_handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_DATE_FORMAT))
    performance_handler.addFilter(lambda record: 'performance' in record.name.lower() or 'monitor' in record.name.lower())
    root.addHandler(performance_handler)

    # stderr is captured by the Electron parent; keep this concise.
    stderr_handler = logging.StreamHandler()
    stderr_handler.setFormatter(logging.Formatter("[%(levelname)s] %(name)s: %(message)s"))
    root.addHandler(stderr_handler)

    root._avs_configured = True  # type: ignore[attr-defined]
    return logging.getLogger("avs")
