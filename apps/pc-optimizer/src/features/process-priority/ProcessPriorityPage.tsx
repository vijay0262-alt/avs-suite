/**
 * ProcessPriorityPage — AI dynamic CPU priority based on active workload.
 *
 * Modes:
 *  - Balanced: default Windows priorities
 *  - Game Mode: boost games, lower background
 *  - Work Mode: boost productivity apps
 *  - Creative Mode: boost creative tools
 *  - Battery Saver: lower non-essential processes
 *
 * Free: view status and process list
 * Pro: set mode, apply adjustments, set priority, set affinity, reset, configure
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  CpuChipIcon,
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon,
  AdjustmentsHorizontalIcon,
  RocketLaunchIcon,
  Battery50Icon,
  BriefcaseIcon,
  PaintBrushIcon,
  ScaleIcon,
} from '@heroicons/react/24/outline';
import {
  processPriorityService,
  type ProcessPriorityStatus,
  type ProcessInfo,
  type PriorityMode,
  type PriorityLevel,
} from './processPriority.service';

const MODE_ICONS: Record<string, typeof BoltIcon> = {
  balanced: ScaleIcon,
  game: RocketLaunchIcon,
  work: BriefcaseIcon,
  creative: PaintBrushIcon,
  battery: Battery50Icon,
};

const CLASSIFICATION_CONFIG: Record<string, { tone: 'success' | 'warning' | 'neutral' | 'info'; label: string }> = {
  boost: { tone: 'success', label: 'Boost' },
  lower: { tone: 'warning', label: 'Lower' },
  protected: { tone: 'info', label: 'Protected' },
  neutral: { tone: 'neutral', label: 'Neutral' },
};

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'below_normal', label: 'Below Normal' },
  { value: 'normal', label: 'Normal' },
  { value: 'above_normal', label: 'Above Normal' },
  { value: 'high', label: 'High' },
];

export default function ProcessPriorityPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<ProcessPriorityStatus | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [applying, setApplying] = useState(false);
  const [actingPid, setActingPid] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [statusResult, listResult] = await Promise.all([
        processPriorityService.getStatus(),
        processPriorityService.listProcesses({ limit: 50, sortBy: 'cpu' }),
      ]);
      setStatus(statusResult);
      setProcesses(listResult.processes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load process priority data');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSetMode = async (mode: PriorityMode) => {
    if (!isPro) {
      showUpgrade('Process Prioritization');
      return;
    }
    setApplying(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await processPriorityService.setMode(mode);
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set mode');
    } finally {
      setApplying(false);
    }
  };

  const handleApplyMode = async () => {
    if (!isPro) {
      showUpgrade('Process Prioritization');
      return;
    }
    setApplying(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await processPriorityService.applyMode();
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply mode');
    } finally {
      setApplying(false);
    }
  };

  const handleSetPriority = async (pid: number, priority: PriorityLevel, name: string) => {
    if (!isPro) {
      showUpgrade('Process Prioritization');
      return;
    }
    setActingPid(pid);
    setError(null);
    setActionMessage(null);
    try {
      const result = await processPriorityService.setPriority(pid, priority);
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to set priority for ${name}`);
    } finally {
      setActingPid(null);
    }
  };

  const handleResetAll = async () => {
    if (!isPro) {
      showUpgrade('Process Prioritization');
      return;
    }
    setResetting(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await processPriorityService.resetAll();
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setResetting(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await processPriorityService.configure({ enabled: !status.enabled });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  const handleToggleAutoDetect = async () => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await processPriorityService.configure({ autoDetect: !status.autoDetect });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  return (
    <div data-testid="page-process-priority" className="space-y-4">
      <PageHeader
        title="AI Process Prioritization"
        description="Dynamic CPU priority based on active workload — boost what matters, lower what doesn&apos;t."
        actions={<HelpButton text="AI adjusts Windows process priorities using SetPriorityClass based on your current mode. Game Mode boosts games and lowers background apps. Work Mode boosts productivity tools. Creative Mode boosts video/3D/design apps. Battery Saver lowers non-essential processes." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <CpuChipIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Dynamic Priority Management</div>
          <p className="text-caption text-text-secondary mt-1">
            Uses Windows SetPriorityClass API to dynamically adjust process CPU priorities.
            Each mode boosts relevant processes and lowers non-essential ones for optimal performance.
          </p>
        </div>
      </div>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="priority-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="priority-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Mode selector */}
      {status && (
        <Card title="Optimization Mode" variant="glass" data-testid="priority-modes">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {status.availableModes.map((mode) => {
              const Icon = MODE_ICONS[mode.id] || ScaleIcon;
              const isActive = status.currentMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleSetMode(mode.id as PriorityMode)}
                  disabled={applying}
                  className={`text-left rounded-[var(--avs-radius-md)] border p-4 transition-all disabled:opacity-50 ${
                    isActive
                      ? 'border-brand-primary bg-brand-primary/10'
                      : 'border-[var(--avs-border)] bg-surface hover:border-brand-primary/50'
                  }`}
                  data-testid={`priority-mode-${mode.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`h-5 w-5 ${isActive ? 'text-brand-primary' : 'text-text-muted'}`} />
                    <span className="text-small font-medium text-text-primary">{mode.label}</span>
                    {isActive && <Badge tone="brand">Active</Badge>}
                  </div>
                  <p className="text-caption text-text-secondary">{mode.description}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              leftIcon={applying ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
              onClick={handleApplyMode}
              disabled={!isPro || applying || status.currentMode === 'balanced'}
              data-testid="priority-apply-btn"
            >
              {applying ? 'Applying...' : isPro ? 'Apply Now' : 'Upgrade'}
            </Button>
            <Button
              variant="secondary"
              leftIcon={resetting ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ArrowPathIcon className="h-5 w-5" />}
              onClick={handleResetAll}
              disabled={!isPro || resetting || status.adjustedCount === 0}
              data-testid="priority-reset-btn"
            >
              {isPro ? (resetting ? 'Resetting...' : 'Reset All') : 'Upgrade'}
            </Button>
          </div>
        </Card>
      )}

      {/* Stats cards */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalAdjustments}</div>
            <div className="text-caption text-text-muted">Total Adjustments</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-semantic-success tabular-nums">{status.stats.totalBoosted}</div>
            <div className="text-caption text-text-muted">Boosted</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-semantic-warning tabular-nums">{status.stats.totalLowered}</div>
            <div className="text-caption text-text-muted">Lowered</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.adjustedCount}</div>
            <div className="text-caption text-text-muted">Currently Adjusted</div>
          </Card>
        </div>
      )}

      {/* Process list */}
      <Card title="Running Processes" variant="glass" data-testid="priority-process-list">
        <p className="text-caption text-text-muted mb-3">
          {processes.length > 0 ? `${processes.length} processes — sorted by CPU usage` : 'No processes'}
        </p>

        {processes.length > 0 ? (
          <div className="space-y-1">
            {processes.slice(0, 30).map((proc) => {
              const classConfig = CLASSIFICATION_CONFIG[proc.classification] ?? CLASSIFICATION_CONFIG.neutral!;
              return (
                <div
                  key={proc.pid}
                  className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-2"
                  data-testid={`priority-proc-${proc.pid}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CpuChipIcon className="h-4 w-4 text-text-muted shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-small text-text-primary truncate">{proc.name}</span>
                        <Badge tone={classConfig.tone}>{classConfig.label}</Badge>
                      </div>
                      <p className="text-caption text-text-muted">
                        PID {proc.pid} · CPU {proc.cpuPercent.toFixed(1)}% · {proc.memoryMB.toFixed(0)} MB · {proc.priorityLabel}
                      </p>
                    </div>
                  </div>
                  {proc.classification !== 'protected' && (
                    <select
                      value="normal"
                      onChange={(e) => handleSetPriority(proc.pid, e.target.value as PriorityLevel, proc.name)}
                      disabled={!isPro || actingPid === proc.pid}
                      className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-2 py-1 text-caption text-text-primary disabled:opacity-50"
                      data-testid={`priority-select-${proc.pid}`}
                    >
                      {PRIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <CpuChipIcon className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-small text-text-secondary">No processes found.</p>
          </div>
        )}
      </Card>

      {/* Configuration */}
      {status && (
        <Card title="Configuration" variant="glass" data-testid="priority-config">
          <div className="space-y-4">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AdjustmentsHorizontalIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Priority Management</div>
                  <p className="text-caption text-text-secondary">Enable or disable priority adjustments</p>
                </div>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  status.enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="priority-enabled-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Auto-detect toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SparklesIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Auto-Detect Workload</div>
                  <p className="text-caption text-text-secondary">Automatically switch modes based on active apps</p>
                </div>
              </div>
              <button
                onClick={handleToggleAutoDetect}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  status.autoDetect ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="priority-auto-detect-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.autoDetect ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="priority-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view status and process list for free. Upgrade to Professional to change modes, apply adjustments, and set priorities.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Process Prioritization')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
