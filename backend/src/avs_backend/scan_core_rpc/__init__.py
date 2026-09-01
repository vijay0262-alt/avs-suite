"""SC-8C8 Part 2A — thin, read-only RPC bridge for RemediationCoordinator."""

from __future__ import annotations

import logging
import os
import sys
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional

import uuid

from avs_backend.api.registry import register
from avs_backend.licensing import _get_current_edition, get_edition_limit, require_feature
from avs_backend.scan_core.metadata.database import DatabaseConfig, MetadataDatabase
from avs_backend.scan_core.orchestration import RemediationCoordinator
from avs_backend.scan_core.orchestration import orchestrator as _orchestrator_module
from avs_backend.scan_core.adapters.smart_optimization_plan_builder import (
    SmartOptimizationPlanBuilder,
)
from avs_backend.scan_core.adapters.security_remediation_plan_builder import (
    SecurityRemediationPlanBuilder,
)
from avs_backend.scan_core.adapters.dashboard_optimization_plan_builder import (
    DashboardOptimizationPlanBuilder,
)
from avs_backend.scan_core.metadata.action_plan_repository import ActionPlanRepository
from avs_backend.scan_core.orchestration.orchestrator import ScanOrchestrator
from avs_backend.scan_core.orchestration.models import ScanProgress, ScanResult
from avs_backend.scan_core.rules.evaluator import CancellationToken
from avs_backend.scan_core.rules.registry import RuleRegistry
from avs_backend.scan_core.rules.detection.junk_rules import register_junk_rules
from avs_backend.scan_core.rules.cleanup_categories import rule_id_to_category, category_order_index
from avs_backend.scan_core.orchestration.remediation_models import (
    RemediationExecutionStatus,
    RemediationPreview,
    RemediationValidation,
    RollbackSummary,
)

__all__ = [
    "get_coordinator",
    "preview_to_dict",
    "validation_to_dict",
    "status_to_dict",
    "rollback_to_dict",
]

logger = logging.getLogger(__name__)

_coordinator: Optional[RemediationCoordinator] = None
_scan_orchestrator: Optional[ScanOrchestrator] = None
_lock = threading.Lock()
_scan_orchestrator_lock = threading.Lock()
_scan_session_lock = threading.Lock()
_scan_sessions: dict[str, dict[str, Any]] = {}
# V1.0: Track the last init failure count for diagnostics, but do NOT
# permanently block retries.  A transient failure (e.g. DB locked by
# another process) should not prevent the user from retrying.
_scan_orchestrator_init_failures = 0

# ── Auto-optimization sessions ─────────────────────────────────────────
_auto_opt_lock = threading.Lock()
_auto_opt_sessions: dict[str, dict[str, Any]] = {}


def _get_app_data_dir() -> Path:
    """Return the platform-specific AVS application data directory."""
    if os.name == "nt":
        base = Path(
            os.environ.get("LOCALAPPDATA")
            or os.environ.get("APPDATA")
            or str(Path.home())
        )
        return base / "AVS Shield"

    base = Path(
        os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))
    )
    return base / "avs-shield"


def get_coordinator() -> Optional[RemediationCoordinator]:
    """Return the module-level RemediationCoordinator singleton, or None on failure."""
    global _coordinator
    if _coordinator is not None:
        return _coordinator

    with _lock:
        if _coordinator is not None:
            return _coordinator

        try:
            app_dir = _get_app_data_dir()
            app_dir.mkdir(parents=True, exist_ok=True)

            # V1.0: Share the same database instance as the scan orchestrator
            # to avoid FOREIGN KEY constraint failures caused by WAL
            # transaction isolation between separate connections.
            # The scan orchestrator saves action plans; the coordinator
            # loads them. If they use different connections, the plan
            # may not be visible to the coordinator yet.
            orch = get_scan_orchestrator(wait_for_ready=False)
            if orch is not None and getattr(orch, '_db', None) is not None:
                db = orch._db
            else:
                db = MetadataDatabase(DatabaseConfig(db_path=app_dir / "metadata.db"))
            _coordinator = RemediationCoordinator(
                database=db,
                backup_root=app_dir / "backups",
            )
            return _coordinator
        except Exception as exc:
            logger.exception("Failed to initialize RemediationCoordinator: %s", exc)
            return None


_scan_orchestrator_initializing = False


def get_scan_orchestrator(wait_for_ready: bool = False, timeout_s: float = 90.0) -> Optional[ScanOrchestrator]:
    """Return the module-level ScanOrchestrator singleton, or None on failure.

    Args:
        wait_for_ready: If True, block until initialization completes (or
            timeout expires) instead of returning None immediately.  This
            lets RPC callers like ``scan_core.scan.quick`` wait for the
            scanner to be ready without requiring the user to click again.
        timeout_s: Maximum seconds to wait when ``wait_for_ready`` is True.
    """
    global _scan_orchestrator, _scan_orchestrator_initializing, _scan_orchestrator_init_failures
    if _scan_orchestrator is not None:
        return _scan_orchestrator

    with _scan_orchestrator_lock:
        if _scan_orchestrator is not None:
            return _scan_orchestrator
        if _scan_orchestrator_initializing:
            # Another thread is already initializing.  If the caller asked
            # us to wait, poll until it's done (or timeout).  Otherwise
            # return None immediately for non-blocking callers.
            if not wait_for_ready:
                return None
            deadline = time.monotonic() + timeout_s
            while _scan_orchestrator_initializing and _scan_orchestrator is None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    logger.warning("get_scan_orchestrator: timed out after %.1fs waiting for initialization", timeout_s)
                    return None
                _scan_orchestrator_lock.release()
                time.sleep(min(0.5, remaining))
                _scan_orchestrator_lock.acquire()
            # After waiting, check again
            if _scan_orchestrator is not None:
                return _scan_orchestrator
            # If still initializing, return None (don't try to init)
            if _scan_orchestrator_initializing:
                return None
        _scan_orchestrator_initializing = True

    # Run initialization outside the lock so other callers don't block.
    try:
        app_dir = _get_app_data_dir()
        app_dir.mkdir(parents=True, exist_ok=True)

        db = MetadataDatabase(DatabaseConfig(db_path=app_dir / "metadata.db"))
        db.initialize()
        registry = RuleRegistry()
        register_junk_rules(registry)

        # V1.0 Protection Center: Register the Defender threat discovery
        # engine so confirmed Defender threats enter the canonical scan
        # pipeline as ScanAssets. The DefenderConfirmedThreatRule (registered
        # via register_junk_rules → register_defender_threat_rule) matches
        # these assets and produces CONFIRMED_THREAT findings.
        from avs_backend.scan_core.orchestration.discovery import (
            FilesystemDiscoveryEngine,
        )
        discovery_engines: dict[str, Any] = {
            "filesystem": FilesystemDiscoveryEngine(),
        }
        # V1.0: Only register the Defender threat discovery engine on
        # Windows.  On Linux/macOS, Defender does not exist and the
        # engine would return NOT_WINDOWS for every query, adding
        # unnecessary overhead.  The import is conditional so that
        # Linux CI environments don't need Windows-only dependencies.
        if os.name == "nt":
            from avs_backend.scan_core.security.defender_discovery import (
                DefenderThreatDiscoveryEngine,
            )
            discovery_engines["defender"] = DefenderThreatDiscoveryEngine()

        with _scan_orchestrator_lock:
            _scan_orchestrator = ScanOrchestrator(
                database=db,
                registry=registry,
                discovery_engines=discovery_engines,
                snapshot_ttl_seconds=3600,
            )
            return _scan_orchestrator
    except Exception as exc:
        logger.exception("Failed to initialize ScanOrchestrator: %s", exc)
        with _scan_orchestrator_lock:
            _scan_orchestrator_init_failures += 1
        return None
    finally:
        with _scan_orchestrator_lock:
            _scan_orchestrator_initializing = False


def _eager_init() -> None:
    """Initialize the scan orchestrator in a background thread at import time.

    The MetadataDatabase.initialize() call can take 30-60+ seconds on first
    run (schema creation, index building).  By starting this immediately at
    module import, the orchestrator is usually ready before the UI requests
    a scan, avoiding a 120s timeout on the first scan_core.scan.latest call.
    """
    try:
        get_scan_orchestrator()
    except Exception:
        logger.exception("Eager scan orchestrator initialization failed")


threading.Thread(target=_eager_init, daemon=True, name="scan-orch-init").start()


def _orchestrator_error() -> dict[str, Any]:
    return {
        "ok": False,
        "error": "Scan orchestrator is not available",
    }


def _safe_params(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    return params if isinstance(params, dict) else {}


def _require_str(params: dict[str, Any], key: str) -> tuple[bool, str]:
    value = params.get(key)
    if not value or not isinstance(value, str):
        return False, f"Missing or invalid parameter: {key}"
    return True, value


def preview_to_dict(preview: RemediationPreview) -> dict[str, Any]:
    """Serialize a RemediationPreview, including UI-required fields.

    Includes ``approval_token`` and the full ``affected_targets`` list.
    """
    return {
        "request_id": preview.request_id,
        "plan_id": preview.plan_id,
        "approval_token": preview.approval_token,
        "total_actions": preview.total_actions,
        "action_types": dict(preview.action_types),
        "affected_targets": list(preview.affected_targets),
        "estimated_size": preview.estimated_size,
        "safety_state_counts": dict(preview.safety_state_counts),
        "fixability_counts": dict(preview.fixability_counts),
        "backup_required": preview.backup_required,
        "rollback_supported": preview.rollback_supported,
        "warnings": list(preview.warnings),
        "is_stale": preview.is_stale,
        "generated_at": preview.generated_at.isoformat(),
    }


def validation_to_dict(validation: RemediationValidation) -> dict[str, Any]:
    """Serialize a RemediationValidation, including the embedded summary."""
    result = validation.to_dict()
    result["summary"] = (
        validation.summary.to_dict() if validation.summary is not None else None
    )
    return result


def status_to_dict(status: RemediationExecutionStatus) -> dict[str, Any]:
    return status.to_dict()


def rollback_to_dict(summary: RollbackSummary) -> dict[str, Any]:
    return summary.to_dict()


def _sanitize_finding_for_frontend(finding: dict[str, Any]) -> dict[str, Any]:
    """Return a privacy-safe, UI-compatible finding view.

    This matches the contract used by ``scan_core.scan.plan_details``:
    no canonical_path, asset_id, raw target data, or sensitive evidence.
    """
    safety = finding.get("safety") or {}
    confidence = finding.get("confidence") or {}

    if isinstance(safety, dict):
        safety_value = safety.get("level", "unknown")
    else:
        safety_value = str(safety) or "unknown"

    if isinstance(confidence, dict):
        confidence_score = float(confidence.get("score", 1.0))
    else:
        try:
            confidence_score = float(confidence or 1.0)
        except (TypeError, ValueError):
            confidence_score = 1.0

    return {
        "finding_id": finding.get("finding_id", ""),
        "display_name": finding.get("display_name", ""),
        "rule_id": finding.get("rule_id", ""),
        "rule_category": finding.get("rule_category", ""),
        "severity": finding.get("severity", "info"),
        "confidence": confidence_score,
        "safety": safety_value,
        "reason": finding.get("reason", ""),
        "recommended_action": finding.get("recommended_action", ""),
        "estimated_size": finding.get("estimated_size") or 0,
        "is_blocked": bool(finding.get("is_blocked", False)),
        "requires_review": bool(finding.get("requires_review", False)),
        "is_actionable": bool(finding.get("is_actionable", False)),
        "canonical_path": "",
    }


def _sanitize_findings_for_frontend(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sanitize a list of findings for the frontend."""
    return [_sanitize_finding_for_frontend(f) for f in findings]


def _coordinator_error() -> dict[str, Any]:
    return {
        "ok": False,
        "error": "Remediation coordinator is not available",
    }


@register("scan_core.remediation.prepare")
def _scan_core_remediation_prepare(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        preview = coord.prepare(plan_id)
        return {"ok": True, "preview": preview_to_dict(preview)}
    except Exception as exc:
        logger.exception("scan_core.remediation.prepare failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.validate")
def _scan_core_remediation_validate(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        validation = coord.validate(plan_id)
        return {"ok": True, "validation": validation_to_dict(validation)}
    except Exception as exc:
        logger.exception("scan_core.remediation.validate failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.execute")
@require_feature("scan_core.remediation.execute")
def _scan_core_remediation_execute(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    for key in ("plan_id", "request_id"):
        ok, value = _require_str(params, key)
        if not ok:
            return {"ok": False, "error": value}

    plan_id: str = params["plan_id"]
    request_id: str = params["request_id"]
    approval_token = str(params.get("approval_token") or "")
    mode = params.get("mode", "dry_run")
    if mode not in ("dry_run", "live"):
        return {"ok": False, "error": "mode must be 'dry_run' or 'live'"}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        summary = coord.execute(
            plan_id,
            request_id=request_id,
            approval_token=approval_token,
            mode=mode,
        )
        if summary.status.value == "rejected":
            return {
                "ok": False,
                "status": "rejected",
                "reason": summary.reason or "Execution rejected",
            }
        return {"ok": True, "summary": summary.to_dict()}
    except Exception as exc:
        logger.exception("scan_core.remediation.execute failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.cancel")
def _scan_core_remediation_cancel(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, execution_id = _require_str(params, "execution_id")
    if not ok:
        return {"ok": False, "error": execution_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        cancelled = coord.cancel(execution_id)
        return {"ok": True, "cancelled": cancelled}
    except Exception as exc:
        logger.exception("scan_core.remediation.cancel failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.status")
def _scan_core_remediation_status(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, execution_id = _require_str(params, "execution_id")
    if not ok:
        return {"ok": False, "error": execution_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        status = coord.get_status(execution_id)
        return {"ok": True, "status": status_to_dict(status)}
    except Exception as exc:
        logger.exception("scan_core.remediation.status failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.remediation.rollback")
@require_feature("scan_core.remediation.rollback")
def _scan_core_remediation_rollback(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, execution_id = _require_str(params, "execution_id")
    if not ok:
        return {"ok": False, "error": execution_id}

    coord = get_coordinator()
    if coord is None:
        return _coordinator_error()

    try:
        summary = coord.rollback(execution_id)
        return {"ok": True, "rollback": rollback_to_dict(summary)}
    except Exception as exc:
        logger.exception("scan_core.remediation.rollback failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def _validate_scope(params: dict[str, Any]) -> tuple[bool, Optional[list[str] | None], str]:
    """Validate the optional ``scope`` parameter."""
    scope = params.get("scope")
    if scope is None:
        return True, None, ""
    if not isinstance(scope, list) or not all(isinstance(x, str) for x in scope):
        return False, None, "scope must be a list of strings"
    return True, scope, ""


def _on_progress(scan_id: str, progress: ScanProgress) -> None:
    """Safely record the latest progress for a session."""
    with _scan_session_lock:
        session = _scan_sessions.get(scan_id)
        if session is not None:
            session["progress"] = progress.to_dict()


def _run_direct_cleanup(scan_id: str, source: str = "dashboard") -> None:
    """V1.0: Simple direct cleanup for Dashboard quick scans.

    Like CCleaner/Disk Cleanup: for each category, scan → delete files →
    remove empty folders → report results. Category-by-category so the
    UI shows "CLEANING USER TEMPORARY FILES", then "CLEANING WINDOWS TEMP",
    etc., with live file paths and progress bar.

    V1.0 UNIFIED: Uses the same ``all_cleaners()`` system as the Junk
    Cleaner feature so both paths clean exactly the same categories.
    This ensures that after AI Smart Optimize / Dashboard scan, the
    Junk Cleaner also shows everything as clean.

    V1.0 Edition gating:
      - Professional: Scans AND cleans all categories. After this,
        Junk Cleaner shows nothing to clean.
      - Free: Scans all categories (shows everything found) but does
        NOT delete anything. The result includes ``requires_upgrade``
        so the frontend shows "Upgrade to Professional for 1-click
        optimization" and directs the user to Junk Cleaner for
        manual cleaning.
    """
    from threading import Event

    # V1.0: Determine edition.
    edition = _get_current_edition()
    is_free = edition in ("free",)
    # Free users: scan everything but don't clean (upgrade required).
    # Pro users: scan and clean everything.
    requires_upgrade = is_free

    # V1.0 UNIFIED: Use the same cleaner system as Junk Cleaner.
    # This ensures both paths clean exactly the same categories.
    try:
        from avs_backend.cleaner.cleaners import all_cleaners
        cleaners = all_cleaners()
    except Exception:
        cleaners = []

    # Skip Browser History & Cookies — it's opt-in for privacy.
    # Everything else is safe to auto-clean.
    cleaners = [c for c in cleaners if c.id != "browser-history"]

    # V1.0: Also include the original Dashboard/Smart Optimize categories
    # that are NOT in the Junk Cleaner system. This COMBINES both sets
    # so Dashboard/Smart Optimize cleans MORE than Junk Cleaner alone.
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    system_root = os.environ.get("SystemRoot", r"C:\Windows")
    program_data = os.environ.get("ProgramData", r"C:\ProgramData")

    extra_folder_categories: list[tuple[str, str]] = []
    # Temporary Internet Files (IE/Edge INetCache) — not in all_cleaners()
    inet_cache = os.path.join(local_app_data, "Microsoft", "Windows", "INetCache")
    if inet_cache and os.path.isdir(inet_cache):
        extra_folder_categories.append(("Temporary Internet Files", inet_cache))
    # Downloaded Program Files — not in all_cleaners()
    dlp = os.path.join(system_root, "Downloaded Program Files")
    if os.path.isdir(dlp):
        extra_folder_categories.append(("Downloaded Program Files", dlp))
    # Error Reports (System) — crash-dumps cleaner only covers user WER
    sys_wer = os.path.join(program_data, "Microsoft", "Windows", "WER")
    if os.path.isdir(sys_wer):
        extra_folder_categories.append(("Error Reports (System)", sys_wer))
    # Previous Windows Installation — not in all_cleaners()
    win_old = os.path.join(system_root[:2] + os.sep, "Windows.old")
    if os.path.isdir(win_old):
        extra_folder_categories.append(("Previous Windows Installation", win_old))

    # Build category list from cleaners + extra folders for progress reporting
    categories: list[dict] = []
    for c in cleaners:
        categories.append({"name": c.name, "cleaner_id": c.id})
    for name, path in extra_folder_categories:
        categories.append({"name": name, "cleaner_id": None, "path": path})

    start_time = time.time()
    total_categories = len(categories)

    # Totals across all categories
    total_files_found = 0
    total_files_deleted = 0
    total_files_skipped = 0
    total_folders_found = 0
    total_folders_deleted = 0
    total_bytes_recovered = 0
    total_bytes_found = 0

    # Per-category results for the results page
    category_results: list[dict] = []

    # ─── Helper: update progress ───────────────────────────────────
    def _update_progress(
        phase: str,
        operation: str,
        current_folder: str | None,
        cat_index: int,
        files_found: int,
        files_deleted: int,
        files_skipped: int,
        bytes_recovered: int,
        pct: int,
    ) -> bool:
        """Update session progress. Returns False if cancelled."""
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is None or session.get("cancelled"):
                return False
            session["progress"] = {
                "phase": phase,
                "current_operation": operation,
                "current_folder": current_folder,
                "current_category": categories[cat_index]["name"] if cat_index < total_categories else None,
                "category_index": cat_index,
                "total_categories": total_categories,
                "assets_discovered": total_files_found + files_found,
                "assets_evaluated": total_files_deleted + files_deleted,
                "findings": total_files_found + files_found,
                "actions_available": total_files_deleted + files_deleted,
                "bytes_recovered": total_bytes_recovered + bytes_recovered,
                "elapsed_time_ms": int((time.time() - start_time) * 1000),
                "is_cancelled": False,
                "completion_percent": pct,
            }
            return True

    # ─── Main loop: scan + clean each category ──────────────────────
    # Iterates over both cleaner objects AND extra folder categories.
    cancel_event = Event()

    # Build a unified list of (name, cleaner_or_none, path_or_none)
    all_entries: list[tuple[str, object | None, str | None]] = []
    for c in cleaners:
        all_entries.append((c.name, c, None))
    for name, path in extra_folder_categories:
        all_entries.append((name, None, path))

    for cat_index, (cat_name, cleaner, extra_path) in enumerate(all_entries):

        # Check cancellation
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is None or session.get("cancelled"):
                cancel_event.set()
                return

        # Calculate progress range for this category
        cat_start = 5 + int(90 * cat_index / max(total_categories, 1))
        cat_end = 5 + int(90 * (cat_index + 1) / max(total_categories, 1))
        cat_span = cat_end - cat_start
        scan_span = int(cat_span * 0.3)
        delete_span = int(cat_span * 0.5)

        # ── Phase A: Scan ───────────────────────────────────────────
        def _on_scan_progress(pct: int) -> None:
            pass  # Progress tracked per-category below

        if cleaner is not None:
            # Use the cleaner's scan method
            scan_result = cleaner.scan(
                cancel_event,
                _on_scan_progress,
                on_file=None,
            )
            cat_f_found = scan_result.total_files
            cat_bytes_found = scan_result.total_bytes
            cat_files = [(item.path, item.size) for item in scan_result.items]
            cat_path_str = str(next(iter(cleaner.targets()), ""))
        else:
            # Extra folder category — scan manually
            cat_path_str = extra_path or ""
            cat_files = []
            cat_f_found = 0
            cat_bytes_found = 0
            try:
                for entry in os.scandir(cat_path_str):
                    if entry.is_dir(follow_symlinks=False):
                        for sub_root, sub_dirs, sub_files in os.walk(entry.path, topdown=False):
                            for f in sub_files:
                                fp = os.path.join(sub_root, f)
                                try:
                                    sz = os.path.getsize(fp)
                                    cat_files.append((fp, sz))
                                    cat_f_found += 1
                                    cat_bytes_found += sz
                                except OSError:
                                    pass
                    elif entry.is_file(follow_symlinks=False):
                        try:
                            sz = entry.stat().st_size
                            cat_files.append((entry.path, sz))
                            cat_f_found += 1
                            cat_bytes_found += sz
                        except OSError:
                            pass
            except OSError as e:
                logger.warning("Failed to scan %s: %s", cat_path_str, e)

        total_files_found += cat_f_found
        total_bytes_found += cat_bytes_found

        _update_progress(
            "discovering",
            f"Scanning {cat_name}...",
            cat_path_str,
            cat_index,
            cat_f_found,
            0,
            0,
            0,
            cat_start + scan_span,
        )

        # ── Phase B: Clean (delete files) ───────────────────────────
        # V1.0: Free users — scan but don't clean. Show upgrade prompt.
        if requires_upgrade:
            # Record what was found but don't delete anything
            category_results.append({
                "name": cat_name,
                "path": cat_path_str,
                "files_found": cat_f_found,
                "files_deleted": 0,
                "files_skipped": 0,
                "folders_removed": 0,
                "bytes_recovered": 0,
                "mb_recovered": 0.0,
                "skipped_due_to_limit": 0,
                "requires_upgrade": True,
            })
            _update_progress(
                "scanning",
                f"Found {cat_f_found} files in {cat_name}",
                None,
                cat_index,
                cat_f_found,
                0,
                0,
                0,
                cat_end,
            )
            continue

        # Pro users: clean everything
        if cleaner is not None:
            # Use the cleaner's clean method
            candidate_paths = [item.path for item in scan_result.items]

            def _on_clean_progress(pct: int) -> None:
                pass  # Progress tracked below

            clean_result = cleaner.clean(
                candidate_paths,
                cancel_event,
                _on_clean_progress,
                on_file=None,
            )
            d_deleted = clean_result.files_removed
            d_recovered = clean_result.bytes_recovered
            d_skipped = clean_result.files_skipped
        else:
            # Extra folder category — delete files manually
            d_deleted = 0
            d_recovered = 0
            d_skipped = 0
            for file_path, file_size in cat_files:
                with _scan_session_lock:
                    session = _scan_sessions.get(scan_id)
                    if session is None or session.get("cancelled"):
                        cancel_event.set()
                        return
                try:
                    os.unlink(file_path)
                    d_deleted += 1
                    d_recovered += file_size
                except (PermissionError, OSError):
                    d_skipped += 1

        # Update progress during cleaning
        _update_progress(
            "cleaning",
            f"Cleaning {cat_name}...",
            None,
            cat_index,
            cat_f_found,
            d_deleted,
            d_skipped,
            d_recovered,
            cat_start + scan_span + delete_span,
        )

        total_files_deleted += d_deleted
        total_files_skipped += d_skipped
        total_bytes_recovered += d_recovered

        # ── Phase C: Remove empty folders (best-effort) ─────────────
        # The cleaner system handles file deletion; empty folder removal
        # is done as a best-effort pass on the target roots.
        folder_span = cat_span - scan_span - delete_span
        d_removed = 0
        try:
            if cleaner is not None:
                roots_to_clean = cleaner.targets()
            else:
                roots_to_clean = [Path(cat_path_str)] if cat_path_str else []
            for root in roots_to_clean:
                if root and hasattr(root, 'exists') and root.exists() and root.is_dir():
                    try:
                        for sub_root, sub_dirs, _ in os.walk(str(root), topdown=False):
                            for d in sub_dirs:
                                dir_path = os.path.join(sub_root, d)
                                try:
                                    os.rmdir(dir_path)
                                    d_removed += 1
                                except OSError:
                                    pass
                    except OSError:
                        pass
        except Exception:
            pass

        total_folders_deleted += d_removed

        _update_progress(
            "finalizing",
            f"Cleaned {cat_name}",
            None,
            cat_index,
            cat_f_found,
            d_deleted,
            d_skipped,
            d_recovered,
            cat_end,
        )

        # Record per-category result
        cat_mb = round(d_recovered / (1024 * 1024), 2)
        category_results.append({
            "name": cat_name,
            "path": cat_path_str,
            "files_found": cat_f_found,
            "files_deleted": d_deleted,
            "files_skipped": d_skipped,
            "folders_removed": d_removed,
            "bytes_recovered": d_recovered,
            "mb_recovered": cat_mb,
            "skipped_due_to_limit": 0,
        })

    # ─── Final results ─────────────────────────────────────────────
    mb_recovered = round(total_bytes_recovered / (1024 * 1024), 2)
    mb_found = round(total_bytes_found / (1024 * 1024), 2)
    elapsed_ms = int((time.time() - start_time) * 1000)

    # V1.0: Calculate health score before/after cleanup.
    # Uses the same log10-based formula as the auto-optimize path.
    import math as _math
    def _cleanup_health_score(cleanable_bytes: int) -> int:
        b = max(0, cleanable_bytes)
        if b == 0:
            return 100
        penalty = min(40, _math.log10(b + 1) * 2.0)
        return max(60, min(100, round(100 - penalty)))

    remaining_bytes = max(0, total_bytes_found - total_bytes_recovered)
    health_before = _cleanup_health_score(total_bytes_found)
    health_after = _cleanup_health_score(remaining_bytes)

    with _scan_session_lock:
        session = _scan_sessions.get(scan_id)
        if session is None:
            return
        if requires_upgrade:
            completion_msg = f"Found {total_files_found} files, {mb_found} MB — Upgrade to clean"
        else:
            completion_msg = f"Cleaned {total_files_deleted} files, {mb_recovered} MB recovered"
        session["progress"] = {
            "phase": "complete",
            "current_operation": completion_msg,
            "current_folder": None,
            "current_category": None,
            "category_index": total_categories,
            "total_categories": total_categories,
            "assets_discovered": total_files_found,
            "assets_evaluated": total_files_found,
            "findings": total_files_found,
            "actions_available": total_files_deleted,
            "bytes_recovered": total_bytes_recovered,
            "elapsed_time_ms": elapsed_ms,
            "is_cancelled": False,
            "completion_percent": 100,
            "edition": edition,
            "requires_upgrade": requires_upgrade,
        }
        session["result"] = {
            "scan_id": scan_id,
            "scan_type": "quick",
            "started_at": datetime.now(UTC).isoformat(),
            "completed_at": datetime.now(UTC).isoformat(),
            "duration_ms": elapsed_ms,
            "cancelled": False,
            "completed": True,
            "error_count": 0,
            "findings_count": total_files_found,
            "action_plan_id": None,
            "actionable_count": total_files_deleted,
            "review_count": 0,
            "blocked_count": total_files_skipped,
            "not_fixable_count": 0,
            "statistics": {
                "matches": total_files_found,
                "actionable": total_files_deleted,
                "blocked": total_files_skipped,
                "review": 0,
                "not_fixable": 0,
                "files_cleaned": total_files_deleted,
                "files_found": total_files_found,
                "folders_cleaned": total_folders_deleted,
                "space_recovered": total_bytes_recovered,
                "bytes_recovered": total_bytes_recovered,
            },
            "findings": [],
            "cleanup_summary": {
                "files_found": total_files_found,
                "files_deleted": total_files_deleted,
                "files_skipped": total_files_skipped,
                "folders_found": total_folders_found,
                "folders_deleted": total_folders_deleted,
                "bytes_recovered": total_bytes_recovered,
                "mb_recovered": mb_recovered,
                "mb_found": mb_found,
                "detected": total_files_found,
                "cleaned": total_files_deleted,
                "failed": total_files_skipped,
                "remaining": total_files_found - total_files_deleted,
                "space_recovered": total_bytes_recovered,
                "categories": category_results,
                "edition": edition,
                "requires_upgrade": requires_upgrade,
                "health_before": health_before,
                "health_after": health_after,
            },
        }
        session["completed"] = True


def _run_scan(
    scan_id: str,
    scan_type: str,
    scope: Optional[list[str]],
    rule_categories: Optional[list[str]] = None,
    source: str = "dashboard",
) -> None:
    """Background target that runs the scan and records the result.

    V1.0: For quick scans (Dashboard), uses a simple direct cleanup
    that enumerates User Temp, Windows Temp, and Prefetch, deletes
    everything inside them, and reports results. No rule evaluation,
    no safety policy, no database — just clean it like CCleaner does.

    For full scans (Security/Protection), uses the full orchestrator
    pipeline with rule evaluation and safety checks.
    """
    # V1.0: Quick scans use direct cleanup — no orchestrator needed
    if scan_type == "quick" and not scope:
        _run_direct_cleanup(scan_id, source=source)
        return

    orchestrator = get_scan_orchestrator(wait_for_ready=True, timeout_s=90.0)
    if orchestrator is None:
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is not None:
                session["error"] = "Scan engine failed to initialize. Please restart the application."
                session["completed"] = True
        return

    original_generate_scan_id = _orchestrator_module.generate_scan_id

    def _generate_scan_id_for_session() -> str:
        """Return the pre-determined scan id and restore the original generator."""
        _orchestrator_module.generate_scan_id = original_generate_scan_id
        return scan_id

    # V1.0 Architecture separation: convert category strings to RuleCategory enums.
    parsed_categories: Optional[list] = None
    if rule_categories:
        from avs_backend.scan_core.rules.enums import RuleCategory
        parsed_categories = []
        for cat_str in rule_categories:
            try:
                parsed_categories.append(RuleCategory(cat_str))
            except ValueError:
                logger.warning("Unknown rule category '%s' — ignoring", cat_str)
        if not parsed_categories:
            parsed_categories = None

    try:
        _orchestrator_module.generate_scan_id = _generate_scan_id_for_session
        if scan_type == "quick":
            result = orchestrator.scan_quick(
                scope=scope,
                on_progress=lambda p: _on_progress(scan_id, p),
            )
        else:
            result = orchestrator.scan_full(
                scope=scope,
                on_progress=lambda p: _on_progress(scan_id, p),
                rule_categories=parsed_categories,
            )
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is None:
                return
            session["result"] = result.to_dict()
            session["completed"] = True
    except Exception as exc:
        logger.exception("scan_core.scan.%s failed for %s: %s", scan_type, scan_id, exc)
        with _scan_session_lock:
            session = _scan_sessions.get(scan_id)
            if session is None:
                return
            session["error"] = str(exc)
            session["completed"] = True
    finally:
        _orchestrator_module.generate_scan_id = original_generate_scan_id


def _start_scan(scan_type: str, params: dict[str, Any]) -> dict[str, Any]:
    """Start a quick or full scan in a background thread.

    V1.0: Returns immediately with a session_id.  The orchestrator
    initialization happens inside the background thread, so the UI
    shows "Preparing..." instead of blocking the RPC call for 60s.

    V1.0 Edition gating: AI Smart Optimize (source="smart_optimize")
    requires Professional edition. Dashboard cleanup (source="dashboard"
    or unset) is allowed for Free with a 500 MB byte limit.
    """
    ok, scope, error = _validate_scope(params)
    if not ok:
        return {"ok": False, "error": error}

    # V1.0 Architecture separation: extract rule_categories from params.
    rule_categories = params.get("rule_categories") if isinstance(params, dict) else None
    if rule_categories is not None and not isinstance(rule_categories, list):
        rule_categories = None

    # V1.0 Edition gating: extract source to differentiate entry points.
    source = params.get("source") if isinstance(params, dict) else None
    if not isinstance(source, str):
        source = "dashboard"

    # AI Smart Optimize requires Professional edition.
    if scan_type == "quick" and source == "smart_optimize":
        edition = _get_current_edition()
        if edition in ("free",):
            return {
                "ok": False,
                "error": "AI Smart Optimization requires Professional edition. Please upgrade to use this feature.",
                "error_code": "EDITION_LOCKED",
                "required_edition": "professional",
                "current_edition": edition,
            }

    scan_id = str(uuid.uuid4())
    started_at = datetime.now(UTC).isoformat()

    with _scan_session_lock:
        _scan_sessions[scan_id] = {
            "scan_id": scan_id,
            "token": None,
            "thread": None,
            "progress": {
                "phase": "preparing",
                "current_operation": "Preparing scan engine...",
                "assets_discovered": 0,
                "assets_evaluated": 0,
                "findings": 0,
                "actions_available": 0,
                "elapsed_time_ms": 0,
                "is_cancelled": False,
                "completion_percent": 0,
            },
            "result": None,
            "cancelled": False,
            "completed": False,
            "error": None,
        }

    thread = threading.Thread(
        target=_run_scan,
        args=(scan_id, scan_type, scope, rule_categories, source),
        daemon=True,
        name=f"scan-core-{scan_type}-{scan_id}",
    )
    _scan_sessions[scan_id]["thread"] = thread
    thread.start()

    return {"ok": True, "session_id": scan_id, "started_at": started_at}


@register("scan_core.scan.quick")
def _scan_core_scan_quick(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    return _start_scan("quick", params)


@register("scan_core.scan.full")
def _scan_core_scan_full(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    return _start_scan("full", params)


@register("scan_core.scan.cancel")
def _scan_core_scan_cancel(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    orchestrator = get_scan_orchestrator()
    cancelled = False
    if orchestrator is not None:
        cancelled = orchestrator.cancel_scan(session_id)

    with _scan_session_lock:
        session = _scan_sessions.get(session_id)
        if session is not None:
            session["cancelled"] = True

    return {"ok": True, "cancelled": cancelled}


@register("scan_core.scan.status")
def _scan_core_scan_status(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _scan_session_lock:
        session = _scan_sessions.get(session_id)

    if session is None:
        return {"ok": False, "error": "Unknown session"}

    return {
        "ok": True,
        "progress": session["progress"],
        "completed": session["completed"],
        "cancelled": session["cancelled"],
        "error": session["error"],
    }


@register("scan_core.scan.result")
def _scan_core_scan_result(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _scan_session_lock:
        session = _scan_sessions.get(session_id)

    if session is None:
        return {"ok": False, "error": "Unknown session"}
    if not session["completed"]:
        return {"ok": False, "error": "Scan not complete"}
    if session["error"]:
        return {"ok": False, "error": session["error"]}
    if session["result"] is None:
        return {"ok": False, "error": "Scan not complete"}

    result = dict(session["result"])
    if "findings" in result:
        result["findings"] = _sanitize_findings_for_frontend(result["findings"])

    return {"ok": True, "result": result}


@register("scan_core.scan.latest")
def _scan_core_scan_latest(_params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Return the latest persisted scan_core scan history record."""
    orchestrator = get_scan_orchestrator()
    if orchestrator is None:
        # Orchestrator may still be initializing — return empty result
        # instead of an error so the dashboard doesn't show an error.
        return {"ok": True, "latest": None}

    try:
        record = orchestrator.get_latest_scan_history()
        if record is None:
            return {"ok": True, "latest": None}
        return {"ok": True, "latest": record}
    except Exception as exc:
        logger.exception("scan_core.scan.latest failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.scan.history")
def _scan_core_scan_history(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Return the most recent persisted scan_core scan history records."""
    params = _safe_params(params)
    limit = params.get("limit", 10)
    if not isinstance(limit, int) or limit < 1:
        limit = 10

    orchestrator = get_scan_orchestrator()
    if orchestrator is None:
        return _orchestrator_error()

    try:
        records = orchestrator.list_scan_history(limit=limit)
        return {"ok": True, "history": records}
    except Exception as exc:
        logger.exception("scan_core.scan.history failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.scan.plan_details")
def _scan_core_scan_plan_details(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Return a read-only, privacy-safe view of a persisted ActionPlan."""
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    orchestrator = get_scan_orchestrator()
    if orchestrator is not None:
        try:
            result = orchestrator.get_plan_details(plan_id)
            if result.get("ok"):
                return result
        except Exception as exc:
            logger.exception("scan_core.scan.plan_details (orchestrator) failed: %s", exc)

    # Fallback: load via the coordinator's ActionPlanRepository.
    # Plans created by security_remediation.plan, smart_optimization.plan,
    # or dashboard_optimization.plan are saved through the coordinator's
    # database, which may be a different MetadataDatabase instance than
    # the orchestrator's (though they point to the same file).
    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        from avs_backend.scan_core.metadata.action_plan_repository import (
            ActionPlanRepository,
        )
        repo = ActionPlanRepository(coordinator.database)
        action_plan = repo.load(plan_id)
        if action_plan is None:
            return {"ok": False, "error": "Plan not found"}

        actions = action_plan.actions
        findings: list[dict[str, Any]] = []
        for action in actions:
            severity = "info"
            if action.priority_score >= 80:
                severity = "critical"
            elif action.priority_score >= 60:
                severity = "high"
            elif action.priority_score >= 40:
                severity = "medium"
            findings.append({
                "severity": severity,
                "category": action.action_type.value if hasattr(action.action_type, "value") else str(action.action_type),
                "title": getattr(action, "description", None) or action.reason or action.action_id,
                "actionable": action.is_actionable,
                "state": action.state.value if hasattr(action.state, "value") else str(action.state),
            })

        return {
            "ok": True,
            "plan_id": plan_id,
            "findings": findings,
            "total_actions": len(actions),
            "auto_fixable": action_plan.summary.auto_fixable_actions,
            "review_required": action_plan.summary.review_required_actions,
            "not_fixable": action_plan.summary.not_fixable_actions,
        }
    except Exception as exc:
        logger.exception("scan_core.scan.plan_details (coordinator fallback) failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.smart_optimization.plan")
def _scan_core_smart_optimization_plan(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Convert Smart Optimization analysis output into a canonical ActionPlan.

    This RPC is planning-only. It does NOT execute remediation.
    """
    params = _safe_params(params)
    actions = params.get("actions")
    if not isinstance(actions, list):
        return {"ok": False, "error": "Missing or invalid parameter: actions"}
    if len(actions) == 0:
        return {"ok": False, "error": "No Smart Optimization actions provided"}

    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        builder = SmartOptimizationPlanBuilder()
        plan = builder.build_plan(actions)

        plan_repo = ActionPlanRepository(coordinator.database)
        plan_repo.save(plan)

        return {
            "ok": True,
            "plan_id": plan.plan_id,
            "total_actions": len(plan.actions),
            "auto_fixable": plan.summary.auto_fixable_actions,
            "review_required": plan.summary.review_required_actions,
            "not_fixable": plan.summary.not_fixable_actions,
            "estimated_affected_size": plan.summary.estimated_affected_size,
            "statistics": {
                "converted": builder.get_adapter_statistics()["converted"],
                "unsupported": builder.get_adapter_statistics()["unsupported"],
                "errors": builder.get_adapter_statistics()["errors"],
            },
        }
    except Exception as exc:
        logger.exception("scan_core.smart_optimization.plan failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.security_remediation.plan")
def _scan_core_security_remediation_plan(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Convert Security Center remediation actions into a canonical ActionPlan.

    This RPC is planning-only. It does NOT execute remediation.
    It does NOT call legacy Security Center execution paths.

    Request:
        {
            "actions": [
                {
                    "id": "action-1",
                    "type": "quarantine",
                    "title": "Quarantine Threat",
                    "description": "...",
                    "confidence": 0.95,
                    "severity": "high",
                    "category": "spyware",
                    "sourceModule": "security-center",
                    "sourceFindingId": "finding-1",
                    "rollbackAvailable": true,
                    "target": {"type": "file", "path": "...", "name": "..."}
                },
                ...
            ]
        }

    Response (success):
        {
            "ok": true,
            "plan_id": "...",
            "total_actions": N,
            "auto_fixable": N,
            "review_required": N,
            "not_fixable": N,
            "estimated_affected_size": N or null,
            "statistics": {
                "converted": N,
                "unsupported": N,
                "errors": N
            }
        }

    Response (failure):
        {"ok": false, "error": "..."}

    Privacy:
        The response NEVER exposes canonical_path, asset_id, backup_location,
        quarantine_path, registry keys, browser profile paths, raw evidence,
        or internal target payloads.
    """
    params = _safe_params(params)
    actions = params.get("actions")
    if not isinstance(actions, list):
        return {"ok": False, "error": "Missing or invalid parameter: actions"}
    if len(actions) == 0:
        return {"ok": False, "error": "No Security Center actions provided"}

    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        builder = SecurityRemediationPlanBuilder()
        plan = builder.build_plan(actions)

        plan_repo = ActionPlanRepository(coordinator.database)
        plan_repo.save(plan)

        adapter_stats = builder.get_adapter_statistics()

        return {
            "ok": True,
            "plan_id": plan.plan_id,
            "total_actions": len(plan.actions),
            "auto_fixable": plan.summary.auto_fixable_actions,
            "review_required": plan.summary.review_required_actions,
            "not_fixable": plan.summary.not_fixable_actions,
            "estimated_affected_size": plan.summary.estimated_affected_size,
            "statistics": {
                "converted": adapter_stats["converted"],
                "unsupported": adapter_stats["unsupported"],
                "errors": adapter_stats["errors"],
            },
        }
    except Exception as exc:
        logger.exception("scan_core.security_remediation.plan failed: %s", exc)
        return {"ok": False, "error": str(exc)}


@register("scan_core.dashboard_optimization.plan")
def _scan_core_dashboard_optimization_plan(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Convert Dashboard Optimize preview actions into a canonical ActionPlan.

    This RPC is planning-only. It does NOT execute remediation.
    It does NOT call legacy Dashboard Optimize execution paths.
    It does NOT call orchestrator.optimize.

    Request:
        {
            "actions": [
                {
                    "id": "action-1",            # optional, generated if missing
                    "type": "clean_temp_files",   # required
                    "title": "Temporary Files",   # optional
                    "description": "...",         # optional
                    "size": 12345,                # optional, estimated bytes
                    "rollbackAvailable": true     # optional, default false
                },
                ...
            ]
        }

    Response (success):
        {
            "ok": true,
            "plan_id": "...",
            "total_actions": N,
            "auto_fixable": N,
            "review_required": N,
            "not_fixable": N,
            "estimated_affected_size": N or null,
            "statistics": {
                "converted": N,
                "unsupported": N,
                "errors": N
            }
        }

    Response (failure):
        {"ok": false, "error": "..."}

    Privacy:
        The response NEVER exposes canonical_path, asset_id, backup_location,
        registry keys, browser profile paths, raw evidence, or internal
        target payloads.
    """
    params = _safe_params(params)
    actions = params.get("actions")
    if not isinstance(actions, list):
        return {"ok": False, "error": "Missing or invalid parameter: actions"}
    if len(actions) == 0:
        return {"ok": False, "error": "No Dashboard Optimization actions provided"}

    coordinator = get_coordinator()
    if coordinator is None:
        return _coordinator_error()

    try:
        builder = DashboardOptimizationPlanBuilder()
        plan = builder.build_plan(actions)

        plan_repo = ActionPlanRepository(coordinator.database)
        plan_repo.save(plan)

        adapter_stats = builder.get_adapter_statistics()

        return {
            "ok": True,
            "plan_id": plan.plan_id,
            "total_actions": len(plan.actions),
            "auto_fixable": plan.summary.auto_fixable_actions,
            "review_required": plan.summary.review_required_actions,
            "not_fixable": plan.summary.not_fixable_actions,
            "estimated_affected_size": plan.summary.estimated_affected_size,
            "statistics": {
                "converted": adapter_stats["converted"],
                "unsupported": adapter_stats["unsupported"],
                "errors": adapter_stats["errors"],
            },
        }
    except Exception as exc:
        logger.exception("scan_core.dashboard_optimization.plan failed: %s", exc)
        return {"ok": False, "error": str(exc)}


# ── Dashboard Auto-Optimization ─────────────────────────────────────────
#
# The auto-optimization flow chains the canonical remediation path:
#   prepare → validate → execute (live mode)
# in a background thread so the frontend can poll progress.
#
# Safety is NOT bypassed:
#   - The SafetyGate still evaluates every action.
#   - REJECTED actions are skipped (counted as "rejected").
#   - REQUIRES_REVIEW actions are skipped (counted as "requires_review").
#   - Only APPROVED actions are executed.
#   - The ExecutionLedger ensures idempotency.
#   - Backups are created for rollback support.
#   - Verification runs after execution.


def _remove_empty_cleanup_dirs() -> int:
    """Remove empty subdirectories from cleanup target areas.

    V1.0: After file deletion, empty folders remain in temp, prefetch,
    and other cleanup directories.  This function walks those directories
    bottom-up and removes any empty subdirectories (but never the root
    directory itself, which is owned by the OS).

    Returns the number of empty directories removed.
    """
    import os as _os
    import platform as _platform

    # Cleanup target directories whose empty subdirs should be removed.
    # The root directory itself is NEVER deleted — only its contents.
    target_dirs: list[str] = []
    if _platform.system() == "Windows":
        target_dirs = [
            _os.path.expandvars(r"%TEMP%"),
            _os.path.expandvars(r"%SystemRoot%\Temp"),
            _os.path.expandvars(r"%SystemRoot%\Prefetch"),
            _os.path.expandvars(r"%LOCALAPPDATA%\D3DSCache"),
            _os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Explorer"),
        ]
    else:
        # Non-Windows: clean the user's temp directory.
        import tempfile as _tempfile
        target_dirs = [_tempfile.gettempdir()]

    removed_count = 0
    for target in target_dirs:
        if not _os.path.isdir(target):
            continue
        try:
            # Walk bottom-up so we can remove directories after their
            # children are gone.
            for root, dirs, _files in _os.walk(target, topdown=False):
                # Skip the root directory itself — never delete it.
                if _os.path.realpath(root) == _os.path.realpath(target):
                    continue
                for d in dirs:
                    dir_path = _os.path.join(root, d)
                    try:
                        # Only remove if truly empty (no files, no subdirs).
                        if not any(_os.scandir(dir_path)):
                            _os.rmdir(dir_path)
                            removed_count += 1
                    except (OSError, PermissionError):
                        pass
        except (OSError, PermissionError):
            pass

    return removed_count


def _run_auto_optimize(session_id: str, plan_id: str) -> None:
    """Background target that runs the full auto-optimization pipeline."""
    coord = get_coordinator()
    if coord is None:
        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is not None:
                session["error"] = "Remediation coordinator is not available"
                session["completed"] = True
        return

    def _update(phase: str, message: str, **extra: Any) -> None:
        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is None:
                return
            session["phase"] = phase
            session["message"] = message
            session.update(extra)

    def _is_cancelled() -> bool:
        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is None:
                return True
            return session.get("cancelled", False)

    try:
        # V1.0: Health score is calculated AFTER the preview, based on
        # cleanup opportunities (safe_count), not fluctuating system metrics.
        # This ensures: scan → score → clean → score → scan again shows
        # consistent, deterministic results.

        # Phase 1: Prepare
        _update("preparing", "Preparing optimization plan...")
        if _is_cancelled():
            _update("cancelled", "Optimization cancelled", completed=True)
            return
        preview = coord.prepare(plan_id)

        total_actions = preview.total_actions
        # The safety_state_counts uses ActionState values, not SafetyLevel.
        # Actions with state "planned" are actionable and safe for execution.
        # The SafetyGate will still independently validate each action.
        safe_count = preview.safety_state_counts.get("planned", 0)
        review_count = preview.safety_state_counts.get("review_required", 0)
        blocked_count = (
            preview.safety_state_counts.get("blocked", 0)
            + preview.safety_state_counts.get("not_fixable", 0)
            + preview.safety_state_counts.get("missing_target", 0)
            + preview.safety_state_counts.get("locked_target", 0)
        )

        # V1.0: Bytes-based health score.
        # The score reflects the actual cleanup BURDEN (bytes recoverable),
        # not just the file count.  A log10 scale is used so that:
        #   0 bytes cleanable  -> score 100 (perfectly clean)
        #   1 KB  (10^3)       -> penalty  6 -> score 94
        #   1 MB  (10^6)       -> penalty 12 -> score 88
        #   100 MB (10^8)      -> penalty 16 -> score 84
        #   1 GB  (10^9)       -> penalty 18 -> score 82
        #   10 GB (10^10)      -> penalty 20 -> score 80
        #   100 GB (10^11)     -> penalty 22 -> score 78
        #   1 TB  (10^12)      -> penalty 24 -> score 76
        # Floor at 60, cap at 100.
        import math as _math

        # Track total cleanable bytes for health scoring.
        # preview.estimated_size is the sum of planned action sizes.
        cleanable_bytes_before = int(preview.estimated_size or 0)

        def _cleanup_health_score(cleanable_bytes: int) -> int:
            """Bytes-based health score (0-100).

            Higher score = less cleanup burden.
            Based on log10 of cleanable bytes so both small and large
            junk amounts produce meaningful, differentiated scores.
            """
            b = max(0, cleanable_bytes)
            if b == 0:
                return 100
            penalty = min(40, _math.log10(b + 1) * 2.0)
            return max(60, min(100, round(100 - penalty)))

        health_before = _cleanup_health_score(cleanable_bytes_before)

        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is not None:
                session["preview"] = preview_to_dict(preview)
                session["total_actions"] = total_actions
                session["safe_actions"] = safe_count
                session["review_required"] = review_count
                session["blocked"] = blocked_count

        # Safety limit: auto-optimization is designed for moderate-sized plans.
        # V1.0: Increased to 100,000 since the V1.0 filter already ensures
        # only safe items reach this point.
        MAX_AUTO_OPTIMIZE_ACTIONS = 100000
        if safe_count > MAX_AUTO_OPTIMIZE_ACTIONS:
            _update(
                "complete",
                f"Too many actions ({safe_count}) for automatic optimization. Please use manual review.",
                completed=True,
                error=f"Plan has {safe_count} safe actions, exceeds limit of {MAX_AUTO_OPTIMIZE_ACTIONS}",
                result={
                    "files_found": safe_count,
                    "files_cleaned": 0,
                    "space_recovered": 0,
                    "detected": safe_count,
                    "cleaned": 0,
                    "remaining": safe_count,
                    "failed": 0,
                    "health_before": health_before,
                    "health_after": health_before,
                    "_diagnostics": {
                        "total": total_actions,
                        "rejected": 0,
                        "skipped": 0,
                        "requires_review": review_count,
                        "cancelled": 0,
                        "error": f"Exceeds limit of {MAX_AUTO_OPTIMIZE_ACTIONS}",
                    },
                },
            )
            return

        # If there are no safe actions, skip execution
        if safe_count == 0:
            _update(
                "complete",
                "No safe actions to execute",
                completed=True,
                result={
                    "files_found": 0,
                    "files_cleaned": 0,
                    "space_recovered": 0,
                    "detected": 0,
                    "cleaned": 0,
                    "remaining": 0,
                    "failed": 0,
                    "health_before": health_before,
                    "health_after": 100,  # No cleanup needed → perfect score
                    "_diagnostics": {
                        "total": total_actions,
                        "rejected": 0,
                        "skipped": 0,
                        "requires_review": review_count,
                        "cancelled": 0,
                        "review_required_input": review_count,
                        "blocked_input": blocked_count,
                    },
                },
            )
            return

        # Phase 2: Pre-execution revalidation
        # V1.0: Re-check every PLANNED action against the CURRENT filesystem.
        # This closes the TOCTOU gap: files that were deletable during discovery
        # may have become locked, deleted, or inaccessible by the time execution
        # begins. The user-visible "detected" count must only include files that
        # can actually be deleted RIGHT NOW.
        if _is_cancelled():
            _update("cancelled", "Optimization cancelled", completed=True)
            return
        _update("revalidating", "Verifying cleanup targets...")
        revalidation = coord.revalidate_planned_actions(plan_id)
        originally_planned = safe_count
        still_deletable = revalidation.get("still_deletable", 0)
        now_missing = revalidation.get("now_missing", 0)
        now_locked = revalidation.get("now_locked", 0)
        now_inaccessible = revalidation.get("now_inaccessible", 0)
        removed = originally_planned - still_deletable

        # V1.0: Update safe_count to the revalidated count.
        # The user sees "detected" = still_deletable, NOT the original
        # planning count. Files that became locked/missing/inaccessible
        # are removed from the user-visible cleanup set BEFORE cleanup.
        safe_count = still_deletable
        # Recalculate cleanable_bytes_before based on revalidated actions.
        # preview.estimated_size includes ALL planned actions, but after
        # revalidation some are locked/missing/inaccessible.  We need the
        # bytes of only the still-deletable actions.
        # Estimate: proportional reduction based on count.
        if originally_planned > 0 and still_deletable > 0:
            cleanable_bytes_before = int(
                cleanable_bytes_before * (still_deletable / originally_planned)
            )
        else:
            cleanable_bytes_before = 0
        health_before = _cleanup_health_score(cleanable_bytes_before)

        with _auto_opt_lock:
            session = _auto_opt_sessions.get(session_id)
            if session is not None:
                session["safe_actions"] = safe_count
                session["revalidation_removed"] = removed

        # If revalidation removed everything, skip execution
        if safe_count == 0:
            _update(
                "complete",
                "No deletable files found after revalidation",
                completed=True,
                result={
                    "files_found": 0,
                    "files_cleaned": 0,
                    "space_recovered": 0,
                    "detected": 0,
                    "cleaned": 0,
                    "remaining": 0,
                    "failed": 0,
                    "health_before": health_before,
                    "health_after": 100,
                    "_diagnostics": {
                        "total": total_actions,
                        "rejected": 0,
                        "skipped": 0,
                        "requires_review": review_count,
                        "cancelled": 0,
                        "review_required_input": review_count,
                        "blocked_input": blocked_count,
                        "revalidation_removed": removed,
                        "now_missing": now_missing,
                        "now_locked": now_locked,
                        "now_inaccessible": now_inaccessible,
                    },
                },
            )
            return

        # Phase 3: Execute (live mode)
        # The executor independently validates each action via SafetyGate
        # during execution. The approval_token from prepare() authorizes
        # execution. The SafetyGate still evaluates each action independently.
        if _is_cancelled():
            _update("cancelled", "Optimization cancelled", completed=True)
            return
        _update(
            "executing",
            f"Optimizing {safe_count} safe actions...",
            execution_started=True,
            execution_progress=0,
            execution_total=safe_count,
            current_file="",
        )

        # Progress callback that updates the session with per-action progress
        def _on_execution_progress(
            current_path: str,
            completed: int,
            total: int,
            info: dict,
        ) -> None:
            with _auto_opt_lock:
                session = _auto_opt_sessions.get(session_id)
                if session is None:
                    return
                # V1.0: Progress maps execute phase from 10% to 90%.
                # When all actions are completed, jump to 95% (verify takes
                # the last 5%).  This ensures the progress bar matches the
                # actual file count progress shown in the UI.
                if total > 0:
                    exec_pct = (completed / total) * 80
                    overall_pct = 10 + int(exec_pct)
                    if completed >= total:
                        overall_pct = 95
                else:
                    overall_pct = 10
                session["execution_progress"] = completed
                session["execution_total"] = total
                session["current_file"] = current_path
                session["overall_progress"] = overall_pct
                # V1.0: Track live space recovered from info dict.
                # The coordinator passes the file size in info["size"]
                # for each completed action.
                live_space = session.get("space_recovered", 0)
                if isinstance(info, dict):
                    size = info.get("size", 0)
                    if isinstance(size, (int, float)) and size > 0:
                        live_space += int(size)
                session["space_recovered"] = live_space
                # V1.0: Extract current category from rule_id for UI display
                rule_id = info.get("rule_id", "") if isinstance(info, dict) else ""
                current_cat = rule_id_to_category(rule_id) if rule_id else ""
                session["current_category"] = current_cat
                # V1.0: message shows the current category being cleaned
                if current_cat:
                    session["message"] = f"Cleaning {current_cat}..."
                else:
                    session["message"] = f"Cleaning {completed}/{total} files..."

        request_id = str(uuid.uuid4())
        summary = coord.execute(
            plan_id,
            request_id=request_id,
            approval_token=preview.approval_token,
            mode="live",
            on_progress=_on_execution_progress,
        )

        # Load the plan to build action_id → rule_id mapping and count
        # folders.  The plan may have been revalidated (some actions
        # moved from PLANNED to LOCKED_TARGET / MISSING_TARGET / etc.)
        # so we load the CURRENT state from the repository.
        plan_repo = ActionPlanRepository(coord.database)
        plan = plan_repo.load(plan_id)
        if plan is None:
            _update(
                "error",
                f"Failed to load plan {plan_id} after execution",
                completed=True,
                error=f"Plan {plan_id} not found",
            )
            return

        # Build action_id → rule_id mapping from the plan for per-category stats
        action_rule_map: dict[str, str] = {}
        for action in plan.actions:
            action_rule_map[action.action_id] = getattr(action, "rule_id", "")

        # V1.0: Per-category breakdown for Disk Cleanup style UI.
        # Tracks files_found, files_cleaned, space_recovered per category.
        category_stats: dict[str, dict[str, int]] = {}

        # Calculate space recovered from VERIFIED completed actions.
        # V1.0: Only count space from actions where the file was actually
        # deleted (after_state confirms the file no longer exists).
        # NEVER trust a "completed" status alone — the filesystem is
        # authoritative.  If after_state is missing or doesn't confirm
        # absence, the action is NOT counted as recovered space.
        space_recovered = 0
        verified_cleaned = 0
        failed_details: list[dict[str, Any]] = []
        # Track total bytes of all executed actions for accurate
        # health score calculation (cleanable_bytes_after_revalidation).
        executed_bytes_total = 0
        for result in summary.results:
            # Get rule_id and map to cleanup category
            rule_id = action_rule_map.get(result.action_id, "")
            cat = rule_id_to_category(rule_id) if rule_id else "Other Safe Cleanup"
            if cat not in category_stats:
                category_stats[cat] = {
                    "files_found": 0,
                    "files_cleaned": 0,
                    "space_recovered": 0,
                }
            # Count as found (was a candidate)
            category_stats[cat]["files_found"] += 1

            # Track total bytes of all executed actions for health score.
            bs = getattr(result, "before_state", None)
            if bs and isinstance(bs, dict):
                sz = bs.get("size", 0)
                if isinstance(sz, (int, float)) and sz > 0:
                    executed_bytes_total += int(sz)

            if result.status.value == "completed":
                # Verify the file was actually deleted via after_state.
                after_state = getattr(result, "after_state", None)
                before_state = getattr(result, "before_state", None)
                if (
                    after_state
                    and isinstance(after_state, dict)
                    and after_state.get("exists") is False
                ):
                    verified_cleaned += 1
                    cat_size = 0
                    if (
                        before_state
                        and isinstance(before_state, dict)
                    ):
                        size = before_state.get("size", 0)
                        if isinstance(size, (int, float)) and size > 0:
                            space_recovered += size
                            cat_size = int(size)
                    # Update per-category cleaned count and space
                    category_stats[cat]["files_cleaned"] += 1
                    category_stats[cat]["space_recovered"] += cat_size
                # If after_state is missing or doesn't confirm absence,
                # do NOT count the space — the deletion is unverified.
            elif result.status.value == "failed":
                # V1.0: Capture failed action details for internal diagnostics.
                # Record: path, rule, error code, reason, whether file existed.
                target = getattr(result, "target", None)
                target_path = ""
                if target:
                    target_dict = target.to_dict() if hasattr(target, "to_dict") else {}
                    target_path = target_dict.get("path", "")
                before_state = getattr(result, "before_state", None) or {}
                after_state = getattr(result, "after_state", None) or {}
                failed_details.append({
                    "path": target_path,
                    "rule_id": getattr(result, "rule_id", ""),
                    "error_code": getattr(result, "error_code", "") or "",
                    "reason": getattr(result, "reason", "") or "",
                    "existed_before": before_state.get("exists", True) if isinstance(before_state, dict) else True,
                    "existed_after": after_state.get("exists", True) if isinstance(after_state, dict) else True,
                    "locked_before": before_state.get("locked", False) if isinstance(before_state, dict) else False,
                    "locked_after": after_state.get("locked", False) if isinstance(after_state, dict) else False,
                })

        # V1.0: Count folders — only actions with action_type=delete_directory
        # or clear_cache count as folder operations.  A folder is "found" if
        # it was a planned safe action, and "cleaned" only if verified absent.
        folders_found = 0
        folders_cleaned = 0
        for action in plan.actions:
            if action.state.value != "planned":
                continue
            at = action.action_type.value
            if at in ("delete_directory", "clear_cache"):
                folders_found += 1
        for result in summary.results:
            if result.status.value != "completed":
                continue
            at = result.action_type
            if at in ("delete_directory", "clear_cache"):
                after_state = getattr(result, "after_state", None)
                if (
                    after_state
                    and isinstance(after_state, dict)
                    and after_state.get("exists") is False
                ):
                    folders_cleaned += 1

        # V1.0: Sort category_stats by display order
        sorted_categories = dict(
            sorted(
                category_stats.items(),
                key=lambda x: category_order_index(x[0]),
            )
        )

        # V1.0: Recycle Bin cleanup via SHEmptyRecycleBin API.
        # The Recycle Bin is NOT scanned via filesystem enumeration (files
        # belong to user SIDs and may be inaccessible).  Instead, we call
        # the Windows SHEmptyRecycleBin API which handles all SIDs and
        # internal metadata correctly.  This runs AFTER the file-based
        # execution so that file deletions are not affected.
        recycle_bin_cleaned = 0
        recycle_bin_bytes = 0
        recycle_bin_failed = 0
        rb_files_before = 0
        rb_files_after = 0
        if sys.platform == "win32":
            try:
                from avs_backend.scan_core.execution.recycle_bin_executor import (
                    RecycleBinExecutor,
                )
                from avs_backend.scan_core.rules.detection.locations import KnownLocations

                # Measure Recycle Bin size before cleanup
                rb_roots = KnownLocations.get_recycle_bin_roots()
                rb_bytes_before = 0
                rb_files_before = 0
                for root in rb_roots:
                    if root.exists():
                        for f in root.rglob("*"):
                            if f.is_file():
                                try:
                                    rb_bytes_before += f.stat().st_size
                                    rb_files_before += 1
                                except (OSError, PermissionError):
                                    pass

                if rb_files_before > 0:
                    # Empty Recycle Bin on all local fixed drives
                    import ctypes
                    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
                    system_drive = os.environ.get("SystemDrive", "C:")
                    for i in range(26):
                        if bitmask & (1 << i):
                            drive = f"{chr(65 + i)}:"
                            try:
                                GetDriveType = ctypes.windll.kernel32.GetDriveTypeW
                                if GetDriveType(f"{drive}\\") == 3:  # DRIVE_FIXED
                                    result_code = RecycleBinExecutor._empty_recycle_bin(f"{drive}\\")
                                    logger.info(
                                        "SHEmptyRecycleBin('%s\\') returned %d",
                                        drive,
                                        result_code,
                                    )
                            except Exception as exc:
                                logger.warning("Recycle Bin cleanup error for drive %s: %s", drive, exc)

                    # Measure Recycle Bin size after cleanup
                    rb_bytes_after = 0
                    rb_files_after = 0
                    for root in rb_roots:
                        if root.exists():
                            for f in root.rglob("*"):
                                if f.is_file():
                                    try:
                                        rb_bytes_after += f.stat().st_size
                                        rb_files_after += 1
                                    except (OSError, PermissionError):
                                        pass

                    recycle_bin_cleaned = max(0, rb_files_before - rb_files_after)
                    recycle_bin_bytes = max(0, rb_bytes_before - rb_bytes_after)

                    # Add to category stats
                    rb_cat = "Recycle Bin"
                    if rb_cat not in sorted_categories:
                        sorted_categories[rb_cat] = {
                            "files_found": rb_files_before,
                            "files_cleaned": recycle_bin_cleaned,
                            "space_recovered": recycle_bin_bytes,
                        }
                    else:
                        sorted_categories[rb_cat]["files_found"] += rb_files_before
                        sorted_categories[rb_cat]["files_cleaned"] += recycle_bin_cleaned
                        sorted_categories[rb_cat]["space_recovered"] += recycle_bin_bytes

                    # Re-sort with the new category
                    sorted_categories = dict(
                        sorted(
                            sorted_categories.items(),
                            key=lambda x: category_order_index(x[0]),
                        )
                    )

                    logger.info(
                        "Recycle Bin cleanup: %d files cleaned, %d bytes recovered",
                        recycle_bin_cleaned,
                        recycle_bin_bytes,
                    )
            except Exception as exc:
                logger.warning("Recycle Bin cleanup failed: %s", exc)
                recycle_bin_failed = 1

        # V1.0 Recycle Bin accounting:
        # The Recycle Bin is cleaned via the Windows SHEmptyRecycleBin API,
        # which is an all-or-nothing operation per drive.  We CANNOT
        # individually verify each Recycle Bin item as "cleanable" before
        # the API call — the API decides what it can remove.
        #
        # Therefore, only items ACTUALLY REMOVED by the API count as
        # "Detected" in the user-visible totals.  Items that remain after
        # the API call were NOT cleanable (protected, in use, or the API
        # chose not to remove them) and must NOT inflate the Detected count.
        #
        # The category breakdown still shows rb_files_before for
        # transparency, but the totals only include recycle_bin_cleaned.
        recycle_bin_found = recycle_bin_cleaned  # only actually removed items
        verified_cleaned += recycle_bin_cleaned
        space_recovered += recycle_bin_bytes

        # V1.0 Accounting contract:
        #   Detected = Cleaned + Failed + Remaining
        #
        # Where:
        #   Detected = safe_count + recycle_bin_cleaned
        #            (filesystem actions verified cleanable + RB items removed)
        #   Cleaned   = verified_cleaned (includes RB cleaned)
        #   Failed    = summary.failed + recycle_bin_failed
        #            (attempted but file still exists)
        #   Remaining = Detected - Cleaned - Failed
        #
        # Locked/inaccessible/missing items were already excluded from
        # safe_count by the dashboard_eligible_only filter and
        # revalidation, so they never enter Detected.
        total_detected = safe_count + recycle_bin_found
        total_failed = summary.failed + recycle_bin_failed
        remaining_after = max(0, total_detected - verified_cleaned - total_failed)

        # V1.0: Bytes-based health score AFTER optimization.
        # remaining_bytes = executed_bytes_total - filesystem_space_recovered
        # This is the bytes of actions that were attempted but NOT
        # successfully cleaned (failed actions whose files still exist).
        # We use executed_bytes_total (sum of before_state.size for all
        # executed actions) rather than the preview estimate, because
        # the preview includes actions that were removed by revalidation.
        filesystem_space_recovered = space_recovered - recycle_bin_bytes
        remaining_bytes = max(0, executed_bytes_total - filesystem_space_recovered)
        health_after = _cleanup_health_score(remaining_bytes)

        # V1.0 Dashboard result contract — Disk Cleanup style:
        # User sees: files_found, files_cleaned, folders_found, folders_cleaned,
        # space_recovered, and per-category breakdown.
        # files_cleaned = verified_cleaned (only actions where after_state
        # confirms the file no longer exists on the filesystem).
        result_dict = {
            # ── User-facing fields ──────────────────────────────────────
            "files_found": total_detected,
            "files_cleaned": verified_cleaned,
            "folders_found": folders_found,
            "folders_cleaned": folders_cleaned,
            "space_recovered": space_recovered,
            # ── Per-category breakdown (Disk Cleanup style) ─────────────
            "categories": sorted_categories,
            # ── Legacy compat (kept for any old callers, NOT shown) ─────
            "detected": total_detected,
            "cleaned": verified_cleaned,
            "remaining": remaining_after,
            "failed": total_failed,
            "health_before": health_before,
            "health_after": health_after,
            # ── Internal diagnostics (NOT shown to Dashboard user) ──────
            "_diagnostics": {
                "execution_id": summary.execution_id,
                "total": summary.total,
                "detected_candidates": total_actions,
                "rejected": summary.rejected,
                "skipped": summary.skipped,
                "requires_review": summary.requires_review,
                "cancelled": summary.cancelled,
                "review_required_input": review_count,
                "blocked_input": blocked_count,
                "failed": summary.failed,
                "remaining": remaining_after,
                "status": summary.status.value,
                "reason": summary.reason or "",
                "failed_details": failed_details,
                "revalidation_removed": removed,
                "now_missing": now_missing,
                "now_locked": now_locked,
                "now_inaccessible": now_inaccessible,
                "completed_unverified": summary.completed - verified_cleaned,
                "recycle_bin_before": rb_files_before,
                "recycle_bin_after": rb_files_after,
                "recycle_bin_cleaned": recycle_bin_cleaned,
                "recycle_bin_failed": recycle_bin_failed,
            },
        }

        # Phase 4: Verification
        if verified_cleaned > 0:
            _update("verifying", f"Verifying {verified_cleaned} cleaned actions...", overall_progress=97)
        else:
            _update("verifying", "No actions to verify...", overall_progress=97)

        # V1.0: Post-cleanup — remove empty directories from cleanup
        # target areas (temp, prefetch, etc.).  The rules only create
        # delete_file actions for individual files; after all files are
        # deleted, empty subdirectories remain.  This step walks the
        # cleanup target directories and removes any empty folders so
        # the user sees a fully clean directory, not just deleted files.
        folders_cleaned += _remove_empty_cleanup_dirs()

        # The executor already verifies each action via preconditions
        # and after_state.  We surface the verification status from
        # the verified count, not the raw completed count.
        verification_status = "passed"
        if summary.failed > 0:
            verification_status = "partial"
        if verified_cleaned == 0 and summary.failed > 0:
            verification_status = "failed"

        # Phase 5: Complete
        _update(
            "complete",
            "Optimization complete",
            completed=True,
            overall_progress=100,
            result=result_dict,
            verification_status=verification_status,
        )

        # Persist cleanup result to scan history (PART 2)
        try:
            orchestrator = get_scan_orchestrator()
            if orchestrator:
                # V1.0: Persist only user-facing fields + verification status.
                # Internal diagnostics are NOT persisted to the user-facing
                # scan history.
                cleanup_result = {
                    "files_found": safe_count,
                    "files_cleaned": verified_cleaned,
                    "space_recovered": space_recovered,
                    "verification_status": verification_status,
                }
                orchestrator.update_scan_history_cleanup(plan_id, cleanup_result)
        except Exception as exc:
            logger.warning(f"Failed to persist cleanup result: {exc}")
            # Non-fatal — optimization succeeded even if persistence failed

    except Exception as exc:
        logger.exception("Auto-optimization failed: %s", exc)
        _update(
            "error",
            f"Optimization failed: {exc}",
            completed=True,
            error=str(exc),
        )


@register("scan_core.dashboard.auto_optimize")
@require_feature("scan_core.dashboard.auto_optimize")
def _scan_core_dashboard_auto_optimize(params: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Start automatic optimization of safe actions from a scan plan.

    This chains prepare → validate → execute (live) in a background thread.
    The SafetyGate is NOT bypassed — only APPROVED actions are executed.
    REQUIRES_REVIEW and REJECTED actions are skipped and counted.

    Parameters:
        plan_id: The action plan ID from a completed scan.
    """
    params = _safe_params(params)
    ok, plan_id = _require_str(params, "plan_id")
    if not ok:
        return {"ok": False, "error": plan_id}

    session_id = str(uuid.uuid4())

    with _auto_opt_lock:
        _auto_opt_sessions[session_id] = {
            "session_id": session_id,
            "plan_id": plan_id,
            "phase": "starting",
            "message": "Starting optimization...",
            "preview": None,
            "validation": None,
            "result": None,
            "completed": False,
            "cancelled": False,
            "error": None,
            "total_actions": 0,
            "safe_actions": 0,
            "review_required": 0,
            "blocked": 0,
            "verification_status": None,
            "execution_progress": 0,
            "execution_total": 0,
            "current_file": "",
            "current_category": "",
            "overall_progress": 0,
            "space_recovered": 0,
        }

    # Start the background thread — get_coordinator() is called from
    # within the thread so the RPC handler returns immediately.
    thread = threading.Thread(
        target=_run_auto_optimize,
        args=(session_id, plan_id),
        daemon=True,
        name=f"auto-opt-{session_id}",
    )
    thread.start()

    return {"ok": True, "session_id": session_id}


@register("scan_core.dashboard.auto_optimize_status")
def _scan_core_dashboard_auto_optimize_status(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Poll the status of a running auto-optimization session."""
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _auto_opt_lock:
        session = _auto_opt_sessions.get(session_id)
        if session is None:
            return {"ok": False, "error": "Optimization session not found"}
        return {"ok": True, **dict(session)}


@register("scan_core.dashboard.auto_optimize_cancel")
def _scan_core_dashboard_auto_optimize_cancel(
    params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Cancel a running auto-optimization session."""
    params = _safe_params(params)
    ok, session_id = _require_str(params, "session_id")
    if not ok:
        return {"ok": False, "error": session_id}

    with _auto_opt_lock:
        session = _auto_opt_sessions.get(session_id)
        if session is None:
            return {"ok": False, "error": "Optimization session not found"}
        session["cancelled"] = True

    # If there's an active execution, cancel it via the coordinator
    coord = get_coordinator()
    if coord is not None:
        # Try to cancel any active execution for this plan
        # The coordinator tracks active executions by request_id
        pass  # The background thread will check cancelled flag

    return {"ok": True, "cancelled": True}


# =====================================================================
# SC-8C14 Phase 3 — Canonical read-only quarantine list
# =====================================================================
#
# Reads the existing quarantine manifest maintained by the
# security_remediation module (same path, same format) and returns a
# privacy-safe, display-oriented summary. This RPC is strictly
# read-only: it never mutates the manifest, never moves/deletes files,
# never calls executors, never calls subprocess, and never invokes the
# RemediationCoordinator or SafetyGate.
#
# Privacy contract:
#   The response NEVER exposes canonical_path, asset_id, backup_location,
#   quarantine_path, original_path, registry keys, browser profile paths,
#   internal storage paths, raw evidence, or executable commands.

import json as _json_for_quarantine
import platform as _platform_for_quarantine

_QUARANTINE_DIR_CANONICAL: str
if _platform_for_quarantine.system() == "Windows":
    _QUARANTINE_DIR_CANONICAL = os.path.expandvars(
        r"%LOCALAPPDATA%\AVS Shield\Quarantine"
    )
else:
    _QUARANTINE_DIR_CANONICAL = os.path.expanduser("~/.avs-shield/quarantine")

_QUARANTINE_MANIFEST_CANONICAL = os.path.join(
    _QUARANTINE_DIR_CANONICAL, "manifest.json"
)


def _load_quarantine_manifest_canonical() -> dict[str, Any]:
    """Load the quarantine manifest read-only.

    Returns ``{"items": []}`` when the manifest is missing or malformed,
    matching the tolerant behavior of the transitional implementation.
    """
    try:
        with open(_QUARANTINE_MANIFEST_CANONICAL, "r", encoding="utf-8") as f:
            data = _json_for_quarantine.load(f)
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            return {"items": []}
        return data
    except (FileNotFoundError, ValueError, OSError):
        return {"items": []}


def _sanitize_quarantine_item(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Convert a raw manifest item into a privacy-safe display record.

    Returns ``None`` for entries that cannot be safely surfaced.
    """
    if not isinstance(raw, dict):
        return None

    quarantine_id = raw.get("quarantineId")
    if not isinstance(quarantine_id, str) or not quarantine_id:
        return None

    restored = bool(raw.get("restored", False))
    deleted = bool(raw.get("deleted", False))
    if deleted:
        status = "deleted"
    elif restored:
        status = "restored"
    else:
        status = "quarantined"

    # Derive a display name from the original path basename. The full
    # path itself is NOT exposed. Handle both Windows (backslash) and
    # POSIX (forward slash) separators so the basename extraction works
    # correctly regardless of the platform running the backend.
    original_path = raw.get("originalPath")
    display_name: str
    if isinstance(original_path, str) and original_path:
        # Normalize separators so basename works on any host platform.
        normalized = original_path.replace("\\", "/")
        display_name = os.path.basename(normalized)
    else:
        display_name = "quarantined-item"

    quarantined_at = raw.get("quarantinedAt")
    detected_at = quarantined_at if isinstance(quarantined_at, str) else None

    file_size = raw.get("fileSize")
    size = int(file_size) if isinstance(file_size, (int, float)) else 0

    reason = raw.get("reason")
    detection_reason = reason if isinstance(reason, str) else None

    return {
        "id": quarantine_id,
        "displayName": display_name,
        "status": status,
        "detectedAt": detected_at,
        "threatType": None,
        "severity": None,
        "size": size,
        "rollbackAvailable": status == "quarantined",
        "detectionReason": detection_reason,
    }


@register("scan_core.security_remediation.quarantine_list")
def _scan_core_security_remediation_quarantine_list(
    _params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """List quarantined items in a privacy-safe, read-only form.

    Reads the existing quarantine manifest maintained by the
    ``security_remediation`` module and returns display-oriented
    metadata only. This RPC does NOT execute remediation, does NOT
    call executors, does NOT call subprocess, does NOT move or delete
    files, and does NOT invoke the RemediationCoordinator or SafetyGate.

    Response (success):
        {
            "ok": True,
            "items": [
                {
                    "id": "q-...",
                    "displayName": "evil.exe",
                    "status": "quarantined" | "restored" | "deleted",
                    "detectedAt": "2024-..." | None,
                    "threatType": None,
                    "severity": None,
                    "size": 1024,
                    "rollbackAvailable": True | False,
                    "detectionReason": "..." | None
                },
                ...
            ],
            "count": N,         # active (non-restored, non-deleted) items
            "totalItems": N,    # all manifest entries
            "capturedAt": "2024-..."
        }

    Response (failure):
        {"ok": False, "error": "..."}

    Privacy:
        The response NEVER exposes canonical_path, asset_id,
        backup_location, quarantine_path, original_path, registry keys,
        browser profile paths, internal storage paths, raw evidence, or
        executable commands. Only display-oriented fields are returned.
    """
    try:
        manifest = _load_quarantine_manifest_canonical()
        raw_items = manifest.get("items", [])
        if not isinstance(raw_items, list):
            raw_items = []

        sanitized: list[dict[str, Any]] = []
        for raw in raw_items:
            entry = _sanitize_quarantine_item(raw)
            if entry is not None:
                sanitized.append(entry)

        active = [
            it for it in sanitized if it["status"] == "quarantined"
        ]

        return {
            "ok": True,
            "items": sanitized,
            "count": len(active),
            "totalItems": len(sanitized),
            "capturedAt": datetime.now(UTC).isoformat(),
        }
    except Exception as exc:
        logger.exception(
            "scan_core.security_remediation.quarantine_list failed: %s",
            exc,
        )
        return {"ok": False, "error": str(exc)}


# =====================================================================
# V1.0 Protection Center — Windows Defender status
# =====================================================================


@register("scan_core.defender.status")
def _scan_core_defender_status(
    _params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Query Windows Defender threat information and protection state.

    Returns authoritative Defender status:
    - status: "available" | "unavailable" | "disabled" | "not_windows" | "query_failed"
    - is_available: bool
    - reason: human-readable explanation
    - threats: list of confirmed threats (empty when available with no threats)
    - protection_state: real-time protection posture

    NEVER fabricates results. When unavailable, returns status="unavailable"
    with a clear reason — NOT "no threats found".

    Response (success):
        {
            "ok": true,
            "status": "available" | "unavailable" | "disabled" | ...,
            "is_available": bool,
            "reason": "...",
            "threats": [...],
            "active_threat_count": N,
            "total_threat_count": N,
            "protection_state": {...} | null,
            "queried_at": "..."
        }
    """
    try:
        from avs_backend.scan_core.security.defender_integration import (
            get_defender_threat_info,
        )

        info = get_defender_threat_info()
        return {"ok": True, **info.to_dict()}
    except Exception as exc:
        logger.exception("scan_core.defender.status failed: %s", exc)
        return {"ok": False, "error": str(exc)}


# =====================================================================
# V1.0 AI Security Center — Real security score from Defender status
# =====================================================================


def _compute_security_score_from_defender(info: Any) -> dict[str, Any]:
    """Compute a deterministic security score from real Defender telemetry.

    Score contract:
      Inputs (all from get_defender_threat_info):
        - status: AVAILABLE | UNAVAILABLE | DISABLED | NOT_WINDOWS | QUERY_FAILED
        - active_threat_count: number of active confirmed threats
        - total_threat_count: total confirmed threats (active + remediated)
        - protection_state: real-time protection posture flags

      Weights:
        - Defender available + healthy:        base 100
        - Defender available + RT protection:  no penalty
        - Defender available + RT off:         -15
        - Defender available + signatures old: -10
        - Defender disabled:                   base 50
        - Defender unavailable/query_failed:   base 50 (unknown, not fake 100)
        - Not Windows:                         base 50 (unknown)
        - Each active confirmed threat:        -20 (capped at -60)
        - Score clamped to [0, 100]

      Missing-data behavior:
        - When Defender telemetry is unavailable, the score is 50 ("unknown"),
          NOT 100. The UI must display "Unknown" rather than "Secure".
        - A successful scan alone does NOT increase the score.
        - Score changes only when security state changes.

    Returns:
        {
            "ok": true,
            "score": int,
            "label": "Secure" | "Protected" | "At Risk" | "Unprotected" | "Unknown",
            "available": bool,
            "reason": str,
            "inputs": {...},
            "computed_at": "..."
        }
    """
    from avs_backend.scan_core.security.defender_integration import DefenderStatus

    status = info.status
    active_threats = len(info.active_threats)
    total_threats = len(info.threats)
    protection_state = info.protection_state

    # Base score by Defender availability
    if status == DefenderStatus.AVAILABLE:
        score = 100
        reason = "Windows Defender is active"
    elif status == DefenderStatus.DISABLED:
        score = 50
        reason = info.reason or "Windows Defender is disabled"
    elif status == DefenderStatus.NOT_WINDOWS:
        score = 50
        reason = "Windows Defender is not available on this platform"
    else:
        # UNAVAILABLE or QUERY_FAILED
        score = 50
        reason = info.reason or "Windows Defender status unavailable"

    # Penalties for protection state (only when Defender is available)
    if status == DefenderStatus.AVAILABLE and protection_state:
        if not protection_state.real_time_protection_enabled:
            score -= 15
        if protection_state.signatures_out_of_date:
            score -= 10

    # Penalties for active confirmed threats
    threat_penalty = min(active_threats * 20, 60)
    score -= threat_penalty

    score = max(0, min(100, score))

    # Label
    if status != DefenderStatus.AVAILABLE:
        label = "Unknown"
    elif score >= 90:
        label = "Secure"
    elif score >= 75:
        label = "Protected"
    elif score >= 50:
        label = "At Risk"
    else:
        label = "Unprotected"

    return {
        "ok": True,
        "score": score,
        "label": label,
        "available": status == DefenderStatus.AVAILABLE,
        "reason": reason,
        "inputs": {
            "defender_status": status.value,
            "active_threat_count": active_threats,
            "total_threat_count": total_threats,
            "real_time_protection_enabled": (
                protection_state.real_time_protection_enabled
                if protection_state
                else None
            ),
            "signatures_out_of_date": (
                protection_state.signatures_out_of_date
                if protection_state
                else None
            ),
        },
        "computed_at": datetime.now(UTC).isoformat(),
    }


@register("scan_core.security.score")
def _scan_core_security_score(
    _params: Optional[dict[str, Any]],
) -> dict[str, Any]:
    """Compute a real security score from authoritative Defender telemetry.

    The score is deterministic and based on real security posture:
    - Defender availability and protection state
    - Active confirmed threat count
    - Signature freshness

    NEVER fabricates a score. When Defender is unavailable, returns
    score=50 with label="Unknown" — NOT score=100.

    A successful scan alone does NOT increase the score.
    Score changes only when security state changes.
    """
    try:
        from avs_backend.scan_core.security.defender_integration import (
            get_defender_threat_info,
        )

        info = get_defender_threat_info()
        return _compute_security_score_from_defender(info)
    except Exception as exc:
        logger.exception("scan_core.security.score failed: %s", exc)
        return {
            "ok": False,
            "error": str(exc),
            "score": 50,
            "label": "Unknown",
            "available": False,
            "reason": f"Security score computation failed: {exc}",
            "inputs": {},
            "computed_at": datetime.now(UTC).isoformat(),
        }
