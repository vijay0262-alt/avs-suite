/**
 * ScanSummary — completion view with success animation, scores, AI summary,
 * result cards, and action buttons.
 *
 * Replaces all per-module completion dialogs with a single, consistent
 * summary experience.
 */
import { CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { Button } from '@avs/ui';
import type { UnifiedScanReport, UnifiedScanAction } from '../unifiedScanTypes';
import { formatDuration } from '../unifiedScanTypes';
import { useAnimatedCounter } from '../useAnimatedCounter';
import { ResultCards } from './ResultCards';

export interface ScanSummaryProps {
  report: UnifiedScanReport;
  actions: UnifiedScanAction[];
  onClose: () => void;
}

function ScoreGauge({ label, animated }: { score: number; label: string; animated: number }) {
  const displayScore = Math.round(animated);
  const color =
    displayScore >= 90 ? 'text-semantic-success' :
    displayScore >= 75 ? 'text-brand-primary' :
    displayScore >= 60 ? 'text-semantic-warning' :
    'text-semantic-danger';

  return (
    <div className="text-center">
      <div className={`text-3xl font-bold tabular-nums ${color}`} aria-live="polite">
        {displayScore}
      </div>
      <div className="text-caption text-text-muted mt-0.5">{label}</div>
    </div>
  );
}

const ACTION_VARIANTS: Record<string, 'primary' | 'secondary' | 'danger'> = {
  primary: 'primary',
  secondary: 'secondary',
  danger: 'danger',
};

export function ScanSummary({ report, actions, onClose }: ScanSummaryProps) {
  const animatedOverall = useAnimatedCounter(report.aiSummary.overallScore, 1200);
  const animatedHealth = useAnimatedCounter(report.aiSummary.healthScore ?? report.aiSummary.overallScore, 1200);
  const animatedSecurity = useAnimatedCounter(report.aiSummary.securityScore ?? 100, 1200);
  const animatedPerformance = useAnimatedCounter(report.aiSummary.performanceScore ?? report.aiSummary.overallScore, 1200);
  const animatedConfidence = useAnimatedCounter(report.aiSummary.aiConfidence * 100, 1000);

  const hasIssues = report.issuesFound > 0 || (report.threatsFound ?? 0) > 0;

  return (
    <div className="space-y-6" data-testid="unified-scan-summary">
      {/* Success animation header */}
      <div className="text-center" data-testid="summary-header">
        <div
          className={`inline-flex p-3 rounded-full mb-3 ${
            hasIssues ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'
          }`}
        >
          {hasIssues ? (
            <ExclamationTriangleIcon className="h-10 w-10 text-semantic-warning" aria-hidden />
          ) : (
            <CheckCircleIcon className="h-10 w-10 text-semantic-success animate-[scaleIn_500ms_ease-out]" aria-hidden />
          )}
        </div>
        <h3 className="text-xl font-semibold text-text-primary">Scan Complete</h3>
        <p className="mt-1 text-small text-text-secondary">
          Completed in {formatDuration(report.durationMs)} · Report ID: {report.reportId}
        </p>
      </div>

      {/* Score gauges */}
      <div className="flex items-center justify-center gap-8 py-2">
        <ScoreGauge score={report.aiSummary.overallScore} label="Overall" animated={animatedOverall} />
        {report.aiSummary.healthScore !== undefined && (
          <ScoreGauge score={report.aiSummary.healthScore} label="Health" animated={animatedHealth} />
        )}
        {report.aiSummary.securityScore !== undefined && (
          <ScoreGauge score={report.aiSummary.securityScore} label="Security" animated={animatedSecurity} />
        )}
        {report.aiSummary.performanceScore !== undefined && (
          <ScoreGauge score={report.aiSummary.performanceScore} label="Performance" animated={animatedPerformance} />
        )}
      </div>

      {/* AI Confidence */}
      <div className="flex items-center justify-center gap-2">
        <SparklesIcon className="h-4 w-4 text-brand-primary" aria-hidden />
        <span className="text-caption text-text-muted">AI Confidence</span>
        <span className="text-small font-semibold tabular-nums text-text-primary">
          {Math.round(animatedConfidence)}%
        </span>
      </div>

      {/* AI Summary text */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4">
        <div className="flex items-start gap-2.5">
          <SparklesIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" aria-hidden />
          <div className="space-y-1.5">
            <div className="text-small font-medium text-text-primary">AI Summary</div>
            <p className="text-small text-text-secondary">{report.aiSummary.verdict}</p>
            {report.aiSummary.estimatedImprovements.length > 0 && (
              <ul className="space-y-1 mt-2">
                {report.aiSummary.estimatedImprovements.map((imp, i) => (
                  <li key={i} className="text-caption text-text-secondary flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-brand-primary" />
                    {imp}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {report.itemsAnalyzed.toLocaleString()}
          </div>
          <div className="text-caption text-text-muted">Items Analyzed</div>
        </div>
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {report.issuesFound.toLocaleString()}
          </div>
          <div className="text-caption text-text-muted">Issues Found</div>
        </div>
        {report.threatsFound !== undefined && (
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
            <div className="text-xl font-bold tabular-nums text-text-primary">
              {report.threatsFound.toLocaleString()}
            </div>
            <div className="text-caption text-text-muted">Threats Found</div>
          </div>
        )}
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {report.aiSummary.modulesAnalyzed}
          </div>
          <div className="text-caption text-text-muted">Modules Analyzed</div>
        </div>
      </div>

      {/* Result cards */}
      {report.results.length > 0 && <ResultCards cards={report.results} />}

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 border-t border-[var(--avs-border)] pt-4">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {actions.map((action) => (
          <Button
            key={action.id}
            variant={ACTION_VARIANTS[action.variant] ?? 'secondary'}
            onClick={action.action}
          >
            {action.label}
          </Button>
        ))}
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
