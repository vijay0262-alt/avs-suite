"""
SC-8C3 Part 4 — Safety Gate Contract

Formal immutable safety gate between ActionPlan and Future Execution Engine.

The gate verifies safety independently of the planner.
The future executor must never be able to bypass this gate.

Returns:
- APPROVED: Action is safe to execute.
- REJECTED: Action is unsafe and must not be executed.
- REQUIRES_REVIEW: Action requires human approval before execution.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Optional, Protocol, runtime_checkable

# ── Safety Gate Result ─────────────────────────────────────────────────────────


class SafetyGateResult(str, Enum):
    """
    Result of safety gate evaluation.
    """

    APPROVED = "approved"
    REJECTED = "rejected"
    REQUIRES_REVIEW = "requires_review"


# ── Safety Gate Protocol ───────────────────────────────────────────────────────


@runtime_checkable
class SafetyGate(Protocol):
    """
    Protocol for safety gate implementations.

    The Future Execution Engine must use a SafetyGate implementation
    to verify every action before execution.

    The gate must be able to return:
    - APPROVED: Action is safe to execute.
    - REJECTED: Action is unsafe and must not be executed.
    - REQUIRES_REVIEW: Action requires human approval.

    The gate must verify safety independently of the ActionPlanner.
    """

    def evaluate(
        self,
        action: Any,  # RemediationAction — avoid circular import
        execution_context: dict[str, Any],
        plan_metadata: Optional[dict[str, Any]] = None,
    ) -> SafetyGateResult:
        """
        Evaluate whether an action is safe to execute.

        Args:
            action: The RemediationAction to evaluate.
            execution_context: Current execution context with live target state.
            plan_metadata: Optional metadata from the ActionPlan.

        Returns:
            SafetyGateResult indicating approval status.
        """
        ...


# ── Default Safety Gate ────────────────────────────────────────────────────────


@dataclass(frozen=True)
class DefaultSafetyGate:
    """
    Default safety gate implementation.

    Applies conservative safety rules:
    - BLOCKED actions are always rejected.
    - REVIEW_REQUIRED actions require human approval.
    - NOT_FIXABLE actions are always rejected.
    - Stale plans are rejected.
    - Preconditions must all pass.
    - Protected paths are rejected.
    - Locked targets are rejected.
    """

    snapshot_ttl_seconds: int = 3600  # 1 hour default
    require_hash_verification: bool = False

    def evaluate(
        self,
        action: Any,
        execution_context: dict[str, Any],
        plan_metadata: Optional[dict[str, Any]] = None,
    ) -> SafetyGateResult:
        """
        Evaluate action safety.
        """
        # 1. State-based rejection (cannot be overridden)
        if action.state.value == "blocked":
            return SafetyGateResult.REJECTED

        if action.state.value == "not_fixable":
            return SafetyGateResult.REJECTED

        if action.state.value == "review_required":
            return SafetyGateResult.REQUIRES_REVIEW

        if action.state.value == "missing_target":
            return SafetyGateResult.REJECTED

        if action.state.value == "locked_target":
            return SafetyGateResult.REJECTED

        # 2. Stale plan check
        if plan_metadata and "generated_at" in plan_metadata:
            generated_at = plan_metadata["generated_at"]
            if isinstance(generated_at, datetime):
                age = (datetime.now(UTC) - generated_at).total_seconds()
                if age > self.snapshot_ttl_seconds:
                    return SafetyGateResult.REJECTED

        # 3. Precondition evaluation
        preconditions = getattr(action, "preconditions", None)
        if preconditions:
            # Prefer typed PreconditionSet evaluation
            if hasattr(preconditions, "evaluate") and callable(preconditions.evaluate):
                passed, failed = preconditions.evaluate(execution_context)
                if not passed:
                    # A running browser is a review condition, not an outright
                    # rejection. Everything else is rejected.
                    if failed and all(
                        c.startswith("browser_not_running:") for c in failed
                    ):
                        return SafetyGateResult.REQUIRES_REVIEW
                    return SafetyGateResult.REJECTED
            else:
                # Fallback for legacy string preconditions
                for precondition in preconditions:
                    if not self._evaluate_precondition(precondition, execution_context):
                        return SafetyGateResult.REJECTED

        # 4. Execution context validation
        if not execution_context.get("exists", False):
            return SafetyGateResult.REJECTED

        if execution_context.get("locked", False):
            return SafetyGateResult.REJECTED

        if not execution_context.get("accessible", False):
            return SafetyGateResult.REJECTED

        # 5. Identity verification
        if execution_context.get("asset_id") != action.asset_id:
            return SafetyGateResult.REJECTED

        # 6. Path validation
        canonical_path = execution_context.get("canonical_path", "")
        if canonical_path:
            try:
                from .action_path_validation import validate_filesystem_path

                validate_filesystem_path(canonical_path)
            except Exception:
                return SafetyGateResult.REJECTED

        # 7. Hash verification (optional)
        if self.require_hash_verification:
            expected_hash = getattr(action, "metadata", {}).get("expected_hash")
            if expected_hash:
                actual_hash = execution_context.get("content_hash")
                if actual_hash != expected_hash:
                    return SafetyGateResult.REJECTED

        # All checks passed
        return SafetyGateResult.APPROVED

    def _evaluate_precondition(
        self, precondition: str, context: dict[str, Any]
    ) -> bool:
        """
        Evaluate a string precondition against execution context.

        This is a fallback for string-based preconditions.
        Typed preconditions should be evaluated by the execution engine
        using the PreconditionSet.evaluate() method.
        """
        if ":" not in precondition:
            return True

        key, value = precondition.split(":", 1)
        key = key.strip()
        value = value.strip().lower()

        if key == "target_exists":
            return context.get("exists", False) == (value == "true")

        if key == "target_accessible":
            return context.get("accessible", False) == (value == "true")

        if key == "target_not_locked":
            return context.get("locked", False) == (value == "false")

        if key == "identity_matches":
            return context.get("asset_id", "") == value

        if key == "inside_allowed_location":
            actual = context.get("canonical_path", "")
            if not actual or not value:
                return False
            # Simple prefix check — execution engine should use proper path comparison
            return actual.lower().startswith(value.lower())

        if key == "safety_valid":
            allowed = [v.strip() for v in value.split(",")]
            return context.get("safety_level", "") in allowed

        if key == "not_symlink":
            return context.get("is_symlink", False) is False

        if key == "not_junction":
            return context.get("is_junction", False) is False

        if key == "not_reparse_point":
            return context.get("is_reparse_point", False) is False

        # Unknown preconditions are treated as passed for forward compatibility
        return True


# ── Safety Gate Factory ────────────────────────────────────────────────────────


def create_safety_gate(
    snapshot_ttl_seconds: int = 3600,
    require_hash_verification: bool = False,
) -> SafetyGate:
    """
    Create a safety gate with specified configuration.

    Args:
        snapshot_ttl_seconds: Maximum age of snapshot in seconds.
        require_hash_verification: Whether to require content hash verification.

    Returns:
        SafetyGate implementation.
    """
    return DefaultSafetyGate(
        snapshot_ttl_seconds=snapshot_ttl_seconds,
        require_hash_verification=require_hash_verification,
    )
