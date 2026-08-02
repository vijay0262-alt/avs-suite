/**
 * OptimizationReportsPage — exposes the optimization-reports and
 * optimization-report backends to the UI.
 *
 * Shows:
 *   - Report statistics (total, avg health delta, storage recovered, etc.)
 *   - Report list with expandable details
 *   - Report comparison view
 *   - Export to PDF/HTML/Markdown/JSON/CSV
 *   - Report history timeline
 */
import { useEffect, useMemo } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState } from '../../components/ModuleStates';
import {
  OptimizationReportManager,
  type OptimizationReport,
  type ReportStatistics,
  type ExportFormat,
  type ExportResult,
  type ReportComparison,
  type ReportHistoryEntry,
  type OverallResult,
} from '../optimization-reports';
import { ReportManager } from '../optimization-report';
import type {
  IntelligenceReport as V1IntelligenceReport,
  ReportStatistics as V1Statistics,
} from '../optimization-report';
import {
  DocumentChartBarIcon,
  ArrowDownTrayIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  CircleStackIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EyeIcon,
  ArchiveBoxIcon,
} from '@heroicons/react/24/outline';

// ── ViewModel ──────────────────────────────────────────────────

interface OptReportsState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  reports: OptimizationReport[];
  v1Reports: V1IntelligenceReport[];
  statistics: ReportStatistics | null;
  v1Statistics: V1Statistics | null;
  history: ReportHistoryEntry[];
  selectedReportId: string | null;
  selectedReport: OptimizationReport | null;
  selectedV1Report: V1IntelligenceReport | null;
  comparison: ReportComparison | null;
  compareAId: string | null;
  compareBId: string | null;
  exportFormat: ExportFormat;
  lastExport: ExportResult | null;
  error: string | null;
}

class OptReportsViewModel extends ViewModel<OptReportsState> {
  private manager: OptimizationReportManager;
  private v1Manager: ReportManager;

  constructor() {
    super({
      bootstrap: 'idle',
      reports: [],
      v1Reports: [],
      statistics: null,
      v1Statistics: null,
      history: [],
      selectedReportId: null,
      selectedReport: null,
      selectedV1Report: null,
      comparison: null,
      compareAId: null,
      compareBId: null,
      exportFormat: 'json',
      lastExport: null,
      error: null,
    });
    this.manager = new OptimizationReportManager();
    this.v1Manager = new ReportManager();
  }

  bootstrap() {
    this.setState({ bootstrap: 'loading' });
    try {
      const reports = this.manager.getReports();
      const v1Reports = this.v1Manager.getReports();
      this.setState({
        reports,
        v1Reports,
        statistics: this.manager.getReportStatistics(),
        v1Statistics: this.v1Manager.getReportStatistics(),
        history: this.manager.history.getAll(),
        bootstrap: 'ready',
      });
    } catch (e) {
      this.setState({ bootstrap: 'error', error: e instanceof Error ? e.message : 'Failed to load reports' });
    }
  }

  selectReport(reportId: string | null) {
    if (!reportId) {
      this.setState({ selectedReportId: null, selectedReport: null, selectedV1Report: null });
      return;
    }
    const report = this.manager.getReport(reportId) ?? null;
    const v1Report = this.v1Manager.getReport(reportId) ?? null;
    if (report) this.manager.markViewed(reportId);
    if (v1Report) this.v1Manager.markViewed(reportId);
    this.setState({ selectedReportId: reportId, selectedReport: report, selectedV1Report: v1Report });
  }

  setCompareA(id: string | null) {
    this.setState({ compareAId: id });
  }

  setCompareB(id: string | null) {
    this.setState({ compareBId: id });
  }

  runComparison() {
    const { compareAId, compareBId } = this.state;
    if (!compareAId || !compareBId) return;
    const result = this.manager.compareReports(compareAId, compareBId);
    this.setState({ comparison: result });
  }

  setExportFormat(format: ExportFormat) {
    this.setState({ exportFormat: format });
  }

  exportSelected() {
    const { selectedReportId, exportFormat } = this.state;
    if (!selectedReportId) return;
    const result = this.manager.exportReport(selectedReportId, exportFormat);
    this.setState({ lastExport: result });
  }

  archiveSelected() {
    const { selectedReportId } = this.state;
    if (!selectedReportId) return;
    const v1 = this.v1Manager.getReport(selectedReportId);
    if (v1) this.v1Manager.archiveReport(selectedReportId);
    this.refresh();
  }

  shareSelected() {
    const { selectedReportId } = this.state;
    if (!selectedReportId) return;
    const v1 = this.v1Manager.getReport(selectedReportId);
    if (v1) this.v1Manager.shareReport(selectedReportId);
    this.refresh();
  }

  private refresh() {
    this.setState({
      reports: this.manager.getReports(),
      v1Reports: this.v1Manager.getReports(),
      statistics: this.manager.getReportStatistics(),
      v1Statistics: this.v1Manager.getReportStatistics(),
      history: this.manager.history.getAll(),
    });
  }

  override dispose() {
    super.dispose();
    this.manager.clear?.();
    this.v1Manager.clear();
  }
}

// ── Helpers ────────────────────────────────────────────────────

const RESULT_COLORS: Record<OverallResult, string> = {
  success: 'text-[var(--avs-success)]',
  partial: 'text-[var(--avs-warning)]',
  failed: 'text-[var(--avs-danger)]',
  rolled_back: 'text-[var(--avs-text-muted)]',
};

const RESULT_ICONS: Record<OverallResult, typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  partial: ExclamationTriangleIcon,
  failed: XCircleIcon,
  rolled_back: ArrowPathIcon,
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.floor(s % 60)}s`;
}

function formatTimeAgo(iso: string): string {
  const ts = new Date(iso).getTime();
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EXPORT_FORMATS: ExportFormat[] = ['pdf', 'html', 'markdown', 'json', 'csv'];

// ── Page ───────────────────────────────────────────────────────

export default function OptimizationReportsPage() {
  const vm = useMemo(() => new OptReportsViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  if (state.bootstrap === 'loading') {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Optimization Reports" description="AI-generated reports for every optimization with health deltas, benefits, and evidence." />
        <ModuleLoadingState />
      </div>
    );
  }

  const s = state;

  return (
    <div className="px-6 py-6 space-y-6">
      <PageHeader
        title="Optimization Reports"
        description="AI-generated reports for every optimization with health deltas, benefits, and evidence."
        actions={
          <Button variant="secondary" onClick={() => vm.bootstrap()} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
            Refresh
          </Button>
        }
      />

      {/* Statistics */}
      {(s.statistics || s.v1Statistics) && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <StatCard label="Total Reports" value={(s.statistics?.totalReports ?? 0) + (s.v1Statistics?.totalReports ?? 0)} icon={DocumentChartBarIcon} />
          <StatCard label="Avg Health Delta" value={`+${(s.statistics?.averageHealthDelta ?? 0).toFixed(1)}`} icon={ArrowTrendingUpIcon} />
          <StatCard label="Storage Recovered" value={formatBytes(s.statistics?.totalStorageRecovered ?? 0)} icon={CircleStackIcon} />
          <StatCard label="Startup Saved" value={`${(s.statistics?.totalStartupSaved ?? 0).toFixed(0)}s`} icon={ClockIcon} />
          <StatCard label="Avg Confidence" value={`${((s.statistics?.averageConfidence ?? 0) * 100).toFixed(0)}%`} icon={CheckCircleIcon} />
          <StatCard label="Recs Resolved" value={s.statistics?.totalRecommendationsResolved ?? 0} icon={CheckCircleIcon} />
        </div>
      )}

      {/* Empty State */}
      {s.reports.length === 0 && s.v1Reports.length === 0 && (
        <Card>
          <ModuleEmptyState
            icon={DocumentChartBarIcon}
            title="No optimization reports yet"
            message="Run an optimization from the Dashboard or Smart Optimize to generate a report."
          />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Report List */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--avs-text-primary)]">Reports</h3>
          {s.reports.length === 0 && s.v1Reports.length === 0 && (
            <p className="text-xs text-[var(--avs-text-muted)]">No reports available.</p>
          )}
          {s.reports.map((report) => (
            <ReportListItem
              key={report.id}
              id={report.id}
              title={report.title}
              summary={report.summary}
              overallResult={report.overallResult}
              healthDelta={report.healthDelta}
              storageRecovered={report.storageRecovered}
              confidence={report.confidence}
              generatedAt={report.generatedAt}
              isSelected={s.selectedReportId === report.id}
              onSelect={() => vm.selectReport(report.id)}
            />
          ))}
          {s.v1Reports.map((report) => (
            <V1ReportListItem
              key={report.id}
              report={report}
              isSelected={s.selectedReportId === report.id}
              onSelect={() => vm.selectReport(report.id)}
            />
          ))}
        </div>

        {/* Report Detail */}
        <div className="lg:col-span-2 space-y-4">
          {s.selectedReport && <ReportDetail report={s.selectedReport} />}
          {s.selectedV1Report && <V1ReportDetail report={s.selectedV1Report} />}
          {!s.selectedReport && !s.selectedV1Report && (
            <Card variant="glass">
              <div className="py-12 text-center">
                <DocumentChartBarIcon className="h-10 w-10 text-[var(--avs-text-muted)] mx-auto mb-3" />
                <p className="text-sm text-[var(--avs-text-muted)]">Select a report to view details.</p>
              </div>
            </Card>
          )}

          {/* Export & Actions */}
          {s.selectedReportId && (
            <Card title="Actions" variant="glass">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--avs-text-muted)]">Format:</span>
                  <select
                    value={s.exportFormat}
                    onChange={(e) => vm.setExportFormat(e.target.value as ExportFormat)}
                    className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-2 py-1 text-xs text-[var(--avs-text-primary)]"
                  >
                    {EXPORT_FORMATS.map((f) => (
                      <option key={f} value={f}>{f.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <Button size="sm" onClick={() => vm.exportSelected()} leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}>
                  Export
                </Button>
                <Button size="sm" variant="secondary" onClick={() => vm.shareSelected()} leftIcon={<EyeIcon className="h-4 w-4" />}>
                  Share
                </Button>
                <Button size="sm" variant="secondary" onClick={() => vm.archiveSelected()} leftIcon={<ArchiveBoxIcon className="h-4 w-4" />}>
                  Archive
                </Button>
              </div>
              {s.lastExport && (
                <div className="mt-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <p className="text-xs text-[var(--avs-text-secondary)]">
                    Exported: <span className="font-medium text-[var(--avs-text-primary)]">{s.lastExport.filename}</span> ({s.lastExport.content.length} bytes)
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Comparison */}
          {s.reports.length >= 2 && (
            <Card title="Compare Reports" variant="glass">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <select
                    value={s.compareAId ?? ''}
                    onChange={(e) => vm.setCompareA(e.target.value || null)}
                    className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-xs text-[var(--avs-text-primary)]"
                  >
                    <option value="">Report A…</option>
                    {s.reports.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                  <span className="text-xs text-[var(--avs-text-muted)]">vs</span>
                  <select
                    value={s.compareBId ?? ''}
                    onChange={(e) => vm.setCompareB(e.target.value || null)}
                    className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-xs text-[var(--avs-text-primary)]"
                  >
                    <option value="">Report B…</option>
                    {s.reports.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                  </select>
                  <Button size="sm" onClick={() => vm.runComparison()} disabled={!s.compareAId || !s.compareBId}>
                    Compare
                  </Button>
                </div>
                {s.comparison && (
                  <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4 space-y-2">
                    <p className="text-sm font-medium text-[var(--avs-text-primary)]">{s.comparison.summary}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <ComparisonRow label="Health Delta" value={s.comparison.healthDelta} />
                      <ComparisonRow label="Storage Delta" value={s.comparison.storageDelta} suffix=" bytes" />
                      <ComparisonRow label="Performance Delta" value={s.comparison.performanceDelta} />
                      <ComparisonRow label="Privacy Delta" value={s.comparison.privacyDelta} />
                      <ComparisonRow label="Startup Delta" value={s.comparison.startupDelta} />
                      <ComparisonRow label="Duration Delta" value={s.comparison.durationDelta} suffix="ms" />
                    </div>
                    <p className="text-xs text-[var(--avs-text-muted)]">
                      Winner: <span className="font-semibold capitalize text-[var(--avs-text-primary)]">{s.comparison.winner}</span>
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* History */}
          {s.history.length > 0 && (
            <Card title="Report History" variant="glass">
              <div className="space-y-1">
                {s.history.slice(-10).reverse().map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                    <ClockIcon className="h-4 w-4 text-[var(--avs-text-muted)]" />
                    <span className="text-xs font-medium text-[var(--avs-text-primary)] capitalize">{entry.action}</span>
                    <span className="text-xs text-[var(--avs-text-muted)]">{formatTimeAgo(entry.timestamp)}</span>
                    <span className="text-xs text-[var(--avs-text-muted)] ml-auto">Report: {entry.reportId.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <Card variant="glass" className="p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
        <div>
          <p className="text-xs text-[var(--avs-text-muted)]">{label}</p>
          <p className="text-lg font-bold text-[var(--avs-text-primary)]">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function ReportListItem({
  id: _id, title, summary, overallResult, healthDelta, storageRecovered, confidence, generatedAt, isSelected, onSelect,
}: {
  id: string; title: string; summary: string; overallResult: OverallResult;
  healthDelta: number | null; storageRecovered: number; confidence: number;
  generatedAt: string; isSelected: boolean; onSelect: () => void;
}) {
  const ResultIcon = RESULT_ICONS[overallResult];
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-[var(--avs-radius-md)] border p-3 transition-all ${
        isSelected
          ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]/10'
          : 'border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] hover:border-[var(--avs-brand-primary)]/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--avs-text-primary)] truncate">{title}</span>
        <ResultIcon className={`h-4 w-4 shrink-0 ${RESULT_COLORS[overallResult]}`} />
      </div>
      <p className="text-xs text-[var(--avs-text-muted)] mt-1 line-clamp-2">{summary}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-[var(--avs-text-muted)]">
        {healthDelta !== null && (
          <span className={healthDelta > 0 ? 'text-[var(--avs-success)]' : ''}>
            Health: {healthDelta > 0 ? '+' : ''}{healthDelta}
          </span>
        )}
        <span>Storage: {formatBytes(storageRecovered)}</span>
        <span>{(confidence * 100).toFixed(0)}%</span>
        <span className="ml-auto">{formatTimeAgo(generatedAt)}</span>
      </div>
    </button>
  );
}

function V1ReportListItem({ report, isSelected, onSelect }: { report: V1IntelligenceReport; isSelected: boolean; onSelect: () => void }) {
  const story = report.story;
  const ResultIcon = story.outcome === 'success' ? CheckCircleIcon : story.outcome === 'failed' ? XCircleIcon : ExclamationTriangleIcon;
  const color = story.outcome === 'success' ? 'text-[var(--avs-success)]' : story.outcome === 'failed' ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-warning)]';
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-[var(--avs-radius-md)] border p-3 transition-all ${
        isSelected
          ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]/10'
          : 'border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] hover:border-[var(--avs-brand-primary)]/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-[var(--avs-text-primary)] truncate">{story.title}</span>
        <ResultIcon className={`h-4 w-4 shrink-0 ${color}`} />
      </div>
      <p className="text-xs text-[var(--avs-text-muted)] mt-1 line-clamp-2">{report.headline}</p>
      <div className="flex items-center gap-3 mt-2 text-xs text-[var(--avs-text-muted)]">
        {report.healthDelta.delta !== null && (
          <span className={report.healthDelta.delta > 0 ? 'text-[var(--avs-success)]' : ''}>
            Health: {report.healthDelta.delta > 0 ? '+' : ''}{report.healthDelta.delta}
          </span>
        )}
        <span>{report.storageRecovered.formatted}</span>
        <span>{(story.confidenceScore * 100).toFixed(0)}%</span>
        <span className="ml-auto">{formatTimeAgo(report.generatedAt)}</span>
      </div>
    </button>
  );
}

function ReportDetail({ report }: { report: OptimizationReport }) {
  return (
    <Card title={report.title} variant="glass">
      <div className="space-y-4">
        <p className="text-sm text-[var(--avs-text-secondary)]">{report.summary}</p>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricBox label="Health Delta" value={report.healthDelta !== null ? `${report.healthDelta > 0 ? '+' : ''}${report.healthDelta}` : 'N/A'} icon={ArrowTrendingUpIcon} />
          <MetricBox label="Storage Recovered" value={formatBytes(report.storageRecovered)} icon={CircleStackIcon} />
          <MetricBox label="Startup Improvement" value={`${report.startupImprovement}s`} icon={ClockIcon} />
          <MetricBox label="Confidence" value={`${(report.confidence * 100).toFixed(0)}%`} icon={CheckCircleIcon} />
        </div>

        {/* Sections */}
        {report.sections.filter(s => s.visible).map((section) => (
          <div key={section.type}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-2">{section.title}</h4>
            <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
              <pre className="text-xs text-[var(--avs-text-secondary)] whitespace-pre-wrap">
                {JSON.stringify(section.data, null, 2)}
              </pre>
            </div>
          </div>
        ))}

        {/* Next Best Actions */}
        {report.nextBestActions.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-2">Next Best Actions</h4>
            <div className="space-y-2">
              {report.nextBestActions.map((action) => (
                <div key={action.id} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--avs-text-primary)]">{action.title}</span>
                    <Badge tone="brand">{action.safety}</Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--avs-text-muted)]">
                    <span>Impact: {action.estimatedImpact}</span>
                    <span>Time: {formatDuration(action.estimatedTime)}</span>
                    <span>Confidence: {(action.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidence */}
        {report.evidence.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-2">Evidence</h4>
            <div className="space-y-1">
              {report.evidence.slice(0, 10).map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-medium text-[var(--avs-text-secondary)]">{ev.source}:</span>
                  <span className="text-[var(--avs-text-muted)]">{ev.metric} = {String(ev.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function V1ReportDetail({ report }: { report: V1IntelligenceReport }) {
  const story = report.story;
  return (
    <Card title={story.title} variant="glass">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-[var(--avs-text-primary)]">{report.headline}</p>
          <p className="text-xs text-[var(--avs-text-muted)] mt-0.5">{report.subtitle}</p>
        </div>

        <p className="text-sm text-[var(--avs-text-secondary)]">{story.narrative}</p>

        {/* Story Highlights */}
        {story.highlights.length > 0 && (
          <div className="space-y-1">
            {story.highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[var(--avs-text-secondary)]">
                <CheckCircleIcon className="h-4 w-4 text-[var(--avs-success)] shrink-0" />
                <span>{h}</span>
              </div>
            ))}
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricBox label="Health Delta" value={report.healthDelta.formatted} icon={ArrowTrendingUpIcon} />
          <MetricBox label="Storage" value={report.storageRecovered.formatted} icon={CircleStackIcon} />
          <MetricBox label="Startup" value={report.startupImprovement.formatted} icon={ClockIcon} />
          <MetricBox label="Execution" value={report.executionTime.formatted} icon={ClockIcon} />
        </div>

        {/* Actions Completed */}
        {report.actionsCompleted.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-2">Actions Completed ({report.actionsCompleted.length})</h4>
            <div className="space-y-1">
              {report.actionsCompleted.map((action) => (
                <div key={action.stepId} className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                  <CheckCircleIcon className="h-4 w-4 text-[var(--avs-success)] shrink-0" />
                  <span className="text-xs font-medium text-[var(--avs-text-primary)]">{action.title}</span>
                  <span className="text-xs text-[var(--avs-text-muted)] ml-auto">{action.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions Skipped */}
        {report.actionsSkipped.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-2">Actions Skipped ({report.actionsSkipped.length})</h4>
            <div className="space-y-1">
              {report.actionsSkipped.map((action) => (
                <div key={action.stepId} className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-[var(--avs-warning)] shrink-0" />
                  <span className="text-xs font-medium text-[var(--avs-text-primary)]">{action.title}</span>
                  <span className="text-xs text-[var(--avs-text-muted)] ml-auto">{action.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rollback Info */}
        {report.rollbackInfo.available && (
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
            <div className="flex items-center gap-2">
              <ArrowPathIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
              <span className="text-xs font-medium text-[var(--avs-text-primary)]">Rollback Available</span>
            </div>
            <p className="text-xs text-[var(--avs-text-muted)] mt-1">{report.rollbackInfo.formatted}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function MetricBox({ label, value, icon: Icon }: { label: string; value: string; icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--avs-text-muted)]" />
        <span className="text-xs text-[var(--avs-text-muted)]">{label}</span>
      </div>
      <p className="text-sm font-semibold text-[var(--avs-text-primary)] mt-1">{value}</p>
    </div>
  );
}

function ComparisonRow({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  if (value === null) return null;
  const positive = value > 0;
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--avs-text-muted)]">{label}</span>
      <span className={`font-medium ${positive ? 'text-[var(--avs-success)]' : value < 0 ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-text-primary)]'}`}>
        {positive ? '+' : ''}{value}{suffix}
      </span>
    </div>
  );
}
