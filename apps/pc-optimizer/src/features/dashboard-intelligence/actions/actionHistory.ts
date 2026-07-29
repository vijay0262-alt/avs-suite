/**
 * Action History — tracks all action invocations and their outcomes.
 *
 * Tracks: Action Invoked, Action Cancelled, Action Completed,
 * Action Failed, Action Duration, Widget Source, Timestamp.
 */
import type {
  ActionHistoryEntry,
  DashboardActionType,
  ActionState,
  ActionRoute,
} from './types';
import type { WidgetType } from '../types';

export class ActionHistory {
  private _entries: ActionHistoryEntry[] = [];
  private _maxEntries: number;

  constructor(maxEntries: number = 500) {
    this._maxEntries = maxEntries;
  }

  record(
    actionId: string,
    actionType: DashboardActionType,
    widgetId: string,
    widgetType: WidgetType,
    state: ActionState,
    durationMs: number,
    error: string | null,
    route: ActionRoute | null,
    userId: string | null,
    metadata: Record<string, unknown> = {},
  ): ActionHistoryEntry {
    const entry: ActionHistoryEntry = {
      id: `hist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      actionId,
      actionType,
      widgetId,
      widgetType,
      state,
      timestamp: new Date().toISOString(),
      durationMs,
      error,
      route,
      userId,
      metadata,
    };
    this._entries.push(entry);
    this._trim();
    return entry;
  }

  getAll(): ActionHistoryEntry[] {
    return [...this._entries];
  }

  getRecent(count: number): ActionHistoryEntry[] {
    return this._entries.slice(-count);
  }

  getByAction(actionId: string): ActionHistoryEntry[] {
    return this._entries.filter((e) => e.actionId === actionId);
  }

  getByWidget(widgetId: string): ActionHistoryEntry[] {
    return this._entries.filter((e) => e.widgetId === widgetId);
  }

  getByState(state: ActionState): ActionHistoryEntry[] {
    return this._entries.filter((e) => e.state === state);
  }

  getByType(actionType: DashboardActionType): ActionHistoryEntry[] {
    return this._entries.filter((e) => e.actionType === actionType);
  }

  getByUser(userId: string): ActionHistoryEntry[] {
    return this._entries.filter((e) => e.userId === userId);
  }

  getFailed(): ActionHistoryEntry[] {
    return this._entries.filter((e) => e.state === 'failed');
  }

  getCompleted(): ActionHistoryEntry[] {
    return this._entries.filter((e) => e.state === 'completed');
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
