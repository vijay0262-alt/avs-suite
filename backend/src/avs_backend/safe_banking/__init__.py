"""Safe Banking — launches banking sites in an isolated browser profile.

A dedicated, extension-free profile (separate cookies, no extensions,
no sync) opened only to user-trusted HTTPS domains. Cuts off the main
attack surface for banking trojans and session theft.

RPC methods:
    safe_banking.status     — browsers found + configured sites
    safe_banking.sites      — list trusted domains
    safe_banking.addSite    {domain}
    safe_banking.removeSite {domain}
    safe_banking.launch     {domain | url, browser?}
"""

from __future__ import annotations

import json
import logging
import os
import platform
import re
import shutil
import subprocess
import winreg
from pathlib import Path
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.safe_banking")

IS_WINDOWS = platform.system() == "Windows"

_DATA_DIR = Path(os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))) / "AVS AI Shield" / "safe_banking"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_SITES_PATH = _DATA_DIR / "trusted_sites.json"
_PROFILE_ROOT = _DATA_DIR / "profile"

_BROWSERS: dict[str, dict[str, Any]] = {
    "chrome": {
        "exe_names": ["chrome.exe", "chrome"],
        "app_paths": [r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"],
        "fallback_dirs": ["Google\\Chrome\\Application\\chrome.exe"],
        "args": ["--no-first-run", "--disable-extensions", "--disable-sync", "--new-window"],
    },
    "edge": {
        "exe_names": ["msedge.exe", "msedge"],
        "app_paths": [r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe"],
        "fallback_dirs": ["Microsoft\\Edge\\Application\\msedge.exe"],
        "args": ["--no-first-run", "--disable-extensions", "--disable-sync", "--new-window"],
    },
    "firefox": {
        "exe_names": ["firefox.exe", "firefox"],
        "app_paths": [r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\firefox.exe"],
        "fallback_dirs": ["Mozilla Firefox\\firefox.exe"],
        "args": ["-no-remote", "-new-instance", "-new-window"],
    },
}

_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?"
    r"(?:\.[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?)+$"
)


def _find_browsers() -> dict[str, str]:
    """Return {browser_id: exe_path} for installed browsers."""
    found: dict[str, str] = {}
    for bid, spec in _BROWSERS.items():
        # 1. PATH lookup
        for name in spec["exe_names"]:
            p = shutil.which(name)
            if p:
                found[bid] = p
                break
        if bid in found or not IS_WINDOWS:
            continue
        # 2. Registry App Paths
        for key_path in spec["app_paths"]:
            try:
                with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, key_path) as k:
                    exe, _ = winreg.QueryValueEx(k, "")
                    if exe and Path(exe).exists():
                        found[bid] = exe
                        break
            except OSError:
                pass
        if bid in found:
            continue
        # 3. Standard install dirs
        for rel in spec["fallback_dirs"]:
            for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"),
                         os.environ.get("LOCALAPPDATA")):
                if not base:
                    continue
                p = Path(base) / rel
                if p.exists():
                    found[bid] = str(p)
                    break
            if bid in found:
                break
    return found


def _load_sites() -> list[str]:
    try:
        return json.loads(_SITES_PATH.read_text("utf-8")).get("sites", [])
    except Exception:
        return []


def _save_sites(sites: list[str]) -> None:
    tmp = _SITES_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps({"sites": sites}), "utf-8")
    os.replace(tmp, _SITES_PATH)


def _normalize_domain(value: str) -> str:
    d = value.strip().lower()
    d = re.sub(r"^https?://", "", d).split("/")[0].split(":")[0].rstrip(".")
    if d.startswith("www."):
        d = d[4:]
    return d


def _error(msg: str, code: str) -> dict[str, Any]:
    return {"success": False, "error": msg, "error_code": code}


@register("safe_banking.status")
def status(params: dict[str, Any] | None) -> dict[str, Any]:
    return {"success": True, "result": {
        "browsers": _find_browsers(),
        "sites": _load_sites(),
        "profile_dir": str(_PROFILE_ROOT),
    }}


@register("safe_banking.sites")
def sites(params: dict[str, Any] | None) -> dict[str, Any]:
    return {"success": True, "result": _load_sites()}


@register("safe_banking.addSite")
def add_site(params: dict[str, Any] | None) -> dict[str, Any]:
    domain = _normalize_domain((params or {}).get("domain", ""))
    if not _DOMAIN_RE.match(domain):
        return _error("invalid domain", "INVALID_PARAMS")
    current = _load_sites()
    if domain not in current:
        current.append(domain)
        _save_sites(current)
    return {"success": True, "result": current}


@register("safe_banking.removeSite")
def remove_site(params: dict[str, Any] | None) -> dict[str, Any]:
    domain = _normalize_domain((params or {}).get("domain", ""))
    current = [s for s in _load_sites() if s != domain]
    _save_sites(current)
    return {"success": True, "result": current}


@register("safe_banking.launch")
def launch(params: dict[str, Any] | None) -> dict[str, Any]:
    params = params or {}
    raw = params.get("url") or params.get("domain") or ""
    domain = _normalize_domain(raw)
    if not domain:
        return _error("domain or url is required", "INVALID_PARAMS")
    trusted = _load_sites()
    if domain not in trusted and not any(domain.endswith("." + s) for s in trusted):
        return _error(
            f"{domain} is not in your trusted banking sites — add it first",
            "NOT_TRUSTED")
    if not raw.lower().startswith("https://") and "://" in raw:
        return _error("Safe Banking only opens HTTPS pages", "HTTPS_ONLY")

    browsers = _find_browsers()
    browser_id = params.get("browser") or next(iter(browsers), None)
    if not browser_id or browser_id not in browsers:
        return _error("no supported browser found (Chrome, Edge, Firefox)", "NO_BROWSER")

    url = raw if "://" in raw else f"https://{domain}"
    profile = _PROFILE_ROOT / browser_id
    profile.mkdir(parents=True, exist_ok=True)

    if browser_id == "firefox":
        args = [browsers[browser_id], "-profile", str(profile),
                *_BROWSERS[browser_id]["args"], url]
    else:
        args = [browsers[browser_id], f"--user-data-dir={profile}",
                *_BROWSERS[browser_id]["args"], url]
    try:
        subprocess.Popen(args, close_fds=True)
        log.info("Safe Banking launched %s in %s", url, browser_id)
        return {"success": True, "result": {"browser": browser_id, "url": url}}
    except Exception as e:
        return _error(str(e), "LAUNCH_FAILED")
