"""Headless maintenance CLI — runs cleanup tasks without the JSON-RPC server.

This module is invoked by Windows Task Scheduler scheduled tasks created by
the scheduler backend. It performs actual cleanup operations directly,
without requiring the Electron app to be running.

Usage:
    avs-backend.exe --maintenance --action junk_clean
    avs-backend.exe --maintenance --action registry_clean
    avs-backend.exe --maintenance --action privacy_clean
    avs-backend.exe --maintenance --action full_optimize
    avs-backend.exe --maintenance --action health_snapshot

Exit codes:
    0 — success
    1 — error
    2 — invalid arguments
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.maintenance")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _log_to_file(message: str, action: str) -> None:
    """Append a log line to the maintenance log file."""
    try:
        log_dir = Path(os.environ.get("LOCALAPPDATA", "")) / "AVSShield" / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        log_file = log_dir / "maintenance.log"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{_now_iso()}] [{action}] {message}\n")
    except Exception:
        pass


def _run_junk_clean() -> dict[str, Any]:
    """Run junk cleanup — same categories as _run_direct_cleanup."""
    import fnmatch

    local_app_data = os.environ.get("LOCALAPPDATA", "")
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    program_data = os.environ.get("ProgramData", r"C:\ProgramData")

    categories: list[dict[str, Any]] = []

    def add_folder(name: str, path: str) -> None:
        if path and os.path.isdir(path):
            categories.append({"name": name, "type": "folder", "path": path})

    def add_pattern(name: str, path: str, pattern: str) -> None:
        if os.path.isdir(path):
            categories.append({"name": name, "type": "pattern", "path": path, "pattern": pattern})

    user_temp = os.path.join(local_app_data, "Temp") if local_app_data else os.environ.get("TEMP", "")
    add_folder("User Temporary Files", user_temp)
    add_folder("Windows Temporary Files", os.path.join(system_root, "Temp"))
    add_folder("Prefetch Data", os.path.join(system_root, "Prefetch"))
    add_folder("Temporary Internet Files", os.path.join(local_app_data, "Microsoft", "Windows", "INetCache"))
    add_folder("Downloaded Program Files", os.path.join(system_root, "Downloaded Program Files"))

    for drive_letter in "CDEFGH":
        drive = f"{drive_letter}:"
        rb_path = os.path.join(drive + os.sep, "$Recycle.Bin")
        if os.path.isdir(rb_path):
            categories.append({"name": f"Recycle Bin ({drive})", "type": "folder", "path": rb_path})

    explorer_dir = os.path.join(local_app_data, "Microsoft", "Windows", "Explorer")
    add_pattern("Thumbnails", explorer_dir, "thumbcache_*.db")
    add_pattern("Icon Cache", explorer_dir, "iconcache_*.db")
    add_folder("DirectX Shader Cache", os.path.join(local_app_data, "D3DSCache"))
    add_folder("Error Reports (User)", os.path.join(local_app_data, "Microsoft", "Windows", "WER"))
    add_folder("Error Reports (System)", os.path.join(program_data, "Microsoft", "Windows", "WER"))
    add_folder("Windows Update Cleanup", os.path.join(system_root, "SoftwareDistribution", "Download"))
    add_folder("Previous Windows Installation", os.path.join(system_root[:2] + os.sep, "Windows.old"))

    total_files_found = 0
    total_files_deleted = 0
    total_files_skipped = 0
    total_folders_deleted = 0
    total_bytes_recovered = 0
    category_results: list[dict[str, Any]] = []

    for cat in categories:
        cat_files_found = 0
        cat_files_deleted = 0
        cat_files_skipped = 0
        cat_folders_deleted = 0
        cat_bytes = 0

        if cat["type"] == "folder":
            root_path = cat["path"]
            try:
                for entry in os.scandir(root_path):
                    if entry.is_dir(follow_symlinks=False):
                        for sub_root, sub_dirs, sub_files in os.walk(entry.path, topdown=False):
                            for f in sub_files:
                                fp = os.path.join(sub_root, f)
                                cat_files_found += 1
                                try:
                                    sz = os.path.getsize(fp)
                                    os.remove(fp)
                                    cat_files_deleted += 1
                                    cat_bytes += sz
                                except OSError:
                                    cat_files_skipped += 1
                            for d in sub_dirs:
                                dp = os.path.join(sub_root, d)
                                try:
                                    os.rmdir(dp)
                                    cat_folders_deleted += 1
                                except OSError:
                                    pass
                        try:
                            os.rmdir(entry.path)
                            cat_folders_deleted += 1
                        except OSError:
                            pass
                    elif entry.is_file(follow_symlinks=False):
                        cat_files_found += 1
                        try:
                            sz = entry.stat().st_size
                            os.remove(entry.path)
                            cat_files_deleted += 1
                            cat_bytes += sz
                        except OSError:
                            cat_files_skipped += 1
            except OSError as e:
                _log_to_file(f"Error scanning {root_path}: {e}", "junk_clean")

        elif cat["type"] == "pattern":
            root_path = cat["path"]
            pattern = cat["pattern"]
            try:
                for entry in os.scandir(root_path):
                    if entry.is_file(follow_symlinks=False) and fnmatch.fnmatch(entry.name, pattern):
                        cat_files_found += 1
                        try:
                            sz = entry.stat().st_size
                            os.remove(entry.path)
                            cat_files_deleted += 1
                            cat_bytes += sz
                        except OSError:
                            cat_files_skipped += 1
            except OSError as e:
                _log_to_file(f"Error scanning pattern {root_path}: {e}", "junk_clean")

        total_files_found += cat_files_found
        total_files_deleted += cat_files_deleted
        total_files_skipped += cat_files_skipped
        total_folders_deleted += cat_folders_deleted
        total_bytes_recovered += cat_bytes

        category_results.append({
            "name": cat["name"],
            "files_found": cat_files_found,
            "files_deleted": cat_files_deleted,
            "files_skipped": cat_files_skipped,
            "folders_deleted": cat_folders_deleted,
            "bytes_recovered": cat_bytes,
        })

        _log_to_file(
            f"Category '{cat['name']}': {cat_files_deleted}/{cat_files_found} files, "
            f"{cat_bytes} bytes, {cat_folders_deleted} folders",
            "junk_clean",
        )

    return {
        "action": "junk_clean",
        "files_found": total_files_found,
        "files_deleted": total_files_deleted,
        "files_skipped": total_files_skipped,
        "folders_deleted": total_folders_deleted,
        "bytes_recovered": total_bytes_recovered,
        "categories": category_results,
        "timestamp": _now_iso(),
    }


def _run_registry_clean() -> dict[str, Any]:
    """Run registry scan and fix."""
    try:
        from avs_backend.registry_cleaner.registry_scanner import scan_registry, fix_issues
    except ImportError:
        return {"action": "registry_clean", "error": "registry_cleaner module not available", "timestamp": _now_iso()}

    result = scan_registry()
    issues = result.issues if hasattr(result, "issues") else []
    fixed = fix_issues(issues) if issues else {}

    _log_to_file(f"Registry: {len(issues)} issues found, {fixed}", "registry_clean")

    return {
        "action": "registry_clean",
        "issues_found": len(issues),
        "fixed": fixed,
        "timestamp": _now_iso(),
    }


def _run_privacy_clean() -> dict[str, Any]:
    """Run privacy cleaning."""
    try:
        from avs_backend.privacy.privacy_cleaner import scan_privacy_items, clean_privacy_items
    except ImportError:
        return {"action": "privacy_clean", "error": "privacy_cleaner module not available", "timestamp": _now_iso()}

    items = scan_privacy_items()
    result = clean_privacy_items(items)

    cleaned = getattr(result, "items_cleaned", 0)
    errors = getattr(result, "errors", 0)
    bytes_cleaned = getattr(result, "bytes_cleaned", 0)

    _log_to_file(f"Privacy: {len(items)} items, {cleaned} cleaned, {bytes_cleaned} bytes", "privacy_clean")

    return {
        "action": "privacy_clean",
        "items_found": len(items),
        "items_cleaned": cleaned,
        "errors": errors,
        "bytes_cleaned": bytes_cleaned,
        "timestamp": _now_iso(),
    }


def _run_health_snapshot() -> dict[str, Any]:
    """Capture a health snapshot for predictive health."""
    try:
        import psutil
    except ImportError:
        return {"action": "health_snapshot", "error": "psutil not available", "timestamp": _now_iso()}

    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("C:\\" if os.name == "nt" else "/")

        snapshot = {
            "action": "health_snapshot",
            "cpu_percent": cpu_percent,
            "memory_percent": memory.percent,
            "memory_available": memory.available,
            "memory_total": memory.total,
            "disk_percent": disk.percent,
            "disk_free": disk.free,
            "disk_total": disk.total,
            "timestamp": _now_iso(),
        }

        _log_to_file(
            f"Health: CPU {cpu_percent}%, RAM {memory.percent}%, Disk {disk.percent}%",
            "health_snapshot",
        )
        return snapshot
    except Exception as e:
        return {"action": "health_snapshot", "error": str(e), "timestamp": _now_iso()}


def _run_full_optimize() -> dict[str, Any]:
    """Run full optimization — junk clean + registry clean + privacy clean."""
    _log_to_file("Starting full optimization", "full_optimize")

    junk_result = _run_junk_clean()
    registry_result = _run_registry_clean()
    privacy_result = _run_privacy_clean()

    total_bytes = (
        junk_result.get("bytes_recovered", 0)
        + privacy_result.get("bytes_cleaned", 0)
    )
    total_files = (
        junk_result.get("files_deleted", 0)
        + privacy_result.get("items_cleaned", 0)
    )

    _log_to_file(
        f"Full optimization complete: {total_files} items, {total_bytes} bytes",
        "full_optimize",
    )

    return {
        "action": "full_optimize",
        "junk": junk_result,
        "registry": registry_result,
        "privacy": privacy_result,
        "total_bytes_recovered": total_bytes,
        "total_items_cleaned": total_files,
        "timestamp": _now_iso(),
    }


def run_maintenance(action: str) -> dict[str, Any]:
    """Run a maintenance action by name."""
    actions = {
        "junk_clean": _run_junk_clean,
        "registry_clean": _run_registry_clean,
        "privacy_clean": _run_privacy_clean,
        "health_snapshot": _run_health_snapshot,
        "full_optimize": _run_full_optimize,
    }

    handler = actions.get(action)
    if handler is None:
        return {"action": action, "error": f"Unknown action: {action}", "timestamp": _now_iso()}

    start = time.time()
    try:
        result = handler()
        result["duration_seconds"] = round(time.time() - start, 2)
        result["status"] = "completed"
        return result
    except Exception as e:
        log.exception("Maintenance action '%s' failed", action)
        return {
            "action": action,
            "error": str(e),
            "duration_seconds": round(time.time() - start, 2),
            "status": "failed",
            "timestamp": _now_iso(),
        }


def main() -> int:
    """CLI entry point for headless maintenance."""
    parser = argparse.ArgumentParser(
        description="AVS Shield headless maintenance runner",
    )
    parser.add_argument(
        "--maintenance",
        action="store_true",
        help="Run in maintenance mode (not JSON-RPC server mode)",
    )
    parser.add_argument(
        "--action",
        type=str,
        choices=["junk_clean", "registry_clean", "privacy_clean", "health_snapshot", "full_optimize"],
        help="Maintenance action to run",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Optional file path to write JSON result",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )

    args = parser.parse_args()

    if not args.maintenance:
        parser.print_help()
        return 2

    if not args.action:
        print("Error: --action is required with --maintenance")
        parser.print_help()
        return 2

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    _log_to_file(f"Starting maintenance action: {args.action}", args.action)

    result = run_maintenance(args.action)

    # Print result to stdout
    print(json.dumps(result, indent=2, default=str))

    # Optionally write to file
    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, default=str)
        except OSError as e:
            log.warning("Failed to write output file: %s", e)

    _log_to_file(
        f"Maintenance action '{args.action}' finished with status: {result.get('status', 'unknown')}",
        args.action,
    )

    return 0 if result.get("status") == "completed" else 1


if __name__ == "__main__":
    sys.exit(main())
