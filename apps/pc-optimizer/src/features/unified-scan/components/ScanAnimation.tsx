/**
 * ScanAnimation — continuously changing activity message.
 *
 * Cycles through activity messages for the current phase to show
 * the user that work is actively being done.  Never shows a static
 * "Scanning..." message.
 */
import { useEffect, useState } from 'react';

export interface ScanAnimationProps {
  activities: string[];
  isScanning: boolean;
  intervalMs?: number;
}

export function ScanAnimation({
  activities,
  isScanning,
  intervalMs = 3000,
}: ScanAnimationProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!isScanning || activities.length === 0) return;
    if (activities.length === 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activities.length);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isScanning, activities, intervalMs]);

  if (!isScanning || activities.length === 0) return null;

  const message = activities[currentIndex] ?? 'Working...';

  return (
    <div
      className="flex items-center gap-2.5 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-2.5"
      data-testid="unified-scan-activity"
      aria-live="polite"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand-primary" />
      </span>
      <span
        key={message}
        className="text-sm text-text-secondary animate-[fadeIn_300ms_ease-out]"
      >
        {message}
      </span>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-ping { animation: none !important; }
          .animate-\\[fadeIn_300ms_ease-out\\] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
