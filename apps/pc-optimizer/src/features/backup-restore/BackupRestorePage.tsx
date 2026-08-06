/**
 * BackupRestorePage — system backup and restore point management.
 *
 * Shows:
 *   - System Restore points list
 *   - Create new restore point
 *   - AVS-managed backups (from undo module)
 *   - System image status
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState, ModuleErrorState, ModuleSuccessBanner } from '../../components/ModuleStates';
import {
  ArrowPathRoundedSquareIcon,
  PlusIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  TrashIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';

interface RestorePoint {
  SequenceNumber: number;
  Description: string;
  CreationTime: string;
  EventType: number;
  RestorePointType: number;
}

interface BackupEntry {
  backupId: string;
  type: string;
  timestamp: string;
  size: number;
  description: string;
}

interface BackupState {
  loading: boolean;
  error: string | null;
  restorePoints: RestorePoint[];
  backups: BackupEntry[];
  systemImageAvailable: boolean;
  creating: boolean;
  successMsg: string | null;
  description: string;
}

class BackupViewModel extends ViewModel<BackupState> {
  constructor() {
    super({ loading: false, error: null, restorePoints: [], backups: [], systemImageAvailable: false, creating: false, successMsg: null, description: '' });
  }

  async bootstrap() {
    this.setState({ loading: true, error: null });
    try {
      if (typeof window === 'undefined' || !window.avs) {
        throw new Error('AVS RPC bridge is unavailable');
      }
      const [rpResult, backupResult, imageResult] = await Promise.all([
        window.avs.rpc.call('backup.listRestorePoints') as Promise<{ restorePoints: RestorePoint[]; total: number }>,
        window.avs.rpc.call('backup.listBackups') as Promise<{ backups: BackupEntry[] } | { entries: BackupEntry[] }>,
        window.avs.rpc.call('backup.systemImage') as Promise<{ Available?: boolean; available?: boolean }>,
      ]);
      const backups = 'backups' in backupResult ? backupResult.backups : ('entries' in backupResult ? backupResult.entries : []);
      this.setState({
        loading: false,
        restorePoints: rpResult.restorePoints,
        backups,
        systemImageAvailable: imageResult.Available ?? imageResult.available ?? false,
      });
    } catch (e) {
      this.setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load backup information' });
    }
  }

  async reload() {
    this.setState({ error: null });
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      const [rpResult, backupResult, imageResult] = await Promise.all([
        window.avs.rpc.call('backup.listRestorePoints') as Promise<{ restorePoints: RestorePoint[]; total: number }>,
        window.avs.rpc.call('backup.listBackups') as Promise<{ backups: BackupEntry[] } | { entries: BackupEntry[] }>,
        window.avs.rpc.call('backup.systemImage') as Promise<{ Available?: boolean; available?: boolean }>,
      ]);
      const backups = 'backups' in backupResult ? backupResult.backups : ('entries' in backupResult ? backupResult.entries : []);
      this.setState({
        restorePoints: rpResult.restorePoints,
        backups,
        systemImageAvailable: imageResult.Available ?? imageResult.available ?? false,
      });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Failed to reload backup information' });
    }
  }

  setDescription(desc: string) {
    this.setState({ description: desc });
  }

  async createRestorePoint() {
    this.setState({ creating: true, error: null, successMsg: null });
    try {
      if (typeof window === 'undefined' || !window.avs) {
        throw new Error('AVS RPC bridge is unavailable');
      }
      const result = await window.avs.rpc.call('backup.createRestorePoint', { description: this.state.description || 'AVS Shield Restore Point' }) as { success: boolean; error?: string };
      if (result.success) {
        this.setState({ creating: false, successMsg: 'Restore point created successfully', description: '' });
        await this.reload();
      } else {
        this.setState({ creating: false, error: result.error || 'Failed to create restore point' });
      }
    } catch (e) {
      this.setState({ creating: false, error: e instanceof Error ? e.message : 'Failed to create restore point' });
    }
  }

  async restoreFromBackup(backupId: string) {
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      await window.avs.rpc.call('backup.restore', { backupId });
      this.setState({ successMsg: 'Backup restored successfully' });
      await this.reload();
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Restore failed' });
    }
  }

  async deleteBackup(backupId: string) {
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      await window.avs.rpc.call('backup.delete', { backupId });
      this.setState({ successMsg: 'Backup deleted' });
      await this.reload();
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Delete failed' });
    }
  }

  dismissSuccess() {
    this.setState({ successMsg: null });
  }
}

export default function BackupRestorePage() {
  const vm = useMemo(() => new BackupViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  if (state.loading) {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Backup & Restore" description="Manage system restore points and AVS-managed backups" />
        <ModuleLoadingState message="Loading backup information…" />
      </div>
    );
  }

  if (state.error && state.restorePoints.length === 0 && state.backups.length === 0) {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Backup & Restore" description="Manage system restore points and AVS-managed backups" />
        <ModuleErrorState message={state.error} onRetry={() => vm.bootstrap()} />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <PageHeader
        title="Backup & Restore"
        description="Manage system restore points and AVS-managed backups"
        actions={
          <Button onClick={() => vm.bootstrap()} variant="secondary" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
            Refresh
          </Button>
        }
      />

      {state.successMsg && <ModuleSuccessBanner title={state.successMsg} onDismiss={() => vm.dismissSuccess()} />}
      {state.error && (
        <Card variant="glass">
          <div className="flex items-center gap-2 text-small text-[var(--avs-danger)]">
            <ExclamationTriangleIcon className="h-4 w-4" />
            {state.error}
          </div>
        </Card>
      )}

      {/* System Image Status */}
      <Card title="System Image" variant="glass">
        <div className="flex items-center gap-3">
          <ServerStackIcon className={`h-6 w-6 ${state.systemImageAvailable ? 'text-[var(--avs-success)]' : 'text-[var(--avs-text-muted)]'}`} />
          <div>
            <p className="text-small font-medium text-[var(--avs-text-primary)]">
              {state.systemImageAvailable ? 'System image available' : 'No system image found'}
            </p>
            <p className="text-caption text-[var(--avs-text-muted)]">
              {state.systemImageAvailable ? 'A Windows system backup image is configured.' : 'Configure Windows Backup to create a system image.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Create Restore Point */}
      <Card title="Create Restore Point" variant="glass">
        <div className="flex items-center gap-3">
          <input
            value={state.description}
            onChange={(e) => vm.setDescription(e.target.value)}
            placeholder="Restore point description (optional)"
            className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-small text-[var(--avs-text-primary)]"
          />
          <Button
            onClick={() => vm.createRestorePoint()}
            loading={state.creating}
            leftIcon={<PlusIcon className="h-4 w-4" />}
          >
            Create
          </Button>
        </div>
      </Card>

      {/* System Restore Points */}
      <Card title={`System Restore Points (${state.restorePoints.length})`} variant="glass">
        {state.restorePoints.length > 0 ? (
          <div className="space-y-2">
            {state.restorePoints.map((rp) => (
              <div key={rp.SequenceNumber} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3">
                <ClockIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
                <div className="flex-1 min-w-0">
                  <span className="text-small font-medium text-[var(--avs-text-primary)]">{rp.Description}</span>
                  <div className="text-caption text-[var(--avs-text-muted)]">
                    {rp.CreationTime} · Sequence #{rp.SequenceNumber}
                  </div>
                </div>
                <Badge tone="brand">Restore Point</Badge>
              </div>
            ))}
          </div>
        ) : (
          <ModuleEmptyState icon={ArrowPathRoundedSquareIcon} title="No restore points" message="Create a restore point above to enable system rollback." />
        )}
      </Card>

      {/* AVS-Managed Backups */}
      <Card title={`AVS-Managed Backups (${state.backups.length})`} variant="glass">
        {state.backups.length > 0 ? (
          <div className="space-y-2">
            {state.backups.map((backup) => (
              <div key={backup.backupId} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3">
                <CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
                <div className="flex-1 min-w-0">
                  <span className="text-small font-medium text-[var(--avs-text-primary)]">{backup.description || backup.type}</span>
                  <div className="text-caption text-[var(--avs-text-muted)]">
                    {backup.timestamp} · {(backup.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Badge tone="neutral">{backup.type}</Badge>
                <Button size="sm" variant="ghost" onClick={() => vm.restoreFromBackup(backup.backupId)} leftIcon={<ArrowPathRoundedSquareIcon className="h-3.5 w-3.5" />}>
                  Restore
                </Button>
                <button onClick={() => vm.deleteBackup(backup.backupId)} className="text-[var(--avs-text-muted)] hover:text-[var(--avs-danger)]">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <ModuleEmptyState icon={CheckCircleIcon} title="No AVS-managed backups" message="Backups created by AVS Shield operations (cleaner, registry, etc.) will appear here." />
        )}
      </Card>
    </div>
  );
}
