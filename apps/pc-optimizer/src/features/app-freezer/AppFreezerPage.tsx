/**
 * AppFreezerPage — AI App Freeze/Sleep.
 *
 * Freeze unused apps to free RAM. Frozen apps consume no CPU and their
 * working sets can be trimmed by the OS. Resume instantly with unfreeze.
 *
 * Free: view candidates and frozen processes
 * Pro: freeze, unfreeze, freeze all, unfreeze all, configure
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  PauseIcon,
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
  CheckCircleIcon,
  XCircleIcon,
  CpuChipIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  appFreezerService,
  type ProcessCandidate,
  type FrozenProcess,
  type AppFreezerStatus,
} from './appFreezer.service';

function formatBytes(mb: number): string {
  if (mb < 1024) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function AppFreezerPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<AppFreezerStatus | null>(null);
  const [candidates, setCandidates] = useState<ProcessCandidate[]>([]);
  const [frozen, setFrozen] = useState<FrozenProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingPid, setActingPid] = useState<number | null>(null);
  const [bulkAction, setBulkAction] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statusResult, candidatesResult, frozenResult] = await Promise.all([
        appFreezerService.getStatus(),
        appFreezerService.listCandidates(),
        appFreezerService.listFrozen(),
      ]);
      setStatus(statusResult);
      setCandidates(candidatesResult.candidates);
      setFrozen(frozenResult.frozen);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load app freezer data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleFreeze = async (pid: number, name: string) => {
    if (!isPro) {
      showUpgrade('App Freeze/Sleep');
      return;
    }
    setActingPid(pid);
    setError(null);
    setActionMessage(null);
    try {
      const result = await appFreezerService.freeze(pid);
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to freeze ${name}`);
    } finally {
      setActingPid(null);
    }
  };

  const handleUnfreeze = async (pid: number, name: string) => {
    if (!isPro) {
      showUpgrade('App Freeze/Sleep');
      return;
    }
    setActingPid(pid);
    setError(null);
    setActionMessage(null);
    try {
      const result = await appFreezerService.unfreeze(pid);
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to unfreeze ${name}`);
    } finally {
      setActingPid(null);
    }
  };

  const handleFreezeAll = async () => {
    if (!isPro) {
      showUpgrade('App Freeze/Sleep');
      return;
    }
    setBulkAction(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await appFreezerService.freezeAll();
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to freeze all');
    } finally {
      setBulkAction(false);
    }
  };

  const handleUnfreezeAll = async () => {
    if (!isPro) {
      showUpgrade('App Freeze/Sleep');
      return;
    }
    setBulkAction(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await appFreezerService.unfreezeAll();
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unfreeze all');
    } finally {
      setBulkAction(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await appFreezerService.configure({ enabled: !status.enabled });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  const handleMinMemChange = async (value: number) => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await appFreezerService.configure({ minMemoryMB: value });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
    } finally {
      setConfiguring(false);
    }
  };

  return (
    <div data-testid="page-app-freezer" className="space-y-4">
      <PageHeader
        title="AI App Freeze/Sleep"
        description="Freeze unused apps to free RAM instantly. Resume them with one click — no reload needed."
        actions={<HelpButton text="Freezing suspends a process using Windows NtSuspendProcess. The app consumes no CPU and its RAM can be reclaimed by the OS. Unfreezing resumes it instantly with all state intact." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <PauseIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Process Freezing Technology</div>
          <p className="text-caption text-text-secondary mt-1">
            Uses Windows NtSuspendProcess/NtResumeProcess via ntdll to suspend and resume processes.
            Frozen apps keep their state in memory but consume no CPU. The OS can trim their working sets
            to free RAM. Resume instantly with unfreeze — no app reload needed.
          </p>
        </div>
      </div>

      {/* Status + actions */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              status && status.frozenCount > 0 ? 'bg-brand-primary/10' : 'bg-surface-muted'
            }`}>
              <PauseIcon className={`h-6 w-6 ${
                status && status.frozenCount > 0 ? 'text-brand-primary' : 'text-text-muted'
              }`} />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Freezer Status</div>
              <p className="text-caption text-text-secondary mt-1">
                {status ? (
                  <>
                    {status.frozenCount} frozen · {formatBytes(status.totalFrozenMemoryMB)} RAM reserved
                    {status.frozenCount > 0 && ` · ${status.maxFrozen - status.frozenCount} slots remaining`}
                  </>
                ) : 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              leftIcon={bulkAction ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <PauseIcon className="h-5 w-5" />}
              onClick={handleFreezeAll}
              disabled={bulkAction || loading || (candidates.length === 0)}
              data-testid="freezer-freeze-all-btn"
            >
              {bulkAction ? 'Freezing...' : isPro ? 'Freeze All' : 'Upgrade'}
            </Button>
            <Button
              variant="secondary"
              leftIcon={bulkAction ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <PlayIcon className="h-5 w-5" />}
              onClick={handleUnfreezeAll}
              disabled={bulkAction || loading || frozen.length === 0}
              data-testid="freezer-unfreeze-all-btn"
            >
              {isPro ? 'Unfreeze All' : 'Upgrade'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="freezer-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="freezer-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Stats cards */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.frozenCount}</div>
            <div className="text-caption text-text-muted">Frozen</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{formatBytes(status.totalFrozenMemoryMB)}</div>
            <div className="text-caption text-text-muted">RAM Reserved</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{candidates.length}</div>
            <div className="text-caption text-text-muted">Candidates</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalFrozen}</div>
            <div className="text-caption text-text-muted">Total Frozen</div>
          </Card>
        </div>
      )}

      {/* Frozen processes */}
      <Card title="Frozen Processes" variant="glass" data-testid="freezer-frozen-list">
        <p className="text-caption text-text-muted mb-3">
          {frozen.length > 0 ? `${frozen.length} process(es) frozen` : 'No frozen processes'}
        </p>

        {frozen.length > 0 ? (
          <div className="space-y-2">
            {frozen.map((proc) => (
              <div
                key={proc.pid}
                className="flex items-center justify-between rounded-[var(--avs-radius-sm)] border border-brand-primary/20 bg-brand-primary/5 px-4 py-3"
                data-testid={`freezer-frozen-${proc.pid}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PauseIcon className="h-5 w-5 text-brand-primary shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-small font-medium text-text-primary truncate">{proc.name}</span>
                      <Badge tone="brand">Frozen</Badge>
                    </div>
                    <p className="text-caption text-text-muted">
                      PID {proc.pid} · {formatBytes(proc.memoryMBAtFreeze)} at freeze · {formatDate(proc.frozenAt)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={actingPid === proc.pid ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PlayIcon className="h-4 w-4" />}
                  onClick={() => handleUnfreeze(proc.pid, proc.name)}
                  disabled={actingPid === proc.pid}
                  data-testid={`freezer-unfreeze-${proc.pid}`}
                >
                  {isPro ? 'Unfreeze' : 'Upgrade'}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <PauseIcon className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-small text-text-secondary">No processes are currently frozen.</p>
          </div>
        )}
      </Card>

      {/* Candidates */}
      <Card title="Freeze Candidates" variant="glass" data-testid="freezer-candidates-list">
        <p className="text-caption text-text-muted mb-3">
          {candidates.length > 0
            ? `${candidates.length} idle process(es) using significant RAM — candidates for freezing`
            : 'No idle processes with significant RAM usage found'}
        </p>

        {candidates.length > 0 ? (
          <div className="space-y-2">
            {candidates.slice(0, 15).map((proc) => (
              <div
                key={proc.pid}
                className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3"
                data-testid={`freezer-candidate-${proc.pid}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <CpuChipIcon className="h-5 w-5 text-text-muted shrink-0" />
                  <div className="min-w-0">
                    <span className="text-small font-medium text-text-primary truncate block">{proc.name}</span>
                    <p className="text-caption text-text-muted">
                      PID {proc.pid} · {formatBytes(proc.memoryMB)} · CPU {proc.cpuPercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={actingPid === proc.pid ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PauseIcon className="h-4 w-4" />}
                  onClick={() => handleFreeze(proc.pid, proc.name)}
                  disabled={actingPid === proc.pid}
                  data-testid={`freezer-freeze-${proc.pid}`}
                >
                  {isPro ? (actingPid === proc.pid ? '...' : 'Freeze') : 'Upgrade'}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <CheckCircleIcon className="h-8 w-8 text-semantic-success mx-auto mb-2" />
            <p className="text-small text-text-secondary">No processes need freezing right now.</p>
          </div>
        )}
      </Card>

      {/* Configuration */}
      {status && (
        <Card title="Configuration" variant="glass" data-testid="freezer-config">
          <div className="space-y-4">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PauseIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">App Freezer</div>
                  <p className="text-caption text-text-secondary">Enable or disable process freezing</p>
                </div>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  status.enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="freezer-enabled-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Min memory */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CpuChipIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Minimum Memory Threshold</div>
                  <p className="text-caption text-text-secondary">Only freeze processes using more than this</p>
                </div>
              </div>
              <select
                value={status.config.minMemoryMB}
                onChange={(e) => handleMinMemChange(Number(e.target.value))}
                disabled={!isPro || configuring}
                className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-3 py-1.5 text-small text-text-primary disabled:opacity-50"
                data-testid="freezer-min-mem"
              >
                <option value={50}>50 MB</option>
                <option value={100}>100 MB</option>
                <option value={200}>200 MB</option>
                <option value={500}>500 MB</option>
              </select>
            </div>

            {/* Max frozen */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StopIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Max Frozen Processes</div>
                  <p className="text-caption text-text-secondary">Limit on simultaneously frozen apps</p>
                </div>
              </div>
              <span className="text-small text-text-muted">{status.maxFrozen}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="freezer-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view candidates and frozen processes for free. Upgrade to Professional to freeze, unfreeze, and configure.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('App Freeze/Sleep')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
