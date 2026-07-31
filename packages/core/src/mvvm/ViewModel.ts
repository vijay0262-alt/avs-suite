/**
 * Abstract ViewModel — the "M" ⇄ "V" mediator in MVVM.
 *
 * Owns the state of a screen or feature, exposes actions, and notifies
 * subscribers on change. The React layer binds via `useViewModel`.
 *
 * ViewModels are pure TypeScript classes — they do NOT import React or
 * Electron. This lets them be unit-tested in isolation and reused across
 * apps.
 *
 * Performance: setState uses microtask batching — multiple synchronous
 * setState calls in the same tick produce only ONE notification to
 * subscribers, minimizing React rerenders.
 */
export type Unsubscribe = () => void;

export abstract class ViewModel<TState> {
  private _state: TState;
  private readonly _listeners = new Set<(state: TState) => void>();
  private _flushScheduled = false;

  protected constructor(initialState: TState) {
    this._state = initialState;
  }

  /** Current immutable state snapshot. */
  get state(): TState {
    return this._state;
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: (state: TState) => void): Unsubscribe {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Replace state and notify subscribers. Prefer functional updates to
   * keep transitions explicit and testable.
   *
   * Multiple synchronous setState calls are batched into a single
   * notification via microtask scheduling.
   */
  protected setState(update: Partial<TState> | ((prev: TState) => TState)): void {
    const next =
      typeof update === 'function'
        ? (update as (prev: TState) => TState)(this._state)
        : { ...this._state, ...update };
    if (Object.is(next, this._state)) return;
    this._state = next;
    this._scheduleFlush();
  }

  /**
   * Schedule a flush of notifications on the microtask queue.
   * This batches multiple synchronous setState calls into one notification.
   */
  private _scheduleFlush(): void {
    if (this._flushScheduled) return;
    this._flushScheduled = true;
    queueMicrotask(() => {
      this._flushScheduled = false;
      const state = this._state;
      for (const listener of this._listeners) listener(state);
    });
  }

  /**
   * Hook called when the last View subscriber unsubscribes. Override to
   * clean up timers, RPC subscriptions, etc.
   */
  dispose(): void {
    this._listeners.clear();
  }
}
