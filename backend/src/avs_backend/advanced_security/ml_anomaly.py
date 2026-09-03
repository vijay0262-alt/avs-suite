"""ML-based anomaly classifier for AVS AI Shield.

This module provides a lightweight statistical anomaly detector for process
behaviour.  Despite the ``ml_`` prefix, it does **not** rely on a trained
neural network.  Instead it combines:

  * A **baseline profile** of normal process behaviour (CPU usage, memory,
    thread count, handle count, network connections) built by sampling the
    running process list over a configurable duration.
  * **Z-score** statistical deviation to flag processes whose metrics exceed
    three standard deviations above the baseline mean.
  * **Heuristic scoring** for behavioural indicators that are difficult to
    capture purely from statistics (unusual parent process, process-name
    impersonation such as ``svchost.exe`` running from a non-system path).

If ``scikit-learn`` is installed, an ``IsolationForest`` model is trained on
the baseline samples and used as an additional anomaly signal.  When
scikit-learn is unavailable the classifier falls back to pure z-score
analysis.

The baseline is persisted to
``%LOCALAPPDATA%\\AVS AI Shield\\threat_engine\\ml_baseline.json`` so it survives
restarts.  Monitoring runs in a daemon thread that polls every 10 seconds.
Detected anomalies are kept in a thread-safe ring buffer (max 500).
"""

from __future__ import annotations

import json
import logging
import math
import os
import platform
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psutil

log = logging.getLogger("avs.advanced_security.ml_anomaly")

IS_WINDOWS = platform.system() == "Windows"

# Optional scikit-learn dependency for IsolationForest-based detection.
try:  # pragma: no cover - import guard
    from sklearn.ensemble import IsolationForest

    SKLEARN_AVAILABLE = True
except Exception:  # pragma: no cover
    SKLEARN_AVAILABLE = False


# =====================================================================
# Constants
# =====================================================================

_BASELINE_PATH = Path(
    os.path.expandvars(r"%LOCALAPPDATA%\AVS AI Shield\threat_engine\ml_baseline.json")
)

_POLL_INTERVAL = 10  # seconds between monitoring polls
_MAX_ANOMALIES = 500
_ZSCORE_THRESHOLD = 3.0  # standard deviations above the mean
_MIN_BASELINE_SAMPLES = 10  # minimum samples before z-score is meaningful
_BASELINE_SAMPLE_INTERVAL = 2  # seconds between samples during training

# Legitimate path for common Windows system processes that are frequently
# impersonated by malware.
_SYSTEM_PROCESS_PATHS: dict[str, str] = {
    "svchost.exe": r"c:\windows\system32\svchost.exe",
    "lsass.exe": r"c:\windows\system32\lsass.exe",
    "csrss.exe": r"c:\windows\system32\csrss.exe",
    "winlogon.exe": r"c:\windows\system32\winlogon.exe",
    "services.exe": r"c:\windows\system32\services.exe",
    "smss.exe": r"c:\windows\system32\smss.exe",
    "wininit.exe": r"c:\windows\system32\wininit.exe",
    "explorer.exe": r"c:\windows\explorer.exe",
}

# Parent processes that are expected for common system binaries.
_EXPECTED_PARENTS: dict[str, set[str]] = {
    "svchost.exe": {"services.exe"},
    "taskhostw.exe": {"svchost.exe"},
    "dllhost.exe": {"svchost.exe"},
}

# Metrics tracked in the baseline profile.
_METRIC_KEYS = ("cpu", "memory_mb", "threads", "handles", "network_connections")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# =====================================================================
# Ring buffer
# =====================================================================

class _AnomalyBuffer:
    """Thread-safe ring buffer for detected anomalies."""

    def __init__(self, max_size: int = _MAX_ANOMALIES) -> None:
        self._lock = threading.Lock()
        self._items: list[dict[str, Any]] = []
        self._max_size = max_size

    def add(self, item: dict[str, Any]) -> None:
        with self._lock:
            self._items.append(item)
            if len(self._items) > self._max_size:
                self._items.pop(0)

    def snapshot(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._items)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._items)


# =====================================================================
# MLAnomalyClassifier
# =====================================================================

class MLAnomalyClassifier:
    """Statistical / ML anomaly classifier for process behaviour.

    Maintains a baseline of normal process metrics and flags processes that
    deviate significantly.  Uses z-score analysis by default and, when
    available, an IsolationForest model from scikit-learn for additional
    anomaly signal.
    """

    name = "ml_anomaly"

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config or {}
        self._lock = threading.Lock()

        # Monitoring state
        self._running = False
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

        # Baseline profile: { metric: { mean, std, min, max, samples } }
        self._baseline: dict[str, Any] = {}
        self._baseline_samples: int = 0
        self._baseline_trained_at: str | None = None

        # IsolationForest model (only when sklearn is available)
        self._model: Any = None
        self._model_type: str = "zscore"

        # Raw samples retained for IsolationForest training (cleared after use)
        self._raw_samples: list[dict[str, float]] = []

        # Anomaly ring buffer and counters
        self._buffer = _AnomalyBuffer(_MAX_ANOMALIES)
        self._anomalies_detected: int = 0

        # Load persisted baseline
        self._load_baseline()

        # Decide model type based on availability + baseline
        if SKLEARN_AVAILABLE and self._baseline_samples >= _MIN_BASELINE_SAMPLES:
            self._model_type = "isolation_forest"
            self._train_isolation_forest()
        elif SKLEARN_AVAILABLE:
            self._model_type = "isolation_forest"
        else:
            self._model_type = "zscore"

    # -----------------------------------------------------------------
    # Baseline persistence
    # -----------------------------------------------------------------

    def _load_baseline(self) -> None:
        """Load the baseline profile from disk if available."""
        try:
            if _BASELINE_PATH.exists():
                with open(_BASELINE_PATH, "r", encoding="utf-8") as fh:
                    data = json.load(fh)
                if isinstance(data, dict):
                    self._baseline = data.get("profile", {})
                    self._baseline_samples = int(data.get("sample_count", 0))
                    self._baseline_trained_at = data.get("trained_at")
                    log.info(
                        "Loaded ML baseline (%d samples) from %s",
                        self._baseline_samples,
                        _BASELINE_PATH,
                    )
        except Exception as e:
            log.debug("Could not load baseline: %s", e)
            self._baseline = {}

    def _save_baseline(self) -> None:
        """Persist the current baseline profile to disk."""
        try:
            _BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "trained_at": self._baseline_trained_at or _now_iso(),
                "sample_count": self._baseline_samples,
                "profile": self._baseline,
            }
            with open(_BASELINE_PATH, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)
            log.info("Saved ML baseline (%d samples) to %s", self._baseline_samples, _BASELINE_PATH)
        except Exception as e:
            log.warning("Failed to save baseline: %s", e)

    # -----------------------------------------------------------------
    # Metrics collection
    # -----------------------------------------------------------------

    def _collect_metrics(self) -> list[dict[str, Any]]:
        """Collect current process metrics for all running processes.

        Returns a list of dicts, one per process, containing:
        ``pid``, ``name``, ``exe``, ``ppid``, ``cpu``, ``memory_mb``,
        ``threads``, ``handles``, ``network_connections``.
        """
        metrics: list[dict[str, Any]] = []

        # Build a pid -> connection count map to avoid repeated scans.
        conn_counts: dict[int, int] = {}
        try:
            for conn in psutil.net_connections(kind="inet"):
                pid = conn.pid
                if pid is not None:
                    conn_counts[pid] = conn_counts.get(pid, 0) + 1
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            pass
        except Exception as e:
            log.debug("net_connections failed: %s", e)

        for proc in psutil.process_iter(
            ["pid", "name", "exe", "ppid", "cpu_percent", "memory_info", "num_threads"]
        ):
            try:
                info = proc.info
                pid = info.get("pid", 0)
                if not pid:
                    continue

                mem_info = info.get("memory_info")
                memory_mb = 0.0
                if mem_info and hasattr(mem_info, "rss"):
                    memory_mb = mem_info.rss / (1024.0 * 1024.0)

                # Handle count is Windows-specific via psutil.Process.num_handles().
                handles = 0
                if IS_WINDOWS:
                    try:
                        handles = proc.num_handles()
                    except (psutil.AccessDenied, psutil.NoSuchProcess):
                        handles = 0
                    except Exception:
                        handles = 0

                entry: dict[str, Any] = {
                    "pid": pid,
                    "name": info.get("name", "") or "",
                    "exe": info.get("exe", "") or "",
                    "ppid": info.get("ppid", 0) or 0,
                    "cpu": float(info.get("cpu_percent", 0.0) or 0.0),
                    "memory_mb": round(memory_mb, 2),
                    "threads": int(info.get("num_threads", 0) or 0),
                    "handles": int(handles),
                    "network_connections": int(conn_counts.get(pid, 0)),
                }
                metrics.append(entry)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            except Exception as e:
                log.debug("metrics collection error for pid %s: %s", proc.pid, e)
                continue

        return metrics

    # -----------------------------------------------------------------
    # Statistical helpers
    # -----------------------------------------------------------------

    @staticmethod
    def _compute_zscore(value: float, mean: float, std: float) -> float:
        """Compute the z-score of *value* relative to *mean* and *std*.

        Returns 0.0 when the standard deviation is zero (no variation in the
        baseline) to avoid division-by-zero.
        """
        if std <= 0 or not math.isfinite(std):
            return 0.0
        return (value - mean) / std

    def _update_baseline_from_samples(self, samples: list[dict[str, float]]) -> None:
        """Compute mean/std/min/max for each metric from collected samples."""
        profile: dict[str, Any] = {}
        for key in _METRIC_KEYS:
            values = [s.get(key, 0.0) for s in samples if key in s]
            if not values:
                continue
            n = len(values)
            mean = sum(values) / n
            if n > 1:
                variance = sum((v - mean) ** 2 for v in values) / (n - 1)
                std = math.sqrt(variance)
            else:
                std = 0.0
            profile[key] = {
                "mean": round(mean, 4),
                "std": round(std, 4),
                "min": round(min(values), 4),
                "max": round(max(values), 4),
                "samples": n,
            }
        self._baseline = profile
        self._baseline_samples = len(samples)
        self._baseline_trained_at = _now_iso()

    # -----------------------------------------------------------------
    # IsolationForest
    # -----------------------------------------------------------------

    def _train_isolation_forest(self) -> bool:
        """Train (or retrain) an IsolationForest model on the baseline.

        Returns True if the model was successfully trained.
        """
        if not SKLEARN_AVAILABLE:
            return False

        # We need raw sample vectors to train.  When the baseline was loaded
        # from disk we only have summary statistics, so we cannot retrain
        # from a persisted baseline.  Training happens at the end of
        # ``train_baseline`` where raw samples are available.
        if not self._raw_samples:
            return False

        try:
            vectors = [
                [s.get(k, 0.0) for k in _METRIC_KEYS]
                for s in self._raw_samples
            ]
            if len(vectors) < _MIN_BASELINE_SAMPLES:
                return False
            self._model = IsolationForest(
                n_estimators=100,
                contamination="auto",
                random_state=42,
            )
            self._model.fit(vectors)
            self._model_type = "isolation_forest"
            log.info("IsolationForest trained on %d samples", len(vectors))
            return True
        except Exception as e:
            log.warning("IsolationForest training failed: %s", e)
            self._model = None
            self._model_type = "zscore"
            return False

    # -----------------------------------------------------------------
    # Baseline training
    # -----------------------------------------------------------------

    def train_baseline(self, duration_seconds: int = 60) -> dict[str, Any]:
        """Collect baseline data for *duration_seconds* seconds.

        Samples the running process list every ``_BASELINE_SAMPLE_INTERVAL``
        seconds and aggregates the metrics into a statistical profile.  The
        profile is persisted to disk and, if scikit-learn is available, an
        IsolationForest model is trained on the raw samples.
        """
        log.info("Training ML baseline for %d seconds", duration_seconds)
        raw_samples: list[dict[str, float]] = []
        deadline = time.time() + max(1, duration_seconds)

        # Prime psutil cpu_percent so the first reading is meaningful.
        try:
            for p in psutil.process_iter(["pid"]):
                try:
                    p.cpu_percent(interval=None)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception:
            pass

        while time.time() < deadline:
            try:
                metrics = self._collect_metrics()
                for m in metrics:
                    raw_samples.append({
                        "cpu": m["cpu"],
                        "memory_mb": m["memory_mb"],
                        "threads": m["threads"],
                        "handles": m["handles"],
                        "network_connections": m["network_connections"],
                    })
            except Exception as e:
                log.debug("baseline sample error: %s", e)
            time.sleep(_BASELINE_SAMPLE_INTERVAL)

        self._raw_samples = raw_samples
        self._update_baseline_from_samples(raw_samples)
        self._save_baseline()

        if SKLEARN_AVAILABLE:
            self._train_isolation_forest()
        else:
            self._model_type = "zscore"
            self._model = None

        return {
            "trained": True,
            "sample_count": self._baseline_samples,
            "duration_seconds": duration_seconds,
            "model_type": self._model_type,
            "trained_at": self._baseline_trained_at,
            "profile": self._baseline,
        }

    # -----------------------------------------------------------------
    # Anomaly detection
    # -----------------------------------------------------------------

    def _detect_impersonation(self, name: str, exe: str) -> bool:
        """Return True if a known system process name runs from a wrong path."""
        expected = _SYSTEM_PROCESS_PATHS.get(name.lower())
        if not expected:
            return False
        if not exe:
            return True  # system process with no exe path is suspicious
        return exe.lower() != expected.lower()

    def _detect_unusual_parent(self, name: str, ppid: int) -> bool:
        """Return True if the process parent is missing or unexpected."""
        if not ppid:
            return True
        expected_parents = _EXPECTED_PARENTS.get(name.lower())
        if not expected_parents:
            return False
        try:
            parent = psutil.Process(ppid)
            parent_name = parent.name().lower()
            return parent_name not in expected_parents
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return True
        except Exception:
            return False

    def _detect_anomalies(self, metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Detect anomalous processes from a metrics snapshot.

        Combines z-score analysis (or IsolationForest predictions when
        available) with heuristic scoring for impersonation and parent
        anomalies.
        """
        anomalies: list[dict[str, Any]] = []
        if not metrics:
            return anomalies

        has_baseline = bool(self._baseline) and self._baseline_samples >= _MIN_BASELINE_SAMPLES

        # Prepare feature vectors for IsolationForest if available.
        if SKLEARN_AVAILABLE and self._model is not None:
            vectors = [
                [m.get(k, 0.0) for k in _METRIC_KEYS]
                for m in metrics
            ]
            try:
                predictions = self._model.predict(vectors)
                scores = self._model.score_samples(vectors)
            except Exception as e:
                log.debug("IsolationForest prediction failed: %s", e)
                predictions = [1] * len(metrics)
                scores = [0.0] * len(metrics)
        else:
            predictions = [1] * len(metrics)
            scores = [0.0] * len(metrics)

        for idx, m in enumerate(metrics):
            score: float = 0.0
            reasons: list[str] = []

            # --- Statistical z-score checks ---
            if has_baseline:
                for key, weight, label in (
                    ("cpu", 2, "cpu_usage_high"),
                    ("memory_mb", 2, "memory_usage_high"),
                    ("threads", 1, "thread_count_high"),
                    ("network_connections", 2, "network_connections_high"),
                ):
                    stat = self._baseline.get(key)
                    if not stat:
                        continue
                    z = self._compute_zscore(
                        float(m.get(key, 0.0)),
                        float(stat.get("mean", 0.0)),
                        float(stat.get("std", 0.0)),
                    )
                    if z > _ZSCORE_THRESHOLD:
                        score += weight
                        reasons.append(f"{label} (z={z:.2f})")

            # --- IsolationForest anomaly ---
            if SKLEARN_AVAILABLE and self._model is not None:
                if predictions[idx] == -1:
                    score += 2
                    reasons.append(f"isolation_forest_anomaly (score={scores[idx]:.3f})")

            # --- Heuristic: process-name impersonation ---
            if self._detect_impersonation(m.get("name", ""), m.get("exe", "")):
                score += 3
                reasons.append("process_impersonation")

            # --- Heuristic: unusual / missing parent ---
            if self._detect_unusual_parent(m.get("name", ""), int(m.get("ppid", 0))):
                score += 1
                reasons.append("unusual_parent")

            if score >= 2:
                severity = "critical" if score >= 7 else "high" if score >= 5 else "medium"
                anomalies.append({
                    "timestamp": _now_iso(),
                    "pid": m["pid"],
                    "process_name": m.get("name", ""),
                    "exe": m.get("exe", ""),
                    "ppid": m.get("ppid", 0),
                    "score": score,
                    "severity": severity,
                    "reasons": reasons,
                    "metrics": {
                        "cpu": m.get("cpu", 0.0),
                        "memory_mb": m.get("memory_mb", 0.0),
                        "threads": m.get("threads", 0),
                        "handles": m.get("handles", 0),
                        "network_connections": m.get("network_connections", 0),
                    },
                    "model_type": self._model_type,
                })

        return anomalies

    # -----------------------------------------------------------------
    # Single-process analysis
    # -----------------------------------------------------------------

    def analyze_process(self, pid: int) -> dict[str, Any]:
        """Analyze a specific process for anomalies.

        Returns a dict with the process metrics, anomaly score, reasons and
        a boolean ``is_anomalous`` flag.
        """
        try:
            proc = psutil.Process(pid)
        except psutil.NoSuchProcess:
            return {"pid": pid, "error": "no_such_process", "is_anomalous": False}
        except psutil.AccessDenied:
            return {"pid": pid, "error": "access_denied", "is_anomalous": False}

        try:
            with proc.oneshot():
                name = proc.name()
                exe = proc.exe()
                ppid = proc.ppid()
                cpu = proc.cpu_percent(interval=0.1)
                mem_info = proc.memory_info()
                memory_mb = mem_info.rss / (1024.0 * 1024.0) if mem_info else 0.0
                threads = proc.num_threads()
                handles = 0
                if IS_WINDOWS:
                    try:
                        handles = proc.num_handles()
                    except Exception:
                        handles = 0
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            return {"pid": pid, "error": str(e), "is_anomalous": False}

        # Count network connections for this pid.
        network_connections = 0
        try:
            for conn in psutil.net_connections(kind="inet"):
                if conn.pid == pid:
                    network_connections += 1
        except (psutil.AccessDenied, psutil.NoSuchProcess):
            pass
        except Exception:
            pass

        metric = {
            "pid": pid,
            "name": name,
            "exe": exe,
            "ppid": ppid,
            "cpu": float(cpu),
            "memory_mb": round(memory_mb, 2),
            "threads": int(threads),
            "handles": int(handles),
            "network_connections": int(network_connections),
        }

        anomalies = self._detect_anomalies([metric])
        if anomalies:
            result = anomalies[0]
            result["is_anomalous"] = True
            return result

        return {
            "pid": pid,
            "process_name": name,
            "exe": exe,
            "ppid": ppid,
            "score": 0,
            "severity": "none",
            "reasons": [],
            "metrics": {
                "cpu": metric["cpu"],
                "memory_mb": metric["memory_mb"],
                "threads": metric["threads"],
                "handles": metric["handles"],
                "network_connections": metric["network_connections"],
            },
            "model_type": self._model_type,
            "is_anomalous": False,
        }

    # -----------------------------------------------------------------
    # Monitoring loop
    # -----------------------------------------------------------------

    def _monitor_loop(self) -> None:
        log.info("ML anomaly classifier monitoring started (model=%s)", self._model_type)
        while not self._stop_event.is_set():
            try:
                metrics = self._collect_metrics()
                anomalies = self._detect_anomalies(metrics)
                for a in anomalies:
                    self._buffer.add(a)
                    with self._lock:
                        self._anomalies_detected += 1
                    log.warning(
                        "Anomaly detected: pid=%s name=%s score=%s reasons=%s",
                        a["pid"], a["process_name"], a["score"], a["reasons"],
                    )
            except Exception as e:
                log.debug("ML monitor loop error: %s", e)
            self._stop_event.wait(_POLL_INTERVAL)
        log.info("ML anomaly classifier monitoring stopped")

    # -----------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------

    def start(self) -> dict[str, Any]:
        """Start background monitoring (polls every 10 seconds)."""
        with self._lock:
            if self._running:
                return {"started": False, "reason": "already_running"}
            self._running = True

        self._stop_event.clear()
        self._thread = threading.Thread(
            target=self._monitor_loop, daemon=True, name="ml-anomaly-monitor"
        )
        self._thread.start()
        return {"started": True, "started_at": _now_iso(), "model_type": self._model_type}

    def stop(self) -> dict[str, Any]:
        """Stop the monitoring thread."""
        with self._lock:
            if not self._running:
                return {"stopped": False, "reason": "not_running"}
            self._running = False

        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=_POLL_INTERVAL + 5)
        self._thread = None
        return {"stopped": True, "stopped_at": _now_iso()}

    # -----------------------------------------------------------------
    # Public accessors
    # -----------------------------------------------------------------

    def get_anomalies(self) -> list[dict[str, Any]]:
        """Return a copy of all detected anomalies (most recent last)."""
        return self._buffer.snapshot()

    def get_status(self) -> dict[str, Any]:
        """Return the current classifier status."""
        with self._lock:
            return {
                "running": self._running,
                "baseline_samples": self._baseline_samples,
                "anomalies_detected": self._anomalies_detected,
                "model_type": self._model_type,
                "sklearn_available": SKLEARN_AVAILABLE,
                "baseline_trained_at": self._baseline_trained_at,
                "anomalies_buffered": len(self._buffer),
                "captured_at": _now_iso(),
            }
