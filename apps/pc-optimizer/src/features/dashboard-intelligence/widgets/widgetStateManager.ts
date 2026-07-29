/**
 * Widget State Manager — manages widget runtime states.
 *
 * States:
 *   Idle, Loading, Ready, Refreshing, Unavailable,
 *   Permission Denied, Empty, Error.
 */
import type { WidgetRuntimeState } from './types';

export interface WidgetStateEntry {
  state: WidgetRuntimeState;
  message: string | null;
  lastStateChange: string;
  retryCount: number;
}

export class WidgetStateManager {
  private _states: Map<string, WidgetStateEntry> = new Map();

  initWidget(widgetId: string): void {
    this._states.set(widgetId, {
      state: 'idle',
      message: null,
      lastStateChange: new Date().toISOString(),
      retryCount: 0,
    });
  }

  setState(widgetId: string, state: WidgetRuntimeState, message?: string): void {
    const entry = this._states.get(widgetId);
    if (!entry) return;
    entry.state = state;
    entry.message = message ?? null;
    entry.lastStateChange = new Date().toISOString();
  }

  getState(widgetId: string): WidgetRuntimeState | undefined {
    return this._states.get(widgetId)?.state;
  }

  getEntry(widgetId: string): WidgetStateEntry | undefined {
    return this._states.get(widgetId);
  }

  incrementRetry(widgetId: string): number {
    const entry = this._states.get(widgetId);
    if (!entry) return 0;
    entry.retryCount++;
    return entry.retryCount;
  }

  resetRetry(widgetId: string): void {
    const entry = this._states.get(widgetId);
    if (!entry) return;
    entry.retryCount = 0;
  }

  getWidgetsByState(state: WidgetRuntimeState): string[] {
    const result: string[] = [];
    for (const [id, entry] of this._states) {
      if (entry.state === state) result.push(id);
    }
    return result;
  }

  removeWidget(widgetId: string): void {
    this._states.delete(widgetId);
  }

  get count(): number {
    return this._states.size;
  }

  clear(): void {
    this._states.clear();
  }
}
