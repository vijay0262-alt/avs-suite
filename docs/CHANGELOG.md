# AVS AI Shield: Security & System Intelligence — Changelog

All notable changes to AVS AI Shield: Security & System Intelligence are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] — V1.1 AI PC Health Platform

### Added — AI Hardware Intelligence (EPIC 2)
- Hardware Center dashboard with overview, live graphs, alerts, and export
- AI Hardware Health Engine — analyzes, explains, and recommends (no hardware modification)
- Hardware scanner, monitor, manager, diagnostics, capabilities detection
- Hardware AI engine with context provider integration

### Added — AI Active Protection Dashboard (EPIC 3)
- Security Dashboard page with 9 panels (overview, protection status, threat timeline, provider health, security analytics, command center, protection reports, AI insights, security search)
- Real-Time Protection Engine with 10 monitor types (file system, process, service, scheduled task, startup, registry, browser, download, USB, network)
- Security Center with 20+ detection providers (adware, spyware, browser hijacker, crypto miner, PUP, PowerShell, macro, script, persistence, network behavior, file reputation, unsigned executable, suspicious process, service analysis, startup abuse, scheduled task, threat intelligence, publisher trust, browser protection, signature)
- Security Investigation engine (threat correlation, explanation, confidence scoring, severity, timeline, knowledge base, recommendations, reports)
- Security Remediation engine (quarantine, deletion, rollback, restore, safety validation, false positive tracking, approval management)
- 82 tests for Security Dashboard (ViewModel + component rendering + accessibility + regression)

### Added — AI Platform
- AI Context Engine with provenance, evidence tracking, and confidence scores
- AI Insights Engine, AI Recommendations Engine, AI Predictions Engine
- AI Process Intelligence engine (process analyzer, impact, risk, explanation, recommendations — no UI yet)
- AI Predictive Health engine (forecast, trend, reliability, thermal, battery, memory, storage, health, performance)
- AI Smart Optimization (planner, adaptive, automation, maintenance, profiles, goals, simulation, recovery, timeline, intelligence)
- AI Workspace (command center, AVS AI Assistant, report studio, actions, tools, multimodal, personalization, quality)
- AI Health Engine, AI Assistant, AI Orchestration, AI Knowledge Base, AI Device Profile
- Dashboard Intelligence (core widgets, actions, widget framework)

### Added — Infrastructure
- Customer Portal (Next.js, v0.1.0 — in development)
- Undo/Restore frontend integration (8 RPC methods wired to UI)
- Module Registry initialization at app startup

### Fixed
- ProtectionManager.enable/disable not updating monitor.enabled flag
- SecurityDashboardViewModel.generateReport wiping state (missing ...prev spread)
- Null-safe access for state.insights in SecurityDashboardPage

### Statistics
- 7,957 tests across 118 test files — all passing
- 61 feature modules, 18 AI engines, 5 dashboards, 19 routes

---

## [1.0.0] — 2026-07-23

### Added
- Centralized version management system with build number, channel, and edition
- Edition Manager framework (Free/Pro/Enterprise) using React context
- Reusable Upgrade Dialog with Pro benefits and feature comparison table
- Professional About page with branding, version info, legal links, and update check
- Update framework with manual check-for-updates capability (auto-update disabled)
- Commercial settings: Application Edition, Version, Update Preferences, Telemetry
- Product branding consistency: publisher name, copyright, window titles
- Release documentation: User Guide, Installation Guide, Release Notes, Changelog
- Legal placeholders: Privacy Policy, Terms of Service, EULA, Open Source Licenses
- Commercial release checklist

### Fixed
- Missing PyInstaller hidden imports causing `dashboard.metrics` unavailable error
- `_ensure_live_metrics_thread` NameError in packaged backend exe
- Frontend RPC timeout for dashboard calls (30s → 120s)
- Windows Health page "View" button route mismatch (`/system-info` → `/system-information`)
- False Windows Defender disabled warnings when third-party AV is active
- False Firewall disabled warnings when third-party firewall is active
- Windows Updates detection: distinguish disabled service vs pending updates
- SmartScreen detection across multiple registry locations
- ThreadPoolExecutor blocking on shutdown in dashboard collectors
- `_ttl_cache` lock contention causing hangs

### Changed
- Updated publisher name to "Advanced Vision Software LLC"
- Updated copyright to "© 2024-2026 Advanced Vision Software LLC"
- Updated `APP_METADATA` with `publisherName` and `description` fields
- Module load order reordered to prevent import deadlocks
- Security detection redesigned to use Windows Security Center API

### Security
- Windows Security Center API integration for accurate AV/firewall detection
- Third-party antivirus detection via `root/SecurityCenter2` WMI namespace
- Third-party firewall detection via WSC products query

---

## [0.1.0] — 2026-07-15

### Added
- Initial scaffold with dashboard, junk cleaner, registry cleaner, startup manager
- Privacy cleaner, duplicate finder, disk analyzer, uninstaller
- Software updater, performance monitor, system information
- Security page, diagnostics page, settings page
- JSON-RPC backend with 105 registered methods across 18 modules
- Electron frontend with React, Vite, TailwindCSS
- PyInstaller packaging for Windows x64
