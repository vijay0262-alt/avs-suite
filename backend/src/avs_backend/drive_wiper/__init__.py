"""Drive Wiper / Secure File Shredder RPC handlers.

Provides secure file deletion with multiple overwrite patterns:
  - Quick: 1-pass random
  - DoD 5220.22-M: 3-pass (zeros, 0xFF, random)
  - Gutmann: 35-pass with specific byte patterns

All editions: unlimited files, all methods.
"""
from typing import Any

from avs_backend.api.registry import register
from .wiper_engine import list_drives, shred_items, wipe_free_space


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

    All editions: unlimited files, all methods.
    """
    request = request or {}
    paths = request.get("paths", [])
    method = request.get("method", "dod")
    passes = request.get("passes", 3)
    zeros = request.get("zeros", False)

    if not paths:
        return {"success": False, "message": "No paths provided", "results": []}

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
        "totalShredded": succeeded,
        "totalFailed": failed,
    }


@register("wiper.wipeFreeSpace")
def wiper_wipe_free_space(request: dict[str, Any] | None) -> dict[str, Any]:
    """Wipe free space on a drive.

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
