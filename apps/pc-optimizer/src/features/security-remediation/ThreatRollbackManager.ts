/**
 * ThreatRollbackManager — manages rollback entries for reversible actions.
 *
 * Integrates with the existing undo/restore infrastructure.
 * Supports restoring:
 *   - Files
 *   - Registry changes
 *   - Browser settings
 *   - Startup entries
 *   - Scheduled tasks
 *   - Configuration changes
 */
import type { RollbackEntry, RollbackType, RollbackData, RemediationAction } from './types';
import { isActionReversible } from './types';

export class ThreatRollbackManager {
  private entries = new Map<string, RollbackEntry>();
  private maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
  }

  createEntry(action: RemediationAction, rollbackData: RollbackData): RollbackEntry | null {
    if (!isActionReversible(action.type)) return null;

    const id = `rb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const type = this.mapActionToRollbackType(action);
    if (!type) return null;

    const entry: RollbackEntry = {
      id,
      actionId: action.id,
      investigationId: action.investigationId,
      type,
      description: `Rollback for ${action.type} on ${action.target.name}`,
      timestamp: Date.now(),
      rollbackData,
      status: 'available',
      rolledBackAt: null,
    };

    this.entries.set(id, entry);
    this.enforceMaxEntries();
    return entry;
  }

  rollback(id: string): RollbackEntry | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (entry.status !== 'available') return null;

    entry.status = 'rolled_back';
    entry.rolledBackAt = Date.now();
    return entry;
  }

  rollbackByAction(actionId: string): RollbackEntry | null {
    for (const entry of this.entries.values()) {
      if (entry.actionId === actionId && entry.status === 'available') {
        return this.rollback(entry.id);
      }
    }
    return null;
  }

  get(id: string): RollbackEntry | null {
    return this.entries.get(id) ?? null;
  }

  getByAction(actionId: string): RollbackEntry | null {
    for (const entry of this.entries.values()) {
      if (entry.actionId === actionId) return entry;
    }
    return null;
  }

  getByInvestigation(investigationId: string): RollbackEntry[] {
    return [...this.entries.values()].filter((e) => e.investigationId === investigationId);
  }

  getAvailable(): RollbackEntry[] {
    return [...this.entries.values()].filter((e) => e.status === 'available');
  }

  getAll(): RollbackEntry[] {
    return [...this.entries.values()];
  }

  countAvailable(): number {
    return this.getAvailable().length;
  }

  canRollback(actionId: string): boolean {
    const entry = this.getByAction(actionId);
    return entry !== null && entry.status === 'available';
  }

  clear(): void {
    this.entries.clear();
  }

  private mapActionToRollbackType(action: RemediationAction): RollbackType | null {
    switch (action.type) {
      case 'quarantine': return 'file_restore';
      case 'disable_startup_entry': return 'startup_entry_restore';
      case 'disable_scheduled_task': return 'scheduled_task_restore';
      case 'disable_browser_extension': return 'extension_restore';
      case 'reset_browser_setting': return 'browser_setting_restore';
      case 'remove_persistence': return 'registry_restore';
      default: return null;
    }
  }

  private enforceMaxEntries(): void {
    if (this.entries.size > this.maxEntries) {
      const sorted = [...this.entries.values()].sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = sorted.slice(0, this.entries.size - this.maxEntries);
      for (const entry of toRemove) {
        this.entries.delete(entry.id);
      }
    }
  }
}
