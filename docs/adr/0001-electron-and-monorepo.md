# ADR 0001 — Electron for Windows-first, monorepo shape

* **Status**: Accepted
* **Date**: 2026-01
* **Context**: We need a native-feeling Windows desktop utility that can
  eventually target more platforms and add sibling products
  (Security, Driver Updater, VPN, File Recovery).
* **Decision**:
  * Electron for the shell (single skill-set, wide ecosystem,
    `electron-updater` for signed auto-updates).
  * Python for privileged system work (psutil, pywin32, WMI) spawned
    as an out-of-process child. Communication via JSON-RPC 2.0 over
    line-delimited stdio.
  * Yarn workspaces monorepo (`apps/*`, `packages/*`) so a shared
    design-system and framework can be developed once and adopted by
    every product.
* **Consequences**:
  * (+) Rapid product family expansion, single design system, single
    CI pipeline.
  * (+) Python isolation contains crashes and privilege escalation to a
    single process.
  * (−) Two runtimes to package (Node + Python via PyInstaller).
  * (−) Testing must cover the RPC serialisation boundary.
