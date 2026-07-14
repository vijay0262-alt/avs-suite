/**
 * Abstract ViewModel — the "M" ⇄ "V" mediator in MVVM.
 *
 * Owns the state of a screen or feature, exposes actions, and notifies
 * subscribers on change. The React layer binds via `useViewModel`.
 *
 * ViewModels are pure TypeScript classes — they do NOT import React or
 * Electron. This lets them be unit-tested in isolation and reused across
 * apps.
 */
export type Unsubscribe = () => void;

export abstract class ViewModel<TState> {
  private _state: TState;
  private readonly _listeners = new Set<(state: TState) => void>();

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
   */
  protected setState(update: Partial<TState> | ((prev: TState) => TState)): void {
    const next =
      typeof update === 'function'
        ? (update as (prev: TState) => TState)(this._state)
        : { ...this._state, ...update };
    if (Object.is(next, this._state)) return;
    this._state = next;
    for (const listener of this._listeners) listener(this._state);
  }

  /**
   * Hook called when the last View subscriber unsubscribes. Override to
   * clean up timers, RPC subscriptions, etc.
   */
  dispose(): void {
    this._listeners.clear();
  }
}
