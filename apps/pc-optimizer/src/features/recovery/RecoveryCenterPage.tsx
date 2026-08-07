/**
 * RecoveryCenterPage — exposes the undo service backend.
 *
 * Shows:
 *   - List of available backups/restore points
 *   - Restore from a backup
 *   - Create a new restore point
 *   - Delete old backups
 *   - Check backup availability
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState, ModuleErrorState } from '../../components/ModuleStates';
import { undoService, type BackupEntry, type RestoreResult } from '../undo';
import {
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

interface RecoveryState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  backups: BackupEntry[];
  loading: boolean;
  error: string | null;
  restoreResult: RestoreResult | null;
  creatingRestorePoint: boolean;
  restoring: string | null;
}

class RecoveryViewModel extends ViewModel<RecoveryState> {
  private undoService;

  constructor() {
    super({
      bootstrap: 'idle',
      backups: [],
      loading: false,
      error: null,
      restoreResult: null,
      creatingRestorePoint: false,
      restoring: null,
    });
    this.undoService = undoService;
  }

  async loadBackups() {
    this.setState({ loading: true, error: null, bootstrap: 'loading' });
    try {
      const result = await this.undoService.listBackups();
      this.setState({ backups: result.backups, loading: false, bootstrap: 'ready' });
    } catch (e) {
      this.setState({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load backups',
        bootstrap: 'error',
      });
    }
  }

  async restore(backupId: string) {
    this.setState({ restoring: backupId, error: null });
    try {
      const result = await this.undoService.restore(backupId);
      this.setState({ restoreResult: result, restoring: null });
    } catch (e) {
      this.setState({
        restoring: null,
        error: e instanceof Error ? e.message : 'Restore failed',
      });
    }
  }

  async createRestorePoint(description: string) {
    this.setState({ creatingRestorePoint: true, error: null });
    try {
      await this.undoService.createRestorePoint(description);
      await this.loadBackups();
      this.setState({ creatingRestorePoint: false });
    } catch (e) {
      this.setState({
        creatingRestorePoint: false,
        error: e instanceof Error ? e.message : 'Failed to create restore point',
      });
    }
  }

  async deleteBackup(backupId: string) {
    try {
      await this.undoService.deleteBackup(backupId);
      await this.loadBackups();
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Failed to delete backup' });
    }
  }

  override dispose() {
    super.dispose();
  }
}

export function RecoveryCenterPage() {
  const vm = useMemo(() => new RecoveryViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.loadBackups();
    return () => vm.dispose();
  }, [vm]);

  if (state.bootstrap === 'loading' || (state.loading && state.backups.length === 0)) {
    return (
      <div className="p-6">
        <PageHeader title="Recovery Center" description="Manage backups and restore points" />
        <ModuleLoadingState message="Loading backups..." />
      </div>
    );
  }

  if (state.bootstrap === 'error' && state.backups.length === 0) {
    return (
      <div className="p-6">
        <PageHeader title="Recovery Center" description="Manage backups and restore points" />
        <ModuleErrorState message={state.error ?? 'Failed to load backups'} onRetry={() => vm.loadBackups()} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Recovery Center"
        description="Manage system backups, restore points, and undo operations"
        actions={
          <Button
            onClick={() => vm.createRestorePoint(`Manual restore point - ${new Date().toLocaleString()}`)}
            loading={state.creatingRestorePoint}
            leftIcon={<PlusIcon className="h-4 w-4" />}
          >
            Create Restore Point
          </Button>
        }
      />

      {state.error && (
        <Card variant="glass">
          <div className="flex items-center gap-2 text-small text-[var(--avs-danger)]">
            <ExclamationTriangleIcon className="h-4 w-4" />
            {state.error}
          </div>
        </Card>
      )}

      {state.restoreResult && (
        <Card title="Restore Result" variant="glass">
          <div className="flex items-center gap-2">
            {state.restoreResult.status === 'success' ? (
              <CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-danger)]" />
            )}
            <span className="text-small text-[var(--avs-text-primary)]">
              {state.restoreResult.status === 'success' ? 'Restore completed successfully' : 'Restore failed'}
            </span>
            {state.restoreResult.message && (
              <span className="text-caption text-[var(--avs-text-muted)]">{state.restoreResult.message}</span>
            )}
          </div>
        </Card>
      )}

      <Card title="Available Backups" variant="glass">
        {state.backups.length > 0 ? (
          <div className="space-y-2">
            {state.backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3"
              >
                <ShieldCheckIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
                <div className="flex-1 min-w-0">
                  <span className="text-small font-medium text-[var(--avs-text-primary)]">
                    {typeof backup.details === 'string'
                      ? backup.details
                      : (backup.details?.description as string) || backup.operation || backup.id}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <ClockIcon className="h-3 w-3 text-[var(--avs-text-muted)]" />
                    <span className="text-caption text-[var(--avs-text-muted)]">
                      {new Date(backup.timestamp).toLocaleString()}
                    </span>
                    <span className="text-caption text-[var(--avs-text-muted)]">
                      ({(backup.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  </div>
                </div>
                <Badge tone="brand">{backup.backupType}</Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => vm.restore(backup.id)}
                  loading={state.restoring === backup.id}
                  leftIcon={<ArrowPathIcon className="h-3.5 w-3.5" />}
                >
                  Restore
                </Button>
                <button
                  onClick={() => vm.deleteBackup(backup.id)}
                  className="text-[var(--avs-text-muted)] hover:text-[var(--avs-danger)]"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <ModuleEmptyState
            icon={ShieldCheckIcon}
            title="No backups available"
            message="Create a restore point to enable system recovery."
          />
        )}
      </Card>
    </div>
  );
}
