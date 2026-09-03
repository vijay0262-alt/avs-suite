"""AMSI Scanner — Windows Anti-Malware Scan Interface integration.

AMSI (Anti-Malware Scan Interface) is a Windows generic interface standard
that allows applications and services to integrate with any anti-malware
product present on a machine. This module:

  - Loads ``amsi.dll`` via ctypes
  - Initializes an AMSI session
  - Scans script content (PowerShell, JavaScript, VBScript, etc.) for malware
  - Delegates scanning to the installed anti-malware provider (e.g. Defender)
  - Reports detection results back to the threat engine

AMSI is only available on Windows. On non-Windows platforms or older Windows
versions where ``amsi.dll`` is not present, the scanner gracefully degrades
and reports that AMSI is unavailable.
"""

from __future__ import annotations

import ctypes
import logging
import os
import platform
from typing import Any

log = logging.getLogger("avs.threat_engine.amsi_scanner")

IS_WINDOWS = platform.system() == "Windows"

# AMSI result constants
AMSI_RESULT_CLEAN = 0
AMSI_RESULT_NOT_DETECTED = 1
AMSI_RESULT_BLOCKED_BY_ADMIN_START = 16384
AMSI_RESULT_BLOCKED_BY_ADMIN_END = 20479
AMSI_RESULT_DETECTED = 32768

# Script file extensions that AMSI can scan
_SCRIPT_EXTENSIONS = {
    ".ps1", ".js", ".vbs", ".hta", ".bat", ".cmd", ".wsf", ".jse", ".py",
}

# AMSI session identifier (GUID-like opaque handle)
AMSI_SESSION = 0


# ---------------------------------------------------------------------------
# ctypes definitions for the AMSI API
# ---------------------------------------------------------------------------

if IS_WINDOWS:
    class AMSI_RESULT(ctypes.c_int):
        """AMSI scan result enumeration."""

    # Function prototypes
    _AmsiInitializeProto = ctypes.WINFUNCTYPE(
        ctypes.HRESULT, ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_void_p)
    )
    _AmsiOpenSessionProto = ctypes.WINFUNCTYPE(
        ctypes.HRESULT, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)
    )
    _AmsiScanBufferProto = ctypes.WINFUNCTYPE(
        ctypes.HRESULT,
        ctypes.c_void_p,            # amsiContext
        ctypes.POINTER(ctypes.c_byte),  # buffer
        ctypes.c_ulong,             # length
        ctypes.c_wchar_p,           # contentName
        ctypes.c_void_p,            # session
        ctypes.POINTER(AMSI_RESULT),  # result
    )
    _AmsiCloseSessionProto = ctypes.WINFUNCTYPE(
        None, ctypes.c_void_p, ctypes.c_void_p
    )
    _AmsiUninitializeProto = ctypes.WINFUNCTYPE(
        None, ctypes.c_void_p
    )
else:
    AMSI_RESULT = None  # type: ignore[assignment,misc]


# Module-level handle cache so we only load the DLL once
_amsi_dll: Any = None
_amsi_context: Any = None
_amsi_initialized: bool = False
_amsi_init_attempted: bool = False


def _load_amsi() -> bool:
    """Load amsi.dll and initialize the AMSI context.

    Returns True if AMSI is available and initialized, False otherwise.
    """
    global _amsi_dll, _amsi_context, _amsi_initialized, _amsi_init_attempted

    if _amsi_init_attempted:
        return _amsi_initialized

    _amsi_init_attempted = True

    if not IS_WINDOWS:
        log.info("AMSI not available — platform is not Windows")
        return False

    try:
        _amsi_dll = ctypes.windll.amsi  # type: ignore[attr-defined]

        # AmsiInitialize(appName, amsiContext)
        _amsi_dll.AmsiInitialize.restype = ctypes.HRESULT
        _amsi_dll.AmsiInitialize.argtypes = [
            ctypes.c_wchar_p,
            ctypes.POINTER(ctypes.c_void_p),
        ]

        # AmsiOpenSession(amsiContext, session)
        _amsi_dll.AmsiOpenSession.restype = ctypes.HRESULT
        _amsi_dll.AmsiOpenSession.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_void_p),
        ]

        # AmsiScanBuffer(amsiContext, buffer, length, contentName, session, result)
        _amsi_dll.AmsiScanBuffer.restype = ctypes.HRESULT
        _amsi_dll.AmsiScanBuffer.argtypes = [
            ctypes.c_void_p,
            ctypes.POINTER(ctypes.c_byte),
            ctypes.c_ulong,
            ctypes.c_wchar_p,
            ctypes.c_void_p,
            ctypes.POINTER(AMSI_RESULT),
        ]

        # AmsiCloseSession(amsiContext, session)
        _amsi_dll.AmsiCloseSession.restype = None
        _amsi_dll.AmsiCloseSession.argtypes = [ctypes.c_void_p, ctypes.c_void_p]

        # AmsiUninitialize(amsiContext)
        _amsi_dll.AmsiUninitialize.restype = None
        _amsi_dll.AmsiUninitialize.argtypes = [ctypes.c_void_p]

        context = ctypes.c_void_p()
        hr = _amsi_dll.AmsiInitialize("AVS AI Shield", ctypes.byref(context))
        if hr != 0 or not context.value:
            log.warning("AmsiInitialize failed: HRESULT 0x%08x", hr & 0xFFFFFFFF)
            _amsi_dll = None
            return False

        _amsi_context = context
        _amsi_initialized = True
        log.info("AMSI initialized successfully")
        return True

    except OSError as e:
        log.info("AMSI not available — amsi.dll could not be loaded: %s", e)
        _amsi_dll = None
        return False
    except Exception as e:
        log.warning("AMSI initialization error: %s", e)
        _amsi_dll = None
        return False


def is_amsi_available() -> bool:
    """Check if AMSI is available on this system."""
    return _load_amsi()


def _result_is_malicious(result: int) -> bool:
    """Determine if an AMSI result indicates malicious content."""
    return result >= AMSI_RESULT_DETECTED or result >= AMSI_RESULT_BLOCKED_BY_ADMIN_START


class AmsiScanner:
    """Windows AMSI (Anti-Malware Scan Interface) scanner.

    Scans script content (PowerShell, JavaScript, VBScript, etc.) using the
    installed anti-malware provider via the Windows AMSI API.
    """

    name = "amsi"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.available = _load_amsi()

        if not self.available:
            log.info("AmsiScanner initialized — AMSI not available")
        else:
            log.info("AmsiScanner initialized — AMSI ready")

    def _scan_buffer(self, content: bytes, content_name: str) -> dict[str, Any] | None:
        """Internal: scan a bytes buffer through AMSI."""
        if not self.available or _amsi_dll is None or _amsi_context is None:
            return None

        if not content:
            return {"detected": False}

        try:
            # Open a session
            session = ctypes.c_void_p()
            hr = _amsi_dll.AmsiOpenSession(
                _amsi_context, ctypes.byref(session)
            )
            if hr != 0 or not session.value:
                log.debug("AmsiOpenSession failed: HRESULT 0x%08x", hr & 0xFFFFFFFF)
                return None

            try:
                result = AMSI_RESULT(AMSI_RESULT_CLEAN)
                buffer = (ctypes.c_byte * len(content)).from_buffer_copy(content)

                hr = _amsi_dll.AmsiScanBuffer(
                    _amsi_context,
                    buffer,
                    ctypes.c_ulong(len(content)),
                    content_name,
                    session,
                    ctypes.byref(result),
                )

                if hr != 0:
                    log.debug("AmsiScanBuffer failed: HRESULT 0x%08x", hr & 0xFFFFFFFF)
                    return None

                scan_result = int(result.value)

                if _result_is_malicious(scan_result):
                    return {
                        "detected": True,
                        "threat_name": self._threat_name_for_result(scan_result),
                        "threat_type": "script",
                        "severity": "high",
                        "confidence": 0.9,
                        "details": {
                            "amsi_result": scan_result,
                            "content_name": content_name,
                            "source": "amsi",
                        },
                    }

                return {"detected": False}

            finally:
                _amsi_dll.AmsiCloseSession(_amsi_context, session)

        except Exception as e:
            log.debug("AMSI scan error for %s: %s", content_name, e)
            return None

    @staticmethod
    def _threat_name_for_result(result: int) -> str:
        """Map an AMSI result code to a human-readable threat name."""
        if result >= AMSI_RESULT_DETECTED:
            return f"AMSI.Detected.{result}"
        if AMSI_RESULT_BLOCKED_BY_ADMIN_START <= result <= AMSI_RESULT_BLOCKED_BY_ADMIN_END:
            return "AMSI.BlockedByAdmin"
        return f"AMSI.Result.{result}"

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a script file through AMSI.

        Only scans files with script extensions (.ps1, .js, .vbs, .hta, .bat,
        .cmd, .wsf, .jse, .py). Returns ``None`` if the file cannot be scanned
        or AMSI is unavailable.
        """
        if not self.available:
            return None

        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            return None

        ext = os.path.splitext(file_path)[1].lower()
        if ext not in _SCRIPT_EXTENSIONS:
            return None

        try:
            with open(file_path, "rb") as f:
                content = f.read()
        except Exception as e:
            log.debug("Failed to read %s: %s", file_path, e)
            return None

        content_name = os.path.basename(file_path)
        return self._scan_buffer(content, content_name)

    def scan_content(self, content: bytes, content_name: str) -> dict[str, Any] | None:
        """Scan raw script content through AMSI.

        Args:
            content: The script content as bytes.
            content_name: A name/label for the content (used by AMSI for logging).

        Returns:
            Detection result dict, or ``None`` if AMSI is unavailable.
        """
        if not self.available:
            return None

        return self._scan_buffer(content, content_name)
