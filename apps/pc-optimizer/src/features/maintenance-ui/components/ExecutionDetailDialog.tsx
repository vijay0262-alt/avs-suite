/**
 * ExecutionDetailDialog — modal panel showing full execution details.
 *
 * Shows:
 *   Execution Summary, Timeline, Task Results, Recovered Space Breakdown,
 *   Warnings, Errors, Application Version, Execution Metadata
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card, Button } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { XMarkIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { StatusBadge, SourceBadge } from './StatusBadge';
import type { ExecutionRecord } from '../../maintenance-history';
import { undoService, type BackupEntry } from '../../undo';

export interface ExecutionDetailDialogProps {
  record: ExecutionRecord | null;
  onClose: () => void;
  onRestored?: () => void;
}

export const ExecutionDetailDialog = React.memo(function ExecutionDetailDialog({
  record,
  onClose,
  onRestored,
}: ExecutionDetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    setRestoreError(null);
    try {
      const result = await undoService.listBackups();
      const filtered = record
        ? result.backups.filter((b) => b.operation === record.source || b.module === record.source)
        : result.backups;
      setBackups(filtered);
    } catch {
      setBackups([]);
    } finally {
      setBackupsLoading(false);
    }
  }, [record]);

  useEffect(() => {
    if (!record) return;
    void loadBackups();
  }, [record, loadBackups]);

  const handleRestore = useCallback(async (backupId: string) => {
    setRestoringId(backupId);
    setRestoreError(null);
    setRestoreStatus(null);
    try {
      const result = await undoService.restore(backupId);
      setRestoreStatus(result.message || 'Restore completed successfully');
      onRestored?.();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  }, [onRestored]);

  useEffect(() => {
    if (!record) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [record, onClose]);

  if (!record) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      data-testid="detail-dialog-overlay"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface)] p-6 shadow-lg outline-none"
        onClick={(e) => e.stopPropagation()}
        data-testid="detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-dialog-title"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 id="detail-dialog-title" className="text-section-title font-semibold text-[var(--avs-text-primary)]">
              Execution Details
            </h2>
            <p className="mt-0.5 text-caption text-[var(--avs-text-muted)] font-mono">{record.id}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close dialog" data-testid="detail-dialog-close">
            <XMarkIcon className="h-5 w-5" />
          </Button>
        </div>

        {/* Summary */}
        <div className="mb-4 grid grid-cols-2 gap-3" data-testid="detail-summary">
          <DetailItem label="Status"><StatusBadge status={record.status} /></DetailItem>
          <DetailItem label="Source"><SourceBadge source={record.source} /></DetailItem>
          <DetailItem label="Start Time">{new Date(record.startTime).toLocaleString()}</DetailItem>
          <DetailItem label="End Time">{new Date(record.endTime).toLocaleString()}</DetailItem>
          <DetailItem label="Duration">{formatDuration(record.durationMs)}</DetailItem>
          <DetailItem label="App Version">{record.appVersion}</DetailItem>
          {record.scheduleId && <DetailItem label="Schedule ID">{record.scheduleId}</DetailItem>}
          <DetailItem label="Job ID">{record.jobId}</DetailItem>
        </div>

        {/* Recovered Space Breakdown */}
        <Card title="Recovered Space Breakdown" className="mb-4" data-testid="detail-space-breakdown">
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="Total Space">{formatBytes(record.totalSpaceRecovered)}</DetailItem>
            <DetailItem label="Files Removed">{record.filesRemoved}</DetailItem>
            <DetailItem label="Folders Removed">{record.foldersRemoved}</DetailItem>
            <DetailItem label="Registry Entries">{record.registryEntriesRemoved}</DetailItem>
            <DetailItem label="Recycle Bin Items">{record.recycleBinItemsRemoved}</DetailItem>
            <DetailItem label="Temp Files">{record.temporaryFilesRemoved}</DetailItem>
            <DetailItem label="Browser Data">{record.browserDataRemoved}</DetailItem>
          </div>
        </Card>

        {/* Task Results */}
        <Card title="Task Results" className="mb-4" data-testid="detail-task-results">
          <div className="space-y-3">
            {record.taskResults.map((task) => (
              <div
                key={task.taskId}
                className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-3"
                data-testid={`detail-task-${task.taskId}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-[var(--avs-text-primary)]">{task.taskName}</span>
                  <StatusBadge status={task.status === 'completed' ? 'succeeded' : task.status === 'failed' ? 'failed' : 'cancelled'} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-caption text-[var(--avs-text-secondary)]">
                  <span>Files: {task.filesCleaned}</span>
                  <span>Space: {formatBytes(task.bytesRecovered)}</span>
                  <span>Duration: {formatDuration(task.durationMs)}</span>
                </div>
                {task.errors.length > 0 && (
                  <div className="mt-2 text-caption text-[var(--avs-danger)]" data-testid={`detail-task-errors-${task.taskId}`}>
                    {task.errors.map((e, i) => <div key={i}>• {e}</div>)}
                  </div>
                )}
                {task.warnings.length > 0 && (
                  <div className="mt-2 text-caption text-[var(--avs-warning)]" data-testid={`detail-task-warnings-${task.taskId}`}>
                    {task.warnings.map((w, i) => <div key={i}>• {w}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Warnings */}
        {record.warnings.length > 0 && (
          <Card title="Warnings" className="mb-4" data-testid="detail-warnings">
            <div className="space-y-1 text-small text-[var(--avs-warning)]">
              {record.warnings.map((w, i) => <div key={i}>• {w}</div>)}
            </div>
          </Card>
        )}

        {/* Errors */}
        {record.errors.length > 0 && (
          <Card title="Errors" className="mb-4" data-testid="detail-errors">
            <div className="space-y-1 text-small text-[var(--avs-danger)]">
              {record.errors.map((e, i) => <div key={i}>• {e}</div>)}
            </div>
          </Card>
        )}

        {/* Restore / Rollback */}
        <Card title="Restore & Rollback" className="mb-4" data-testid="detail-restore">
          {backupsLoading ? (
            <p className="text-small text-[var(--avs-text-muted)]">Loading available backups…</p>
          ) : backups.length === 0 ? (
            <p className="text-small text-[var(--avs-text-muted)]">No backups available for this execution. Backups are created automatically before cleaning operations.</p>
          ) : (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div key={backup.id} className="flex items-center justify-between rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-small font-medium text-[var(--avs-text-primary)] truncate">
                      {backup.backupType === 'restore_point' ? 'System Restore Point' : backup.originalPath}
                    </div>
                    <div className="text-caption text-[var(--avs-text-muted)]">
                      {new Date(backup.timestamp).toLocaleString()} · {formatBytes(backup.size)}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleRestore(backup.id)}
                    loading={restoringId === backup.id}
                    leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
                    data-testid={`restore-button-${backup.id}`}
                  >
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
          {restoreStatus && (
            <div className="mt-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-success-bg,rgba(34,197,94,0.1))] border border-[var(--avs-success-border,rgba(34,197,94,0.3))] px-3 py-2">
              <p className="text-small text-semantic-success" data-testid="restore-success">{restoreStatus}</p>
            </div>
          )}
          {restoreError && (
            <div className="mt-3 rounded-[var(--avs-radius-md)] bg-semantic-danger/10 border border-semantic-danger/30 px-3 py-2">
              <p className="text-small text-semantic-danger" data-testid="restore-error">{restoreError}</p>
            </div>
          )}
        </Card>

        {/* Metadata */}
        <div className="text-caption text-[var(--avs-text-muted)]" data-testid="detail-metadata">
          Logged at: {new Date(record.loggedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
});

function DetailItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-caption font-medium uppercase tracking-wide text-[var(--avs-text-muted)]">{label}</div>
      <div className="mt-0.5 text-small text-[var(--avs-text-primary)]">{children}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
