"""
SC-8C2 Production Detection Rules

Detection-only rules for junk, temporary files, and safe cache data.

NO ACTION EXECUTION.
NO SYSTEM MODIFICATION.
"""

from .junk_rules import (
    ShaderCacheRule,
    ThumbnailCacheRule,
    UserTempRule,
    WindowsTempRule,
    register_junk_rules,
)
from .junk_rules_ext import (
    ApplicationCacheRule,
    ApplicationTempRule,
    BrowserCacheRule,
    InstallerCacheRule,
    WindowsUpdateCacheRule,
)
from .locations import KnownLocations
from .safety_policy import SafetyPolicy

__all__ = [
    "KnownLocations",
    "SafetyPolicy",
    # Original rules
    "UserTempRule",
    "WindowsTempRule",
    "ShaderCacheRule",
    "ThumbnailCacheRule",
    # Extended rules
    "ApplicationTempRule",
    "BrowserCacheRule",
    "InstallerCacheRule",
    "WindowsUpdateCacheRule",
    "ApplicationCacheRule",
    # Registration
    "register_junk_rules",
]
