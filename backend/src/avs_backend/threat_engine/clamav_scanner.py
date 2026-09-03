"""ClamAV Scanner — signature-based malware detection via the ClamAV daemon.

ClamAV is an open-source antivirus engine that provides signature-based
detection for viruses, trojans, and other malware. This module communicates
with the ClamAV daemon (clamd) to perform file scanning.

This module:
  - Connects to clamd via the clamd Python package or raw socket fallback
  - Supports scanning individual files via the INSTREAM command
  - Supports scanning all files in a directory
  - Parses ClamAV detection results (virus name, status)
  - Triggers freshclam to update signature databases

ClamAV is optional — if clamd is not running or the clamd package is not
installed, the scanner gracefully degrades and reports that ClamAV is
unavailable.
"""

from __future__ import annotations

import hashlib
import logging
import os
import socket
import subprocess
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.threat_engine.clamav_scanner")

# Default clamd connection endpoints
if sys.platform == "win32":
    _DEFAULT_UNIX_SOCKET = r"C:\Program Files\ClamAV\clamd.sock"
else:
    _DEFAULT_UNIX_SOCKET = "/var/run/clamd.sock"
_DEFAULT_TCP_HOST = "localhost"
_DEFAULT_TCP_PORT = 3310

# Try to import the clamd Python package
try:
    import clamd  # type: ignore
    CLAMD_PACKAGE_AVAILABLE = True
    log.info("clamd Python package available")
except ImportError:
    CLAMD_PACKAGE_AVAILABLE = False
    log.info("clamd Python package not available — will use raw socket fallback")


def _compute_sha256(file_path: str) -> str | None:
    """Compute the SHA-256 hash of a file."""
    try:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def _connect_raw_socket(
    unix_socket: str | None = None,
    tcp_host: str | None = None,
    tcp_port: int | None = None,
) -> socket.socket | None:
    """Try to connect to clamd via raw socket (Unix or TCP)."""
    unix_path = unix_socket or _DEFAULT_UNIX_SOCKET
    host = tcp_host or _DEFAULT_TCP_HOST
    port = tcp_port or _DEFAULT_TCP_PORT

    # Try Unix socket first (if not Windows)
    if sys.platform != "win32" and os.path.exists(unix_path):
        try:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect(unix_path)
            log.debug("Connected to clamd via Unix socket: %s", unix_path)
            return sock
        except Exception as e:
            log.debug("Failed to connect to Unix socket %s: %s", unix_path, e)

    # On Windows, try the default socket path as well
    if sys.platform == "win32" and os.path.exists(unix_path):
        try:
            sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            sock.settimeout(10)
            sock.connect(unix_path)
            log.debug("Connected to clamd via Unix socket: %s", unix_path)
            return sock
        except Exception as e:
            log.debug("Failed to connect to Windows Unix socket %s: %s", unix_path, e)

    # Fall back to TCP
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        sock.connect((host, port))
        log.debug("Connected to clamd via TCP %s:%d", host, port)
        return sock
    except Exception as e:
        log.debug("Failed to connect to clamd via TCP %s:%d: %s", host, port, e)

    return None


def _get_clamd_client(
    unix_socket: str | None = None,
    tcp_host: str | None = None,
    tcp_port: int | None = None,
) -> Any | None:
    """Get a clamd client object, trying the Python package first, then raw socket."""
    unix_path = unix_socket or _DEFAULT_UNIX_SOCKET
    host = tcp_host or _DEFAULT_TCP_HOST
    port = tcp_port or _DEFAULT_TCP_PORT

    # Try the clamd Python package first
    if CLAMD_PACKAGE_AVAILABLE:
        # Try Unix socket
        if os.path.exists(unix_path):
            try:
                client = clamd.ClamdUnixSocket(file_name=unix_path)
                client.ping()
                log.debug("clamd package connected via Unix socket: %s", unix_path)
                return client
            except Exception as e:
                log.debug("clamd package Unix socket failed: %s", e)

        # Try TCP
        try:
            client = clamd.ClamdNetworkSocket(host=host, port=port)
            client.ping()
            log.debug("clamd package connected via TCP %s:%d", host, port)
            return client
        except Exception as e:
            log.debug("clamd package TCP failed: %s", e)

    # Fall back to raw socket
    sock = _connect_raw_socket(unix_path, host, port)
    if sock is not None:
        return _RawSocketClamd(sock)

    return None


class _RawSocketClamd:
    """Minimal clamd-compatible client using raw sockets.

    This is a fallback when the clamd Python package is not installed.
    It implements the clamd protocol commands needed for scanning.
    """

    def __init__(self, sock: socket.socket):
        self._sock = sock

    def _send_command(self, command: str) -> str:
        """Send a command to clamd and return the response as a string."""
        try:
            # clamd protocol uses 'z' prefix for null-terminated commands
            self._sock.sendall(b"z" + command.encode("utf-8") + b"\x00")
            response = b""
            while True:
                chunk = self._sock.recv(4096)
                if not chunk:
                    break
                response += chunk
                if b"\x00" in chunk:
                    break
            # Strip trailing null byte
            return response.rstrip(b"\x00").decode("utf-8", errors="replace").strip()
        except Exception as e:
            log.debug("clamd raw socket command '%s' failed: %s", command, e)
            raise

    def ping(self) -> bool:
        """Check if clamd is responsive."""
        try:
            resp = self._send_command("PING")
            return "PONG" in resp
        except Exception:
            return False

    def version(self) -> str:
        """Get the ClamAV version string."""
        return self._send_command("VERSION")

    def instream(self, file_path: str) -> tuple[str, str]:
        """Stream a file to clamd via INSTREAM and return (filename, result)."""
        try:
            # Open a fresh connection for INSTREAM (clamd closes after response)
            self._sock.sendall(b"zINSTREAM\x00")
            with open(file_path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    # Send chunk length (4-byte big-endian) + data
                    import struct
                    self._sock.sendall(struct.pack("!L", len(chunk)) + chunk)
            # Send zero-length chunk to signal end of stream
            import struct
            self._sock.sendall(struct.pack("!L", 0))

            response = b""
            while True:
                data = self._sock.recv(4096)
                if not data:
                    break
                response += data
                if b"\x00" in data:
                    break

            result = response.rstrip(b"\x00").decode("utf-8", errors="replace").strip()
            # Format: "stream: OK" or "stream: VirusName FOUND"
            return "stream", result
        except Exception as e:
            log.debug("clamd INSTREAM failed for %s: %s", file_path, e)
            raise

    def close(self) -> None:
        """Close the socket connection."""
        try:
            self._sock.close()
        except Exception:
            pass


def check_clamav_available() -> bool:
    """Check if the ClamAV daemon (clamd) is running and responsive.

    Returns:
        True if clamd is reachable and responds to PING, False otherwise.
    """
    client = _get_clamd_client()
    if client is None:
        return False
    try:
        if hasattr(client, "ping"):
            result = client.ping()
            # clamd package returns a dict like {"ping": "PONG"} on success
            if isinstance(result, dict):
                return "PONG" in str(result.values())
            return bool(result)
        return False
    except Exception:
        return False
    finally:
        if isinstance(client, _RawSocketClamd):
            client.close()


def get_clamav_version() -> str | None:
    """Get the ClamAV version string from clamd.

    Returns:
        The version string (e.g. "ClamAV 1.0.1/...") or None if unavailable.
    """
    client = _get_clamd_client()
    if client is None:
        return None
    try:
        if hasattr(client, "version"):
            result = client.version()
            # clamd package returns a dict like {"version": "ClamAV 1.0.1/..."}
            if isinstance(result, dict):
                return str(next(iter(result.values()), ""))
            return str(result)
        return None
    except Exception:
        return None
    finally:
        if isinstance(client, _RawSocketClamd):
            client.close()


def get_clamav_signature_count() -> int:
    """Get the number of signatures loaded by clamd.

    Parses the VERSION response which has the format:
        ClamAV 1.0.1/27118/Tue Jan 14 09:30:00 2025

    The number after the first '/' is the combined signature count
    from main.cvd and daily.cvd.

    Returns:
        The signature count, or 0 if clamd is unavailable or parsing fails.
    """
    version = get_clamav_version()
    if not version:
        return 0
    try:
        # Format: "ClamAV <version>/<sig_count>/<date>"
        parts = version.split("/")
        if len(parts) >= 2:
            # The sig count is the first number after the version
            sig_part = parts[1].strip()
            # Some versions have format like "27118" or "27118/Tue..."
            sig_str = sig_part.split("/")[0].split()[0]
            return int(sig_str)
    except (ValueError, IndexError):
        pass
    return 0


def detect_clamav_installation() -> dict[str, Any]:
    """Detect whether ClamAV is installed on this system.

    Checks common installation paths for clamd, freshclam, and the
    ClamAV configuration directory. Also checks if clamd is currently
    running and responsive.

    Returns:
        A dict with keys:
            - installed: bool — whether ClamAV binaries are found
            - clamd_running: bool — whether clamd is reachable
            - clamd_path: str | None — path to clamd binary
            - freshclam_path: str | None — path to freshclam binary
            - conf_path: str | None — path to clamd.conf
            - version: str | None — clamd version string if running
            - signature_count: int — number of loaded signatures
            - db_path: str | None — path to signature database directory
    """
    result: dict[str, Any] = {
        "installed": False,
        "clamd_running": False,
        "clamd_path": None,
        "freshclam_path": None,
        "conf_path": None,
        "version": None,
        "signature_count": 0,
        "db_path": None,
    }

    # Common ClamAV installation paths on Windows
    if sys.platform == "win32":
        # Include the AVS AI Shield portable install path
        _avs_path = os.path.join(os.environ.get("LOCALAPPDATA", ""), "AVS AI Shield", "clamav")
        # Detect packaged ClamAV (electron-builder extraResources → resources/clamav)
        _packaged_clamav = None
        if getattr(sys, "frozen", False):
            # PyInstaller exe: siblings of the exe in the bundle
            _exe_dir = os.path.dirname(sys.executable)
            _packaged_clamav = os.path.join(_exe_dir, "clamav")
            if not os.path.isdir(_packaged_clamav):
                _packaged_clamav = None
        bin_dirs = [
            r"C:\Program Files\ClamAV",
            r"C:\Program Files (x86)\ClamAV",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "ClamAV"),
            _avs_path,
        ]
        if _packaged_clamav:
            bin_dirs.insert(0, _packaged_clamav)
        conf_candidates = [
            r"C:\Program Files\ClamAV\clamd.conf",
            r"C:\Program Files (x86)\ClamAV\clamd.conf",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "ClamAV", "clamd.conf"),
            os.path.join(_avs_path, "clamd.conf"),
        ]
        if _packaged_clamav:
            conf_candidates.insert(0, os.path.join(_packaged_clamav, "clamd.conf"))
        db_candidates = [
            r"C:\Program Files\ClamAV\db",
            r"C:\Program Files (x86)\ClamAV\db",
            os.path.join(os.environ.get("LOCALAPPDATA", ""), "ClamAV", "db"),
            os.path.join(_avs_path, "db"),
        ]
        if _packaged_clamav:
            db_candidates.insert(0, os.path.join(_packaged_clamav, "db"))
    else:
        bin_dirs = ["/usr/bin", "/usr/local/bin", "/opt/clamav/bin"]
        conf_candidates = ["/etc/clamav/clamd.conf", "/usr/local/etc/clamd.conf"]
        db_candidates = ["/var/lib/clamav", "/usr/local/share/clamav"]

    # Find clamd binary
    for d in bin_dirs:
        clamd_path = os.path.join(d, "clamd.exe" if sys.platform == "win32" else "clamd")
        if os.path.isfile(clamd_path):
            result["clamd_path"] = clamd_path
            result["installed"] = True
            break

    # Find freshclam binary
    for d in bin_dirs:
        fc_path = os.path.join(d, "freshclam.exe" if sys.platform == "win32" else "freshclam")
        if os.path.isfile(fc_path):
            result["freshclam_path"] = fc_path
            result["installed"] = True
            break

    # Find config file
    for c in conf_candidates:
        if os.path.isfile(c):
            result["conf_path"] = c
            break

    # Find database directory
    for d in db_candidates:
        if os.path.isdir(d):
            result["db_path"] = d
            break

    # Check if clamd is running
    result["clamd_running"] = check_clamav_available()
    if result["clamd_running"]:
        result["version"] = get_clamav_version()
        result["signature_count"] = get_clamav_signature_count()

    return result


def ensure_clamav_db(freshclam_path: str | None = None) -> dict[str, Any]:
    """Ensure ClamAV signature database exists; download if missing.

    If the signature database directory has no .cvd/.cld files,
    runs freshclam to download the initial database.

    Args:
        freshclam_path: Optional path to freshclam binary. If None,
            uses update_clamav_db() to auto-detect.

    Returns:
        A dict with keys: success, message, output, updated_at, db_exists
    """
    install_info = detect_clamav_installation()
    db_path = install_info.get("db_path")

    # Check if DB already exists
    db_exists = False
    if db_path and os.path.isdir(db_path):
        for fname in os.listdir(db_path):
            if fname.endswith((".cvd", ".cld")):
                db_exists = True
                break

    if db_exists and install_info.get("clamd_running"):
        # DB exists and clamd is running — check sig count
        sig_count = install_info.get("signature_count", 0)
        if sig_count > 0:
            return {
                "success": True,
                "message": f"Signature database exists ({sig_count} signatures loaded)",
                "output": "",
                "updated_at": _now_iso(),
                "db_exists": True,
                "signature_count": sig_count,
            }

    # Need to update/download
    if freshclam_path:
        try:
            result = subprocess.run(
                [freshclam_path, "--no-warnings"],
                capture_output=True,
                text=True,
                timeout=600,
            )
            output = (result.stdout or "") + (result.stderr or "")
            if result.returncode == 0:
                return {
                    "success": True,
                    "message": "Signature database downloaded/updated",
                    "output": output,
                    "updated_at": _now_iso(),
                    "db_exists": True,
                }
            return {
                "success": False,
                "message": f"freshclam exited with code {result.returncode}",
                "output": output,
                "updated_at": _now_iso(),
                "db_exists": db_exists,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"freshclam failed: {e}",
                "output": "",
                "updated_at": _now_iso(),
                "db_exists": db_exists,
            }

    # Fall back to auto-detection
    return update_clamav_db()


def update_clamav_db() -> dict[str, Any]:
    """Trigger a ClamAV signature database update via freshclam.

    Runs the freshclam executable to update virus signatures. This requires
    ClamAV to be installed on the system (not just clamd running).

    Returns:
        A dict with keys: success, message, output, updated_at
    """
    # Try common freshclam locations
    candidates = ["freshclam"]
    if sys.platform == "win32":
        candidates.extend([
            r"C:\Program Files\ClamAV\freshclam.exe",
            r"C:\Program Files (x86)\ClamAV\freshclam.exe",
        ])
    else:
        candidates.extend([
            "/usr/bin/freshclam",
            "/usr/local/bin/freshclam",
        ])

    last_error = ""
    for candidate in candidates:
        try:
            result = subprocess.run(
                [candidate, "--no-warnings"],
                capture_output=True,
                text=True,
                timeout=300,
            )
            output = (result.stdout or "") + (result.stderr or "")
            if result.returncode == 0:
                log.info("ClamAV database updated successfully via %s", candidate)
                return {
                    "success": True,
                    "message": "Signature database updated",
                    "output": output,
                    "updated_at": _now_iso(),
                }
            else:
                last_error = output or f"freshclam exited with code {result.returncode}"
                log.debug("freshclam (%s) returned %d: %s", candidate, result.returncode, last_error)
        except FileNotFoundError:
            continue
        except subprocess.TimeoutExpired:
            last_error = "freshclam timed out"
            log.warning("freshclam timed out after 300s")
        except Exception as e:
            last_error = str(e)
            log.debug("freshclam execution failed: %s", e)

    return {
        "success": False,
        "message": f"Could not update ClamAV database: {last_error or 'freshclam not found'}",
        "output": last_error,
        "updated_at": _now_iso(),
    }


def _now_iso() -> str:
    """Return the current UTC timestamp in ISO format."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _parse_clamd_result(result_str: str) -> dict[str, str]:
    """Parse a clamd scan result string.

    clamd results are formatted as:
        "filename: OK"
        "filename: VirusName FOUND"
        "filename: ERROR"

    Returns a dict with keys: status, virus_name (if detected).
    """
    parsed: dict[str, str] = {"status": "unknown", "virus_name": ""}

    if " FOUND" in result_str:
        # "stream: Eicar-Test-Signature FOUND"
        parts = result_str.rsplit(": ", 1)
        if len(parts) == 2:
            found_part = parts[1].replace(" FOUND", "").strip()
            parsed["status"] = "detected"
            parsed["virus_name"] = found_part
        else:
            parsed["status"] = "detected"
            parsed["virus_name"] = result_str.replace(" FOUND", "").strip()
    elif " OK" in result_str:
        parsed["status"] = "clean"
    elif " ERROR" in result_str:
        parsed["status"] = "error"
        parsed["virus_name"] = result_str.split(": ", 1)[-1].replace(" ERROR", "").strip()
    else:
        parsed["status"] = "unknown"

    return parsed


def _classify_threat(virus_name: str) -> tuple[str, str]:
    """Classify a ClamAV detection into threat_type and severity.

    ClamAV signature names often contain hints like 'Trojan', 'Worm',
    'Ransom', 'Adware', 'PUA', etc.

    Returns:
        (threat_type, severity)
    """
    name_lower = virus_name.lower()

    if any(k in name_lower for k in ("ransom", "cryptolocker", "locky", "wannacry")):
        return "ransomware", "high"
    if any(k in name_lower for k in ("trojan", "backdoor", "rat", "bot")):
        return "trojan", "high"
    if any(k in name_lower for k in ("worm", "virus")):
        return "worm", "high"
    if any(k in name_lower for k in ("adware", "pup", "pua")):
        return "adware", "medium"
    if any(k in name_lower for k in ("spyware", "keylog")):
        return "spyware", "high"
    if any(k in name_lower for k in ("rootkit")):
        return "rootkit", "high"
    if any(k in name_lower for k in ("exploit", "cve")):
        return "exploit", "high"
    if any(k in name_lower for k in ("miner", "coinminer", "cryptominer")):
        return "cryptominer", "medium"
    if any(k in name_lower for k in ("test", "eicar")):
        return "test", "low"

    return "malware", "high"


class ClamAvScanner:
    """ClamAV signature-based malware scanner.

    Connects to the ClamAV daemon (clamd) to scan files for known malware
    signatures. If clamd is not available, the scanner degrades gracefully
    and scan_file() returns None.
    """

    name = "clamav"

    def __init__(self, config: dict[str, Any]):
        self.config = config
        self.unix_socket: str = config.get("clamav_unix_socket", _DEFAULT_UNIX_SOCKET)
        self.tcp_host: str = config.get("clamav_tcp_host", _DEFAULT_TCP_HOST)
        self.tcp_port: int = int(config.get("clamav_tcp_port", _DEFAULT_TCP_PORT))
        self._available: bool | None = None

        # Check availability at init time
        if not CLAMD_PACKAGE_AVAILABLE:
            log.info("ClamAV scanner: clamd Python package not installed, will try raw socket")

        available = check_clamav_available()
        if available:
            self._available = True
            version = get_clamav_version()
            log.info("ClamAvScanner initialized: clamd available (%s)", version or "version unknown")
        else:
            self._available = False
            log.warning(
                "ClamAvScanner initialized: clamd not reachable. "
                "Ensure ClamAV is installed and clamd is running. "
                "Tried Unix socket %s and TCP %s:%d",
                self.unix_socket,
                self.tcp_host,
                self.tcp_port,
            )

    def _get_client(self) -> Any | None:
        """Get a clamd client for this scanner's configured endpoints."""
        return _get_clamd_client(self.unix_socket, self.tcp_host, self.tcp_port)

    def scan_file(self, file_path: str) -> dict[str, Any] | None:
        """Scan a single file using ClamAV via the INSTREAM command.

        Args:
            file_path: Path to the file to scan.

        Returns:
            - {"detected": True, "threat_name": ..., "threat_type": ...,
               "severity": "high", "confidence": 0.95, "sha256": ...,
               "details": {"source": "clamav", ...}} on detection
            - {"detected": False, "sha256": ...} on clean
            - None if the file can't be scanned (clamd unavailable, file missing, etc.)
        """
        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            log.debug("ClamAV scan_file: file not found: %s", file_path)
            return None

        client = self._get_client()
        if client is None:
            log.debug("ClamAV scan_file: clamd not available")
            return None

        sha256 = _compute_sha256(file_path)

        try:
            # Use INSTREAM to avoid clamd needing filesystem access
            if isinstance(client, _RawSocketClamd):
                _, result_str = client.instream(file_path)
            else:
                # clamd Python package: instream_file returns dict
                # e.g. {"stream": ("OK",)} or {"stream": ("VirusName", "FOUND")}
                raw = client.instream_file(file_path)
                if isinstance(raw, dict):
                    # Format: {"stream": ("Eicar-Test-Signature", "FOUND")}
                    values = list(raw.values())
                    if values and isinstance(values[0], tuple):
                        parts = values[0]
                        if len(parts) >= 2:
                            result_str = f"stream: {parts[0]} {parts[1]}"
                        elif len(parts) == 1:
                            result_str = f"stream: {parts[0]}"
                        else:
                            result_str = "stream: OK"
                    else:
                        result_str = str(raw)
                else:
                    result_str = str(raw)

            parsed = _parse_clamd_result(result_str)

            if parsed["status"] == "detected":
                virus_name = parsed["virus_name"]
                threat_type, severity = _classify_threat(virus_name)
                log.info("ClamAV detected threat in %s: %s", file_path, virus_name)
                return {
                    "detected": True,
                    "threat_name": virus_name,
                    "threat_type": threat_type,
                    "severity": severity,
                    "confidence": 0.95,
                    "sha256": sha256,
                    "details": {
                        "source": "clamav",
                        "engine": "clamd",
                        "raw_result": result_str,
                        "scanner": self.name,
                    },
                }
            elif parsed["status"] == "clean":
                return {"detected": False, "sha256": sha256}
            else:
                # Error or unknown status
                log.warning("ClamAV scan returned error for %s: %s", file_path, result_str)
                return None

        except Exception as e:
            log.warning("ClamAV scan_file error on %s: %s", file_path, e)
            return None
        finally:
            if isinstance(client, _RawSocketClamd):
                client.close()

    def scan_directory(self, dir_path: str) -> dict[str, Any]:
        """Scan all files in a directory using ClamAV.

        Args:
            dir_path: Path to the directory to scan.

        Returns:
            A dict with keys:
                - scanned: int (number of files scanned)
                - detected: int (number of files with detections)
                - clean: int (number of clean files)
                - errors: int (number of files that could not be scanned)
                - results: list[dict] (per-file results for detections)
                - available: bool (whether clamd was available)
        """
        results: list[dict[str, Any]] = []
        scanned = 0
        detected = 0
        clean = 0
        errors = 0

        if not os.path.isdir(dir_path):
            log.debug("ClamAV scan_directory: directory not found: %s", dir_path)
            return {
                "scanned": 0,
                "detected": 0,
                "clean": 0,
                "errors": 0,
                "results": [],
                "available": False,
            }

        if not check_clamav_available():
            log.warning("ClamAV scan_directory: clamd not available")
            return {
                "scanned": 0,
                "detected": 0,
                "clean": 0,
                "errors": 0,
                "results": [],
                "available": False,
            }

        try:
            entries = list(Path(dir_path).rglob("*"))
        except Exception as e:
            log.warning("ClamAV scan_directory: failed to list %s: %s", dir_path, e)
            return {
                "scanned": 0,
                "detected": 0,
                "clean": 0,
                "errors": 0,
                "results": [],
                "available": True,
            }

        for entry in entries:
            if not entry.is_file():
                continue
            result = self.scan_file(str(entry))
            if result is None:
                errors += 1
                continue
            scanned += 1
            if result.get("detected"):
                detected += 1
                result["file_path"] = str(entry)
                results.append(result)
            else:
                clean += 1

        log.info(
            "ClamAV directory scan complete: %s — scanned=%d detected=%d clean=%d errors=%d",
            dir_path,
            scanned,
            detected,
            clean,
            errors,
        )

        return {
            "scanned": scanned,
            "detected": detected,
            "clean": clean,
            "errors": errors,
            "results": results,
            "available": True,
        }

    def is_available(self) -> bool:
        """Check if the ClamAV daemon is currently available."""
        if self._available is None:
            self._available = check_clamav_available()
        return self._available
