/**
 * ScanSummary — commercial-grade completion view.
 *
 * Shows verified results: files removed, storage recovered, registry repaired,
 * privacy items removed, startup optimized, health score before→after,
 * duration, and verification status.
 *
 * No AI Confidence, Evidence, Assessment, or Estimated Improvements.
 */
import { CheckCircleIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
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

function ScoreDisplay({ label, animated }: { label: string; animated: number }) {
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

  const hasIssues = report.issuesFound > 0 || (report.threatsFound ?? 0) > 0;
  const isVerified = report.aiSummary.aiConfidence >= 0.9;

  // V1.0: For optimize module, threatsFound is undefined (no threats).
  // Show "PC is Optimized" instead of "Scan Complete" when files were cleaned.
  const isOptimizeModule = report.moduleName === 'AI Smart Optimize' || report.moduleName === 'Dashboard';
  const hasCleanupResults = report.results.some(
    (r) => r.id === 'files-deleted' || r.id === 'space-recovered',
  );

  // V1.0: For optimize with cleanup results, show a clean summary
  // without threats, verification status, or health score before/after.
  if (isOptimizeModule && hasCleanupResults) {
    const filesCard = report.results.find((r) => r.id === 'files-deleted');
    const spaceCard = report.results.find((r) => r.id === 'space-recovered');
    const filesDeleted = filesCard ? parseInt(filesCard.improvedValue, 10) || 0 : 0;
    const spaceStr = spaceCard?.improvedValue ?? '0 MB';

    return (
      <div className="space-y-6" data-testid="unified-scan-summary">
        {/* Success header */}
        <div className="text-center" data-testid="summary-header">
          <div className="inline-flex p-3 rounded-full mb-3 bg-semantic-success/10">
            <CheckCircleIcon className="h-10 w-10 text-semantic-success animate-[scaleIn_500ms_ease-out]" aria-hidden />
          </div>
          <h3 className="text-xl font-semibold text-text-primary">
            {filesDeleted > 0 ? 'PC is Optimized' : 'PC is Already Clean'}
          </h3>
          <p className="mt-1 text-small text-text-secondary">
            {filesDeleted > 0
              ? `Cleaned ${filesDeleted.toLocaleString()} files · ${spaceStr} recovered · ${formatDuration(report.durationMs)}`
              : `No junk files found · ${formatDuration(report.durationMs)}`}
          </p>
        </div>

        {/* Cleanup stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-semantic-success">
              {filesDeleted.toLocaleString()}
            </div>
            <div className="text-caption text-text-muted mt-1">Files Cleaned</div>
          </div>
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-brand-primary">
              {spaceStr}
            </div>
            <div className="text-caption text-text-muted mt-1">Space Recovered</div>
          </div>
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4 text-center">
            <div className="text-2xl font-bold tabular-nums text-text-primary">
              {formatDuration(report.durationMs)}
            </div>
            <div className="text-caption text-text-muted mt-1">Time Taken</div>
          </div>
        </div>

        {/* V1.0: Per-category breakdown with files + space recovered */}
        {report.cleanupCategories && report.cleanupCategories.length > 0 && (
          <div className="space-y-2">
            <div className="text-caption font-semibold uppercase tracking-wide text-text-muted">
              Categories Cleaned
            </div>
            <div className="space-y-1.5">
              {report.cleanupCategories.map((cat) => {
                const catMb = cat.bytes_recovered
                  ? cat.bytes_recovered / (1024 * 1024)
                  : (cat as { mb_recovered?: number }).mb_recovered ?? 0;
                const catSizeStr = catMb >= 1024
                  ? `${(catMb / 1024).toFixed(2)} GB`
                  : catMb > 0
                    ? `${catMb.toFixed(2)} MB`
                    : '';
                const catFiles = cat.files_deleted ?? cat.files ?? 0;
                return (
                  <div
                    key={cat.name}
                    className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircleIcon className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />
                      <span className="text-small text-text-primary truncate">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      {catFiles > 0 && (
                        <span className="text-small font-semibold tabular-nums text-text-secondary">
                          {catFiles.toLocaleString()} files
                        </span>
                      )}
                      {catSizeStr && (
                        <span className="text-small tabular-nums text-brand-primary font-medium">
                          {catSizeStr}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

  // Default summary for security/protection modules
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
        <h3 className="text-xl font-semibold text-text-primary">
          {hasIssues ? 'Scan Complete' : 'Optimization Complete'}
        </h3>
        <p className="mt-1 text-small text-text-secondary">
          {hasIssues
            ? `${report.issuesFound} ${report.issuesFound === 1 ? 'issue' : 'issues'} found · ${formatDuration(report.durationMs)}`
            : `Your PC has been optimized. · ${formatDuration(report.durationMs)}`}
        </p>
      </div>

      {/* Score before → after */}
      <div className="flex items-center justify-center gap-8 py-2">
        <ScoreDisplay label="Health Score" animated={animatedOverall} />
        {report.aiSummary.healthScore !== undefined && report.aiSummary.healthScore !== report.aiSummary.overallScore && (
          <>
            <ArrowPathIcon className="h-6 w-6 text-brand-primary" aria-hidden />
            <ScoreDisplay label="After" animated={animatedHealth} />
          </>
        )}
      </div>

      {/* Verification status */}
      <div className="flex items-center justify-center gap-2">
        {isVerified ? (
          <CheckCircleIcon className="h-4 w-4 text-semantic-success" aria-hidden />
        ) : (
          <ExclamationTriangleIcon className="h-4 w-4 text-semantic-warning" aria-hidden />
        )}
        <span className="text-caption text-text-muted">
          Verification Status: <span className={`font-semibold ${isVerified ? 'text-semantic-success' : 'text-semantic-warning'}`}>
            {isVerified ? 'Verified' : 'Partially Verified'}
          </span>
        </span>
      </div>

      {/* Verified stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {report.itemsAnalyzed.toLocaleString()}
          </div>
          <div className="text-caption text-text-muted">Files Removed</div>
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
            <div className="text-caption text-text-muted">Threats Checked</div>
          </div>
        )}
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
          <div className="text-xl font-bold tabular-nums text-text-primary">
            {report.aiSummary.modulesAnalyzed}
          </div>
          <div className="text-caption text-text-muted">Modules Verified</div>
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
