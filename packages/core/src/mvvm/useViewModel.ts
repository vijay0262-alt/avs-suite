import { useEffect, useState } from 'react';
import type { ViewModel } from './ViewModel';

/**
 * React binding for a ViewModel instance.
 *
 * Usage:
 *   const vm = useMemo(() => new DashboardViewModel(container), [container]);
 *   const state = useViewModel(vm);
 *
 * The ViewModel's lifecycle is owned by the caller — this hook only
 * synchronises the state.
 */
export function useViewModel<TState>(vm: ViewModel<TState>): TState {
  const [state, setState] = useState<TState>(vm.state);
  useEffect(() => vm.subscribe(setState), [vm]);
  return state;
}
