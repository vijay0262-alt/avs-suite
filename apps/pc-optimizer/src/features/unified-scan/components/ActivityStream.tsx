/**
 * ActivityStream — scrolling list of real backend activity entries.
 *
 * Shows live activity messages from the backend orchestrator during
 * scan and optimize phases. Auto-scrolls to the latest entry.
 */
import { useEffect, useRef } from 'react';

export interface ActivityEntry {
  ts: string;
  module: string;
  action: string;
  detail: string;
  operation?: string;
  path?: string;
}

export interface ActivityStreamProps {
  entries: ActivityEntry[];
  maxVisible?: number;
}

const MODULE_COLORS: Record<string, string> = {
  junk: 'text-orange-400',
  privacy: 'text-purple-400',
  registry: 'text-blue-400',
  startup: 'text-cyan-400',
  performance: 'text-green-400',
  disk: 'text-yellow-400',
  security: 'text-red-400',
  system: 'text-indigo-400',
  orchestrator: 'text-brand-primary',
};

const ACTION_ICONS: Record<string, string> = {
  scanning: '🔍',
  scanned: '✓',
  optimizing: '⚙',
  optimized: '✓',
  preparing: '▸',
  analyzing: '▸',
  verifying: '✓',
  completed: '✓',
  error: '✕',
  skipped: '⊘',
};

export function ActivityStream({ entries, maxVisible = 30 }: ActivityStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const visible = entries.slice(-maxVisible);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (visible.length === 0) return null;

  return (
    <div>
      <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
        Activity Stream
      </div>
      <div
        ref={scrollRef}
        className="max-h-32 overflow-y-auto rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] p-2 space-y-1 scroll-smooth"
        role="log"
        aria-live="polite"
        aria-label="Scan activity log"
      >
        {visible.map((entry, i) => {
          const icon = ACTION_ICONS[entry.action] ?? '•';
          const color = MODULE_COLORS[entry.module] ?? 'text-text-secondary';
          const isError = entry.action === 'error';
          return (
            <div
              key={`${entry.ts}-${i}`}
              className={`flex items-start gap-2 text-caption font-mono leading-tight ${isError ? 'text-semantic-danger' : 'text-text-secondary'}`}
            >
              <span className="shrink-0 text-xs" aria-hidden>{icon}</span>
              <span className={`shrink-0 font-semibold ${color}`}>{entry.module}</span>
              <span className="truncate">{entry.detail}</span>
            </div>
          );
        })}
      </div>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .scroll-smooth { scroll-behavior: auto !important; }
        }
      `}</style>
    </div>
  );
}
