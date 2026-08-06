/**
 * useAnimatedCounter — smoothly transitions a number from its previous
 * value to the new target value.  Used by all scan counter displays
 * so numbers animate instead of jumping.
 */
import { useEffect, useRef, useState } from 'react';

export function useAnimatedCounter(
  target: number,
  duration = 600,
): number {
  const [displayValue, setDisplayValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === displayValue) return;

    fromRef.current = displayValue;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (startRef.current === null) {
        startRef.current = timestamp;
      }
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setDisplayValue(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(target);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return displayValue;
}

/**
 * useElapsedTimer — tracks elapsed time since a start timestamp.
 * Updates every 100ms for smooth display.
 */
export function useElapsedTimer(startTime: number | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startTime === null) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [startTime]);

  return elapsed;
}
