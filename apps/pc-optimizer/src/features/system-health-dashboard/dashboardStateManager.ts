/**
 * Dashboard State Manager — manages the complete dashboard state
 * with re-render throttling to avoid unnecessary UI updates.
 *
 * Responsibilities:
 *   • Hold the current DashboardState
 *   • Throttle state updates (batch rapid changes)
 *   • Notify subscribers on state changes
 *   • Provide immutable state updates
 *
 * This module does NOT modify any business logic.
 */
import type { DashboardState, DashboardEventListener, DashboardEventType } from './types';

export class DashboardStateManager {
  private _state: DashboardState;
  private _listeners: Map<DashboardEventType, Set<DashboardEventListener>> = new Map();
  private _updateTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingState: DashboardState | null = null;
  private _throttleMs: number;

  constructor(throttleMs: number = 100) {
    this._throttleMs = throttleMs;
    this._state = this._createInitialState();
  }

  /**
   * Get the current state.
   */
  getState(): DashboardState {
    return this._state;
  }

  /**
   * Update the state (throttled).
   */
  setState(updates: Partial<DashboardState>): void {
    this._pendingState = { ...this._pendingState ?? this._state, ...updates };

    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
    }

    this._updateTimer = setTimeout(() => {
      this._flushState();
    }, this._throttleMs);
  }

  /**
   * Force an immediate state flush (bypasses throttle).
   */
  flush(): void {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
    this._flushState();
  }

  /**
   * Subscribe to state changes.
   */
  on(event: DashboardEventType, listener: DashboardEventListener): () => void {
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(listener);
    return () => set?.delete(listener);
  }

  /**
   * Set the throttle interval.
   */
  setThrottleMs(ms: number): void {
    this._throttleMs = Math.max(0, ms);
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this._state = this._createInitialState();
    this._pendingState = null;
    if (this._updateTimer) {
      clearTimeout(this._updateTimer);
      this._updateTimer = null;
    }
    this._emit('dashboard_state_updated', { state: this._state });
  }

  // ── Internal ────────────────────────────────────────────────

  private _flushState(): void {
    if (!this._pendingState) return;
    this._state = this._pendingState;
    this._pendingState = null;
    this._updateTimer = null;
    this._emit('dashboard_state_updated', { state: this._state });
  }

  private _emit(event: DashboardEventType, payload: unknown): void {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (err) {
        console.error('[DashboardState] Listener error:', err);
      }
    }
  }

  private _createInitialState(): DashboardState {
    return {
      loading: false,
      error: null,
      liveMetrics: null,
      healthScorePanel: null,
      categoryCards: [],
      realTimeStatus: null,
      timeline: [],
      timelineRange: '7days',
      alerts: [],
      widgets: [],
      quickActions: [],
      lastUpdated: null,
    };
  }
}

/**
 * Default singleton instance.
 */
export const dashboardStateManager = new DashboardStateManager();
