"""
SC-8C12 Phase 2 — Security Remediation Adapter

Converts Security Center threat remediation actions into canonical
scan_core RemediationAction objects suitable for the existing
ActionPlan / RemediationCoordinator workflow.

Architecture:
  Security Center threat detection / investigation (frontend)
    ↓
  Security Center remediation actions (domain-specific)
    ↓
  [THIS ADAPTER] ← SC-8C12 Phase 2
    ↓
  canonical RemediationAction objects
    ↓
  SecurityRemediationPlanBuilder (Phase 3)
    ↓
  ActionPlan
    ↓
  RemediationCoordinator (existing)
    ↓
  DefaultExecutor (existing)

This adapter:
- NEVER executes remediation
- NEVER calls legacy Security Center execution (ThreatRemediationEngine, security.remediation.*, security.quarantine.*)
- NEVER bypasses SafetyGate
- NEVER bypasses CapabilityContract
- NEVER calls target executors
- NEVER performs filesystem / registry / process mutation
- NEVER calls subprocess or PowerShell
- ONLY converts Security Center domain actions to canonical RemediationActions
- ONLY produces RemediationActions for existing supported action types
- Classifies unsupported actions as NOT_FIXABLE
- Classifies non-remediation actions (review, ignore, mark_false_positive, export_investigation) as NOT_FIXABLE

Quarantine Architecture Decision (SC-8C12 Specification §10):
  Classification B — quarantine maps to ActionType.DELETE_FILE with
  backup_required=True and rollback_supported=True.
  The existing BackupManager backup represents the quarantined copy.
  Canonical rollback represents quarantine restore.
  NO new ActionType is required.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Optional

from ..assets.identity import (
    generate_file_asset_id,
    generate_registry_value_asset_id,
)
from ..rules.action import (
    ActionState,
    ActionTarget,
    ActionType,
    FilesystemActionTarget,
    RegistryActionTarget,
    RemediationAction,
    StartupActionTarget,
    _NoTarget,
)
from ..rules.action_preconditions import (
    HashMatches,
    NotJunction,
    NotReparsePoint,
    NotSymlink,
    PathWithinAllowedScope,
    PreconditionSet,
    RegistryHiveMatches,
    RegistryKeyExists,
    RegistryValueExists,
    SafetyLevelValid,
    SnapshotFresh,
    TargetAccessible,
    TargetExists,
    TargetIdentityMatches,
    TargetNotLocked,
)
from ..rules.actionability import CapabilityContract, Fixability
from ..rules.enums import RuleCategory
from ..rules.priority import RuleCapability


# ── Security Action Type Mapping ──────────────────────────────────────────────


@dataclass(frozen=True)
class SecurityActionMapping:
    """
    Mapping from a Security Center action type to a canonical scan_core action type.

    Only includes mappings for actions that can be safely executed through
    existing scan_core executors. Unsupported actions are marked is_supported=False.
    Non-remediation actions (review, ignore, etc.) are marked is_remediation=False.
    """

    security_type: str
    action_type: ActionType
    rule_category: RuleCategory
    target_type: str  # "filesystem" | "startup" | "registry" | "none"
    backup_required: bool
    rollback_supported: bool
    is_supported: bool
    is_remediation: bool
    reason: str


# ── Supported Security Action Mappings ────────────────────────────────────────

_MAPPING_QUARANTINE = SecurityActionMapping(
    security_type="quarantine",
    action_type=ActionType.DELETE_FILE,
    rule_category=RuleCategory.SECURITY,
    target_type="filesystem",
    backup_required=True,
    rollback_supported=True,
    is_supported=True,
    is_remediation=True,
    reason=(
        "Quarantine maps to delete_file with backup_required=True. "
        "The BackupManager backup IS the quarantined copy. "
        "Canonical rollback (restore from backup) IS quarantine restore."
    ),
)

_MAPPING_DELETE = SecurityActionMapping(
    security_type="delete",
    action_type=ActionType.DELETE_FILE,
    rule_category=RuleCategory.SECURITY,
    target_type="filesystem",
    backup_required=False,
    rollback_supported=False,
    is_supported=True,
    is_remediation=True,
    reason=(
        "Permanent deletion of a quarantined file. "
        "Targets the backup/quarantine location. "
        "Irreversible — backup_required=False, rollback_supported=False."
    ),
)

_MAPPING_DISABLE_STARTUP = SecurityActionMapping(
    security_type="disable_startup_entry",
    action_type=ActionType.DISABLE_STARTUP_ENTRY,
    rule_category=RuleCategory.STARTUP,
    target_type="startup",
    backup_required=True,
    rollback_supported=True,
    is_supported=True,
    is_remediation=True,
    reason="Direct mapping to canonical StartupExecutor.",
)

# remove_persistence is target-type-dependent.
# When the persistence mechanism is a registry value, it maps to
# REMOVE_REGISTRY_VALUE. When it is a startup entry, it maps to
# DISABLE_STARTUP_ENTRY. Other target types are unsupported.
_MAPPING_REMOVE_PERSISTENCE_REGISTRY = SecurityActionMapping(
    security_type="remove_persistence",
    action_type=ActionType.REMOVE_REGISTRY_VALUE,
    rule_category=RuleCategory.REGISTRY,
    target_type="registry",
    backup_required=True,
    rollback_supported=True,
    is_supported=True,
    is_remediation=True,
    reason=(
        "Registry-based persistence maps to remove_registry_value. "
        "The RegistryExecutor handles backup and rollback."
    ),
)

_MAPPING_REMOVE_PERSISTENCE_STARTUP = SecurityActionMapping(
    security_type="remove_persistence",
    action_type=ActionType.DISABLE_STARTUP_ENTRY,
    rule_category=RuleCategory.STARTUP,
    target_type="startup",
    backup_required=True,
    rollback_supported=True,
    is_supported=True,
    is_remediation=True,
    reason=(
        "Startup-based persistence maps to disable_startup_entry. "
        "The StartupExecutor handles backup and rollback."
    ),
)


# ── Unsupported / Non-Remediation Mappings ────────────────────────────────────


def _unsupported(
    security_type: str,
    reason: str,
) -> SecurityActionMapping:
    """Create an unsupported mapping for an action that has no canonical executor."""
    return SecurityActionMapping(
        security_type=security_type,
        action_type=ActionType.NONE,
        rule_category=RuleCategory.SECURITY,
        target_type="none",
        backup_required=False,
        rollback_supported=False,
        is_supported=False,
        is_remediation=True,
        reason=reason,
    )


def _non_remediation(
    security_type: str,
    reason: str,
) -> SecurityActionMapping:
    """Create a non-remediation mapping for actions that are not remediation."""
    return SecurityActionMapping(
        security_type=security_type,
        action_type=ActionType.NONE,
        rule_category=RuleCategory.SECURITY,
        target_type="none",
        backup_required=False,
        rollback_supported=False,
        is_supported=False,
        is_remediation=False,
        reason=reason,
    )


# Primary action type → mapping (for non-target-dependent types).
SECURITY_ACTION_MAPPINGS: dict[str, SecurityActionMapping] = {
    # ── Supported remediation actions ──
    "quarantine": _MAPPING_QUARANTINE,
    "delete": _MAPPING_DELETE,
    "disable_startup_entry": _MAPPING_DISABLE_STARTUP,
    # ── Unsupported remediation actions (no canonical executor) ──
    "disable_scheduled_task": _unsupported(
        "disable_scheduled_task",
        "No canonical executor for scheduled tasks.",
    ),
    "disable_browser_extension": _unsupported(
        "disable_browser_extension",
        "No canonical executor for browser extensions.",
    ),
    "reset_browser_setting": _unsupported(
        "reset_browser_setting",
        "No canonical executor for browser settings.",
    ),
    # ── Non-remediation actions (state decisions / domain operations) ──
    "review": _non_remediation(
        "review",
        "Review is a state decision, not a remediation action. "
        "Maps to ActionState.REVIEW_REQUIRED at the plan level.",
    ),
    "ignore": _non_remediation(
        "ignore",
        "Ignore is a state decision, not a remediation action.",
    ),
    "mark_false_positive": _non_remediation(
        "mark_false_positive",
        "False-positive tracking remains in the Security Center domain "
        "(per SC-8C12 product decision D4). Not a canonical remediation action.",
    ),
    "restore": _non_remediation(
        "restore",
        "Restore maps to canonical rollback (scan_core.remediation.rollback), "
        "which is an execution-phase operation, not a planning action.",
    ),
    "export_investigation": _non_remediation(
        "export_investigation",
        "Export is a reporting action, not a remediation action.",
    ),
}

# Target-type-dependent mappings for remove_persistence.
REMOVE_PERSISTENCE_TARGET_MAPPINGS: dict[str, SecurityActionMapping] = {
    "registry": _MAPPING_REMOVE_PERSISTENCE_REGISTRY,
    "startup_entry": _MAPPING_REMOVE_PERSISTENCE_STARTUP,
    # Unsupported target types for remove_persistence
    "scheduled_task": _unsupported(
        "remove_persistence",
        "No canonical executor for scheduled-task persistence.",
    ),
    "service": _unsupported(
        "remove_persistence",
        "No canonical executor for service persistence.",
    ),
    "process": _unsupported(
        "remove_persistence",
        "No canonical executor for process persistence.",
    ),
    "network": _unsupported(
        "remove_persistence",
        "No canonical executor for network persistence.",
    ),
    "file": _unsupported(
        "remove_persistence",
        "remove_persistence on a file target is not a persistence removal.",
    ),
    "browser_extension": _unsupported(
        "remove_persistence",
        "No canonical executor for browser-extension persistence.",
    ),
    "browser_setting": _unsupported(
        "remove_persistence",
        "No canonical executor for browser-setting persistence.",
    ),
}

# Severity → priority score mapping (deterministic).
_SEVERITY_PRIORITY_SCORE: dict[str, float] = {
    "critical": 100.0,
    "high": 80.0,
    "medium": 60.0,
    "low": 40.0,
    "info": 20.0,
}


# ── Security Remediation Adapter ──────────────────────────────────────────────


class SecurityRemediationAdapter:
    """
    Adapter to convert Security Center remediation actions to canonical
    scan_core RemediationActions.

    This adapter:
    - Accepts Security Center action data from the threat remediation pipeline
    - Maps supported actions to existing scan_core action types
    - Marks unsupported actions as NOT_FIXABLE
    - Marks non-remediation actions (review, ignore, etc.) as NOT_FIXABLE
    - Generates RemediationActions with proper typed preconditions
    - Never executes remediation
    - Never bypasses SafetyGate or CapabilityContract
    - Never calls legacy Security Center execution paths
    """

    def __init__(self, capability_contract: Optional[CapabilityContract] = None) -> None:
        """
        Initialize the Security Remediation adapter.

        Args:
            capability_contract: Optional capability contract for actionability checks.
        """
        self.capability_contract = capability_contract or CapabilityContract()
        self.statistics: dict[str, int] = {
            "converted": 0,
            "unsupported": 0,
            "non_remediation": 0,
            "errors": 0,
        }

    def convert_action(
        self,
        security_action: dict[str, Any],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> RemediationAction:
        """
        Convert a Security Center remediation action to a canonical RemediationAction.

        Args:
            security_action: Security Center action data with keys:
                - id: str (required)
                - type: str (required — Security Center action type)
                - threatId: str (optional, for audit trail)
                - title: str (optional, human-readable)
                - description: str (optional, human-readable)
                - reason: str (optional, why this action is recommended)
                - confidence: float (optional, 0.0–1.0)
                - severity: str (optional — "low"|"medium"|"high"|"critical")
                - category: str (optional — threat category)
                - sourceModule: str (optional — always "security-center")
                - sourceFindingId: str (optional — finding ID)
                - rollbackAvailable: bool (optional)
                - target: dict (optional — {type, path, name})
            snapshot_timestamp: Optional snapshot timestamp for preconditions.

        Returns:
            RemediationAction instance.

        Raises:
            ValueError: If action data is invalid or incomplete.
        """
        try:
            # ── Extract and validate required fields ──
            action_id = security_action.get("id", "")
            action_type_str = security_action.get("type", "")

            if not action_id or not action_type_str:
                raise ValueError(
                    "Security action missing required fields: id, type"
                )

            # Extract optional fields
            threat_id = security_action.get("threatId", "")
            title = security_action.get("title", "")
            description = security_action.get("description", "")
            reason = security_action.get("reason", "")
            confidence = float(security_action.get("confidence", 0.0))
            severity = security_action.get("severity", "medium")
            category = security_action.get("category", "unknown")
            source_module = security_action.get("sourceModule", "security-center")
            source_finding_id = security_action.get("sourceFindingId", action_id)
            rollback_available = bool(security_action.get("rollbackAvailable", False))
            raw_target = security_action.get("target", {})
            # Gracefully handle malformed target (non-dict) by falling back to {}
            target_data = raw_target if isinstance(raw_target, dict) else {}

            # ── Resolve the action mapping ──
            mapping = self._resolve_mapping(action_type_str, target_data)

            # ── Determine action state and fixability ──
            if not mapping.is_remediation:
                # Non-remediation actions (review, ignore, mark_false_positive, etc.)
                state = ActionState.NOT_FIXABLE
                is_actionable = False
                is_fixable = False
                fixability = Fixability.NOT_FIXABLE
                rule_capability = RuleCapability.NO_REMEDIATION
                self.statistics["non_remediation"] += 1
            elif not mapping.is_supported:
                # Unsupported remediation actions (no canonical executor)
                state = ActionState.NOT_FIXABLE
                is_actionable = False
                is_fixable = False
                fixability = Fixability.NOT_FIXABLE
                rule_capability = RuleCapability.NO_REMEDIATION
                self.statistics["unsupported"] += 1
            else:
                # Supported remediation actions
                state = ActionState.PLANNED
                is_actionable = True
                is_fixable = True
                fixability = Fixability.AUTO_FIXABLE
                rule_capability = RuleCapability.REMEDIATION_AVAILABLE
                self.statistics["converted"] += 1

            # ── Create the canonical ActionTarget ──
            target = self._create_target(
                mapping=mapping,
                action_id=action_id,
                target_data=target_data,
                rollback_available=rollback_available,
            )

            # ── Create typed preconditions ──
            preconditions = self._create_preconditions(
                mapping=mapping,
                target=target,
                target_data=target_data,
                snapshot_timestamp=snapshot_timestamp,
            )

            # ── Compute priority score from severity and confidence ──
            priority_score = self._compute_priority_score(severity, confidence)

            # ── Build safe metadata (no raw paths, no asset IDs) ──
            display_name = target_data.get("name", "") or title or action_id
            metadata: dict[str, Any] = {
                "source": "security_center",
                "source_module": source_module,
                "security_type": action_type_str,
                "threat_id": threat_id,
                "threat_category": category,
                "severity": severity,
                "confidence": confidence,
                "display_name": display_name,
                "title": title,
            }

            # ── Create the canonical RemediationAction ──
            action = RemediationAction(
                action_id=action_id,
                action_type=mapping.action_type,
                state=state,
                target=target,
                finding_id=source_finding_id,
                rule_id=f"security_{action_type_str}",
                rule_version="1.0.0",
                asset_id=self._resolve_asset_id(mapping, target_data),
                priority_score=priority_score,
                fixability=fixability,
                is_blocked=False,
                requires_review=not mapping.is_supported,
                is_actionable=is_actionable,
                is_auto_fixable=mapping.is_supported and mapping.is_remediation,
                is_fixable=is_fixable,
                rule_capability=rule_capability,
                preconditions=preconditions,
                safety_assessment=mapping.reason,
                reason=reason or description or title,
                estimated_size=None,  # Security actions do not estimate storage recovery
                backup_required=mapping.backup_required and mapping.is_supported,
                rollback_supported=mapping.rollback_supported and mapping.is_supported,
                backup_location=None,  # Backend assigns during execution
                backup_identity=None,  # Backend assigns during execution
                computed_at=datetime.now(UTC),
                metadata=metadata,
            )

            return action

        except Exception as exc:
            self.statistics["errors"] += 1
            raise ValueError(
                f"Failed to convert Security Center action: {exc}"
            ) from exc

    def convert_actions(
        self,
        security_actions: list[dict[str, Any]],
        snapshot_timestamp: Optional[datetime] = None,
    ) -> list[RemediationAction]:
        """
        Convert multiple Security Center actions to RemediationActions.

        Invalid actions are skipped (error counted) but processing continues.

        Args:
            security_actions: List of Security Center action data dicts.
            snapshot_timestamp: Optional snapshot timestamp for preconditions.

        Returns:
            List of RemediationAction instances (invalid actions skipped).
        """
        actions: list[RemediationAction] = []
        for security_action in security_actions:
            try:
                action = self.convert_action(security_action, snapshot_timestamp)
                actions.append(action)
            except ValueError:
                # Error already counted in convert_action; continue processing
                continue
        return actions

    def get_statistics(self) -> dict[str, int]:
        """Return a copy of adapter statistics."""
        return self.statistics.copy()

    def reset_statistics(self) -> None:
        """Reset adapter statistics to zero."""
        self.statistics = {
            "converted": 0,
            "unsupported": 0,
            "non_remediation": 0,
            "errors": 0,
        }

    # ── Internal helpers ───────────────────────────────────────────────────

    def _resolve_mapping(
        self,
        action_type_str: str,
        target_data: dict[str, Any],
    ) -> SecurityActionMapping:
        """
        Resolve the action mapping for a Security Center action type.

        For remove_persistence, the mapping depends on the target type.
        For all other types, the mapping is looked up directly.

        Unknown action types are treated as unsupported.
        """
        if action_type_str == "remove_persistence":
            target_type = target_data.get("type", "")
            mapping = REMOVE_PERSISTENCE_TARGET_MAPPINGS.get(target_type)
            if mapping is not None:
                return mapping
            # Unknown target type for remove_persistence
            return _unsupported(
                "remove_persistence",
                f"No canonical executor for remove_persistence on target type '{target_type}'.",
            )

        mapping = SECURITY_ACTION_MAPPINGS.get(action_type_str)
        if mapping is not None:
            return mapping

        # Unknown action type — treat as unsupported
        return _unsupported(
            action_type_str,
            f"Unknown Security Center action type: {action_type_str}",
        )

    def _create_target(
        self,
        mapping: SecurityActionMapping,
        action_id: str,
        target_data: dict[str, Any],
        rollback_available: bool,
    ) -> ActionTarget:
        """
        Create the canonical ActionTarget for the action.

        For unsupported / non-remediation actions, returns _NoTarget.
        For supported actions, creates the appropriate typed target with
        internal path information (backend-only, never exposed to frontend
        via RPC responses).
        """
        if not mapping.is_supported or mapping.target_type == "none":
            return _NoTarget()

        target_path = target_data.get("path", "")
        target_name = target_data.get("name", "")

        if mapping.target_type == "filesystem":
            # Filesystem target for quarantine (DELETE_FILE with backup) or
            # permanent deletion (DELETE_FILE without backup).
            # canonical_path and allowed_location are backend-internal fields
            # that are never exposed to the frontend via RPC responses.
            allowed_location = self._extract_parent_directory(target_path)
            return FilesystemActionTarget(
                asset_id=self._resolve_asset_id(mapping, target_data),
                canonical_path=target_path,
                allowed_location=allowed_location,
                scope="user",
                backup_required=mapping.backup_required,
                rollback_supported=mapping.rollback_supported,
            )

        if mapping.target_type == "startup":
            return StartupActionTarget(
                asset_id=self._resolve_asset_id(mapping, target_data),
                entry_id=target_name,  # Use target name as entry identifier
                scope="user",
                backup_required=mapping.backup_required,
                rollback_supported=mapping.rollback_supported,
            )

        if mapping.target_type == "registry":
            hive, key_path, value_name = self._parse_registry_target(target_data)
            return RegistryActionTarget(
                asset_id=self._resolve_asset_id(mapping, target_data),
                hive=hive,
                key_path=key_path,
                value_name=value_name,
                backup_required=mapping.backup_required,
                rollback_supported=mapping.rollback_supported,
            )

        return _NoTarget()

    def _create_preconditions(
        self,
        mapping: SecurityActionMapping,
        target: ActionTarget,
        target_data: dict[str, Any],
        snapshot_timestamp: Optional[datetime],
    ) -> PreconditionSet:
        """
        Create typed preconditions for the action.

        For unsupported / non-remediation actions, returns an empty
        PreconditionSet (no preconditions to evaluate).

        For supported actions, reuses existing scan_core precondition
        structures: TargetExists, TargetAccessible, TargetNotLocked,
        NotSymlink, NotJunction, NotReparsePoint, SafetyLevelValid,
        SnapshotFresh, TargetIdentityMatches, PathWithinAllowedScope.
        """
        if not mapping.is_supported:
            return PreconditionSet(conditions=())

        conditions: list[Any] = [
            TargetExists(expected=True),
            TargetAccessible(expected=True),
            TargetNotLocked(expected=True),
            NotSymlink(),
            NotJunction(),
            NotReparsePoint(),
            SafetyLevelValid(allowed_levels=("safe", "low_risk")),
            SnapshotFresh(max_age_seconds=3600),
        ]

        # Filesystem-specific preconditions
        if isinstance(target, FilesystemActionTarget):
            if target.allowed_location:
                conditions.append(
                    PathWithinAllowedScope(
                        allowed_location=target.allowed_location,
                        canonical_path=target.canonical_path,
                    )
                )
            conditions.append(
                TargetIdentityMatches(expected_asset_id=target.asset_id)
            )

        # Registry-specific preconditions
        if isinstance(target, RegistryActionTarget):
            conditions.append(RegistryHiveMatches(expected_hive=target.hive))
            conditions.append(RegistryKeyExists(expected=True))
            if target.value_name is not None:
                conditions.append(RegistryValueExists(expected=True))
            conditions.append(
                TargetIdentityMatches(expected_asset_id=target.asset_id)
            )

        # Startup-specific preconditions
        if isinstance(target, StartupActionTarget):
            conditions.append(
                TargetIdentityMatches(expected_asset_id=target.asset_id)
            )

        return PreconditionSet(conditions=tuple(conditions))

    def _compute_priority_score(self, severity: str, confidence: float) -> float:
        """
        Compute a deterministic priority score from severity and confidence.

        Score = severity_weight * (0.5 + 0.5 * confidence)
        This ensures higher-severity, higher-confidence threats get higher priority.
        """
        severity_weight = _SEVERITY_PRIORITY_SCORE.get(severity, 60.0)
        confidence_factor = 0.5 + 0.5 * max(0.0, min(1.0, confidence))
        return severity_weight * confidence_factor

    def _resolve_asset_id(
        self,
        mapping: SecurityActionMapping,
        target_data: dict[str, Any],
    ) -> str:
        """
        Generate a deterministic asset_id from the target data.

        For filesystem targets, uses generate_file_asset_id(path).
        For registry targets, uses generate_registry_value_asset_id(hive, key, value).
        For startup targets, uses a deterministic hash of the entry name.
        For unsupported targets, returns the action_id as a fallback.
        """
        target_path = target_data.get("path", "")
        target_name = target_data.get("name", "")

        if mapping.target_type == "filesystem" and target_path:
            return generate_file_asset_id(target_path)

        if mapping.target_type == "registry":
            hive, key_path, value_name = self._parse_registry_target(target_data)
            if hive and key_path:
                return generate_registry_value_asset_id(
                    hive, key_path, value_name or ""
                )

        if mapping.target_type == "startup" and target_name:
            # Use a deterministic hash of the entry name as asset_id
            import hashlib

            return hashlib.sha256(
                f"startup_entry:{target_name}".encode("utf-8")
            ).hexdigest()

        # Fallback: use target path or name, or empty string
        return target_path or target_name or ""

    def _extract_parent_directory(self, path: str) -> str:
        """
        Extract the parent directory from a file path.

        This is used as the allowed_location for filesystem targets,
        ensuring the executor only operates within the approved scope.
        """
        if not path:
            return ""
        parent = os.path.dirname(path)
        return parent if parent else ""

    def _parse_registry_target(
        self, target_data: dict[str, Any]
    ) -> tuple[str, str, Optional[str]]:
        """
        Parse registry target data into (hive, key_path, value_name).

        The Security Center target.path for registry targets is expected
        to be in the format: HIVE\\Key\\Subkey or HIVE\\Key\\Subkey\\ValueName
        """
        path = target_data.get("path", "")
        name = target_data.get("name", "")

        if not path:
            return ("", "", None)

        # Split the path into components
        parts = path.split("\\")
        if len(parts) < 2:
            # Just a hive, no key path
            return (parts[0] if parts else "", "", None)

        hive = parts[0]
        # The key path is everything except the last component if name is
        # provided (name is the value name). Otherwise, the last component
        # is the value name and the rest is the key path.
        if name:
            # name is the value name; key_path is the full path after hive
            key_path = "\\".join(parts[1:])
            return (hive, key_path, name)
        else:
            # No explicit value name — treat the last component as value name
            key_path = "\\".join(parts[1:-1]) if len(parts) > 2 else ""
            value_name = parts[-1] if len(parts) > 1 else None
            return (hive, key_path, value_name)


# ── Helper Functions ──────────────────────────────────────────────────────────


def is_security_action_supported(action_type: str) -> bool:
    """
    Check if a Security Center action type is supported by scan_core.

    Args:
        action_type: Security Center action type string.

    Returns:
        True if the action type has a supported canonical mapping, False otherwise.
    """
    mapping = SECURITY_ACTION_MAPPINGS.get(action_type)
    return mapping is not None and mapping.is_supported


def get_security_action_mapping(action_type: str) -> Optional[SecurityActionMapping]:
    """
    Get the action mapping for a Security Center action type.

    Args:
        action_type: Security Center action type string.

    Returns:
        SecurityActionMapping if found, None otherwise.
    """
    return SECURITY_ACTION_MAPPINGS.get(action_type)


def is_security_action_remediation(action_type: str) -> bool:
    """
    Check if a Security Center action type is a remediation action
    (as opposed to a state decision like review or ignore).

    Args:
        action_type: Security Center action type string.

    Returns:
        True if the action is a remediation action, False otherwise.
    """
    mapping = SECURITY_ACTION_MAPPINGS.get(action_type)
    if mapping is None:
        return False
    return mapping.is_remediation
