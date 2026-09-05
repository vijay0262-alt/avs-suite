/**
 * AutoCarePage — AI Auto-Care idle maintenance.
 *
 * When the PC is idle, AI Auto-Care automatically:
 *  - Cleans junk files (temp, cache, logs)
 *  - Optimizes RAM (trims working sets)
 *  - Clears temporary folders
 *
 * Free: view status and activity log
 * Pro: configure, enable/disable, run now, clear log
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge, GaugeCard, StatTile } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  SparklesIcon,
  ArrowPathIcon,
  PlayIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  CpuChipIcon,
  ClockIcon,
  BoltIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';
import {
  autoCareService,
  type AutoCareStatus,
  type AutoCareLogEntry,
} from './autoCare.service';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const TASK_LABELS: Record<string, string> = {
  junkClean: 'Junk Cleanup',
  memoryOptimize: 'RAM Optimization',
  tempClean: 'Temp Files Clean',
};

const TASK_ICONS: Record<string, typeof BoltIcon> = {
  junkClean: TrashIcon,
  memoryOptimize: CpuChipIcon,
  tempClean: BoltIcon,
};

export default function AutoCarePage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<AutoCareStatus | null>(null);
  const [logEntries, setLogEntries] = useState<AutoCareLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await autoCareService.getStatus();
      setStatus(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load auto-care status');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLog = useCallback(async () => {
    try {
      const result = await autoCareService.getActivityLog(50);
      setLogEntries(result.entries);
    } catch {
      // Silent fail for log loading
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadLog();
  }, [loadStatus, loadLog]);

  const handleToggle = async () => {
    if (!isPro) {
      showUpgrade('AI Auto-Care');
      return;
    }
    if (!status) return;
    setConfiguring(true);
    setError(null);
    try {
      const result = await autoCareService.configure({ enabled: !status.config.enabled });
      setStatus((prev) => prev ? { ...prev, config: result.config, running: result.running } : prev);
      setActionMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle auto-care');
    } finally {
      setConfiguring(false);
    }
  };

  const handleTaskToggle = async (task: string) => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const newTasks = { ...status.config.tasks, [task]: !status.config.tasks[task as keyof typeof status.config.tasks] };
      const result = await autoCareService.configure({ tasks: newTasks });
      setStatus((prev) => prev ? { ...prev, config: result.config } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update tasks');
    } finally {
      setConfiguring(false);
    }
  };

  const handleThresholdChange = async (value: number) => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await autoCareService.configure({ idleThresholdSeconds: value });
      setStatus((prev) => prev ? { ...prev, config: result.config } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update threshold');
    } finally {
      setConfiguring(false);
    }
  };

  const handleRunNow = async () => {
    if (!isPro) {
      showUpgrade('AI Auto-Care');
      return;
    }
    setRunning(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await autoCareService.runNow();
      setActionMessage(
        `Ran ${result.tasks.length} tasks: freed ${formatBytes(result.totalBytesFreed)}, cleaned ${result.totalItemsCleaned} items`,
      );
      await loadLog();
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to run auto-care');
    } finally {
      setRunning(false);
    }
  };

  const handleClearLog = async () => {
    if (!isPro) {
      showUpgrade('AI Auto-Care');
      return;
    }
    try {
      await autoCareService.clearLog();
      setLogEntries([]);
      setActionMessage('Activity log cleared');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear log');
    }
  };

  const config = status?.config;
  const isEnabled = config?.enabled ?? false;
  const isRunning = status?.running ?? false;

  return (
    <div data-testid="page-auto-care" className="space-y-4">
      <PageHeader
        title="AI Auto-Care"
        description="When your PC is idle, AI automatically cleans junk, clears temp files, and optimizes RAM."
        actions={<HelpButton text="Auto-Care runs in the background when your PC is idle. Configure which tasks to run and the idle threshold." />}
      />

      {/* Hero status section — System Mechanic style */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="autocare-hero-section">
        {/* Gauge */}
        <GaugeCard
          title={isRunning ? 'Active' : isEnabled ? 'Standby' : 'Disabled'}
          value={isRunning ? 100 : isEnabled ? 50 : 0}
          unit=""
          tone={isRunning ? 'success' : isEnabled ? 'warning' : 'danger'}
          icon={<SparklesIcon className="h-6 w-6" />}
          description={
            isRunning
              ? `Idle: ${formatDuration(status?.currentIdleSeconds ?? 0)}`
              : isEnabled
                ? 'Waiting for idle threshold'
                : 'Auto-Care is off'
          }
          data-testid="autocare-hero-gauge"
        />

        {/* Key stats */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile
            label="Status"
            value={isRunning ? 'Running' : isEnabled ? 'Standby' : 'Off'}
            hint={isRunning ? 'Active now' : isEnabled ? 'Enabled' : 'Disabled'}
            icon={<SparklesIcon className="h-5 w-5" />}
            variant="glass"
            accentColor={isRunning ? 'var(--avs-success)' : isEnabled ? 'var(--avs-warning)' : 'var(--avs-danger)'}
          />
          <StatTile
            label="Idle Time"
            value={formatDuration(status?.currentIdleSeconds ?? 0)}
            hint={`Threshold: ${formatDuration(config?.idleThresholdSeconds ?? 0)}`}
            icon={<ClockIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Last Run"
            value={status?.lastRunAt ? formatDate(status.lastRunAt).split(' ')[0] : '—'}
            hint={status?.lastRunAt ? formatDate(status.lastRunAt).split(' ').slice(1).join(' ') : 'Never'}
            icon={<ArrowPathIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Log Entries"
            value={logEntries.length.toString()}
            hint="Activity records"
            icon={<CircleStackIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Tasks"
            value={config ? Object.values(config.tasks).filter(Boolean).length.toString() : '0'}
            hint="Enabled tasks"
            icon={<BoltIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Edition"
            value={isPro ? 'Pro' : 'Free'}
            hint={isPro ? 'Full control' : 'View only'}
            icon={<CpuChipIcon className="h-5 w-5" />}
            variant="glass"
            accentColor={isPro ? 'var(--avs-success)' : 'var(--avs-warning)'}
          />
        </div>
      </div>

      {/* Action buttons */}
      <Card variant="glass" className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <SparklesIcon className={`h-5 w-5 ${isRunning ? 'text-semantic-success' : 'text-text-muted'}`} />
            <div>
              <div className="text-small font-medium text-text-primary">Auto-Care Controls</div>
              <p className="text-caption text-text-secondary">
                {isRunning ? 'Currently active' : isEnabled ? 'Enabled, waiting for idle' : 'Disabled'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              leftIcon={running ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <PlayIcon className="h-5 w-5" />}
              onClick={handleRunNow}
              disabled={running || configuring}
              data-testid="autocare-run-btn"
            >
              {running ? 'Running...' : isPro ? 'Run Now' : 'Upgrade'}
            </Button>
            <Button
              variant={isEnabled ? 'danger' : 'secondary'}
              leftIcon={configuring ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
              onClick={handleToggle}
              disabled={configuring || loading}
              data-testid="autocare-toggle-btn"
            >
              {configuring ? '...' : isPro ? (isEnabled ? 'Disable' : 'Enable') : 'Upgrade'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="autocare-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="autocare-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Configuration */}
      {config && (
        <Card title="Configuration" variant="glass" data-testid="autocare-config">
          <div className="space-y-4">
            {/* Idle threshold */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClockIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Idle Threshold</div>
                  <p className="text-caption text-text-secondary">Wait time before auto-care triggers</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={config.idleThresholdSeconds}
                  onChange={(e) => handleThresholdChange(Number(e.target.value))}
                  disabled={!isPro || configuring}
                  className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-3 py-1.5 text-small text-text-primary disabled:opacity-50"
                  data-testid="autocare-threshold"
                >
                  <option value={120}>2 minutes</option>
                  <option value={300}>5 minutes</option>
                  <option value={600}>10 minutes</option>
                  <option value={900}>15 minutes</option>
                  <option value={1800}>30 minutes</option>
                </select>
              </div>
            </div>

            {/* Tasks */}
            <div>
              <div className="text-small font-medium text-text-primary mb-2">Tasks to Run</div>
              <div className="space-y-2">
                {(Object.keys(TASK_LABELS) as string[]).map((taskKey) => {
                  const Icon = TASK_ICONS[taskKey] || BoltIcon;
                  const enabled = config.tasks[taskKey as keyof typeof config.tasks];
                  return (
                    <div key={taskKey} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-text-muted" />
                        <span className="text-small text-text-primary">{TASK_LABELS[taskKey]}</span>
                      </div>
                      <button
                        onClick={() => handleTaskToggle(taskKey)}
                        disabled={!isPro || configuring}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                          enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                        }`}
                        data-testid={`autocare-task-${taskKey}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          enabled ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Activity log */}
      <Card title="Activity Log" variant="glass" data-testid="autocare-log">
        <div className="flex items-center justify-between mb-3">
          <p className="text-caption text-text-muted">
            {logEntries.length > 0 ? `${logEntries.length} entries` : 'No activity yet'}
          </p>
          {logEntries.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<TrashIcon className="h-4 w-4" />}
              onClick={handleClearLog}
              disabled={!isPro}
              data-testid="autocare-clear-log"
            >
              {isPro ? 'Clear Log' : 'Upgrade'}
            </Button>
          )}
        </div>

        {logEntries.length > 0 ? (
          <div className="space-y-2">
            {logEntries.slice().reverse().map((entry, i) => (
              <div key={entry.id} className="rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3" data-testid={`autocare-log-${i}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {entry.success ? (
                      <CheckCircleIcon className="h-4 w-4 text-semantic-success" />
                    ) : (
                      <XCircleIcon className="h-4 w-4 text-semantic-danger" />
                    )}
                    <span className="text-small font-medium text-text-primary">{formatDate(entry.timestamp)}</span>
                    <Badge tone={entry.trigger === 'idle' ? 'success' : 'neutral'}>
                      {entry.trigger === 'idle' ? 'Auto' : 'Manual'}
                    </Badge>
                  </div>
                  <div className="text-caption text-text-muted">
                    {formatBytes(entry.totalBytesFreed)} freed · {entry.totalItemsCleaned} items
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  {entry.tasks.map((task, ti) => (
                    <span
                      key={ti}
                      className={`text-caption px-2 py-0.5 rounded ${
                        task.success ? 'bg-semantic-success/10 text-semantic-success' : 'bg-semantic-danger/10 text-semantic-danger'
                      }`}
                    >
                      {TASK_LABELS[task.task] || task.task}
                    </span>
                  ))}
                  {entry.idleSeconds > 0 && (
                    <span className="text-caption text-text-muted">
                      Idle: {formatDuration(entry.idleSeconds)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <SparklesIcon className="h-10 w-10 text-text-muted mx-auto mb-2" />
            <p className="text-small text-text-secondary">No auto-care activity yet.</p>
          </div>
        )}
      </Card>

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="autocare-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view auto-care status and activity log for free. Upgrade to Professional to enable, configure, and run auto-care.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('AI Auto-Care')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
