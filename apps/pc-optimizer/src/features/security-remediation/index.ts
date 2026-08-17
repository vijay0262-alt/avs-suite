/**
 * AI Remediation, Quarantine & Recovery — barrel exports
 *
 * Version 1.2 — EPIC 1 — Part 4 — AI Remediation, Quarantine & Recovery
 *
 * Safety is the highest priority. Every action must be explainable.
 * Every reversible action must support rollback.
 * Never perform destructive actions without user approval.
 */

// Types
export * from './types';

// Events
export { remediationEventBus } from './ThreatRemediationEvents';

// Configuration
export { ThreatConfigurationManager } from './ThreatConfiguration';

// Policy & Safety
export { ThreatRemediationPolicyManager } from './ThreatRemediationPolicy';
export { ThreatSafetyValidator } from './ThreatSafetyValidator';

// Quarantine
export { ThreatQuarantineManager } from './ThreatQuarantineManager';

// Rollback & Approval
export { ThreatRollbackManager } from './ThreatRollbackManager';
export { ThreatApprovalManager } from './ThreatApprovalManager';

// Planning & History & Reports
export { ThreatRemediationPlanner } from './ThreatRemediationPlanner';
export { ThreatRemediationHistory } from './ThreatRemediationHistory';
export { ThreatRemediationReportGenerator } from './ThreatRemediationReport';

// Dashboard
export { ThreatDashboardProvider } from './ThreatDashboardProvider';

// False Positive
export { ThreatFalsePositiveTracker } from './ThreatFalsePositiveTracker';

// Main Engine
export { ThreatRemediationEngine } from './ThreatRemediationEngine';
