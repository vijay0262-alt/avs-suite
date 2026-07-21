import { useState } from 'react';
import type { ReactNode } from 'react';
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
  ChevronDownIcon,
  ChevronUpIcon,
  InformationCircleIcon,
  LockClosedIcon,
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

function Expandable({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 text-left bg-surface-muted hover:bg-surface"
      >
        <span className="text-sm font-medium text-text-primary">{title}</span>
        {open ? <ChevronUpIcon className="h-4 w-4 text-text-muted" /> : <ChevronDownIcon className="h-4 w-4 text-text-muted" />}
      </button>
      {open && <div className="p-3 border-t border-border">{children}</div>}
    </div>
  );
}

function ImpactBadge({ impact }: { impact: 'low' | 'medium' | 'high' }) {
  const colors = {
    high: 'bg-semantic-danger/10 text-semantic-danger',
    medium: 'bg-semantic-warning/10 text-semantic-warning',
    low: 'bg-semantic-success/10 text-semantic-success',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[impact]}`}>
      {impact.charAt(0).toUpperCase() + impact.slice(1)} Impact
    </span>
  );
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
    const selectedModules = selected.map((i) => report.modules.find((m) => m.moduleId === i.moduleId)).filter(Boolean);
    const totalRecoverable = selected.reduce((s, i) => s + i.recoverableSpace, 0);
    const before = report.overallScore;
    const boost = Math.min(50, Math.round(selected.length * 6));
    const after = Math.min(100, before + boost);
    const bootImprovement = selectedModules.reduce((s, m) => s + (m?.details?.bootImprovementSeconds || 0), 0);
    const ramRecovery = selectedModules.reduce((s, m) => s + (m?.details?.ramRecovery || 0), 0);
    const tracesRemoved = selectedModules.reduce((s, m) => s + (m?.details?.tracesRemoved || 0), 0);

    return (
      <Modal
        open
        title="Optimization Summary"
        onClose={onClose}
        size="lg"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onBackToReport} leftIcon={<ArrowLeftIcon className="h-4 w-4" />}>
              Back
            </Button>
            <Button onClick={onExecute} leftIcon={<SparklesIcon className="h-4 w-4" />}>
              Optimize Now
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <div className="text-2xl font-bold text-text-primary tabular-nums">{before}</div>
              <div className="text-xs text-text-secondary">Current Health</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-semantic-success tabular-nums">{after}</div>
              <div className="text-xs text-text-secondary">Predicted Health</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-semantic-success tabular-nums">{formatBytes(totalRecoverable)}</div>
              <div className="text-xs text-text-secondary">Storage Recovery</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-semantic-success tabular-nums">{bootImprovement}s</div>
              <div className="text-xs text-text-secondary">Boot Improvement</div>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <div className="text-2xl font-bold text-semantic-success tabular-nums">{formatBytes(ramRecovery)}</div>
              <div className="text-xs text-text-secondary">RAM Available After</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-semantic-success tabular-nums">{tracesRemoved}</div>
              <div className="text-xs text-text-secondary">Traces Removed</div>
            </Card>
            <Card>
              <div className="text-2xl font-bold text-text-primary tabular-nums">{selected.length}</div>
              <div className="text-xs text-text-secondary">Categories</div>
            </Card>
          </div>

          <div className="p-4 rounded-md bg-semantic-success/10">
            <div className="flex items-start gap-3">
              <LockClosedIcon className="h-5 w-5 text-semantic-success shrink-0 mt-0.5" aria-hidden />
              <div>
                <div className="text-sm font-medium text-text-primary">What will NOT be changed</div>
                <ul className="mt-2 space-y-1 text-sm text-text-secondary">
                  <li>Personal files, documents, photos, and videos will not be deleted.</li>
                  <li>Passwords, bookmarks, and saved logins will not be removed.</li>
                  <li>Installed software and Windows system files will not be modified.</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
              Select categories and review details
            </div>
            <div className="space-y-3">
              {selection.map((item) => {
                const module = report.modules.find((m) => m.moduleId === item.moduleId);
                const details = module?.details;
                return (
                  <Expandable
                    key={item.moduleId}
                    title={
                      <div className="flex items-center gap-3 w-full pr-2">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleSelection(item.moduleId);
                          }}
                          onChange={() => {}}
                          className="w-4 h-4"
                        />
                        <span className="flex-1">{item.moduleName}</span>
                        <ImpactBadge impact={details?.impact || 'low'} />
                        <span className="text-semantic-success tabular-nums">{formatBytes(item.recoverableSpace)}</span>
                      </div>
                    }
                  >
                    {details ? (
                      <div className="space-y-4">
                        <div className="text-sm text-text-secondary">
                          <span className="font-medium text-text-primary">Summary:</span> {details.summary}
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-text-secondary">Safe to remove:</span>
                            <span className={details.safeToRemove ? 'text-semantic-success' : 'text-semantic-danger'}>
                              {details.safeToRemove ? 'Yes' : 'No'}
                            </span>
                          </div>
                          {details.estimatedRecovery ? (
                            <div className="text-semantic-success tabular-nums">
                              Est. recovery: {formatBytes(details.estimatedRecovery)}
                            </div>
                          ) : null}
                          {details.bootImprovementSeconds ? (
                            <div className="text-semantic-success tabular-nums">
                              Boot improvement: {details.bootImprovementSeconds}s
                            </div>
                          ) : null}
                          {details.ramRecovery ? (
                            <div className="text-semantic-success tabular-nums">
                              RAM recovery: {formatBytes(details.ramRecovery)}
                            </div>
                          ) : null}
                          {details.tracesRemoved ? (
                            <div className="text-semantic-success tabular-nums">
                              Traces removed: {details.tracesRemoved}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex gap-2 text-sm text-text-secondary">
                          <InformationCircleIcon className="h-5 w-5 shrink-0" aria-hidden />
                          <span>{details.why}</span>
                        </div>
                        <div className="text-sm">
                          <div className="font-medium text-text-primary mb-1">What will NOT be changed</div>
                          <ul className="list-disc pl-5 space-y-1 text-text-secondary">
                            {details.notChanged.map((n, idx) => (
                              <li key={idx}>{n}</li>
                            ))}
                          </ul>
                        </div>
                        {details.groups.length > 0 && (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-text-primary">Details</div>
                            {details.groups.map((g, idx) => (
                              <div key={idx} className="p-3 rounded-md bg-surface-muted">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-sm font-medium text-text-primary">{g.title}</span>
                                  {g.totalSize ? <span className="text-xs text-semantic-success tabular-nums">{formatBytes(g.totalSize)}</span> : null}
                                </div>
                                <div className="text-xs text-text-secondary mb-2">{g.why}</div>
                                {g.items.length > 0 && (
                                  <ul className="space-y-1 text-xs text-text-secondary">
                                    {g.items.map((i, iidx) => (
                                      <li key={iidx} className="flex items-center justify-between">
                                        <span>{i.name}</span>
                                        {i.size ? <span className="tabular-nums">{formatBytes(i.size)}</span> : null}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-text-secondary">No details available.</div>
                    )}
                  </Expandable>
                );
              })}
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
    const changes = result ? buildResultChanges(result) : [];
    const undoMap = buildUndoMap(selected);

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

          {changes.length > 0 && (
            <div>
              <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">Exactly what changed</div>
              <div className="space-y-2">
                {changes.map((c) => (
                  <div key={c.key} className="flex items-center justify-between p-3 rounded-md bg-surface-muted">
                    <div className="flex items-center gap-3">
                      {c.cleaned ? (
                        <CheckCircleIcon className="h-5 w-5 text-semantic-success" aria-hidden />
                      ) : (
                        <XCircleIcon className="h-5 w-5 text-semantic-warning" aria-hidden />
                      )}
                      <span className="text-sm text-text-primary">{c.label}</span>
                    </div>
                    <span className="text-sm font-medium text-text-primary tabular-nums">{formatBytes(c.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 rounded-md bg-surface-muted">
            <div className="mb-2 text-sm font-medium text-text-primary">Undo availability</div>
            <div className="space-y-2">
              {undoMap.map((u) => (
                <div key={u.moduleId} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{u.moduleName}</span>
                  <span className={u.available ? 'text-semantic-success' : 'text-text-muted'}>
                    {u.available ? 'Yes' : 'No'}
                  </span>
                </div>
              ))}
            </div>
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

function buildResultChanges(result: OptimizeExecuteResponse): { key: string; label: string; cleaned: boolean; size: number }[] {
  const labels: Record<string, string> = {
    temporaryFiles: 'Temporary files removed',
    recycleBin: 'Recycle bin emptied',
    browserCache: 'Browser cache cleared',
    thumbnailCache: 'Thumbnail cache cleared',
    flushDNS: 'DNS cache flushed',
    refreshExplorer: 'Explorer cache refreshed',
    memoryTrim: 'Memory optimized',
  };
  return Object.entries(result.results).map(([key, value]) => ({
    key,
    label: labels[key] || key,
    cleaned: value.cleaned && !value.error,
    size: value.size,
  }));
}

function buildUndoMap(selected: OptimizationSelectionItem[]): { moduleId: string; moduleName: string; available: boolean }[] {
  const canUndo: Record<string, boolean> = {
    junk: true,
    startup: true,
    registry: true,
    privacy: false,
    performance: false,
    disk: false,
    security: false,
    system: false,
  };
  return selected.map((item) => ({
    moduleId: item.moduleId,
    moduleName: item.moduleName,
    available: canUndo[item.moduleId] ?? false,
  }));
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
