"""Unified Health Model — single source of truth for all health scores.

Every page (Dashboard, AI Smart Optimize, AI Protection Center) reads from
this model. No page calculates its own score.

Score Hierarchy:
  Overall Health   = Optimization + Protection + Hardware
  Optimization     = optimization modules only
  Protection       = security modules + optimization baseline
  Performance      = performance modules only
  Storage          = storage modules only

Scan Profiles:
  dashboard  = all modules (optimization + security + health)
  optimize   = optimization modules only
  protection = security modules + essential optimization checks
"""

from __future__ import annotations

from typing import Any

# ── Module Categories ────────────────────────────────────────────────

ALL_MODULES = [
    "junk",
    "privacy",
    "registry",
    "startup",
    "performance",
    "disk",
    "security",
    "system",
]

OPTIMIZATION_MODULES = [
    "junk",
    "privacy",
    "registry",
    "startup",
    "performance",
    "disk",
]

SECURITY_MODULES = [
    "security",
    "system",
]

PERFORMANCE_MODULES = [
    "performance",
]

STORAGE_MODULES = [
    "disk",
    "junk",
]

# Essential optimization checks included in the protection profile
# (a dirty system can affect security)
ESSENTIAL_OPTIMIZATION_FOR_PROTECTION = [
    "junk",
    "privacy",
    "registry",
]

# ── Scan Profiles ────────────────────────────────────────────────────

SCAN_PROFILES: dict[str, list[str]] = {
    "dashboard": ALL_MODULES,
    "optimize": OPTIMIZATION_MODULES,
    "protection": SECURITY_MODULES + ESSENTIAL_OPTIMIZATION_FOR_PROTECTION,
}


def get_profile_modules(profile: str | None) -> list[str]:
    """Return the module list for a scan profile.

    Defaults to 'dashboard' (all modules) if profile is not specified.
    """
    if not profile or profile not in SCAN_PROFILES:
        return SCAN_PROFILES["dashboard"]
    return SCAN_PROFILES[profile]


def get_optimize_modules(profile: str | None) -> list[str]:
    """Return the modules that should be optimized for a given profile.

    - dashboard: all auto-fixable modules
    - optimize: optimization modules that can auto-fix
    - protection: essential optimization modules that can auto-fix
    """
    profile_modules = get_profile_modules(profile)
    # Only modules that can auto-fix
    auto_fixable = {"junk", "privacy", "registry", "startup", "performance"}
    return [m for m in profile_modules if m in auto_fixable]


# ── Health Model Calculation ─────────────────────────────────────────


def _avg(scores: list[int]) -> int:
    """Calculate integer average of a list of scores."""
    if not scores:
        return 100
    return int(sum(scores) / len(scores))


def calculate_health_model(
    module_scores: dict[str, int],
    module_issues: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Calculate the unified health model from per-module scores.

    Args:
        module_scores: moduleId → 0-100 score
        module_issues: moduleId → issue count (optional, for metadata)

    Returns:
        dict with:
          overallHealth: int
          optimizationScore: int
          protectionScore: int
          performanceScore: int
          storageScore: int
          hardwareHealth: int
          moduleScores: dict[str, int] (echoed back)
          moduleIssues: dict[str, int] (echoed back if provided)
    """
    if module_issues is None:
        module_issues = {}

    # Optimization score: average of optimization module scores
    opt_scores = [module_scores.get(m, 100) for m in OPTIMIZATION_MODULES if m in module_scores]
    optimization_score = _avg(opt_scores)

    # Protection score: security modules + optimization baseline
    # Security takes priority — weight security 60%, optimization 40%
    sec_scores = [module_scores.get(m, 100) for m in SECURITY_MODULES if m in module_scores]
    sec_avg = _avg(sec_scores)
    # Use optimization baseline (junk, privacy, registry) as a sub-score
    essential_opt = [module_scores.get(m, 100) for m in ESSENTIAL_OPTIMIZATION_FOR_PROTECTION if m in module_scores]
    essential_opt_avg = _avg(essential_opt)

    if sec_scores and essential_opt:
        protection_score = int(sec_avg * 0.6 + essential_opt_avg * 0.4)
    elif sec_scores:
        protection_score = sec_avg
    elif essential_opt:
        protection_score = essential_opt_avg
    else:
        protection_score = 100

    # Performance score: performance module only
    perf_scores = [module_scores.get(m, 100) for m in PERFORMANCE_MODULES if m in module_scores]
    performance_score = _avg(perf_scores)

    # Storage score: storage modules only
    storage_scores_list = [module_scores.get(m, 100) for m in STORAGE_MODULES if m in module_scores]
    storage_score = _avg(storage_scores_list)

    # Hardware health: system module score
    hardware_health = module_scores.get("system", 95)

    # Overall health: weighted average
    # Optimization 40%, Protection 40%, Hardware 20%
    overall = int(
        optimization_score * 0.4 +
        protection_score * 0.4 +
        hardware_health * 0.2
    )

    return {
        "overallHealth": overall,
        "optimizationScore": optimization_score,
        "protectionScore": protection_score,
        "performanceScore": performance_score,
        "storageScore": storage_score,
        "hardwareHealth": hardware_health,
        "moduleScores": dict(module_scores),
        "moduleIssues": dict(module_issues),
    }


def calculate_after_health_model(
    before_model: dict[str, Any],
    module_scores_after: dict[str, int],
    module_issues_after: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Calculate the post-optimization health model.

    Uses the same formula as calculate_health_model but with after-scores.
    Also includes before/after delta for each score.
    """
    if module_issues_after is None:
        module_issues_after = {}

    after = calculate_health_model(module_scores_after, module_issues_after)

    # Add deltas
    after["overallBefore"] = before_model.get("overallHealth", 0)
    after["overallAfter"] = after["overallHealth"]
    after["optimizationBefore"] = before_model.get("optimizationScore", 0)
    after["optimizationAfter"] = after["optimizationScore"]
    after["protectionBefore"] = before_model.get("protectionScore", 0)
    after["protectionAfter"] = after["protectionScore"]
    after["performanceBefore"] = before_model.get("performanceScore", 0)
    after["performanceAfter"] = after["performanceScore"]
    after["storageBefore"] = before_model.get("storageScore", 0)
    after["storageAfter"] = after["storageScore"]

    return after
