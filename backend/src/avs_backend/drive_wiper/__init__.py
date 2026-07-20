"""Drive Wiper / Secure File Shredder RPC handlers."""
from avs_backend.api.registry import register
from .wiper_engine import list_drives, shred_items, wipe_free_space


@register("wiper.drives")
def wiper_drives(request: dict):
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
def wiper_shred(request: dict):
    paths = request.get("paths", [])
    passes = request.get("passes", 3)
    zeros = request.get("zeros", False)
    if not paths:
        return {"success": False, "message": "No paths provided", "results": []}
    results = shred_items(paths, passes=passes, zeros=zeros)
    return {
        "success": all(r.success for r in results),
        "message": "Shred completed",
        "results": [
            {"path": r.path, "success": r.success, "message": r.message} for r in results
        ],
    }


@register("wiper.wipeFreeSpace")
def wiper_wipe_free_space(request: dict):
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
