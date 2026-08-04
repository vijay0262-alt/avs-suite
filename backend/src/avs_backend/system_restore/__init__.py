"""System Restore Point service.

Creates Windows System Restore Points before cleaning or optimization
operations so the user can revert if anything goes wrong.

Uses the Windows SystemRestore WMI provider via PowerShell since
``Get-COMObject SystemRestore`` requires elevated privileges and
the WMI namespace ``ROOT\\Default\\SystemRestore`` is the canonical
entry point.

On non-Windows platforms, all methods return a no-op result.
"""

from __future__ import annotations

import logging
import platform
import subprocess
from dataclasses import dataclass

log = logging.getLogger("avs.system-restore")

IS_WINDOWS = platform.system() == "Windows"


@dataclass(slots=True)
class RestorePointResult:
    success: bool
    description: str
    sequence_number: int | None = None
    error: str | None = None


def create_restore_point(description: str = "AVS Shield — Pre-cleaning checkpoint") -> RestorePointResult:
    """Create a System Restore Point.

    Requires:
      * Windows OS
      * Elevated (administrator) privileges
      * System Protection enabled on the system drive

    Returns:
        RestorePointResult with success status and sequence number.
    """
    if not IS_WINDOWS:
        return RestorePointResult(
            success=False,
            description=description,
            error="System Restore is only available on Windows",
        )

    # PowerShell command to create a restore point via WMI.
    # The SystemRestore WMI provider accepts a description and creates
    # a checkpoint with type RESTORE_POINT_APPLICATION_INSTALL (0) which
    # is the standard type for application-driven checkpoints.
    ps_script = (
        f'$desc = "{description}";'
        "try {"
        "  $sysRestore = Get-WmiObject -List -Namespace 'ROOT\\Default' -Class SystemRestore;"
        "  if ($sysRestore) {"
        "    $result = $sysRestore.CreateRestorePoint($desc, 0, 100);"
        "    if ($result.ReturnValue -eq 0) {"
        "      Write-Output ('SUCCESS:' + $result.SequenceNumber);"
        "    } else {"
        "      Write-Output ('FAILED:' + $result.ReturnValue);"
        "    }"
        "  } else {"
        "    Write-Output 'FAILED:NO_WMI_PROVIDER';"
        "  }"
        "} catch {"
        "  Write-Output ('ERROR:' + $_.Exception.Message);"
        "}"
    )

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = (result.stdout or "").strip()

        if output.startswith("SUCCESS:"):
            seq_str = output.split(":", 1)[1].strip()
            try:
                seq_num = int(seq_str)
            except ValueError:
                seq_num = None
            log.info("Restore point created: %s (seq=%s)", description, seq_num)
            return RestorePointResult(
                success=True,
                description=description,
                sequence_number=seq_num,
            )
        elif output.startswith("FAILED:"):
            reason = output.split(":", 1)[1] if ":" in output else output
            log.warning("Restore point creation failed: %s", reason)
            return RestorePointResult(
                success=False,
                description=description,
                error=f"System Restore returned: {reason}",
            )
        else:
            err_msg = output or result.stderr or "Unknown error"
            log.warning("Restore point creation error: %s", err_msg)
            return RestorePointResult(
                success=False,
                description=description,
                error=err_msg,
            )
    except subprocess.TimeoutExpired:
        log.warning("Restore point creation timed out")
        return RestorePointResult(
            success=False,
            description=description,
            error="PowerShell command timed out",
        )
    except OSError as e:
        log.warning("Restore point creation OS error: %s", e)
        return RestorePointResult(
            success=False,
            description=description,
            error=str(e),
        )


def is_system_protection_enabled() -> bool:
    """Check if System Protection is enabled on the system drive.

    Uses PowerShell to query the SystemRestore WMI provider status.
    """
    if not IS_WINDOWS:
        return False

    ps_script = (
        "try {"
        "  $sr = Get-WmiObject -Namespace 'ROOT\\Default' -Class SystemRestore;"
        "  if ($sr) { Write-Output 'ENABLED' } else { Write-Output 'DISABLED' }"
        "} catch { Write-Output 'DISABLED' }"
    )

    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
            capture_output=True,
            text=True,
            timeout=10,
        )
        output = (result.stdout or "").strip()
        return output == "ENABLED"
    except (subprocess.TimeoutExpired, OSError):
        return False


__all__ = [
    "RestorePointResult",
    "create_restore_point",
    "is_system_protection_enabled",
]

# Import RPC handlers so they register on import.
from . import rpc  # noqa: E402, F401
