/**
 * Performance hooks for React components.
 *
 * - useDebouncedCallback: debounces a callback, returns stable ref
 * - useThrottledValue: throttles a rapidly-changing value
 * - useStableCallback: useCallback with stable identity (no deps needed)
 * - useVisibilityAware: pauses work when tab/window is not visible
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Debounce a callback. The returned function has a stable identity
 * across renders. The actual invocation is delayed by `delayMs`;
 * if called again within that window, the previous call is cancelled.
 */
export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback((...args: Parameters<T>) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => callbackRef.current(...args), delayMs);
  }, [delayMs]);
}

/**
 * Throttle a value so it only updates at most once per `intervalMs`.
 * Useful for rapidly-changing values like scroll position or live metrics.
 */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdateRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdateRef.current >= intervalMs) {
      lastUpdateRef.current = now;
      setThrottled(value);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThrottled(value);
      }, intervalMs - (now - lastUpdateRef.current));
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, intervalMs]);

  return throttled;
}

/**
 * Returns a stable callback identity without needing deps.
 * The callback always sees the latest closure values.
 */
export function useStableCallback<T extends (...args: never[]) => unknown>(
  callback: T,
): T {
  const ref = useRef(callback);
  ref.current = callback;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
}

/**
 * Track whether the page is visible (not hidden in a background tab).
 * Returns `true` when the document is visible.
 */
export function useIsPageVisible(): boolean {
  const [visible, setVisible] = useState(
    typeof document !== 'undefined' ? !document.hidden : true,
  );

  useEffect(() => {
    const handler = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  return visible;
}

/**
 * Run an effect only when the page is visible.
 * When the page becomes hidden, the cleanup function runs.
 * When it becomes visible again, the effect re-runs.
 */
export function useVisibilityAwareEffect(
  effect: () => (() => void) | void,
  deps: React.DependencyList,
): void {
  const visible = useIsPageVisible();
  useEffect(() => {
    if (!visible) return;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ...deps]);
}
