"""RPC handlers for the centralized Job Manager."""

from __future__ import annotations

import logging
from typing import Any

from avs_backend.api.registry import register
from avs_backend.common.job_manager import get_job_manager

log = logging.getLogger("avs.jobs.rpc")


@register("job.status")
def job_status(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get the status of a single job by ID."""
    if not params or "jobId" not in params:
        return {"present": False}
    snap = get_job_manager().status(params["jobId"])
    if snap is None:
        return {"present": False}
    return {
        "present": True,
        "jobId": snap.job_id,
        "jobType": snap.job_type,
        "status": snap.status.value,
        "progress": snap.progress,
        "startedAt": snap.started_at,
        "finishedAt": snap.finished_at,
        "result": snap.result,
        "error": snap.error,
        "durationMs": snap.duration_ms,
        "etaMs": snap.eta_ms,
    }


@register("job.cancel")
def job_cancel(params: dict[str, Any] | None) -> dict[str, bool]:
    """Cancel a running job."""
    if not params or "jobId" not in params:
        return {"cancelled": False}
    return {"cancelled": get_job_manager().cancel(params["jobId"])}


@register("job.list")
def job_list(params: dict[str, Any] | None) -> dict[str, Any]:
    """List all jobs, optionally filtered by type."""
    job_type = params.get("jobType") if params else None
    snaps = get_job_manager().list_jobs(job_type)
    return {
        "jobs": [
            {
                "jobId": s.job_id,
                "jobType": s.job_type,
                "status": s.status.value,
                "progress": s.progress,
                "startedAt": s.started_at,
                "finishedAt": s.finished_at,
                "error": s.error,
                "durationMs": s.duration_ms,
                "etaMs": s.eta_ms,
            }
            for s in snaps
        ],
        "count": len(snaps),
    }
