"""Auto Browser Clean — watches for browser process exits and cleans privacy data.

When a browser (Chrome, Edge, Firefox, Brave, Opera, Vivaldi) closes,
this service triggers a privacy clean for the configured categories.

The watcher runs in a background thread and polls running processes
every 5 seconds. When a tracked browser process disappears, the
clean is triggered after a 2-second delay (to ensure the browser
has fully released file locks).
"""

from __future__ import annotations

import logging
import platform
import threading
import time
from typing import Any

from avs_backend.api.registry import register

log = logging.getLogger("avs.auto_browser_clean")

IS_WINDOWS = platform.system() == "Windows"

# Browser process names to watch
_BROWSER_PROCESSES: dict[str, str] = {
    "chrome.exe": "chrome",
    "msedge.exe": "edge",
    "firefox.exe": "firefox",
    "brave.exe": "brave",
    "opera.exe": "opera",
    "vivaldi.exe": "vivaldi",
}

# Polling interval (seconds)
_POLL_INTERVAL = 5.0
# Delay after browser exits before cleaning (seconds)
_CLEAN_DELAY = 2.0

_watcher: "BrowserCleanWatcher | None" = None
_watcher_lock = threading.Lock()


class BrowserCleanWatcher:
    """Background thread that watches for browser exits and triggers cleaning."""

    def __init__(self) -> None:
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._running_browsers: set[str] = set()
        self._enabled = False
        self._categories: list[str] = ["browser_cache", "browser_history", "browser_cookies"]
        self._lock = threading.Lock()

    def start(self, categories: list[str] | None = None) -> None:
        """Start watching for browser exits."""
        with self._lock:
            self._enabled = True
            if categories is not None:
                self._categories = categories
        if self._thread is None or not self._thread.is_alive():
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run, daemon=True, name="browser-clean-watcher")
            self._thread.start()
            log.info("Browser clean watcher started (categories=%s)", self._categories)

    def stop(self) -> None:
        """Stop watching."""
        with self._lock:
            self._enabled = False
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=10)
            self._thread = None
        log.info("Browser clean watcher stopped")

    def update_categories(self, categories: list[str]) -> None:
        """Update the categories to clean."""
        with self._lock:
            self._categories = categories

    def is_running(self) -> bool:
        """Check if the watcher is running."""
        return self._thread is not None and self._thread.is_alive()

    def get_status(self) -> dict[str, Any]:
        """Get current watcher status."""
        return {
            "enabled": self._enabled,
            "running": self.is_running(),
            "categories": self._categories,
            "watchedBrowsers": list(_BROWSER_PROCESSES.keys()),
            "currentlyRunningBrowsers": list(self._running_browsers),
        }

    def _run(self) -> None:
        """Main watcher loop."""
        while not self._stop_event.is_set():
            try:
                with self._lock:
                    if not self._enabled:
                        break

                current = self._get_running_browsers()
                # Find browsers that were running but are now gone
                exited = self._running_browsers - current
                if exited:
                    log.info("Browsers exited: %s — cleaning in %ss", exited, _CLEAN_DELAY)
                    time.sleep(_CLEAN_DELAY)
                    self._trigger_clean(exited)
                self._running_browsers = current
            except Exception as e:
                log.error("Browser clean watcher error: %s", e)

            self._stop_event.wait(_POLL_INTERVAL)

    def _get_running_browsers(self) -> set[str]:
        """Get the set of browser process names currently running."""
        if not IS_WINDOWS:
            return set()
        try:
            import psutil
            running = set()
            for proc in psutil.process_iter(["name"]):
                name = proc.info.get("name", "").lower()
                if name in _BROWSER_PROCESSES:
                    running.add(name)
            return running
        except Exception:
            return set()

    def _trigger_clean(self, exited_browsers: set[str]) -> None:
        """Trigger privacy clean for the exited browsers."""
        try:
            from avs_backend.privacy.privacy_cleaner import (
                PrivacyCategory, scan_privacy_items, clean_privacy_items,
            )
            from threading import Event

            cancel = Event()
            with self._lock:
                categories = set()
                for cat_str in self._categories:
                    try:
                        categories.add(PrivacyCategory(cat_str))
                    except ValueError:
                        pass

            if not categories:
                log.warning("No valid categories configured for auto browser clean")
                return

            # Scan for items in the configured categories
            result = scan_privacy_items(cancel, None, categories)
            if not result.items:
                log.info("Auto browser clean: no items to clean")
                return

            # Clean the items
            clean_result = clean_privacy_items(result.items, cancel, None)
            log.info(
                "Auto browser clean completed: %d items cleaned, %d bytes freed",
                clean_result.items_cleaned, clean_result.space_freed,
            )
        except Exception as e:
            log.error("Auto browser clean failed: %s", e)


def _ensure_watcher() -> BrowserCleanWatcher:
    """Get or create the singleton watcher."""
    global _watcher
    if _watcher is None:
        with _watcher_lock:
            if _watcher is None:
                _watcher = BrowserCleanWatcher()
    return _watcher


@register("auto_browser_clean.status")
def auto_browser_clean_status(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Get the current auto browser clean watcher status."""
    return _ensure_watcher().get_status()


@register("auto_browser_clean.start")
def auto_browser_clean_start(params: dict[str, Any] | None) -> dict[str, Any]:
    """Start the auto browser clean watcher.

    Params:
        categories: list of privacy category strings to clean on browser close
    """
    categories = None
    if params and "categories" in params:
        categories = params["categories"]
    _ensure_watcher().start(categories)
    return {"success": True, "status": _ensure_watcher().get_status()}


@register("auto_browser_clean.stop")
def auto_browser_clean_stop(_params: dict[str, Any] | None) -> dict[str, Any]:
    """Stop the auto browser clean watcher."""
    _ensure_watcher().stop()
    return {"success": True, "status": _ensure_watcher().get_status()}


@register("auto_browser_clean.updateCategories")
def auto_browser_clean_update_categories(params: dict[str, Any] | None) -> dict[str, Any]:
    """Update the categories to clean on browser close.

    Params:
        categories: list of privacy category strings
    """
    if not params or "categories" not in params:
        return {"success": False, "error": "Missing categories parameter"}
    _ensure_watcher().update_categories(params["categories"])
    return {"success": True, "status": _ensure_watcher().get_status()}
