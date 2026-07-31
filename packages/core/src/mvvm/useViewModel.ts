import { useSyncExternalStore } from 'react';
import type { ViewModel } from './ViewModel';

/**
 * React binding for a ViewModel instance.
 *
 * Uses `useSyncExternalStore` (React 18+) for:
 *   - Automatic batching of synchronous state updates
 *   - Tear-free concurrent rendering
 *   - No unnecessary rerenders when state reference is unchanged
 *
 * Usage:
 *   const vm = useMemo(() => new DashboardViewModel(container), [container]);
 *   const state = useViewModel(vm);
 *
 * The ViewModel's lifecycle is owned by the caller — this hook only
 * synchronises the state.
 */
export function useViewModel<TState>(vm: ViewModel<TState>): TState {
  const subscribe = (callback: () => void) => vm.subscribe(() => callback());
  const getSnapshot = () => vm.state;
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
