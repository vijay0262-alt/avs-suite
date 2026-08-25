"""
V1.0 Cleanup category mapping.

Maps backend rule_ids to user-friendly cleanup category names
matching Windows Disk Cleanup style.

Used by:
- scan_core_rpc auto-optimize result (per-category breakdown)
- scan progress (current category being scanned)
- auto-optimize progress (current category being cleaned)
"""

from __future__ import annotations

# Rule ID → cleanup category display name
# Multiple rule_ids can map to the same display category.
RULE_ID_TO_CATEGORY: dict[str, str] = {
    # Temporary Files
    "junk.temp.user": "Temporary Files",
    "junk.temp.windows": "Temporary Files",
    "junk.temp.application": "Temporary Files",
    # Recycle Bin
    "junk.recycle_bin": "Recycle Bin",
    # Prefetch
    "junk.prefetch": "Prefetch",
    # Thumbnail Cache
    "cache.thumbnail": "Thumbnail Cache",
    # Shader Cache
    "cache.shader.d3d": "Shader Cache",
    "cache.shader.nvidia_dx": "Shader Cache",
    "cache.shader.nvidia_gl": "Shader Cache",
    "cache.shader.nvidia_compute": "Shader Cache",
    "cache.shader.amd_dx": "Shader Cache",
    "cache.shader.amd_gl": "Shader Cache",
    # Browser Cache
    "cache.browser": "Browser Cache",
    "cache.browser.chrome": "Browser Cache",
    "cache.browser.edge": "Browser Cache",
    "cache.browser.brave": "Browser Cache",
    "cache.browser.firefox": "Browser Cache",
    "cache.browser.opera": "Browser Cache",
    "cache.browser.vivaldi": "Browser Cache",
    # Application Cache
    "cache.application": "Application Cache",
    # Windows Update Cleanup
    "junk.windows_update": "Windows Update Cleanup",
    "cache.windows_update": "Windows Update Cleanup",
    # Delivery Optimization
    "cache.delivery_optimization": "Delivery Optimization",
    # Windows Error Reporting / Crash Dumps
    "junk.crash_dump": "Windows Error Reporting",
    "junk.wer": "Windows Error Reporting",
    # Memory Dumps
    "junk.memory_dump": "Memory Dumps",
    # Windows.old
    "junk.windows_old": "Windows.old",
    # Downloaded Program Files
    "junk.downloaded_program_files": "Downloaded Program Files",
    # Offline Web Pages
    "junk.offline_web_pages": "Offline Web Pages",
    # Font Cache
    "cache.font_cache": "Font Cache",
    # BranchCache
    "cache.branch_cache": "BranchCache",
    # Retail Demo
    "junk.retail_demo": "Retail Demo",
    # Installer Patch Cache
    "junk.installer_patch_cache": "Installer Patch Cache",
}

# Ordered list of categories for display
CATEGORY_ORDER: list[str] = [
    "Temporary Files",
    "Browser Cache",
    "Windows Cleanup",
    "Recycle Bin",
    "Prefetch",
    "Shader Cache",
    "Thumbnail Cache",
    "Windows Update Cleanup",
    "Delivery Optimization",
    "Windows Error Reporting",
    "Memory Dumps",
    "Application Cache",
    "Downloaded Program Files",
    "Offline Web Pages",
    "Font Cache",
    "BranchCache",
    "Retail Demo",
    "Installer Patch Cache",
    "Windows.old",
    "Other Safe Cleanup",
]


def rule_id_to_category(rule_id: str) -> str:
    """Map a rule_id to a user-friendly cleanup category name.

    If the rule_id is not in the mapping, try prefix matching:
    - "junk.temp.*" → "Temporary Files"
    - "cache.browser.*" → "Browser Cache"
    - "cache.shader.*" → "Shader Cache"
    - "junk.*" → "Windows Cleanup"
    - "cache.*" → "Other Safe Cleanup"

    Returns "Other Safe Cleanup" as the fallback.
    """
    if rule_id in RULE_ID_TO_CATEGORY:
        return RULE_ID_TO_CATEGORY[rule_id]

    # Try prefix matching
    if rule_id.startswith("junk.temp."):
        return "Temporary Files"
    if rule_id.startswith("cache.browser."):
        return "Browser Cache"
    if rule_id.startswith("cache.shader."):
        return "Shader Cache"
    if rule_id.startswith("junk."):
        return "Windows Cleanup"
    if rule_id.startswith("cache."):
        return "Other Safe Cleanup"

    return "Other Safe Cleanup"


def category_order_index(category: str) -> int:
    """Get the sort order index for a category. Lower = earlier in display."""
    try:
        return CATEGORY_ORDER.index(category)
    except ValueError:
        return len(CATEGORY_ORDER)
