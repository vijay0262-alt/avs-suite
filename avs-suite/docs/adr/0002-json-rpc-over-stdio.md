# ADR 0002 — JSON-RPC 2.0 over stdio for Electron ↔ Python

* **Status**: Accepted
* **Date**: 2026-01
* **Context**: Two candidates evaluated: (a) local HTTP server (loopback),
  (b) JSON-RPC over stdio.
* **Decision**: JSON-RPC over stdio.
* **Rationale**:
  * No listening TCP port → smaller attack surface, no firewall dialog.
  * Lower per-call latency than HTTP.
  * Simpler packaging: PyInstaller-produced exe + `spawn(...)`.
  * Deterministic lifecycle — child is bound to Electron main.
* **Trade-offs**:
  * (−) Debugging is slightly harder without HTTP tools; mitigated by
    a `--debug-rpc` mode that mirrors traffic to a log file.
  * (−) Streaming responses require notification-style messages (id-less).
