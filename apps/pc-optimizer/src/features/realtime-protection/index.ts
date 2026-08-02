/**
 * Real-Time AI Protection — barrel exports
 *
 * Version 1.2 — EPIC 2 — Part 1 — Real-Time Monitoring Framework
 *
 * Event-driven real-time protection. Lightweight, non-blocking, enterprise-ready.
 * Reuses existing security scanning modules — no duplicate logic.
 */

// Types
export * from './types';

// Events
export { protectionEventBus } from './ProtectionEvents';

// Configuration & Policy
export { ProtectionConfigurationManager } from './ProtectionConfiguration';
export { ProtectionPolicyManager } from './ProtectionPolicy';

// State & Scheduling
export { ProtectionStateMachine } from './ProtectionStateMachine';
export { ProtectionScheduler } from './ProtectionScheduler';
export type { ScheduledTask } from './ProtectionScheduler';

// Rules
export { ProtectionRuleEngine } from './ProtectionRuleEngine';

// Action Queue
export { ProtectionActionQueue } from './ProtectionActionQueue';

// Notifications
export { ProtectionNotificationCenter } from './ProtectionNotificationCenter';

// Telemetry
export { ProtectionTelemetryCollector } from './ProtectionTelemetry';

// Session
export { ProtectionSessionManager } from './ProtectionSession';

// Health & Diagnostics
export { ProtectionHealthChecker } from './ProtectionHealth';
export { ProtectionDiagnosticsRunner } from './ProtectionDiagnostics';
export type { DiagnosticsContext } from './ProtectionDiagnostics';

// Statistics & History
export { ProtectionStatisticsCollector } from './ProtectionStatistics';
export { ProtectionHistoryManager } from './ProtectionHistory';

// Monitors
export { ProtectionManager } from './ProtectionManager';

// Dashboard
export { ProtectionDashboardProvider } from './ProtectionDashboardProvider';

// Factory
export { ProtectionFactory } from './ProtectionFactory';
export type { ProtectionComponents } from './ProtectionFactory';

// Main Engine
export { RealTimeProtectionEngine } from './RealTimeProtectionEngine';
