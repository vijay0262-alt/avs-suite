"""AI Workload Detection — classify current PC workload and auto-optimize.

Analyzes running processes to classify the current workload into one of:
  - gaming       — games running (high CPU/GPU)
  - video_editing — video editing software (Premiere, DaVinci, OBS)
  - coding       — IDEs and development tools
  - browsing     — web browsers dominant
  - office       — office applications
  - media        — media playback (Spotify, VLC, Netflix)
  - idle         — no significant workload
  - mixed        — multiple categories active

For each mode, applies optimizations:
  - gaming:       disable background scans, free RAM, high performance power plan
  - video_editing: free RAM, disable auto-care
  - coding:       moderate RAM optimization
  - browsing:     light cleanup
  - office:       light optimization
  - media:        prevent sleep, light optimization
  - idle:         full auto-care enabled
  - mixed:        balanced

RPC methods:
    workload.detect       — detect current workload
    workload.status       — get current detected mode and config
    workload.configure    — update workload detection config (Pro only)
    workload.setMode      — manually override detected mode (Pro only)
    workload.history      — get workload detection history
"""

from __future__ import annotations

import json
import logging
import os
import platform
import time
from datetime import datetime, timezone
from typing import Any

from avs_backend.api.registry import register
from avs_backend.licensing import require_feature

log = logging.getLogger("avs.workload")

IS_WINDOWS = platform.system() == "Windows"

# Storage paths
_CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".avs", "workload_config.json")
_HISTORY_PATH = os.path.join(os.path.expanduser("~"), ".avs", "workload_history.json")

# Process classification database
# Maps process names (lowercase) to workload categories
PROCESS_CATEGORIES: dict[str, list[str]] = {
    "gaming": [
        # Steam games
        "steam.exe", "steamwebhelper.exe",
        # Epic Games
        "epicgameslauncher.exe", "epicgames.exe",
        # Popular game processes
        "csgo.exe", "valorant.exe", "valorant-win64-shipping.exe",
        "league of legends.exe", "leagueclient.exe",
        "dota2.exe", "overwatch.exe", "genshinimpact.exe",
        "minecraft.exe", "javaw.exe",  # Minecraft runs on Java
        "wow.exe", "diablo iv.exe", "diablo64.exe",
        "cyberpunk2077.exe", "witcher3.exe",
        "fortniteclient-win64-shipping.exe", "fortnitelauncher.exe",
        "apex_legends.exe", "rdr2.exe",
        "bg3.exe", "starfield.exe",
        "ea.exe", "ealauncher.exe",
        "battle.net.exe", "valorant.exe",
        "riotclientservices.exe",
        "geforcenow.exe",
        # Game launchers
        "gog galaxy.exe", "uplay.exe", "ubisoftconnect.exe",
        "battlenet.exe",
    ],
    "video_editing": [
        "premiere.exe", "premierepro.exe",  # Adobe Premiere
        "afterfx.exe",  # After Effects
        "resolve.exe", "davinci resolve.exe",  # DaVinci Resolve
        "obs64.exe", "obs32.exe",  # OBS Studio
        "ffmpeg.exe",
        "vegas.exe", "vegas130.exe", "vegas140.exe",  # Vegas Pro
        "filmora.exe",
        "camtasiastudio.exe",
        "handbrake.exe",
        "adobe media encoder.exe",
        "lightworks.exe",
        "hitfilm.exe", "hitfilmpro.exe",
        "shotcut.exe",
        "olive.exe",
    ],
    "coding": [
        "code.exe",  # VS Code
        "code - insiders.exe",
        "devenv.exe",  # Visual Studio
        "idea.exe", "idea64.exe",  # IntelliJ IDEA
        "pycharm.exe", "pycharm64.exe",  # PyCharm
        "webstorm.exe", "webstorm64.exe",
        "phpstorm.exe", "phpstorm64.exe",
        "rubymine.exe", "rubymine64.exe",
        "goland.exe", "goland64.exe",
        "clion.exe", "clion64.exe",
        "rider.exe", "rider64.exe",
        "eclipse.exe",
        "netbeans.exe",
        "atom.exe",
        "sublime_text.exe",
        "notepad++.exe",
        "vim.exe", "gvim.exe",
        "emacs.exe",
        "docker.exe", "docker desktop.exe",
        "node.exe", "npm.exe",
        "python.exe", "python3.exe",
        "git.exe",
        "powershell.exe",  # Could be coding or general
        "terminal.exe", "windowsterminal.exe",
        "wt.exe",
    ],
    "browsing": [
        "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe",
        "opera.exe", "vivaldi.exe", "safari.exe",
        "chromium.exe",
    ],
    "office": [
        "winword.exe", "excel.exe", "powerpnt.exe",  # MS Office
        "outlook.exe", "onenote.exe",
        "winproj.exe", "visio.exe",
        "libreoffice.exe", "soffice.exe",
        "wps.exe", "wpsoffice.exe",
        "notion.exe", "obsidian.exe",
        "teams.exe", "slack.exe", "discord.exe",
        "zoom.exe", "skype.exe",
        "telegram.exe", "whatsapp.exe",
    ],
    "media": [
        "spotify.exe", "vlc.exe", "mpc-hc.exe", "mpc-be.exe",
        "potplayer.exe", "potplayermini64.exe",
        "itunes.exe", "apple music.exe",
        "foobar2000.exe", "aimp.exe",
        "winamp.exe", "musicbee.exe",
        "netflix.exe", "disneyplus.exe", "hulu.exe",
        "primevideo.exe", "twitch.exe",
        "audacity.exe",
        "obs64.exe",  # Could be streaming media
    ],
}

# Optimization profiles for each mode
OPTIMIZATION_PROFILES: dict[str, dict[str, Any]] = {
    "gaming": {
        "label": "Gaming Mode",
        "description": "Maximum performance for gaming. Suspends background scans, frees RAM, high performance power plan.",
        "actions": ["suspend_scans", "free_ram", "high_performance_power"],
        "icon": "game",
        "color": "danger",
    },
    "video_editing": {
        "label": "Video Editing Mode",
        "description": "Optimized for video editing. Frees RAM, disables auto-care during editing.",
        "actions": ["free_ram", "disable_auto_care"],
        "icon": "video",
        "color": "warning",
    },
    "coding": {
        "label": "Coding Mode",
        "description": "Balanced for development work. Moderate RAM optimization.",
        "actions": ["moderate_ram_optimize"],
        "icon": "code",
        "color": "primary",
    },
    "browsing": {
        "label": "Browsing Mode",
        "description": "Light optimization for web browsing.",
        "actions": ["light_cleanup"],
        "icon": "globe",
        "color": "primary",
    },
    "office": {
        "label": "Office Mode",
        "description": "Light optimization for office work.",
        "actions": ["light_cleanup"],
        "icon": "document",
        "color": "neutral",
    },
    "media": {
        "label": "Media Mode",
        "description": "Prevents sleep during media playback. Light optimization.",
        "actions": ["prevent_sleep", "light_cleanup"],
        "icon": "music",
        "color": "primary",
    },
    "idle": {
        "label": "Idle Mode",
        "description": "System is idle. Full auto-care enabled for background maintenance.",
        "actions": ["enable_auto_care"],
        "icon": "moon",
        "color": "neutral",
    },
    "mixed": {
        "label": "Mixed Mode",
        "description": "Multiple workload categories active. Balanced optimization.",
        "actions": ["balanced_optimize"],
        "icon": "sparkles",
        "color": "warning",
    },
}

# Default config
_DEFAULT_CONFIG = {
    "enabled": True,
    "autoOptimize": False,  # Auto-apply optimizations when mode detected
    "manualOverride": None,  # None or a mode string
    "checkIntervalSeconds": 30,
    "minConfidence": 0.5,
}

# In-memory state
_state: dict[str, Any] = {
    "currentMode": "idle",
    "currentConfidence": 0.0,
    "detectedAt": None,
    "detectedProcesses": [],
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_dirs() -> None:
    os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)


def _load_config() -> dict[str, Any]:
    if not os.path.isfile(_CONFIG_PATH):
        return _DEFAULT_CONFIG.copy()
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        config = _DEFAULT_CONFIG.copy()
        config.update(data)
        return config
    except (ValueError, OSError):
        return _DEFAULT_CONFIG.copy()


def _save_config(config: dict[str, Any]) -> bool:
    _ensure_dirs()
    try:
        with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        return True
    except OSError as e:
        log.error("Failed to save workload config: %s", e)
        return False


def _load_history() -> list[dict[str, Any]]:
    if not os.path.isfile(_HISTORY_PATH):
        return []
    try:
        with open(_HISTORY_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("entries", [])
    except (ValueError, OSError):
        return []


def _save_history(entries: list[dict[str, Any]]) -> bool:
    _ensure_dirs()
    try:
        with open(_HISTORY_PATH, "w", encoding="utf-8") as f:
            json.dump({"entries": entries[-200:]}, f, indent=2)
        return True
    except OSError:
        return False


def _add_history_entry(entry: dict[str, Any]) -> None:
    entries = _load_history()
    entries.append(entry)
    _save_history(entries)


def _get_running_processes() -> list[tuple[str, float, float]]:
    """Get list of running processes with name, CPU%, and memory MB.

    Returns list of (process_name, cpu_percent, memory_mb).
    """
    try:
        import psutil
        procs: list[tuple[str, float, float]] = []
        for p in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
            try:
                name = p.info.get("name", "") or ""
                cpu = p.info.get("cpu_percent", 0.0) or 0.0
                mi = p.info.get("memory_info")
                mem_mb = (mi.rss / (1024 * 1024)) if mi else 0.0
                procs.append((name.lower(), cpu, mem_mb))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        return procs
    except Exception as e:
        log.error("Failed to get processes: %s", e)
        return []


def _classify_workload(processes: list[tuple[str, float, float]]) -> dict[str, Any]:
    """Classify the current workload based on running processes.

    Returns:
        mode: detected workload mode
        confidence: 0.0 to 1.0
        matchedProcesses: list of matched process names
        categoryScores: scores per category
    """
    if not processes:
        return {
            "mode": "idle",
            "confidence": 1.0,
            "matchedProcesses": [],
            "categoryScores": {},
        }

    # Score each category
    category_scores: dict[str, dict[str, Any]] = {}
    for category, proc_list in PROCESS_CATEGORIES.items():
        matched: list[dict[str, Any]] = []
        total_cpu = 0.0
        total_mem = 0.0

        for proc_name, cpu, mem in processes:
            # Check if process matches any in the category list
            for known_proc in proc_list:
                if known_proc in proc_name or proc_name in known_proc:
                    matched.append({
                        "name": proc_name,
                        "cpu": cpu,
                        "memoryMB": mem,
                    })
                    total_cpu += cpu
                    total_mem += mem
                    break

        if matched:
            # Score based on number of matched processes and their resource usage
            score = len(matched) + (total_cpu / 100.0) + (total_mem / 1024.0)
            category_scores[category] = {
                "score": score,
                "matched": matched,
                "totalCpu": total_cpu,
                "totalMem": total_mem,
            }

    if not category_scores:
        return {
            "mode": "idle",
            "confidence": 1.0,
            "matchedProcesses": [],
            "categoryScores": {},
        }

    # Sort categories by score
    sorted_cats = sorted(category_scores.items(), key=lambda x: x[1]["score"], reverse=True)
    top_cat, top_data = sorted_cats[0]
    second_cat, second_data = sorted_cats[1] if len(sorted_cats) > 1 else (None, None)

    # Determine if mixed (top two categories are close)
    if second_cat and second_data and top_data["score"] > 0:
        ratio = second_data["score"] / top_data["score"]
        if ratio > 0.7:
            mode = "mixed"
            confidence = min(1.0, (top_data["score"] + second_data["score"]) / 10.0)
            matched_procs = top_data["matched"] + second_data["matched"]
        else:
            mode = top_cat
            confidence = min(1.0, top_data["score"] / 5.0)
            matched_procs = top_data["matched"]
    else:
        mode = top_cat
        confidence = min(1.0, top_data["score"] / 5.0)
        matched_procs = top_data["matched"]

    return {
        "mode": mode,
        "confidence": round(confidence, 2),
        "matchedProcesses": matched_procs,
        "categoryScores": {k: v["score"] for k, v in sorted_cats},
    }


# ─── RPC Methods ────────────────────────────────────────────────────

@register("workload.detect")
def workload_detect(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Detect the current workload by analyzing running processes.

    Returns:
        mode: detected workload mode
        confidence: 0.0 to 1.0
        matchedProcesses: list of matched process details
        categoryScores: scores per category
        profile: optimization profile for detected mode
        detectedAt: timestamp
    """
    if not IS_WINDOWS:
        return {
            "mode": "idle",
            "confidence": 1.0,
            "matchedProcesses": [],
            "categoryScores": {},
            "profile": OPTIMIZATION_PROFILES["idle"],
            "detectedAt": _now_iso(),
            "supported": False,
        }

    config = _load_config()

    # Check for manual override
    if config.get("manualOverride"):
        mode = config["manualOverride"]
        result = {
            "mode": mode,
            "confidence": 1.0,
            "matchedProcesses": [],
            "categoryScores": {},
            "manualOverride": True,
        }
    else:
        processes = _get_running_processes()
        result = _classify_workload(processes)

    mode = result["mode"]
    profile = OPTIMIZATION_PROFILES.get(mode, OPTIMIZATION_PROFILES["mixed"])

    # Update state
    _state.update({
        "currentMode": mode,
        "currentConfidence": result["confidence"],
        "detectedAt": _now_iso(),
        "detectedProcesses": result.get("matchedProcesses", []),
    })

    # Add to history
    _add_history_entry({
        "timestamp": _now_iso(),
        "mode": mode,
        "confidence": result["confidence"],
        "matchedCount": len(result.get("matchedProcesses", [])),
        "manualOverride": bool(config.get("manualOverride")),
    })

    return {
        "mode": mode,
        "confidence": result["confidence"],
        "matchedProcesses": result.get("matchedProcesses", []),
        "categoryScores": result.get("categoryScores", {}),
        "profile": profile,
        "detectedAt": _now_iso(),
        "supported": True,
        "manualOverride": bool(config.get("manualOverride")),
    }


@register("workload.status")
def workload_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get current workload detection status and configuration."""
    config = _load_config()
    profile = OPTIMIZATION_PROFILES.get(_state["currentMode"], OPTIMIZATION_PROFILES["mixed"])

    return {
        "currentMode": _state["currentMode"],
        "currentConfidence": _state["currentConfidence"],
        "detectedAt": _state["detectedAt"],
        "detectedProcesses": _state["detectedProcesses"],
        "profile": profile,
        "config": config,
        "supported": IS_WINDOWS,
    }


@register("workload.configure")
@require_feature("workload.configure")
def workload_configure(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update workload detection configuration. Pro only.

    Params (all optional):
        enabled: bool — enable/disable workload detection
        autoOptimize: bool — auto-apply optimizations
        manualOverride: str | None — manually set mode or None for auto
        checkIntervalSeconds: int
        minConfidence: float
    """
    config = _load_config()

    if params:
        if "enabled" in params:
            config["enabled"] = bool(params["enabled"])
        if "autoOptimize" in params:
            config["autoOptimize"] = bool(params["autoOptimize"])
        if "manualOverride" in params:
            override = params["manualOverride"]
            if override is None or override in OPTIMIZATION_PROFILES:
                config["manualOverride"] = override
        if "checkIntervalSeconds" in params:
            config["checkIntervalSeconds"] = max(10, int(params["checkIntervalSeconds"]))
        if "minConfidence" in params:
            config["minConfidence"] = max(0.0, min(1.0, float(params["minConfidence"])))

    _save_config(config)

    return {
        "success": True,
        "config": config,
        "message": "Workload detection configuration updated",
    }


@register("workload.setMode")
@require_feature("workload.setMode")
def workload_set_mode(params: dict[str, Any] | None) -> dict[str, Any]:
    """Manually override the detected workload mode. Pro only.

    Params:
        mode: str — mode to set (gaming, video_editing, coding, browsing, office, media, idle, mixed)
                   or null to clear override and return to auto-detection
    """
    config = _load_config()

    if not params or "mode" not in params:
        return {"success": False, "message": "mode parameter is required"}

    mode = params["mode"]

    if mode is None:
        config["manualOverride"] = None
        _save_config(config)
        return {"success": True, "message": "Manual override cleared, auto-detection active", "config": config}
    elif mode in OPTIMIZATION_PROFILES:
        config["manualOverride"] = mode
        _save_config(config)
        # Update state
        _state["currentMode"] = mode
        _state["currentConfidence"] = 1.0
        _state["detectedAt"] = _now_iso()
        return {
            "success": True,
            "message": f"Mode set to {mode}",
            "config": config,
            "profile": OPTIMIZATION_PROFILES[mode],
        }
    else:
        return {"success": False, "message": f"Unknown mode: {mode}"}


@register("workload.history")
def workload_history(params: dict[str, Any] | None) -> dict[str, Any]:
    """Get workload detection history.

    Params (optional):
        limit: int — max entries to return (default 50)
    """
    limit = 50
    if params and "limit" in params:
        limit = min(200, max(1, int(params["limit"])))

    entries = _load_history()
    return {
        "entries": entries[-limit:],
        "count": len(entries),
        "supported": True,
    }
