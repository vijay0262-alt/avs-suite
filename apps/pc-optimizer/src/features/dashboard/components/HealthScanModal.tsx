import { Button, Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon,
  SparklesIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  TrashIcon,
  CpuChipIcon,
  CircleStackIcon,
  ServerIcon,
} from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import type {
  HealthScanStep,
  HealthScanModuleResult,
  HealthScanReport,
  OptimizationSelectionItem,
  OptimizationExecutionProgress,
  OptimizeExecuteResponse,
} from '../dashboard.types';

export interface HealthScanModalProps {
  step: HealthScanStep;
  modules: HealthScanModuleResult[];
  report: HealthScanReport | null;
  selection: OptimizationSelectionItem[];
  execution: OptimizationExecutionProgress | null;
  result: OptimizeExecuteResponse | null;
  error: string | null;
  onCancel: () => void;
  onClose: () => void;
  onReview: () => void;
  onToggleSelection: (moduleId: string) => void;
  onExecute: () => void;
  onCancelExecute: () => void;
  onBackToReport: () => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  high: 'text-semantic-danger',
  medium: 'text-semantic-warning',
  low: 'text-semantic-success',
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remaining}s`;
  return `${remaining}s`;
}

function ModuleIcon({ id }: { id: string }) {
  const icons: Record<string, typeof ShieldCheckIcon> = {
    junk: TrashIcon,
    startup: ServerIcon,
    privacy: ShieldCheckIcon,
    performance: CpuChipIcon,
    disk: CircleStackIcon,
    registry: ServerIcon,
    security: ShieldCheckIcon,
    system: CpuChipIcon,
  };
  const Icon = icons[id] || ShieldCheckIcon;
  return <Icon className="h-5 w-5" aria-hidden />;
}

export function HealthScanModal({
  step,
  modules,
  report,
  selection,
  execution,
  result,
  error,
  onCancel,
  onClose,
  onReview,
  onToggleSelection,
  onExecute,
  onCancelExecute,
  onBackToReport,
}: HealthScanModalProps) {
  const total = modules.length || 1;
  const done = modules.filter((m) => m.status === 'complete' || m.status === 'error' || m.status === 'skipped').length;
  const progress = Math.round((done / total) * 100);
  const currentModule = modules.find((m) => m.status === 'scanning');

  if (step === 'scanning') {
    return (
      <Modal open title="Health Scan" onClose={onCancel} size="lg" actions={null}>
        <div className="space-y-6">
          <div className="text-center">
            <div className="text-lg font-medium text-text-primary mb-1">
              {currentModule ? `Scanning ${currentModule.moduleName}...` : 'Preparing scan...'}
            </div>
            <div className="text-sm text-text-secondary">{progress}% complete</div>
          </div>

          <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-text-secondary">
              <ClockIcon className="h-4 w-4" aria-hidden />
              <span>Elapsed: {report ? formatDuration(Date.now() - report.startedAt) : '0s'}</span>
            </div>
            <div className="flex items-center gap-2 text-text-secondary">
              <ClockIcon className="h-4 w-4" aria-hidden />
              <span>Remaining: ~{Math.max(0, Math.round(((100 - progress) * 0.5)))}s</span>
            </div>
          </div>

          <div className="space-y-2">
            {modules.map((m) => (
              <div
                key={m.moduleId}
                className="flex items-center justify-between p-3 rounded-md bg-surface-muted"
              >
                <div className="flex items-center gap-3">
                  <div className="text-text-muted">
                    <ModuleIcon id={m.moduleId} />
                  </div>
                  <span className="text-sm font-medium text-text-primary">{m.moduleName}</span>
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button variant="secondary" onClick={onCancel}>
              Cancel Scan
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'report' && report) {
    const duration = report.finishedAt - report.startedAt;
    return (
      <Modal
        open
        title="Health Scan Report"
        onClose={onClose}
        size="lg"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onReview} leftIcon={<SparklesIcon className="h-4 w-4" />}>
              Review & Optimize
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-3xl font-bold text-text-primary tabular-nums">
                {report.overallScore}
              </div>
              <div className="text-sm text-text-secondary">Overall Health</div>
            </Card>
            <Card>
              <div className="text-3xl font-bold text-semantic-danger tabular-nums">
                {report.issuesFound}
              </div>
              <div className="text-sm text-text-secondary">Issues Found</div>
            </Card>
            <Card>
              <div className="text-3xl font-bold text-semantic-success tabular-nums">
                {formatBytes(report.recoverableSpace)}
              </div>
              <div className="text-sm text-text-secondary">Recoverable Space</div>
            </Card>
          </div>

          <div>
            <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
              Module Breakdown
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {report.modules.map((m) => (
                <ModuleReportCard key={m.moduleId} module={m} />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Scan completed in {formatDuration(duration)}</span>
            {error && (
              <span className="text-semantic-danger">{error}</span>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'selection' && report) {
    const selected = selection.filter((i) => i.selected);
    const totalRecoverable = selected.reduce((s, i) => s + i.recoverableSpace, 0);
    const before = report.overallScore;
    const boost = Math.min(50, Math.round(selected.length * 6));
    const after = Math.min(100, before + boost);

    return (
      <Modal
        open
        title="Optimization Selection"
        onClose={onClose}
        size="lg"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onBackToReport} leftIcon={<ArrowLeftIcon className="h-4 w-4" />}>
              Back
            </Button>
            <Button onClick={onExecute} leftIcon={<SparklesIcon className="h-4 w-4" />}>
              Run Optimization
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-3xl font-bold text-text-primary tabular-nums">{before}</div>
              <div className="text-sm text-text-secondary">Current Health</div>
            </Card>
            <Card>
              <div className="text-3xl font-bold text-semantic-success tabular-nums">{after}</div>
              <div className="text-sm text-text-secondary">Predicted Health</div>
            </Card>
            <Card>
              <div className="text-3xl font-bold text-semantic-success tabular-nums">
                {formatBytes(totalRecoverable)}
              </div>
              <div className="text-sm text-text-secondary">Space Recovery</div>
            </Card>
          </div>

          <div>
            <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
              Select categories to optimize
            </div>
            <div className="space-y-2">
              {selection.map((item) => (
                <label
                  key={item.moduleId}
                  className="flex items-center justify-between p-3 rounded-md bg-surface-muted cursor-pointer hover:bg-surface"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => onToggleSelection(item.moduleId)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm font-medium text-text-primary">{item.moduleName}</span>
                  </div>
                  <span className="text-sm text-semantic-success tabular-nums">
                    {formatBytes(item.recoverableSpace)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'optimizing') {
    return (
      <Modal open title="Optimizing" onClose={onCancelExecute} size="lg" actions={null}>
        <div className="space-y-6 text-center">
          <div className="text-lg font-medium text-text-primary">
            {execution?.currentModule || 'Optimizing...'}
          </div>

          <div className="w-full h-3 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all duration-300"
              style={{ width: `${execution?.progress || 0}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {execution?.itemsProcessed || 0}
              </div>
              <div className="text-sm text-text-secondary">Items Processed</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-semantic-success tabular-nums">
                {formatBytes(execution?.spaceRecovered || 0)}
              </div>
              <div className="text-sm text-text-secondary">Space Recovered</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {execution ? formatDuration(execution.elapsedMs) : '0s'}
              </div>
              <div className="text-sm text-text-secondary">Elapsed</div>
            </Card>
          </div>

          <div className="flex justify-center">
            <Button variant="secondary" onClick={onCancelExecute}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === 'complete' && report) {
    const before = report.overallScore;
    const selected = selection.filter((i) => i.selected);
    const boost = Math.min(50, Math.round(selected.length * 6));
    const after = Math.min(100, before + boost);
    const recovered = result?.totalRecovered ?? execution?.spaceRecovered ?? 0;
    const elapsed = result?.elapsedMs ?? execution?.elapsedMs ?? 0;

    return (
      <Modal
        open
        title="Optimization Complete"
        onClose={onClose}
        size="lg"
        actions={
          <Button onClick={onClose} leftIcon={<CheckCircleIcon className="h-4 w-4" />}>
            Done
          </Button>
        }
      >
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-4">
            <div className="p-3 rounded-full bg-semantic-success/10">
              <CheckCircleIcon className="h-10 w-10 text-semantic-success" aria-hidden />
            </div>
            <div>
              <div className="text-3xl font-bold text-text-primary tabular-nums">
                {before} <ArrowRightIcon className="h-6 w-6 inline mx-1 text-text-muted" /> {after}
              </div>
              <div className="text-sm text-text-secondary">Health Score</div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <div className="text-xl font-bold text-semantic-success tabular-nums">
                {formatBytes(recovered)}
              </div>
              <div className="text-xs text-text-secondary">Recovered Space</div>
            </Card>
            <Card>
              <div className="text-xl font-bold text-text-primary tabular-nums">
                {selected.length}
              </div>
              <div className="text-xs text-text-secondary">Modules Used</div>
            </Card>
            <Card>
              <div className="text-xl font-bold text-text-primary tabular-nums">
                {formatDuration(elapsed)}
              </div>
              <div className="text-xs text-text-secondary">Time Taken</div>
            </Card>
            <Card>
              <div className="text-xl font-bold text-semantic-success tabular-nums">
                {formatBytes(selected.reduce((s, i) => s + i.recoverableSpace, 0))}
              </div>
              <div className="text-xs text-text-secondary">Est. Recoverable</div>
            </Card>
          </div>

          {error && (
            <div className="flex items-start gap-3 py-3 px-4 rounded-md bg-semantic-danger/10 text-sm text-semantic-danger">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
              <span>{error}</span>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return null;
}

function StatusBadge({ status }: { status: HealthScanModuleResult['status'] }) {
  if (status === 'scanning') {
    return <span className="text-sm text-brand-primary">Scanning...</span>;
  }
  if (status === 'complete') {
    return <CheckCircleIcon className="h-5 w-5 text-semantic-success" aria-hidden />;
  }
  if (status === 'error') {
    return <XCircleIcon className="h-5 w-5 text-semantic-danger" aria-hidden />;
  }
  if (status === 'skipped') {
    return <span className="text-sm text-text-muted">Skipped</span>;
  }
  return <span className="text-sm text-text-muted">Pending</span>;
}

function ModuleReportCard({ module }: { module: HealthScanModuleResult }) {
  return (
    <div className="p-3 rounded-md bg-surface-muted">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="text-text-muted">
            <ModuleIcon id={module.moduleId} />
          </div>
          <span className="text-sm font-medium text-text-primary">{module.moduleName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${SEVERITY_COLORS[module.severity]}`}>
            {module.score}
          </span>
          <StatusBadge status={module.status} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-text-secondary">
        <div>Issues: {module.issuesFound}</div>
        <div>Recoverable: {formatBytes(module.recoverableSpace)}</div>
        <div className="col-span-2">{module.estimatedImprovement}</div>
      </div>
    </div>
  );
}
