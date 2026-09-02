"""AVS AI Shield — Python backend package.

The backend runs as a child process of the Electron main process and
communicates over stdio using JSON-RPC 2.0. See ``api/rpc_server.py``.

Layers:

* ``api``          — JSON-RPC dispatcher and method registration.
* ``common``       — shared utilities (constants, logging, errors, DI).
* ``models``       — dataclasses used across modules.
* Feature modules  — cleaner, startup, privacy, duplicate_finder,
                     disk_analyzer, performance, system_information,
                     scheduler, settings, registry_cleaner, uninstaller,
                     software_updater, hardware_monitor, dashboard,
                     junk_monitor, auto_care, process_priority,
                     workload, anomaly, app_freezer, network_optimizer,
                     network_info, context_menu, browser_extensions,
                     pup_scanner, reporting, notifications,
                     full_system_scan, file_shredder, disk_optimizer.
* ``scan_core``    — unified scan engine: rules, assets, execution,
                     orchestration, remediation, adapters.
* ``threat_engine`` — ClamAV, YARA, AMSI, VirusTotal, Abuse.ch,
                     MalwareBazaar, NIST NSRL, Defender integration.
* ``realtime_threat`` — file monitor, process monitor, USB monitor,
                     network C2 detection.
* ``advanced_security`` — behavioral sandbox, ML anomaly, web shield,
                     ransomware vaccine, email scanner, boot sector.
* ``ai_features``  — threat explainer, optimization advisor, security
                     audit, threat timeline, community intel, privacy
                     score, game/movie mode.
* ``utilities``    — Windows-specific helpers guarded by ``platform``.
* ``logs``         — rotating file-log configuration.
"""

__version__ = "1.0.0"
