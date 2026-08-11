"""GPU shader cache cleaner.

Scans shader cache directories used by DirectX, NVIDIA, and AMD drivers.
These caches are regenerated automatically by the GPU driver when needed,
so deleting them is safe and can recover significant disk space on
gaming PCs (shader caches can grow to several GB).

Roots:
  * DirectX Shader Cache: %LOCALAPPDATA%\\D3DSCache
  * NVIDIA DX Cache: %LOCALAPPDATA%\\NVIDIA\\DXCache
  * NVIDIA GL Cache: %LOCALAPPDATA%\\NVIDIA\\GLCache
  * NVIDIA Compute Cache: %LOCALAPPDATA%\\NVIDIA\\ComputeCache
  * AMD DX Cache: %LOCALAPPDATA%\\AMD\\DxCache
  * AMD GL Cache: %LOCALAPPDATA%\\AMD\\GLCache
  * AMD Dxc Cache: %LOCALAPPDATA%\\AMD\\DxcCache
"""

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ..interfaces import CleanerCategory
from ..scanner_base import BaseCleaner, expand


class ShaderCacheCleaner(BaseCleaner):
    id = "shader-cache"
    name = "GPU Shader Cache"
    description = (
        "DirectX, NVIDIA, and AMD shader caches — regenerated automatically "
        "by GPU drivers. Safe to delete and can recover significant space."
    )
    category = CleanerCategory.APPLICATIONS

    def targets(self) -> Iterable[Path]:
        roots: list[Path] = []
        candidates = [
            r"%LOCALAPPDATA%\D3DSCache",
            r"%LOCALAPPDATA%\NVIDIA\DXCache",
            r"%LOCALAPPDATA%\NVIDIA\GLCache",
            r"%LOCALAPPDATA%\NVIDIA\ComputeCache",
            r"%LOCALAPPDATA%\AMD\DxCache",
            r"%LOCALAPPDATA%\AMD\GLCache",
            r"%LOCALAPPDATA%\AMD\DxcCache",
        ]
        for template in candidates:
            p = expand(template)
            if p.exists():
                roots.append(p)
        return roots
