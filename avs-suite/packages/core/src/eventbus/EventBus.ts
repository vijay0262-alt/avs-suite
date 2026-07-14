/**
 * Type-safe application event bus. Used for cross-feature coordination
 * that doesn't fit a direct call (e.g. "license activated" broadcast).
 */
export type EventMap = {
  'app:ready': void;
  'app:theme-changed': { theme: 'light' | 'dark' };
  'license:activated': { edition: 'free' | 'pro' | 'enterprise' | 'trial' };
  'update:available': { version: string };
  'update:downloaded': { version: string };
  'scan:started': { module: string; taskId: string };
  'scan:progress': { taskId: string; progress: number };
  'scan:completed': { taskId: string; summary: unknown };
};

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export class EventBus {
  private readonly listeners = new Map<keyof EventMap, Set<Listener<never>>>();

  on<K extends keyof EventMap>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => set!.delete(listener as Listener<never>);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const l of set) (l as Listener<K>)(payload);
  }
}

/** Process-wide singleton — DI-registered as `TOKENS.EventBus` at bootstrap. */
export const globalEventBus = new EventBus();
