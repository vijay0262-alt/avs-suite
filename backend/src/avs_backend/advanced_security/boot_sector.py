"""Boot sector / MBR scanner for AVS AI Shield — boot-level malware detection.

This module reads and analyses the Master Boot Record (MBR) of the system
drive to detect bootkits, rootkits and other boot-level malware that
operates below the operating system.

IMPORTANT
---------
This is a **read-only** scanner.  It never writes to the MBR or any boot
sector.  The only write operations are:

  1. Creating a backup copy of the current MBR (to a safe location under
     ``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\mbr_backups\\``).
  2. Persisting scan history to
     ``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\boot_scan_history.json``.

Reading the MBR requires **administrator privileges** on Windows.  When the
process is not elevated the scanner returns a clear ``permission_denied``
result instead of raising.

MBR layout (512 bytes)
----------------------
  Offset  Size   Contents
  0       446    Bootstrap code
  446     16     Partition entry 1
  462     16     Partition entry 2
  478     16     Partition entry 3
  494     16     Partition entry 4
  510     2      Boot signature (0x55 0xAA)

Each 16-byte partition entry:
  Offset  Size  Contents
  0       1     Boot indicator (0x80 = active/bootable, 0x00 = inactive)
  1       3     Starting CHS address
  4       1     Partition type descriptor
  5       3     Ending CHS address
  8       4     Starting LBA
  12      4     Size in sectors

Checks performed
----------------
  - Invalid boot signature (not 0x55AA)
  - More than one active partition (bootable flag = 0x80)
  - Suspicious / unknown partition types
  - Zeroed-out partition table (wiped MBR)
  - Non-standard boot code (compared against Windows / GRUB / LILO)
  - Known bootkit signatures in the boot code area
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import struct
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("avs.advanced_security.boot_sector")

IS_WINDOWS = platform.system() == "Windows"

# =====================================================================
# Constants
# =====================================================================

_MBR_SIZE = 512
_BOOT_SIGNATURE_OFFSET = 510
_BOOT_SIGNATURE = b"\x55\xaa"
_PARTITION_TABLE_OFFSET = 446
_PARTITION_ENTRY_SIZE = 16
_PARTITION_ENTRIES = 4
_BOOT_CODE_SIZE = 446

_ACTIVE_PARTITION_FLAG = 0x80

# Known-good partition type IDs (common, legitimate types).
_KNOWN_PARTITION_TYPES = {
    0x00,  # Empty
    0x01,  # FAT12
    0x04,  # FAT16 <32M
    0x05,  # Extended
    0x06,  # FAT16
    0x07,  # NTFS / exFAT
    0x0B,  # FAT32
    0x0C,  # FAT32 LBA
    0x0E,  # FAT16 LBA
    0x0F,  # Extended LBA
    0x11,  # Hidden FAT12
    0x16,  # Hidden FAT16
    0x17,  # Hidden NTFS
    0x1B,  # Hidden FAT32
    0x82,  # Linux swap
    0x83,  # Linux
    0x85,  # Linux extended
    0x8E,  # Linux LVM
    0xA5,  # FreeBSD
    0xA6,  # OpenBSD
    0xA8,  # Mac OS X UFS
    0xA9,  # NetBSD
    0xAF,  # HFS+ / HFSX
    0xEE,  # GPT protective
    0xEF,  # EFI System Partition
}

# Suspicious partition type IDs that are rarely seen on healthy systems and
# have been abused by bootkits / rootkits.
_SUSPICIOUS_PARTITION_TYPES = {
    0xDB,  # CP/M / Concurrent DOS
    0xFE,  # LANstep
    0xFF,  # Xenix bad block table
}

# Known bootkit signatures (byte patterns) searched for in the boot code
# area.  These are distinctive fragments used by well-known bootkits.
_BOOTKIT_SIGNATURES: list[dict[str, Any]] = [
    {
        "name": "TDL4 / Alureon",
        "pattern": b"\x8b\xec\x83\xec\x54\xa1",
        "severity": "critical",
        "description": "TDL4 bootkit bootstrap code fragment",
    },
    {
        "name": "Rovnix / Carberp",
        "pattern": b"\xfa\xfc\x8c\xc8\x8e\xd8\x8c\xc0\x8e\xc0",
        "severity": "critical",
        "description": "Rovnix bootkit kernel patching stub",
    },
    {
        "name": "Gapz / Win32:Gapz",
        "pattern": b"\xb8\x00\x00\x8e\xc0\xbe",
        "severity": "critical",
        "description": "Gapz bootkit VBR hijack stub",
    },
    {
        "name": "Mebroot / Torpig",
        "pattern": b"\x60\x1e\xb8\x00\x00\x8e\xd8",
        "severity": "critical",
        "description": "Mebroot rootkit MBR replacement code",
    },
    {
        "name": "Whistler / Bootkit.B",
        "pattern": b"\xbe\x00\x7c\xac\x20\xc0\x74",
        "severity": "high",
        "description": "Whistler bootkit bootstrap fragment",
    },
    {
        "name": "Cidox / DosAlureon",
        "pattern": b"\xb8\x01\x02\xbb\x00\x7c",
        "severity": "high",
        "description": "Cidox bootkit INT 13h hook stub",
    },
    {
        "name": "Pihar / Rootkit.Win32.Pihar",
        "pattern": b"\x2b\xc9\x33\xc0\x8e\xd8\x8e\xc0",
        "severity": "high",
        "description": "Pihar bootkit MBR patch fragment",
    },
]

# Known-good boot code fingerprints.  We compare the first 8 bytes of the
# boot code area against these signatures to recognise standard bootloaders.
_KNOWN_BOOTLOADERS: list[dict[str, Any]] = [
    {
        "name": "Windows (IPL)",
        # Classic Windows MBR bootstrap: cli; xor ax,ax; mov ss,ax
        "prefix": b"\xfa\x33\xc0\x8e\xd0\xbc",
        "description": "Standard Windows NT/2000/XP/Vista/7 MBR",
    },
    {
        "name": "Windows 8+",
        # Newer Windows MBR variant.
        "prefix": b"\xfa\x33\xc0\x8e\xd8\x8e\xc0",
        "description": "Standard Windows 8/10/11 MBR",
    },
    {
        "name": "GRUB",
        # GRUB stage1 typically starts with a jump.
        "prefix": b"\xeb\x4c\x90",
        "description": "GRUB legacy stage1 boot code",
    },
    {
        "name": "GRUB2",
        "prefix": b"\xeb\x63\x90",
        "description": "GRUB2 core.img boot code",
    },
    {
        "name": "LILO",
        "prefix": b"\xfa\xeb\x6b\x90",
        "description": "LILO boot loader code",
    },
    {
        "name": "Syslinux",
        "prefix": b"\xfa\xeb\x1e\x90",
        "description": "Syslinux MBR boot code",
    },
]

# =====================================================================
# Paths
# =====================================================================

_DATA_DIR = Path(
    os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
) / "AVS AI Shield" / "threat_engine"
_DATA_DIR.mkdir(parents=True, exist_ok=True)

_HISTORY_PATH = _DATA_DIR / "boot_scan_history.json"
_BACKUP_DIR = _DATA_DIR / "mbr_backups"
_BACKUP_DIR.mkdir(parents=True, exist_ok=True)

_MAX_HISTORY_ENTRIES = 100


# =====================================================================
# Helpers
# =====================================================================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _device_path(drive_index: int) -> str:
    """Return the raw device path for a physical drive index."""
    if IS_WINDOWS:
        return rf"\\.\PhysicalDrive{drive_index}"
    # Linux: /dev/sda, /dev/sdb, ...
    return f"/dev/sd{chr(ord('a') + drive_index)}"


def _read_mbr(device_path: str) -> bytes | None:
    """Read the first 512 bytes (MBR) from *device_path*.

    Returns the raw bytes or ``None`` if the device could not be opened.
    Permission errors are expected for non-admin users and are logged at
    debug level.
    """
    try:
        fd = os.open(device_path, os.O_RDONLY)
    except PermissionError:
        log.warning("Permission denied reading MBR from %s (admin required)", device_path)
        return None
    except FileNotFoundError:
        log.warning("Device not found: %s", device_path)
        return None
    except OSError as e:
        log.warning("Cannot open device %s: %s", device_path, e)
        return None

    try:
        data = os.read(fd, _MBR_SIZE)
        # Best effort to read exactly 512 bytes; pad if short.
        if len(data) < _MBR_SIZE:
            data = data.ljust(_MBR_SIZE, b"\x00")
        return data
    except PermissionError:
        log.warning("Permission denied reading MBR from %s (admin required)", device_path)
        return None
    except OSError as e:
        log.warning("Read error on %s: %s", device_path, e)
        return None
    finally:
        try:
            os.close(fd)
        except OSError:
            pass


def _parse_partition_entry(entry: bytes) -> dict[str, Any]:
    """Parse a single 16-byte partition table entry."""
    boot_flag = entry[0]
    part_type = entry[4]
    start_lba = struct.unpack_from("<I", entry, 8)[0]
    size_sectors = struct.unpack_from("<I", entry, 12)[0]
    return {
        "bootable": bool(boot_flag & _ACTIVE_PARTITION_FLAG),
        "boot_flag": boot_flag,
        "type": part_type,
        "type_hex": f"0x{part_type:02X}",
        "start_lba": start_lba,
        "size_sectors": size_sectors,
        "size_bytes": size_sectors * 512,
        "empty": part_type == 0x00 and start_lba == 0 and size_sectors == 0,
    }


def _load_history() -> list[dict[str, Any]]:
    """Load scan history from disk."""
    if _HISTORY_PATH.exists():
        try:
            with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
        except Exception as e:
            log.warning("Failed to load boot scan history: %s", e)
    return []


def _save_history(history: list[dict[str, Any]]) -> None:
    """Save scan history to disk (capped at _MAX_HISTORY_ENTRIES)."""
    try:
        trimmed = history[-_MAX_HISTORY_ENTRIES:]
        with open(_HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump(trimmed, f, indent=2)
    except Exception as e:
        log.error("Failed to save boot scan history: %s", e)


# =====================================================================
# BootSectorScanner
# =====================================================================

class BootSectorScanner:
    """Read-only MBR / boot sector scanner for AVS AI Shield.

    The scanner reads the Master Boot Record of the system drive, validates
    its structure, checks the partition table for anomalies and scans the
    boot code area for known bootkit signatures.

    All errors are handled gracefully — permission errors (the most common
    case for non-admin users) return a clear ``permission_denied`` result
    rather than raising.  The scanner **never** writes to the MBR.
    """

    name = "boot_sector"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        self._default_drive = int(self._config.get("default_drive", 0))
        self._available = self._check_availability()
        self._last_scan: str | None = None
        self._threats_found = 0
        self._history: list[dict[str, Any]] = _load_history()

    # -----------------------------------------------------------------
    # Availability
    # -----------------------------------------------------------------

    @staticmethod
    def _check_availability() -> bool:
        """Return True if raw device access is possible on this platform."""
        # We cannot know for sure without admin rights, but the feature is
        # "available" in the sense that the code path is supported.
        return IS_WINDOWS or platform.system() in ("Linux", "Darwin")

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def scan(self) -> dict[str, Any]:
        """Scan the MBR of the default system drive.

        Returns a dict with the keys:
        ``safe``, ``threats``, ``mbr_info`` and (on error) ``error``.
        """
        return self.scan_drive(self._default_drive)

    def scan_drive(self, drive_index: int) -> dict[str, Any]:
        """Scan the MBR of a specific physical drive.

        Returns a dict with the keys:
        ``safe``, ``threats``, ``mbr_info``, ``drive_index`` and
        (on error) ``error``.
        """
        result: dict[str, Any] = {
            "safe": True,
            "threats": [],
            "mbr_info": {},
            "drive_index": drive_index,
            "timestamp": _now_iso(),
        }

        if not self._available:
            result["error"] = "boot sector scanning not supported on this platform"
            self._record_history(result)
            return result

        device = _device_path(drive_index)
        mbr = _read_mbr(device)

        if mbr is None:
            result["safe"] = False
            result["error"] = (
                "permission_denied: administrator privileges are required to read "
                f"the MBR ({device}). Run AVS AI Shield as administrator and retry."
            )
            result["threats"].append({
                "type": "access_denied",
                "severity": "info",
                "description": (
                    "Unable to read the boot sector without administrator "
                    "privileges. No boot-level malware can be detected until "
                    "the scan is run elevated."
                ),
            })
            self._record_history(result)
            return result

        # Always create a backup before analysis so the user has a known-good
        # copy in case the MBR is later tampered with.
        backup_info = self._backup_mbr_bytes(mbr, drive_index)

        mbr_info: dict[str, Any] = {
            "device": device,
            "drive_index": drive_index,
            "size": len(mbr),
            "sha256": hashlib.sha256(mbr).hexdigest(),
            "md5": hashlib.md5(mbr).hexdigest(),
            "boot_signature_valid": self._check_boot_signature(mbr),
            "partitions": [],
            "bootloader": None,
            "backup": backup_info,
        }

        threats: list[dict[str, Any]] = []

        # --- Boot signature -------------------------------------------
        if not mbr_info["boot_signature_valid"]:
            threats.append({
                "type": "invalid_boot_signature",
                "severity": "critical",
                "description": (
                    "MBR boot signature is not 0x55AA. The boot sector may be "
                    "corrupted or overwritten by malware."
                ),
            })

        # --- Partition table ------------------------------------------
        partitions = self._parse_partition_table(mbr)
        mbr_info["partitions"] = partitions
        threats.extend(self._check_partition_table(partitions, mbr))

        # --- Bootloader identification --------------------------------
        bootloader = self._identify_bootloader(mbr)
        mbr_info["bootloader"] = bootloader
        if bootloader is None:
            threats.append({
                "type": "non_standard_boot_code",
                "severity": "high",
                "description": (
                    "Boot code does not match any known bootloader (Windows, "
                    "GRUB, LILO, Syslinux). This may indicate a custom or "
                    "malicious MBR replacement."
                ),
            })

        # --- Bootkit signatures ---------------------------------------
        threats.extend(self._scan_bootkit_signatures(mbr))

        result["threats"] = threats
        result["safe"] = len(threats) == 0
        result["mbr_info"] = mbr_info

        self._last_scan = _now_iso()
        if result["safe"]:
            self._threats_found = 0
        else:
            self._threats_found = len(threats)

        self._record_history(result)
        log.info(
            "Boot sector scan complete: drive=%d safe=%s threats=%d",
            drive_index, result["safe"], len(threats),
        )
        return result

    def get_status(self) -> dict[str, Any]:
        """Return the current scanner status."""
        return {
            "available": self._available,
            "last_scan": self._last_scan,
            "threats_found": self._threats_found,
            "platform": platform.system(),
            "default_drive": self._default_drive,
            "backup_dir": str(_BACKUP_DIR),
            "captured_at": _now_iso(),
        }

    def get_history(self) -> list[dict[str, Any]]:
        """Return the scan history (most recent last)."""
        return list(self._history)

    def backup_mbr(self) -> dict[str, Any]:
        """Backup the current MBR of the default drive to a safe location.

        Returns a dict describing the backup, or an ``error`` key on failure.
        """
        if not self._available:
            return {"error": "boot sector scanning not supported on this platform"}

        device = _device_path(self._default_drive)
        mbr = _read_mbr(device)
        if mbr is None:
            return {
                "error": (
                    "permission_denied: administrator privileges are required "
                    f"to read the MBR ({device})."
                ),
            }
        return self._backup_mbr_bytes(mbr, self._default_drive)

    def verify_mbr(self, backup_path: str) -> dict[str, Any]:
        """Compare the current MBR against a previously saved backup.

        Returns a dict with ``match`` (bool), the current and backup hashes,
        and a list of ``differences`` describing the mismatched regions.
        """
        result: dict[str, Any] = {
            "match": False,
            "backup_path": backup_path,
            "current_sha256": None,
            "backup_sha256": None,
            "differences": [],
            "timestamp": _now_iso(),
        }

        backup_file = Path(backup_path)
        if not backup_file.is_file():
            result["error"] = f"backup file not found: {backup_path}"
            return result

        try:
            with open(backup_file, "rb") as f:
                backup_mbr = f.read(_MBR_SIZE)
        except Exception as e:
            result["error"] = f"failed to read backup: {e}"
            return result

        if len(backup_mbr) < _MBR_SIZE:
            backup_mbr = backup_mbr.ljust(_MBR_SIZE, b"\x00")

        device = _device_path(self._default_drive)
        current_mbr = _read_mbr(device)
        if current_mbr is None:
            result["error"] = (
                "permission_denied: administrator privileges are required "
                f"to read the MBR ({device})."
            )
            return result

        current_hash = hashlib.sha256(current_mbr).hexdigest()
        backup_hash = hashlib.sha256(backup_mbr).hexdigest()
        result["current_sha256"] = current_hash
        result["backup_sha256"] = backup_hash
        result["match"] = current_hash == backup_hash

        if not result["match"]:
            # Describe which regions differ.
            regions = [
                ("boot_code", 0, _BOOT_CODE_SIZE),
                ("partition_table", _PARTITION_TABLE_OFFSET,
                 _PARTITION_TABLE_OFFSET + _PARTITION_ENTRY_SIZE * _PARTITION_ENTRIES),
                ("boot_signature", _BOOT_SIGNATURE_OFFSET, _MBR_SIZE),
            ]
            for name, start, end in regions:
                if current_mbr[start:end] != backup_mbr[start:end]:
                    result["differences"].append({
                        "region": name,
                        "offset": start,
                        "length": end - start,
                        "description": f"{name} region differs from backup",
                    })

        log.info(
            "MBR verification: match=%s current=%s backup=%s",
            result["match"], current_hash, backup_hash,
        )
        return result

    # -----------------------------------------------------------------
    # MBR analysis helpers
    # -----------------------------------------------------------------

    @staticmethod
    def _check_boot_signature(mbr: bytes) -> bool:
        """Return True if the boot signature at offset 510 is 0x55AA."""
        return mbr[_BOOT_SIGNATURE_OFFSET:_BOOT_SIGNATURE_OFFSET + 2] == _BOOT_SIGNATURE

    @staticmethod
    def _parse_partition_table(mbr: bytes) -> list[dict[str, Any]]:
        """Parse the four 16-byte partition table entries."""
        entries: list[dict[str, Any]] = []
        for i in range(_PARTITION_ENTRIES):
            start = _PARTITION_TABLE_OFFSET + i * _PARTITION_ENTRY_SIZE
            raw = mbr[start:start + _PARTITION_ENTRY_SIZE]
            entry = _parse_partition_entry(raw)
            entry["index"] = i
            entries.append(entry)
        return entries

    @staticmethod
    def _check_partition_table(
        partitions: list[dict[str, Any]], mbr: bytes
    ) -> list[dict[str, Any]]:
        """Check the partition table for anomalies."""
        threats: list[dict[str, Any]] = []

        # --- More than one active partition ---------------------------
        active = [p for p in partitions if p["bootable"]]
        if len(active) > 1:
            threats.append({
                "type": "multiple_active_partitions",
                "severity": "high",
                "description": (
                    f"{len(active)} partitions are marked active/bootable. "
                    "A healthy MBR has at most one active partition."
                ),
                "partitions": [p["index"] for p in active],
            })

        # --- Suspicious partition types -------------------------------
        for p in partitions:
            if p["empty"]:
                continue
            if p["type"] in _SUSPICIOUS_PARTITION_TYPES:
                threats.append({
                    "type": "suspicious_partition_type",
                    "severity": "medium",
                    "description": (
                        f"Partition {p['index']} has a suspicious type "
                        f"{p['type_hex']} that is rarely used on healthy systems."
                    ),
                    "partition": p["index"],
                    "partition_type": p["type_hex"],
                })
            elif p["type"] not in _KNOWN_PARTITION_TYPES:
                threats.append({
                    "type": "unknown_partition_type",
                    "severity": "low",
                    "description": (
                        f"Partition {p['index']} has an unknown type "
                        f"{p['type_hex']}. This may be legitimate but is unusual."
                    ),
                    "partition": p["index"],
                    "partition_type": p["type_hex"],
                })

        # --- Wiped MBR (zeroed partition table) ----------------------
        table_bytes = mbr[_PARTITION_TABLE_OFFSET:
                         _PARTITION_TABLE_OFFSET + _PARTITION_ENTRY_SIZE * _PARTITION_ENTRIES]
        if table_bytes == b"\x00" * (_PARTITION_ENTRY_SIZE * _PARTITION_ENTRIES):
            # Only flag as a threat if the boot code is also empty — a fully
            # zeroed MBR is a wiped disk, which is suspicious if the disk is
            # supposed to be bootable.
            boot_code = mbr[:_BOOT_CODE_SIZE]
            if boot_code != b"\x00" * _BOOT_CODE_SIZE:
                threats.append({
                    "type": "wiped_partition_table",
                    "severity": "critical",
                    "description": (
                        "The partition table is entirely zeroed but boot code "
                        "is present. This may indicate a bootkit that has "
                        "redirected boot to a custom VBR."
                    ),
                })
            else:
                threats.append({
                    "type": "wiped_mbr",
                    "severity": "high",
                    "description": (
                        "The entire MBR is zeroed. The disk may be uninitialised "
                        "or the MBR may have been wiped by malware."
                    ),
                })

        return threats

    @staticmethod
    def _identify_bootloader(mbr: bytes) -> dict[str, Any] | None:
        """Try to identify the bootloader from the boot code prefix.

        Returns a dict with ``name`` and ``description`` or ``None`` if the
        boot code does not match any known bootloader.
        """
        prefix = mbr[:8]
        for bl in _KNOWN_BOOTLOADERS:
            if prefix.startswith(bl["prefix"]):
                return {
                    "name": bl["name"],
                    "description": bl["description"],
                    "matched_prefix": bl["prefix"].hex(),
                }
        return None

    @staticmethod
    def _scan_bootkit_signatures(mbr: bytes) -> list[dict[str, Any]]:
        """Scan the boot code area for known bootkit byte signatures."""
        threats: list[dict[str, Any]] = []
        boot_code = mbr[:_BOOT_CODE_SIZE]
        for sig in _BOOTKIT_SIGNATURES:
            pattern = sig["pattern"]
            offset = boot_code.find(pattern)
            if offset != -1:
                threats.append({
                    "type": "bootkit_signature",
                    "severity": sig["severity"],
                    "name": sig["name"],
                    "description": sig["description"],
                    "offset": offset,
                    "pattern": pattern.hex(),
                })
        return threats

    # -----------------------------------------------------------------
    # Backup & history
    # -----------------------------------------------------------------

    @staticmethod
    def _backup_mbr_bytes(mbr: bytes, drive_index: int) -> dict[str, Any]:
        """Write *mbr* to the backup directory and return metadata."""
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"mbr_drive{drive_index}_{ts}.bin"
        path = _BACKUP_DIR / filename
        info: dict[str, Any] = {
            "path": str(path),
            "filename": filename,
            "drive_index": drive_index,
            "sha256": hashlib.sha256(mbr).hexdigest(),
            "size": len(mbr),
            "created_at": _now_iso(),
        }
        try:
            with open(path, "wb") as f:
                f.write(mbr)
            log.info("MBR backup written to %s", path)
        except Exception as e:
            log.error("Failed to write MBR backup: %s", e)
            info["error"] = f"backup write failed: {e}"
        return info

    def _record_history(self, result: dict[str, Any]) -> None:
        """Append a summary of *result* to the scan history."""
        entry = {
            "timestamp": result.get("timestamp", _now_iso()),
            "drive_index": result.get("drive_index", self._default_drive),
            "safe": result.get("safe", False),
            "threats": len(result.get("threats", [])),
            "threat_types": [t.get("type", "unknown") for t in result.get("threats", [])],
            "error": result.get("error"),
        }
        self._history.append(entry)
        if len(self._history) > _MAX_HISTORY_ENTRIES:
            self._history = self._history[-_MAX_HISTORY_ENTRIES:]
        _save_history(self._history)
