/**
 * Execution History — tracks pipeline execution lifecycle events.
 */
import type { ExecutionHistoryEntry, PipelineStage } from './types';
import { generateHistoryId } from './types';

export class ExecutionHistory {
  private _entries: ExecutionHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 1000) {
    this._maxEntries = maxEntries;
  }

  record(
    executionId: string,
    action: string,
    stage: PipelineStage | null = null,
    metadata: Record<string, unknown> = {},
  ): ExecutionHistoryEntry {
    const entry: ExecutionHistoryEntry = {
      id: generateHistoryId(),
      executionId,
      action,
      timestamp: new Date().toISOString(),
      stage,
      metadata,
    };
    this._entries.push(entry);
    this._trim();
    return entry;
  }

  getAll(): ExecutionHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): ExecutionHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByExecution(executionId: string): ExecutionHistoryEntry[] {
    return this._entries.filter((e) => e.executionId === executionId);
  }

  getByAction(action: string): ExecutionHistoryEntry[] {
    return this._entries.filter((e) => e.action === action);
  }

  getByStage(stage: PipelineStage): ExecutionHistoryEntry[] {
    return this._entries.filter((e) => e.stage === stage);
  }

  clear(): void {
    this._entries = [];
  }

  get count(): number {
    return this._entries.length;
  }

  private _trim(): void {
    if (this._entries.length > this._maxEntries) {
      this._entries = this._entries.slice(-this._maxEntries);
    }
  }
}
