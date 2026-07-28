/**
 * Task Registry — maps task IDs to task factory functions.
 *
 * The schedule's `tasks` array contains string IDs (e.g. "junk_cleaner",
 * "browser_cleaner"). The JobBuilder uses this registry to instantiate
 * the corresponding MaintenanceTask implementations.
 */
import type { MaintenanceTask } from '../types';
import { JunkCleanerTask } from './JunkCleanerTask';
import { BrowserCleanerTask } from './BrowserCleanerTask';
import { RecycleBinCleanerTask } from './RecycleBinCleanerTask';
import { TempFilesCleanerTask } from './TempFilesCleanerTask';

export type TaskFactory = () => MaintenanceTask;

// ── Task ID constants ─────────────────────────────────────────

export const TASK_IDS = {
  JUNK_CLEANER: 'junk_cleaner',
  BROWSER_CLEANER: 'browser_cleaner',
  RECYCLE_BIN_CLEANER: 'recycle_bin_cleaner',
  TEMP_FILES_CLEANER: 'temp_files_cleaner',
} as const;

// ── Registry ──────────────────────────────────────────────────

const _registry: Map<string, TaskFactory> = new Map();

export function registerTask(taskId: string, factory: TaskFactory): void {
  _registry.set(taskId, factory);
}

export function createTask(taskId: string): MaintenanceTask | null {
  const factory = _registry.get(taskId);
  if (!factory) return null;
  return factory();
}

export function getRegisteredTaskIds(): string[] {
  return Array.from(_registry.keys());
}

export function isTaskRegistered(taskId: string): boolean {
  return _registry.has(taskId);
}

// ── Built-in task registration ────────────────────────────────

registerTask(TASK_IDS.JUNK_CLEANER, () => new JunkCleanerTask());
registerTask(TASK_IDS.BROWSER_CLEANER, () => new BrowserCleanerTask());
registerTask(TASK_IDS.RECYCLE_BIN_CLEANER, () => new RecycleBinCleanerTask());
registerTask(TASK_IDS.TEMP_FILES_CLEANER, () => new TempFilesCleanerTask());

// ── Re-exports ────────────────────────────────────────────────

export { JunkCleanerTask } from './JunkCleanerTask';
export { BrowserCleanerTask } from './BrowserCleanerTask';
export { RecycleBinCleanerTask } from './RecycleBinCleanerTask';
export { TempFilesCleanerTask } from './TempFilesCleanerTask';
export { BaseMaintenanceTask, isRpcAvailable, getRpcBridge } from './BaseMaintenanceTask';
