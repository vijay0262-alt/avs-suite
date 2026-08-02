# AVS Suite — Feature Matrix

**Every feature in the codebase with status, edition, module, and production readiness.**
Last updated: 2026-08-02

---

## Legend

- **Status**: Complete, Engine Only (no UI), Placeholder, In Development
- **Edition**: Free, Pro (Professional), Both
- **UI**: Yes / No
- **Tests**: Yes / No
- **Production Ready**: Yes / No / N/A

---

## PC Optimizer Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Dashboard | Complete | Both | `features/dashboard/` | `@avs/core`, `@avs/ui` | Yes | Yes | Yes |
| Health Score | Complete | Both | `features/health/` | `features/dashboard/` | Yes | Yes | Yes |
| Junk Cleaner — Scan | Complete | Both | `features/junk-cleaner/` | Python `cleaner/` | Yes | Yes | Yes |
| Junk Cleaner — Deep | Complete | Pro | `features/junk-cleaner/` | Python `cleaner/` | Yes | Yes | Yes |
| Junk Cleaner — Clean | Complete | Both | `features/junk-cleaner/` | Python `cleaner/` | Yes | Yes | Yes |
| Registry Cleaner | Complete | Both | `features/registry/` | Python `registry_cleaner/` | Yes | Yes | Yes |
| Startup Manager | Complete | Both | `features/startup/` | Python `startup/` | Yes | Yes | Yes |
| Privacy Cleaner | Complete | Pro | `features/privacy/` | Python `privacy/` | Yes | Yes | Yes |
| Duplicate Finder | Complete | Pro | `features/duplicate-finder/`, `features/duplicate-engine/` | Python `duplicate_finder/` | Yes | Yes | Yes |
| Disk Analyzer | Complete | Pro | `features/disk-analyzer/` | Python `disk_analyzer/` | Yes | Yes | Yes |
| Uninstaller | Complete | Pro | `features/uninstaller/` | Python `uninstaller/` | Yes | Yes | Yes |
| Software Updater | Complete | Pro | `features/software-updater/` | Python `software_updater/` | Yes | Yes | Yes |
| Performance Monitor | Complete | Pro | `features/performance/` | Python `performance/` | Yes | Yes | Yes |
| System Information | Complete | Both | `features/system-info/` | Python `system_information/` | Yes | Yes | Yes |
| Security Page (legacy) | Complete | Both | `features/security/` | Python `dashboard/` | Yes | Yes | Yes |
| Maintenance History | Complete | Pro | `features/maintenance-history/`, `features/maintenance-ui/` | `features/maintenance-engine/` | Yes | Yes | Yes |
| Reports | Complete | Pro | `features/optimization-reports/`, `features/optimization-report/` | `features/optimization-planner/` | Yes | Yes | Yes |
| Settings | Complete | Both | `pages/SettingsPage.tsx` | `@avs/shared`, `@avs/licensing` | Yes | Yes | Yes |
| About | Complete | Both | `pages/AboutPage.tsx` | `config/version.ts` | Yes | Yes | Yes |
| Diagnostics | Complete | Both | `features/diagnostics/` | Python backend | Yes | Yes | Yes |

## AI Active Protection Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Security Dashboard | Complete | Both | `features/security-dashboard/` | `features/realtime-protection/` | Yes | Yes | Yes |
| Real-Time Protection Engine | Complete | Pro | `features/realtime-protection/` | None (self-contained) | No | Yes | Yes |
| File System Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Process Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Service Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Scheduled Task Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Startup Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Registry Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Browser Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Download Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| USB Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Network Monitor | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Protection Rule Engine | Complete | Pro | `features/realtime-protection/` | `ProtectionConfiguration` | No | Yes | Yes |
| Protection Scheduler | Complete | Pro | `features/realtime-protection/` | `ProtectionManager` | No | Yes | Yes |
| Protection State Machine | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |
| Protection Statistics | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |
| Protection Telemetry | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |
| Protection Session Mgmt | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |
| Protection Notifications | Complete | Pro | `features/realtime-protection/` | `ProtectionEvents` | No | Yes | Yes |
| Protection Action Queue | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |
| Protection Health | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |
| Protection History | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |
| Protection Diagnostics | Complete | Pro | `features/realtime-protection/` | None | No | Yes | Yes |

## Security Center Detection Providers

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Adware Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Spyware Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Browser Hijacker Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Crypto Miner Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| PUP Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| PowerShell Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Macro Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Script Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Persistence Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Network Behavior Analysis | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| File Reputation | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Unsigned Executable Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Suspicious Process Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Service Analysis | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Startup Abuse Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Scheduled Task Analysis | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Threat Intelligence | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Publisher Trust | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Browser Protection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Signature Detection | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Security Engine | Complete | Pro | `features/security-center/` | All providers | No | Yes | Yes |
| Security Manager | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Security Scanner | Complete | Pro | `features/security-center/` | `SecurityEngine` | No | Yes | Yes |
| Security Health | Complete | Pro | `features/security-center/` | None | No | Yes | Yes |
| Security History | Complete | Pro | `features/security-center/` | None | No | Yes | Yes |
| Security Cache | Complete | Pro | `features/security-center/` | None | No | Yes | Yes |
| Security Diagnostics | Complete | Pro | `features/security-center/` | None | No | Yes | Yes |

## Security Investigation Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Threat Correlation Engine | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Explanation Engine | Complete | Pro | `features/security-investigation/` | `ThreatKnowledgeBase` | No | Yes | Yes |
| Threat Confidence Engine | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Severity Engine | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Timeline Builder | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Knowledge Base | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Recommendation Engine | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Report Generator | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Relationship Graph | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Evidence Collector | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Context Builder | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat Summary Builder | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |
| Threat History | Complete | Pro | `features/security-investigation/` | None | No | Yes | Yes |

## Security Remediation Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Remediation Engine | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Remediation Planner | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Remediation Policy | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Quarantine Manager | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Deletion Manager | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Rollback Manager | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Restore Manager | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Safety Validator | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| False Positive Tracker | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Approval Manager | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Remediation History | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Remediation Report | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |
| Remediation Events | Complete | Pro | `features/security-remediation/` | None | No | Yes | Yes |

## AI Hardware Intelligence Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Hardware Center Dashboard | Complete | Both | `features/hardware-center/ui/` | `@avs/ui`, `@avs/core` | Yes | Yes | Yes |
| Hardware Dashboard ViewModel | Complete | Both | `features/hardware-center/ui/` | `features/hardware-center/` | Yes | Yes | Yes |
| Hardware Scanner | Complete | Both | `features/hardware-center/` | None | No | Yes | Yes |
| Hardware Monitor | Complete | Both | `features/hardware-center/` | None | No | Yes | Yes |
| Hardware Manager | Complete | Both | `features/hardware-center/` | None | No | Yes | Yes |
| Hardware Health Engine | Complete | Both | `features/hardware-center/` | None | No | Yes | Yes |
| Hardware Capabilities | Complete | Both | `features/hardware-center/` | None | No | Yes | Yes |
| Hardware Diagnostics | Complete | Both | `features/hardware-center/` | None | No | Yes | Yes |
| Hardware AI Engine | Complete | Both | `features/hardware-ai/` | `features/hardware-center/` | No | Yes | Yes |
| Live Graphs | Complete | Both | `features/hardware-center/ui/` | `@avs/ui` | Yes | Yes | Yes |
| Hardware Alerts | Complete | Both | `features/hardware-center/ui/` | None | Yes | Yes | Yes |
| Hardware Export | Complete | Both | `features/hardware-center/ui/` | None | Yes | Yes | Yes |

## AI Platform Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| AI Context Engine | Complete | Pro | `features/ai-intelligence/context/` | None | No | Yes | Yes |
| AI Insights Engine | Complete | Pro | `features/ai-intelligence/insights/` | `context/` | No | Yes | Yes |
| AI Recommendations Engine | Complete | Pro | `features/ai-intelligence/recommendations/` | `context/`, `insights/` | No | Yes | Yes |
| AI Predictions Engine | Complete | Pro | `features/ai-intelligence/predictions/` | `context/` | No | Yes | Yes |
| AI Orchestration | Complete | Pro | `features/ai-intelligence/orchestration/` | All AI modules | No | Yes | Yes |
| AI Knowledge Base | Complete | Pro | `features/ai-intelligence/knowledge/` | None | No | Yes | Yes |
| AI Device Profile | Complete | Pro | `features/ai-intelligence/device-profile/` | None | No | Yes | Yes |
| AI Health Engine | Complete | Pro | `features/ai-health-engine/` | All analyzers | No | Yes | Yes |
| AI Assistant | Complete | Pro | `features/ai-assistant/` | `context/`, `insights/` | No | Yes | Yes |
| AI Process Intelligence | Engine Only | Pro | `features/process-ai/` | `context/` | No | Yes | No |
| AI Predictive Health | Engine Only | Pro | `features/predictive-health/` | `context/`, `predictions/` | No | Yes | No |
| AI Smart Optimization | Complete | Pro | `features/smart-optimize/` | `recommendations/` | No | Yes | Yes |
| AI Smart Optimization (AI) | Complete | Pro | `features/smart-optimization-ai/` | `smart-optimize/` | No | Yes | Yes |
| AI Workspace — Command Center | Complete | Pro | `features/ai-workspace/command-center/` | None | No | Yes | Yes |
| AI Workspace — Copilot | Complete | Pro | `features/ai-workspace/copilot/` | `ai-assistant/` | No | Yes | Yes |
| AI Workspace — Report Studio | Complete | Pro | `features/ai-workspace/report-studio/` | None | No | Yes | Yes |
| AI Workspace — Actions | Complete | Pro | `features/ai-workspace/actions/` | None | No | Yes | Yes |
| AI Workspace — Tools | Complete | Pro | `features/ai-workspace/tools/` | None | No | Yes | Yes |
| AI Workspace — Multimodal | Complete | Pro | `features/ai-workspace/multimodal/` | None | No | Yes | Yes |
| AI Workspace — Personalization | Complete | Pro | `features/ai-workspace/personalization/` | None | No | Yes | Yes |
| AI Workspace — Quality | Complete | Pro | `features/ai-workspace/quality/` | None | No | Yes | Yes |
| Dashboard Intelligence — Core Widgets | Complete | Pro | `features/dashboard-intelligence/core-widgets/` | None | No | Yes | Yes |
| Dashboard Intelligence — Actions | Complete | Pro | `features/dashboard-intelligence/actions/` | None | No | Yes | Yes |
| Dashboard Intelligence — Widget Framework | Complete | Pro | `features/dashboard-intelligence/widgets/` | None | No | Yes | Yes |

## Smart Optimize Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Smart Optimize Planner | Complete | Pro | `features/smart-optimize/planner/` | None | No | Yes | Yes |
| Adaptive Optimization | Complete | Pro | `features/smart-optimize/adaptive/` | `planner/` | No | Yes | Yes |
| Automation Engine | Complete | Pro | `features/smart-optimize/automation/` | `planner/` | No | Yes | Yes |
| Maintenance Engine | Complete | Pro | `features/smart-optimize/maintenance/` | `planner/` | No | Yes | Yes |
| Optimization Profiles | Complete | Pro | `features/smart-optimize/profiles/` | `planner/` | No | Yes | Yes |
| Optimization Goals | Complete | Pro | `features/smart-optimize/goals/` | `planner/` | No | Yes | Yes |
| Simulation | Complete | Pro | `features/smart-optimize/simulation/` | `planner/` | No | Yes | Yes |
| Recovery | Complete | Pro | `features/smart-optimize/recovery/` | `planner/` | No | Yes | Yes |
| Timeline | Complete | Pro | `features/smart-optimize/timeline/` | None | No | Yes | Yes |
| Intelligence | Complete | Pro | `features/smart-optimize/intelligence/` | `planner/` | No | Yes | Yes |

## Infrastructure Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Module Registry | Complete | Both | `features/module-registry/` | `@avs/core` | No | Yes | Yes |
| Edition Manager | Complete | Both | `config/EditionManager.tsx` | `@avs/shared` | Yes | Yes | Yes |
| Feature Gate | Complete | Both | `features/licensing/FeatureGate.ts` | `@avs/licensing` | No | Yes | Yes |
| Upgrade Dialog | Complete | Both | `components/UpgradeDialog.tsx` | `@avs/licensing` | Yes | Yes | Yes |
| License Activation UI | Complete | Both | `features/licensing/ActivationPage.tsx` | `@avs/licensing` | Yes | Yes | Yes |
| License Service | Placeholder | Both | `packages/licensing/` | None | No | Yes | No |
| Update Framework | Complete | Both | `features/update/` | `@avs/updater` | Yes | Yes | Yes |
| Onboarding | Complete | Both | `features/onboarding/` | None | Yes | Yes | Yes |
| Notifications | Complete | Both | (integrated) | None | No | Yes | Yes |
| Automation Engine | Complete | Pro | `features/smart-optimize/automation/` | None | No | Yes | Yes |
| Execution Pipeline | Complete | Pro | `features/execution-pipeline/` | None | No | Yes | Yes |
| Undo / Restore | Complete | Both | `features/undo/` | Python `undo/` | Yes | Yes | Yes |
| Config Sync | Complete | Both | `features/config-sync/` | None | No | Yes | Yes |
| Release Engineering | Complete | Both | `features/release-engineering/` | None | No | Yes | Yes |
| Production Readiness | Complete | Both | `features/production/` | None | No | Yes | Yes |
| Auth | Complete | Both | `features/auth/` | None | No | Yes | Yes |
| Entitlement | Complete | Both | `features/entitlement/` | `@avs/licensing` | No | Yes | Yes |
| Subscription | Complete | Both | `features/subscription/` | `@avs/licensing` | No | Yes | Yes |
| Sync | Complete | Both | `features/sync/` | None | No | Yes | Yes |
| Usage Capabilities | Complete | Both | `features/usage-capabilities/` | None | No | Yes | Yes |
| Usage Quota | Complete | Both | `features/usage-quota/` | None | No | Yes | Yes |
| Feature Engine | Complete | Both | `features/feature-engine/` | `@avs/licensing` | No | Yes | Yes |
| Experience | Complete | Both | `features/experience/` | None | No | Yes | Yes |
| Windows Health | Complete | Both | `features/windows-health/` | None | No | Yes | Yes |
| Browser Health | Complete | Both | `features/browser-health/` | None | No | Yes | Yes |
| Storage Intelligence | Complete | Both | `features/storage-intelligence/` | None | No | Yes | Yes |
| System Health Dashboard | Complete | Both | `features/system-health-dashboard/` | None | No | Yes | Yes |
| Startup Optimizer | Complete | Both | `features/startup-optimizer/` | None | No | Yes | Yes |

## Future / Placeholder Features

| Name | Status | Edition | Module | Dependencies | UI | Tests | Prod Ready |
|------|--------|---------|--------|-------------|----|-------|------------|
| Driver Updater | Placeholder | Pro | `apps/driver-updater/` (empty) | N/A | No | No | No |
| AVS Security (standalone) | Placeholder | Pro | `apps/security/` (empty) | N/A | No | No | No |
| File Recovery | Placeholder | Pro | `apps/file-recovery/` (empty) | N/A | No | No | No |
| VPN | Placeholder | Pro | `apps/vpn/` (empty) | N/A | No | No | No |
| Customer Portal | In Development | Both | `apps/customer-portal/` | Next.js | Yes | No | No |
| License Server Admin Portal | In Development | Both | `frontend/` (CRA) | N/A | Yes | No | No |
| Antivirus (standalone) | Placeholder | Pro | `moduleDefinitions.ts` | N/A | No | No | No |
| Backup | Placeholder | Pro | `moduleDefinitions.ts` | N/A | No | No | No |
| Browser Cleaner (standalone) | Placeholder | Pro | `moduleDefinitions.ts` | N/A | No | No | No |
| Disk Defragmenter | Placeholder | Pro | `moduleDefinitions.ts` | N/A | No | No | No |
| Network Optimizer | Placeholder | Pro | `moduleDefinitions.ts` | N/A | No | No | No |
| Memory Optimizer (standalone) | Placeholder | Pro | `moduleDefinitions.ts` | N/A | No | No | No |
| Battery Optimizer | Placeholder | Pro | `moduleDefinitions.ts` | N/A | No | No | No |
