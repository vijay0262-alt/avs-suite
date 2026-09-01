"""Drive Wiper / Secure File Shredder RPC handlers.

Provides secure file deletion with multiple overwrite patterns:
  - Quick: 1-pass random
  - DoD 5220.22-M: 3-pass (zeros, 0xFF, random)
  - Gutmann: 35-pass with specific byte patterns

Free edition: limited to 3 files per run
Professional edition: unlimited files, all methods
"""
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature
from avs_backend.licensing import _get_current_edition as get_current_edition
from .wiper_engine import list_drives, shred_items, wipe_free_space

# Free edition limit: max 3 files per shred operation
FREE_FILE_LIMIT = 3


@register("wiper.drives")
def wiper_drives(_request: dict[str, Any] | None) -> dict[str, Any]:
    """List available drives for free-space wiping."""
    return {
        "drives": [
            {
                "letter": d[0],
                "label": d[1],
                "fileSystem": d[2],
                "totalBytes": d[3],
                "freeBytes": d[4],
            }
            for d in list_drives()
        ]
    }


@register("wiper.shred")
def wiper_shred(request: dict[str, Any] | None) -> dict[str, Any]:
    """Securely shred files and/or directories.

    Params:
        paths: list of file/directory paths to shred
        method: shredding method ("quick", "dod", "gutmann", "random")
        passes: number of passes (for "random" method, default 3)
        zeros: use zeros instead of random (for "random" method)

    Free edition: limited to 3 files, "quick" method only
    Professional edition: unlimited files, all methods
    """
    request = request or {}
    paths = request.get("paths", [])
    method = request.get("method", "dod")
    passes = request.get("passes", 3)
    zeros = request.get("zeros", False)

    if not paths:
        return {"success": False, "message": "No paths provided", "results": []}

    edition = get_current_edition()
    is_free = edition == "free"

    # Free edition: limit number of files
    if is_free:
        # Count total files (including files inside directories)
        total_files = 0
        for raw in paths:
            p_path = raw
            try:
                import os
                if os.path.isdir(p_path):
                    for _root, _dirs, files in os.walk(p_path):
                        total_files += len(files)
                else:
                    total_files += 1
            except Exception:
                total_files += 1

        if total_files > FREE_FILE_LIMIT:
            return {
                "success": False,
                "message": f"Free edition limits shredding to {FREE_FILE_LIMIT} files. Upgrade to Professional for unlimited shredding.",
                "error_code": "EDITION_LIMIT",
                "required_edition": "professional",
                "current_edition": edition,
                "file_limit": FREE_FILE_LIMIT,
                "files_requested": total_files,
                "results": [],
            }

        # Free edition: force "quick" method only
        method = "quick"

    results = shred_items(paths, method=method, passes=passes, zeros=zeros)

    # Count successes
    succeeded = sum(1 for r in results if r.success)
    failed = len(results) - succeeded

    return {
        "success": failed == 0,
        "message": f"Shredded {succeeded} item(s)" + (f", {failed} failed" if failed else ""),
        "method": method,
        "results": [
            {
                "path": r.path,
                "success": r.success,
                "message": r.message,
                "passes": r.passes,
                "bytesShredded": r.bytes_shredded,
            }
            for r in results
        ],
        "edition": edition,
        "totalShredded": succeeded,
        "totalFailed": failed,
    }


@register("wiper.wipeFreeSpace")
@require_feature("wiper.wipeFreeSpace")
def wiper_wipe_free_space(request: dict[str, Any] | None) -> dict[str, Any]:
    """Wipe free space on a drive (Pro feature).

    Fills the drive's free space with random data, then deletes the temp files.
    This prevents recovery of previously deleted files.
    """
    request = request or {}
    drive = request.get("drive", "")
    passes = request.get("passes", 1)
    zeros = request.get("zeros", False)
    result = wipe_free_space(drive, passes=passes, zeros=zeros)
    return {
        "success": result.success,
        "message": result.message,
        "bytesProcessed": result.bytesProcessed,
        "drive": result.drive,
    }
