"""
SC-8C2 Production Detection Rules

Detection-only rules for junk, temporary files, and safe cache data.

NO ACTION EXECUTION.
NO SYSTEM MODIFICATION.
"""

from .locations import KnownLocations
from .junk_rules import (
    UserTempRule,
    WindowsTempRule,
    ShaderCacheRule,
    ThumbnailCacheRule,
    register_junk_rules,
)

__all__ = [
    "KnownLocations",
    "UserTempRule",
    "WindowsTempRule",
    "ShaderCacheRule",
    "ThumbnailCacheRule",
    "register_junk_rules",
]
