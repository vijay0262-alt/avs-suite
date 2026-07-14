"""AVS PC Optimizer — Python backend package.

The backend runs as a child process of the Electron main process and
communicates over stdio using JSON-RPC 2.0. See ``api/rpc_server.py``.

Layers:

* ``api``          — JSON-RPC dispatcher and method registration.
* ``common``       — shared utilities (constants, logging, errors, DI).
* ``models``       — dataclasses used across modules.
* Feature modules  — cleaner, startup, privacy, duplicate_finder,
                     disk_analyzer, performance, system_information,
                     scheduler, settings.
* ``utilities``    — Windows-specific helpers guarded by ``platform``.
* ``logs``         — rotating file-log configuration.

No feature-level logic is implemented in this initial scaffold — only
public method stubs so the RPC contract compiles end-to-end.
"""

__version__ = "0.1.0"
