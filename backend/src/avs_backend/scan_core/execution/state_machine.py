"""
SC-8C4 Phase B — Execution state machine.

Enforces valid execution lifecycle transitions and provides
recovered-state classification for restart safety.
"""

from __future__ import annotations


class InvalidExecutionStateTransition(Exception):
    """Raised when an invalid execution state transition is requested."""

    pass


class ExecutionState:
    """Allowed persisted execution states (ExecutionStatus-compatible values)."""

    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    ROLLED_BACK = "rolled_back"
    DRY_RUN = "dry_run"
    APPROVED = "approved"
    REJECTED = "rejected"
    SKIPPED = "skipped"
    REQUIRES_REVIEW = "requires_review"

    FINAL_STATES: set[str] = {
        COMPLETED,
        FAILED,
        CANCELLED,
        ROLLED_BACK,
        DRY_RUN,
        APPROVED,
        REJECTED,
        SKIPPED,
        REQUIRES_REVIEW,
    }


_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    ExecutionState.PLANNED: {ExecutionState.RUNNING},
    ExecutionState.RUNNING: ExecutionState.FINAL_STATES,
}


def can_transition(current_state: str, new_state: str) -> bool:
    """Return True if the state transition is valid."""
    if current_state == new_state:
        return True
    allowed = _ALLOWED_TRANSITIONS.get(current_state)
    if allowed is None:
        return False
    return new_state in allowed


def validate_transition(current_state: str, new_state: str) -> None:
    """Raise InvalidExecutionStateTransition if the transition is not allowed."""
    if not can_transition(current_state, new_state):
        raise InvalidExecutionStateTransition(
            f"Invalid execution state transition: {current_state} -> {new_state}"
        )


def is_final_state(state: str) -> bool:
    """Return True if the state is terminal."""
    return state in ExecutionState.FINAL_STATES


def classify_recovery_state(
    status: str,
    completed_action_count: int,
    total_action_count: int,
) -> str:
    """
    Classify a recovered persisted execution.

    Returns one of:
        - "completed": execution already reached a final state
        - "interrupt_safe": partial completion; may continue if revalidated
        - "manual_review": corruption/inconsistency detected
    """
    if is_final_state(status):
        return "completed"
    if status in {ExecutionState.PLANNED, ExecutionState.RUNNING}:
        if completed_action_count == 0:
            return "interrupt_safe"
        if 0 < completed_action_count < total_action_count:
            return "interrupt_safe"
        if completed_action_count > total_action_count:
            return "manual_review"
    return "manual_review"
