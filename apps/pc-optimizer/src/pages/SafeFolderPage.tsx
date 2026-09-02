/**
 * SafeFolderPage — ransomware protection for sensitive directories.
 *
 * Users can add folders to protect, start/stop monitoring, view alerts,
 * and configure sensitivity and process-killing behavior.
 */
import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import { useEdition } from '../config/EditionManager';
import { useUpgradeDialog } from '../components/UpgradeDialog';
import {
  ShieldExclamationIcon,
  FolderPlusIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
  BellAlertIcon,
  AdjustmentsHorizontalIcon,
  CameraIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline';

interface ProtectedFolder {
  path: string;
  name: string;
  added_at: string;
}

interface Alert {
  type: string;
  message: string;
  folder: string;
  timestamp: string;
  details: Record<string, unknown>;
}

interface SafeFolderStatus {
  supported: boolean;
  monitoring: boolean;
  folder_count: number;
  alert_count: number;
  settings: {
    kill_process: boolean;
    sensitivity: string;
  };
  folders: ProtectedFolder[];
}

export default function SafeFolderPage() {
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<SafeFolderStatus | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newFolderPath, setNewFolderPath] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Array<{ snapshot_id: string; folder_path: string; created_at: string; file_count: number }>>([]);
  const [snapshotLoading, setSnapshotLoading] = useState<string | null>(null);

  const isPro = edition === 'professional';

  const refreshStatus = useCallback(async () => {
    try {
      const s = await rpc.raw<SafeFolderStatus>(RPC_METHODS.SAFE_FOLDER_STATUS);
      setStatus(s);
    } catch {
      setError('Failed to get status');
    }
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      const res = await rpc.raw<{ alerts: Alert[] }>(RPC_METHODS.SAFE_FOLDER_ALERTS);
      setAlerts(res.alerts || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshAlerts();
    const interval = setInterval(() => {
      refreshStatus();
      refreshAlerts();
    }, 5000);
    return () => clearInterval(interval);
  }, [refreshStatus, refreshAlerts]);

  const handleAdd = async () => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    if (!newFolderPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await rpc.raw<{ error?: string; success?: boolean }>(RPC_METHODS.SAFE_FOLDER_ADD, {
        path: newFolderPath,
        name: newFolderName || undefined,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setNewFolderPath('');
        setNewFolderName('');
        refreshStatus();
      }
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  const handleRemove = async (path: string) => {
    if (!isPro) return;
    try {
      await rpc.raw(RPC_METHODS.SAFE_FOLDER_REMOVE, { path });
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStart = async () => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    try {
      await rpc.raw(RPC_METHODS.SAFE_FOLDER_START);
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleStop = async () => {
    try {
      await rpc.raw(RPC_METHODS.SAFE_FOLDER_STOP);
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleConfigure = async (settings: { kill_process?: boolean; sensitivity?: string }) => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    try {
      await rpc.raw(RPC_METHODS.SAFE_FOLDER_CONFIGURE, settings);
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleClearAlerts = async () => {
    try {
      await rpc.raw(RPC_METHODS.SAFE_FOLDER_CLEAR_ALERTS);
      setAlerts([]);
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
  };

  const refreshSnapshots = useCallback(async () => {
    try {
      const res = await rpc.raw<{ snapshots: typeof snapshots }>(RPC_METHODS.SAFE_FOLDER_SNAPSHOTS);
      setSnapshots(res.snapshots || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshSnapshots();
  }, [refreshSnapshots]);

  const handleCreateSnapshot = async (folderPath: string) => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    setSnapshotLoading(folderPath);
    setError(null);
    try {
      await rpc.raw(RPC_METHODS.SAFE_FOLDER_SNAPSHOT, { path: folderPath });
      refreshSnapshots();
    } catch (e) {
      setError(String(e));
    }
    setSnapshotLoading(null);
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    setSnapshotLoading(snapshotId);
    setError(null);
    try {
      await rpc.raw(RPC_METHODS.SAFE_FOLDER_RESTORE, { snapshot_id: snapshotId });
      refreshSnapshots();
      refreshStatus();
    } catch (e) {
      setError(String(e));
    }
    setSnapshotLoading(null);
  };

  const alertTone = (type: string): 'danger' | 'warning' | 'neutral' => {
    if (type === 'rapid_modification' || type === 'extension_change') return 'danger';
    if (type === 'mass_deletion') return 'warning';
    return 'neutral';
  };

  return (
    <div data-testid="page-safe-folder">
      <PageHeader
        title="Safe Folder"
        description="Protect sensitive folders against ransomware and unauthorized file modifications."
        actions={<HelpButton text="Safe Folder monitors your selected directories for ransomware-like behavior: rapid file modifications, suspicious extension changes, and mass deletions. When detected, you'll be alerted and can optionally terminate the offending process." />}
      />

      <div className="space-y-4">
        {/* Status card */}
        <Card title="Protection Status" variant="glass">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldExclamationIcon className={`h-10 w-10 ${status?.monitoring ? 'text-semantic-success' : 'text-text-muted'}`} />
              <div>
                <div className="text-small font-medium text-text-primary">
                  {status?.monitoring ? 'Protected' : 'Not Monitoring'}
                </div>
                <div className="text-caption text-text-secondary">
                  {status?.folder_count ?? 0} folders protected, {status?.alert_count ?? 0} alerts
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {!status?.monitoring ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStart}
                  disabled={!isPro || (status?.folder_count ?? 0) === 0}
                  leftIcon={<PlayIcon className="h-4 w-4" />}
                  data-testid="safe-folder-start"
                >
                  Start Protection
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleStop}
                  leftIcon={<StopIcon className="h-4 w-4" />}
                  data-testid="safe-folder-stop"
                >
                  Stop
                </Button>
              )}
            </div>
          </div>
          {!isPro && (
            <p className="text-caption text-brand-primary mt-2">Professional edition required for folder protection.</p>
          )}
        </Card>

        {error && (
          <Card variant="glass">
            <p className="text-small text-semantic-danger">{error}</p>
          </Card>
        )}

        {/* Add folder */}
        <Card title="Add Protected Folder" variant="glass">
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="C:\Users\You\Documents"
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none"
                data-testid="safe-folder-path-input"
              />
              <input
                type="text"
                placeholder="Label (optional)"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-40 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none"
              />
              <Button
                onClick={handleAdd}
                disabled={loading || !newFolderPath}
                leftIcon={<FolderPlusIcon className="h-4 w-4" />}
                data-testid="safe-folder-add"
              >
                Add
              </Button>
            </div>
          </div>
        </Card>

        {/* Protected folders list */}
        {status && status.folders.length > 0 && (
          <Card title={`Protected Folders (${status.folders.length})`} variant="glass">
            <div className="space-y-2">
              {status.folders.map((f) => (
                <div key={f.path} className="flex items-center justify-between py-2 px-3 rounded hover:bg-[var(--avs-surface-hover)]">
                  <div className="flex items-center gap-2">
                    <ShieldExclamationIcon className="h-5 w-5 text-semantic-success" />
                    <div>
                      <div className="text-small font-medium text-text-primary">{f.name}</div>
                      <div className="text-caption text-text-muted">{f.path}</div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(f.path)}
                    leftIcon={<TrashIcon className="h-4 w-4" />}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Settings */}
        <Card title="Settings" variant="glass">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AdjustmentsHorizontalIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Sensitivity</div>
                  <div className="text-caption text-text-secondary">Detection threshold for alerts</div>
                </div>
              </div>
              <div className="flex gap-1">
                {['low', 'medium', 'high'].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleConfigure({ sensitivity: s })}
                    className={`px-3 py-1 rounded-[var(--avs-radius-sm)] text-caption font-medium capitalize transition-colors ${
                      status?.settings.sensitivity === s
                        ? 'bg-[var(--avs-brand-primary)] text-white'
                        : 'bg-[var(--avs-surface)] text-text-secondary hover:bg-[var(--avs-surface-hover)]'
                    }`}
                    data-testid={`safe-folder-sensitivity-${s}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-4">
              <div>
                <div className="text-small font-medium text-text-primary">Kill suspicious processes</div>
                <div className="text-caption text-text-secondary">Automatically terminate processes caught modifying protected files</div>
              </div>
              <button
                onClick={() => handleConfigure({ kill_process: !status?.settings.kill_process })}
                disabled={!isPro}
                className={`relative h-6 w-11 rounded-full transition-colors ${status?.settings.kill_process ? 'bg-semantic-danger' : 'bg-[var(--avs-border)]'}`}
                data-testid="safe-folder-kill-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${status?.settings.kill_process ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </Card>

        {/* Alerts */}
        <Card title={`Security Alerts (${alerts.length})`} variant="glass">
          {alerts.length === 0 ? (
            <p className="text-small text-text-secondary">No alerts. Your folders are safe.</p>
          ) : (
            <>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {alerts.slice().reverse().map((a, i) => (
                  <div key={i} className="flex items-start gap-2 py-2 px-3 rounded border border-[var(--avs-border)]">
                    <BellAlertIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge tone={alertTone(a.type)}>{a.type.replace(/_/g, ' ')}</Badge>
                        <span className="text-caption text-text-muted">
                          {new Date(a.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-small text-text-primary mt-1">{a.message}</div>
                      <div className="text-caption text-text-muted truncate">{a.folder}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleClearAlerts}>
                  Clear All
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Snapshots */}
        {status && status.folders.length > 0 && (
          <Card title={`Folder Snapshots (${snapshots.length})`} variant="glass">
            <p className="text-caption text-text-secondary mb-3">
              Create backup snapshots of protected folders. If ransomware strikes, restore from a snapshot to recover your files.
            </p>
            {/* Create snapshot buttons for each protected folder */}
            <div className="space-y-2 mb-4">
              {status.folders.map((f) => (
                <div key={f.path} className="flex items-center justify-between py-1">
                  <div className="text-small text-text-primary truncate flex-1 min-w-0">{f.name}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCreateSnapshot(f.path)}
                    disabled={snapshotLoading === f.path || !isPro}
                    leftIcon={<CameraIcon className="h-4 w-4" />}
                  >
                    {snapshotLoading === f.path ? 'Creating...' : 'Snapshot'}
                  </Button>
                </div>
              ))}
            </div>

            {/* Existing snapshots */}
            {snapshots.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto border-t border-[var(--avs-border)] pt-3">
                {snapshots.map((s) => (
                  <div key={s.snapshot_id} className="flex items-center gap-2 py-2 px-3 rounded border border-[var(--avs-border)]">
                    <CameraIcon className="h-4 w-4 text-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-small text-text-primary truncate">{s.folder_path}</div>
                      <div className="text-caption text-text-muted">
                        {new Date(s.created_at).toLocaleString()} — {s.file_count} files
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleRestoreSnapshot(s.snapshot_id)}
                      disabled={snapshotLoading === s.snapshot_id || !isPro}
                      leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
                    >
                      {snapshotLoading === s.snapshot_id ? 'Restoring...' : 'Restore'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {!isPro && (
              <p className="text-caption text-brand-primary mt-2">Professional edition required for snapshots.</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
