/**
 * Startup Optimizer — Barrel Export
 *
 * Complete startup optimization module:
 *   • Discovers startup applications
 *   • Measures startup impact
 *   • Estimates boot performance
 *   • Safely enables/disables startup entries
 *   • Integrates with AI Health Engine, Optimization Planner, Execution Engine
 *
 * This module does NOT modify:
 *   • Authentication, licensing, subscriptions, payment
 *   • Configuration synchronization
 *   • AI Health Engine architecture
 *   • Optimization Planner architecture
 *   • Execution Engine architecture
 *   • Maintenance History
 */
// Types
export type {
  StartupSource,
  UserScope,
  SignatureStatus,
  ImpactLevel,
  StartupEntry,
  StartupImpact,
  StartupAnalysis,
  StartupRecommendation,
  StartupChangeRecord,
  StartupExecutionConfig,
  StartupHealthContribution,
  StartupHealthIssue,
  StartupEventType,
  StartupEventPayloads,
  StartupEventListener,
} from './types';
export {
  PROTECTED_APP_PATTERNS,
  generateEntryId,
  isProtectedApp,
  formatBootDelay,
} from './types';

// Events
export { startupEvents, StartupEventEmitter } from './startupEvents';

// Scanner
export { StartupScanner, startupScanner } from './startupScanner';

// Repository
export { StartupRepository, startupRepository } from './startupRepository';

// Impact Calculator
export { StartupImpactCalculator, startupImpactCalculator } from './startupImpactCalculator';

// Analyzer
export { StartupAnalyzer, startupAnalyzer } from './startupAnalyzer';

// Execution Task
export { StartupExecutionTask } from './startupExecutionTask';
import { StartupExecutionTask } from './startupExecutionTask';

// History
export { StartupHistory, startupHistory, generateRecordId } from './startupHistory';

// ── Task Registration ──────────────────────────────────────────
// Register the startup optimizer task with the execution engine's
// task registry. This allows the job builder and execution engine
// to create and run startup optimization tasks by ID.
//
// We register a factory that creates a task with an empty config.
// The actual config (which entries to disable/enable) is set
// by the caller before execution.
import { registerTask } from '../maintenance-engine/tasks';
import type { StartupEntry } from './types';

export const STARTUP_OPTIMIZER_TASK_ID = 'startup_optimizer';

// Store the current execution config so the factory can use it
let _currentConfig: { disableEntryIds: string[]; enableEntryIds: string[] } | null = null;
let _currentEntries: StartupEntry[] = [];

/**
 * Set the configuration for the next startup optimizer task.
 * This must be called before creating a task via the registry.
 */
export function setStartupExecutionConfig(
  config: { disableEntryIds: string[]; enableEntryIds: string[] },
  entries: StartupEntry[],
): void {
  _currentConfig = config;
  _currentEntries = entries;
}

// Register the task factory
registerTask(STARTUP_OPTIMIZER_TASK_ID, () => {
  if (!_currentConfig) {
    // Return a no-op task if no config is set
    return new StartupExecutionTask({ disableEntryIds: [], enableEntryIds: [] }, []);
  }
  return new StartupExecutionTask(_currentConfig, _currentEntries);
});
