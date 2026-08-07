/**
 * UnifiedResultsView — composes all AI results components into a single,
 * premium report experience used by every module in AVS Shield.
 *
 * Layout:
 *   ┌─────────────────────────────────────────┐
 *   │  ResultHeader (success, timestamp, meta) │
 *   │  ScoreRow (primary + secondary gauges)   │
 *   │  AIVerdict (natural language summary)    │
 *   │  ImpactEstimation (before/after grid)    │
 *   │  ResultCardsGrid (premium result cards)  │
 *   │  IssuePriorityGroups (collapsible)       │
 *   │  Recommendations (expandable + selectable)│
 *   │  ScanHistory (recent scans + trend)      │
 *   │  ActionPanel (export, apply, close)      │
 *   └─────────────────────────────────────────┘
 */
import { useState, useMemo, useCallback } from 'react';
import type { ReactNode } from 'react';
import { Card } from '@avs/ui';
import { ResultHeader } from './ResultHeader';
import { ScoreRow } from './ScoreGauge';
import { AIVerdict } from './AIVerdict';
import { ImpactEstimation } from './ImpactEstimation';
import { ResultCardsGrid } from './ResultCardsGrid';
import { FileDetailsSection } from './FileDetailsSection';
import { IssuePriorityGroups } from './IssuePriorityGroups';
import { Recommendations } from './Recommendations';
import { ReportExport } from './ReportExport';
import { ScanHistory } from './ScanHistory';
import type {
  UnifiedResultsReport,
  UnifiedResultAction,
  UnifiedScanHistoryEntry,
} from '../unifiedResultsTypes';

export interface UnifiedResultsViewProps {
  report: UnifiedResultsReport;
  history?: UnifiedScanHistoryEntry[];
  isPro?: boolean;
  onClose: () => void;
  onApplySelected?: (ids: string[]) => void;
  onApplyAllSafe?: (ids: string[]) => void;
  onReviewDetails?: () => void;
  extraActions?: UnifiedResultAction[];
  /** Prominent action rendered right after the header + scores */
  headerAction?: UnifiedResultAction;
  children?: ReactNode;
}

export function UnifiedResultsView({
  report,
  history = [],
  isPro = false,
  onClose,
  onApplySelected,
  onApplyAllSafe,
  onReviewDetails,
  extraActions = [],
  headerAction,
  children,
}: UnifiedResultsViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(report.recommendations.filter((r) => !r.requiresPro).map((r) => r.id)),
  );

  const hasIssues = report.issuesFound > 0 || (report.threatsFound ?? 0) > 0;

  const safeRecommendationIds = useMemo(
    () => report.recommendations
      .filter((r) => r.riskLevel === 'none' || r.riskLevel === 'low')
      .map((r) => r.id),
    [report.recommendations],
  );

  const handleToggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((ids: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const handleApplySelected = useCallback(() => {
    onApplySelected?.(Array.from(selectedIds));
  }, [selectedIds, onApplySelected]);

  const handleApplyAllSafe = useCallback(() => {
    onApplyAllSafe?.(safeRecommendationIds);
  }, [safeRecommendationIds, onApplyAllSafe]);

  return (
    <Card variant="glass" data-testid="unified-results-view">
      <div className="space-y-6">
        {/* Header */}
        <ResultHeader report={report} hasIssues={hasIssues} />

        {/* Scores */}
        <ScoreRow primary={report.primaryScore} secondary={report.secondaryScores} />

        {/* Prominent header action (e.g. Optimize Now) */}
        {headerAction && (
          <div className="flex justify-center pt-2">
            <button
              onClick={headerAction.action}
              data-testid="header-action-btn"
              data-action-id={headerAction.id}
              className="inline-flex items-center gap-2 rounded-[var(--avs-radius-lg)] bg-[var(--avs-brand-primary)] px-8 py-3 text-body font-semibold text-white shadow-[var(--avs-shadow-md)] transition-all hover:bg-[var(--avs-brand-primary)] hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
            >
              {headerAction.label}
            </button>
          </div>
        )}

        {/* AI Verdict */}
        <AIVerdict verdict={report.aiVerdict} />

        {/* Impact Estimation */}
        {report.impactEstimates.length > 0 && (
          <Section title="Estimated Improvements">
            <ImpactEstimation estimates={report.impactEstimates} />
          </Section>
        )}

        {/* Result Cards */}
        {report.resultCards.length > 0 && (
          <Section title="Result Summary">
            <ResultCardsGrid cards={report.resultCards} />
          </Section>
        )}

        {/* File Details (detected or cleaned files) */}
        {report.fileDetails && report.fileDetails.length > 0 && (
          <Section title="Files Detected">
            <FileDetailsSection
              groups={report.fileDetails}
              title="Files Needing Cleanup"
              variant="detected"
            />
          </Section>
        )}

        {/* Issues by Priority */}
        {report.issues.length > 0 && (
          <Section title={`Issues Found (${report.issues.length})`}>
            <IssuePriorityGroups issues={report.issues} />
          </Section>
        )}

        {/* Recommendations */}
        {report.recommendations.length > 0 && (
          <Section title={`Recommendations (${report.recommendations.length})`}>
            <Recommendations
              recommendations={report.recommendations}
              selectedIds={selectedIds}
              onToggle={handleToggle}
              onToggleAll={handleToggleAll}
            />
          </Section>
        )}

        {/* Custom module content */}
        {children}

        {/* Scan History */}
        {history.length > 0 && (
          <Section title="Scan History">
            <ScanHistory entries={history} isPro={isPro} />
          </Section>
        )}

        {/* Action Panel with inline export */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--avs-border)] pt-4">
          <div className="flex items-center gap-2">
            <ReportExport report={report} />
            <button
              onClick={() => {
                const json = JSON.stringify(report, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `AVS-Shield-${report.moduleId}-${report.reportId}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded-[var(--avs-radius-md)] px-3 py-1.5 text-caption font-medium text-text-secondary hover:bg-[var(--avs-surface-muted)] transition-colors"
            >
              Save Report
            </button>
            {onReviewDetails && (
              <button
                onClick={onReviewDetails}
                className="rounded-[var(--avs-radius-md)] px-3 py-1.5 text-caption font-medium text-text-secondary hover:bg-[var(--avs-surface-muted)] transition-colors"
              >
                Review Details
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onApplyAllSafe && safeRecommendationIds.length > 0 && (
              <button
                onClick={handleApplyAllSafe}
                className="rounded-[var(--avs-radius-md)] bg-brand-primary/10 px-3 py-1.5 text-caption font-medium text-brand-primary hover:bg-brand-primary/20 transition-colors"
              >
                Apply All Safe ({safeRecommendationIds.length})
              </button>
            )}
            {onApplySelected && selectedIds.size > 0 && (
              <button
                onClick={handleApplySelected}
                className="rounded-[var(--avs-radius-md)] bg-brand-primary px-3 py-1.5 text-caption font-medium text-white hover:bg-brand-primary/90 transition-colors"
              >
                Apply Selected ({selectedIds.size})
              </button>
            )}
            {extraActions.map((action) => (
              <button
                key={action.id}
                onClick={action.action}
                className="rounded-[var(--avs-radius-md)] px-3 py-1.5 text-caption font-medium text-text-secondary hover:bg-[var(--avs-surface-muted)] transition-colors"
              >
                {action.label}
              </button>
            ))}
            <button
              onClick={onClose}
              className="rounded-[var(--avs-radius-md)] px-3 py-1.5 text-caption font-medium text-text-muted hover:bg-[var(--avs-surface-muted)] transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-small font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      {children}
    </div>
  );
}
