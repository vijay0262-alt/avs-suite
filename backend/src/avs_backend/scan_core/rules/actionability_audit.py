"""
SC-8C4 Phase C — Actionability audit and coverage reporting.

Generates the rule -> asset type -> action type -> actionability matrix
and coverage statistics without executing any actions.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Optional

from ..assets import AssetType
from .actionability import DEFAULT_CAPABILITY_MATRIX, Actionability, CapabilityContract
from .priority import Fixability, RuleCapability
from .registry import RuleRegistry
from .rule import Rule
from .safety import SafetyAssessment


def _ideal_safe_assessment() -> SafetyAssessment:
    """Safe assessment used for capability auditing (best-case for a rule)."""
    return SafetyAssessment.create_safe("Audit best-case safety")


def audit_rule(
    rule: Rule,
    contract: CapabilityContract,
) -> list[dict[str, Any]]:
    """
    Audit a single rule's supported asset types against the capability contract.

    Returns one row per (rule, supported asset type, inferred action type).
    """
    rows: list[dict[str, Any]] = []
    metadata = rule.metadata
    category = metadata.category
    supported = metadata.supported_asset_types

    if not supported:
        # Empty supported list means the rule claims to support all asset types;
        # in practice the current rule set specifies types explicitly.
        rows.append(
            {
                "rule_id": rule.rule_id,
                "rule_name": metadata.name,
                "rule_version": metadata.version_string,
                "category": category.value,
                "asset_type": "*",
                "action_type": None,
                "actionability": Actionability.UNSUPPORTED.value,
                "reason": "Rule does not declare supported asset types",
            }
        )
        return rows

    for asset_type_value in supported:
        try:
            asset_type = AssetType(asset_type_value)
        except ValueError:
            rows.append(
                {
                    "rule_id": rule.rule_id,
                    "rule_name": metadata.name,
                    "rule_version": metadata.version_string,
                    "category": category.value,
                    "asset_type": asset_type_value,
                    "action_type": None,
                    "actionability": Actionability.UNSUPPORTED.value,
                    "reason": f"Unknown asset type: {asset_type_value}",
                }
            )
            continue

        action_type = contract.infer_action_type(category, asset_type)
        if action_type is None:
            rows.append(
                {
                    "rule_id": rule.rule_id,
                    "rule_name": metadata.name,
                    "rule_version": metadata.version_string,
                    "category": category.value,
                    "asset_type": asset_type.value,
                    "action_type": None,
                    "actionability": Actionability.UNSUPPORTED.value,
                    "reason": "No supported action type for this category/asset combination",
                }
            )
            continue

        actionability = contract.resolve(
            category=category,
            asset_type=asset_type,
            action_type_value=action_type,
            safety=_ideal_safe_assessment(),
            fixability=Fixability.AUTO_FIXABLE,
            rule_capability=RuleCapability.REMEDIATION_AVAILABLE,
        )

        rows.append(
            {
                "rule_id": rule.rule_id,
                "rule_name": metadata.name,
                "rule_version": metadata.version_string,
                "category": category.value,
                "asset_type": asset_type.value,
                "action_type": action_type,
                "actionability": actionability.value,
                "reason": "Best-case audit resolution",
            }
        )

    return rows


def audit_registry(
    registry: RuleRegistry,
    contract: Optional[CapabilityContract] = None,
) -> list[dict[str, Any]]:
    """Audit all enabled rules in a registry and return the full matrix."""
    if contract is None:
        contract = CapabilityContract()

    rows: list[dict[str, Any]] = []
    for rule in registry.list_enabled():
        rows.extend(audit_rule(rule, contract))
    return rows


def coverage_statistics(
    registry: RuleRegistry,
    contract: Optional[CapabilityContract] = None,
) -> dict[str, Any]:
    """Compute coverage statistics for a registry against the contract."""
    rows = audit_registry(registry, contract)
    counter = Counter(row["actionability"] for row in rows)

    total_rules = len(registry.list_enabled())
    actionable = counter[Actionability.ACTIONABLE.value]
    detection_only = counter[Actionability.DETECTION_ONLY.value]
    review_required = counter[Actionability.REVIEW_REQUIRED.value]
    blocked = counter[Actionability.BLOCKED.value]
    unsupported = counter[Actionability.UNSUPPORTED.value]

    supported_action_types = sorted(
        {action_type for (_, _, action_type), _ in DEFAULT_CAPABILITY_MATRIX.items()}
    )
    findings_with_no_executor = [
        row
        for row in rows
        if row["actionability"]
        in (Actionability.UNSUPPORTED.value, Actionability.DETECTION_ONLY.value)
    ]

    return {
        "total_rules": total_rules,
        "total_rows": len(rows),
        "actionable": actionable,
        "detection_only": detection_only,
        "review_required": review_required,
        "blocked": blocked,
        "unsupported": unsupported,
        "supported_action_types": supported_action_types,
        "supported_action_type_count": len(supported_action_types),
        "findings_with_no_executor_count": len(findings_with_no_executor),
        "findings_with_no_executor": findings_with_no_executor,
        "matrix": rows,
    }


def format_matrix_row(row: dict[str, Any]) -> str:
    """Format a single matrix row as a pipe-delimited table row."""
    return (
        f"| {row['rule_id']:<30} | {row['category']:<12} | {row['asset_type']:<20} | "
        f"{str(row['action_type']):<25} | {row['actionability']:<18} |"
    )


def format_coverage_report(stats: dict[str, Any]) -> str:
    """Format coverage statistics and matrix as a Markdown string."""
    lines = [
        "## Actionability Coverage",
        "",
        f"- Total registered rules: {stats['total_rules']}",
        f"- Total (rule x asset type) rows: {stats['total_rows']}",
        f"- Actionable rows: {stats['actionable']}",
        f"- Detection-only rows: {stats['detection_only']}",
        f"- Review-required rows: {stats['review_required']}",
        f"- Blocked rows: {stats['blocked']}",
        f"- Unsupported rows: {stats['unsupported']}",
        f"- Supported ActionType values: {stats['supported_action_type_count']}",
        f"- Rows with no executable action: {stats['findings_with_no_executor_count']}",
        "",
        "### Supported ActionTypes",
        "",
    ]
    for action_type in stats["supported_action_types"]:
        lines.append(f"- `{action_type}`")
    lines.append("")
    lines.append("### Rule x AssetType x ActionType Matrix")
    lines.append("")
    lines.append("| Rule ID | Category | Asset Type | Action Type | Actionability |")
    lines.append("|---------|----------|------------|-------------|---------------|")
    for row in stats["matrix"]:
        lines.append(format_matrix_row(row))
    lines.append("")
    if stats["findings_with_no_executor"]:
        lines.append("### Findings with no executable action")
        lines.append("")
        for row in stats["findings_with_no_executor"]:
            lines.append(
                f"- `{row['rule_id']}` ({row['rule_name']}) / {row['asset_type']}: {row['reason']}"
            )
        lines.append("")

    return "\n".join(lines)
