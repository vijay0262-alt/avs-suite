/**
 * AVS Release Engineering — Barrel Export
 *
 * Phase 4.0 — Version 1.0 Release Engineering & Production Readiness.
 *
 * EPICS:
 *   1.  Performance Profiler
 *   2.  Stability Validator
 *   3.  Installer Config
 *   4.  Auto Updater
 *   5.  Security Auditor
 *   6.  Accessibility Manager
 *   7.  QA Test Suite
 *   8.  Diagnostics Bundle
 *   9.  Documentation Generator
 *   10. Release Checklist
 *
 * This module does NOT modify any existing architecture.
 */

// Types
export type {
  StartupType,
  StartupMetric,
  ResourceSnapshot,
  LatencyMetric,
  PerformanceReport,
  StabilityTestType,
  StabilityTestStatus,
  StabilityTestResult,
  StabilityReport,
  InstallMode,
  InstallScope,
  InstallerConfig,
  UpdateChannel,
  UpdateInfo,
  UpdateStatus,
  UpdateState,
  SecurityAuditCategory,
  SecurityAuditStatus,
  SecurityAuditResult,
  SecurityAuditReport,
  AccessibilityFeature,
  AccessibilityStatus,
  AccessibilityReport,
  DiagnosticExportType,
  DiagnosticExport,
  ChecklistStatus,
  ChecklistItem,
  FeatureChecklistItem,
  KnownIssue,
  CompatibilityEntry,
  MinimumRequirements,
  ReleaseChecklist,
  ReleaseEventType,
  ReleaseEventListener,
} from './types';
export { DEFAULT_INSTALLER_CONFIG, formatBytes, formatMs, average } from './types';

// Events
export { ReleaseEventEmitter, releaseEvents } from './releaseEvents';

// EPIC 1 — Performance
export { PerformanceProfiler, performanceProfiler } from './performanceProfiler';

// EPIC 2 — Stability
export { StabilityValidator, stabilityValidator } from './stabilityValidator';

// EPIC 3 — Installer
export { InstallerConfigBuilder, installerConfigBuilder } from './installerConfig';

// EPIC 4 — Auto Update
export { AutoUpdater, autoUpdater } from './autoUpdater';

// EPIC 5 — Security
export { SecurityAuditor, securityAuditor } from './securityAuditor';

// EPIC 6 — Accessibility
export { AccessibilityManager, accessibilityManager } from './accessibilityManager';

// EPIC 7 — QA
export { QATestSuite, qaTestSuite } from './qaTestSuite';
export type { QATestScenario, QATestResult, QATestReport } from './qaTestSuite';

// EPIC 8 — Diagnostics
export { DiagnosticsBundle, diagnosticsBundle } from './diagnosticsBundle';

// EPIC 9 — Documentation
export { DocumentationGenerator, documentationGenerator } from './documentationGenerator';
export type { DocSection, GeneratedDoc } from './documentationGenerator';

// EPIC 10 — Release Checklist
export { ReleaseChecklistManager, releaseChecklistManager } from './releaseChecklist';
