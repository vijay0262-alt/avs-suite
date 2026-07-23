import { useEffect, useRef, useState } from 'react';

/**
 * useAnimatedNumber — smoothly transitions a number from its previous
 * value to the new target value over a given duration.
 *
 * Used by the Health Score gauge so the score animates (e.g. 53 → 61 →
 * 72 → 85 → 94 → 100) instead of jumping instantly.
 */
export function useAnimatedNumber(
  target: number,
  duration = 800,
): number {
  const [displayValue, setDisplayValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // If the target hasn't changed, do nothing
    if (target === displayValue) return;

    fromRef.current = displayValue;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (startRef.current === null) {
        startRef.current = timestamp;
      }
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic for a natural deceleration
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
