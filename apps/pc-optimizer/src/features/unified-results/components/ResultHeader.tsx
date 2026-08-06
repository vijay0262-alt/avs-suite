/**
 * ResultHeader — large success illustration with scan metadata.
 *
 * Shows: success icon, "Scan Complete", timestamp, duration,
 * items analyzed, AI confidence.
 */
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  DocumentTextIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { UnifiedResultsReport } from '../unifiedResultsTypes';
import { formatTimestamp, formatDuration } from '../unifiedResultsTypes';

export interface ResultHeaderProps {
  report: UnifiedResultsReport;
  hasIssues: boolean;
}

export function ResultHeader({ report, hasIssues }: ResultHeaderProps) {
  return (
    <div className="text-center space-y-3" data-testid="result-header">
      {/* Success illustration */}
      <div
        className={`inline-flex p-3 rounded-full ${
          hasIssues ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'
        }`}
      >
        {hasIssues ? (
          <ExclamationTriangleIcon
            className="h-12 w-12 text-semantic-warning animate-[scaleIn_500ms_ease-out]"
            aria-hidden
          />
        ) : (
          <CheckCircleIcon
            className="h-12 w-12 text-semantic-success animate-[scaleIn_500ms_ease-out]"
            aria-hidden
          />
        )}
      </div>

      {/* Title */}
      <h2 className="text-2xl font-bold text-text-primary">Scan Complete</h2>
      <p className="text-sm text-text-muted">
        {report.moduleName} · {formatTimestamp(report.timestamp)}
      </p>

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
        <MetaPill icon={<ClockIcon className="h-3.5 w-3.5" />} label="Duration" value={formatDuration(report.durationMs)} />
        <MetaPill icon={<DocumentTextIcon className="h-3.5 w-3.5" />} label="Items" value={report.itemsAnalyzed.toLocaleString()} />
        <MetaPill
          icon={<SparklesIcon className="h-3.5 w-3.5" />}
          label="AI Confidence"
          value={`${Math.round(report.aiConfidence * 100)}%`}
        />
      </div>

      <style>{`
        @keyframes scaleIn {
          from { transform: scale(0); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[scaleIn_500ms_ease-out\\] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function MetaPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-[var(--avs-surface-muted)] px-3 py-1.5">
      <span className="text-text-muted">{icon}</span>
      <span className="text-xs text-text-muted">{label}:</span>
      <span className="text-xs font-semibold tabular-nums text-text-primary">{value}</span>
    </div>
  );
}
