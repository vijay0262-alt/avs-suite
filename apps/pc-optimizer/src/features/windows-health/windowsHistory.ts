/**
 * Windows History — records Windows update scans, security scans,
 * health changes, and execution actions.
 *
 * This module does NOT modify any existing architecture.
 */
import type {
  WindowsHistoryEntry,
  WindowsHistoryEntryType,
  WindowsActionType,
} from './types';

let _entryCounter = 0;

function generateEntryId(): string {
  _entryCounter += 1;
  return `windows-history-${Date.now().toString(36)}-${_entryCounter}`;
}

export class WindowsHistory {
  private _entries: WindowsHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 200) {
    this._maxEntries = maxEntries;
  }

  record(
    type: WindowsHistoryEntryType,
    description: string,
    options: {
      scoreBefore?: number | null;
      scoreAfter?: number | null;
      actionType?: WindowsActionType | null;
      success?: boolean;
      durationMs?: number;
    } = {},
  ): WindowsHistoryEntry {
    const entry: WindowsHistoryEntry = {
      id: generateEntryId(),
      type,
      timestamp: new Date().toISOString(),
      description,
      scoreBefore: options.scoreBefore ?? null,
      scoreAfter: options.scoreAfter ?? null,
      actionType: options.actionType ?? null,
      success: options.success ?? true,
      durationMs: options.durationMs ?? 0,
    };
    this._entries.unshift(entry);
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(0, this._maxEntries);
    }
    return entry;
  }

  recordScan(score: number, durationMs: number, success: boolean = true): WindowsHistoryEntry {
    return this.record('scan', 'Windows health scan completed', {
      scoreAfter: score,
      success,
      durationMs,
    });
  }

  recordUpdateCheck(pendingCount: number): WindowsHistoryEntry {
    return this.record('update_check', `Update check: ${pendingCount} pending updates`, {
      success: true,
    });
  }

  recordExecution(actionType: WindowsActionType, success: boolean, durationMs: number): WindowsHistoryEntry {
    return this.record('execution', `Execution: ${actionType}`, {
      actionType,
      success,
      durationMs,
    });
  }

  recordHealthChange(scoreBefore: number, scoreAfter: number): WindowsHistoryEntry {
    const direction = scoreAfter > scoreBefore ? 'improved' : scoreAfter < scoreBefore ? 'declined' : 'unchanged';
    return this.record('health_change', `Health score ${direction}: ${scoreBefore} → ${scoreAfter}`, {
      scoreBefore,
      scoreAfter,
    });
  }

  getAll(): WindowsHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(limit: number): WindowsHistoryEntry[] {
    return this._entries.slice(0, limit);
  }

  getByType(type: WindowsHistoryEntryType): WindowsHistoryEntry[] {
    return this._entries.filter((e) => e.type === type);
  }

  getScans(): WindowsHistoryEntry[] {
    return this.getByType('scan');
  }

  getExecutions(): WindowsHistoryEntry[] {
    return this.getByType('execution');
  }

  getHealthChanges(): WindowsHistoryEntry[] {
    return this.getByType('health_change');
  }

  getLastScore(): number | null {
    const scan = this._entries.find((e) => e.type === 'scan' && e.scoreAfter !== null);
    return scan?.scoreAfter ?? null;
  }

  clear(): void {
    this._entries = [];
  }

  size(): number {
    return this._entries.length;
  }
}

export const windowsHistory = new WindowsHistory();
