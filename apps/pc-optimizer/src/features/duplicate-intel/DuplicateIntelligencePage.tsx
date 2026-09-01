/**
 * DuplicateIntelligencePage — AI smart duplicate resolution.
 *
 * Finds duplicate files and intelligently recommends which copy to keep
 * based on location, age, name quality, and path depth.
 *
 * Free: scan, view groups, dismiss groups
 * Pro: delete files, delete all recommended, configure
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  DocumentDuplicateIcon,
  ArrowPathIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  BoltIcon,
  SparklesIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import {
  duplicateIntelService,
  type DuplicateGroup,
  type DupIntelStatus,
} from './duplicateIntel.service';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function DuplicateIntelligencePage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<DupIntelStatus | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [scanning, setScanning] = useState(false);
  const [actingPath, setActingPath] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [statusResult, listResult] = await Promise.all([
        duplicateIntelService.getStatus(),
        duplicateIntelService.listGroups({ limit: 50 }),
      ]);
      setStatus(statusResult);
      setGroups(listResult.groups);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load duplicate data');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await duplicateIntelService.scan();
      if (result.success) {
        setActionMessage(result.message);
        await loadAll();
      } else {
        setError(result.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scan');
    } finally {
      setScanning(false);
    }
  };

  const handleDeleteFile = async (path: string, name: string) => {
    if (!isPro) {
      showUpgrade('Duplicate Intelligence');
      return;
    }
    setActingPath(path);
    setError(null);
    setActionMessage(null);
    try {
      const result = await duplicateIntelService.deleteFile(path);
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to delete ${name}`);
    } finally {
      setActingPath(null);
    }
  };

  const handleDeleteRecommended = async () => {
    if (!isPro) {
      showUpgrade('Duplicate Intelligence');
      return;
    }
    setBulkAction(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await duplicateIntelService.deleteRecommended();
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete recommended');
    } finally {
      setBulkAction(false);
    }
  };

  const handleDismissGroup = async (id: string) => {
    try {
      await duplicateIntelService.dismissGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dismiss');
    }
  };

  const handleClearAll = async () => {
    try {
      await duplicateIntelService.clearAll();
      setGroups([]);
      await loadAll();
      setActionMessage('All results cleared');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear');
    }
  };

  const handleToggleEnabled = async () => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await duplicateIntelService.configure({ enabled: !status.enabled });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  const handleAlgorithmChange = async (value: 'md5' | 'sha256') => {
    if (!isPro) {
      showUpgrade('Duplicate Intelligence');
      return;
    }
    setConfiguring(true);
    try {
      const result = await duplicateIntelService.configure({ hashAlgorithm: value });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
    } finally {
      setConfiguring(false);
    }
  };

  const activeGroups = groups.filter((g) => !g.dismissed);
  const totalWasted = activeGroups.reduce((sum, g) => sum + g.wastedBytes, 0);

  return (
    <div data-testid="page-duplicate-intel" className="space-y-4">
      <PageHeader
        title="AI Duplicate Intelligence"
        description="Smart duplicate file resolution — AI recommends which copy to keep based on location, age, and name quality."
        actions={<HelpButton text="AI scans your folders for duplicate files by hashing. For each group, it scores every copy based on path priority (Documents > Desktop > Downloads > Temp), name quality (original vs copy), path depth, and file age. The highest-scored file is recommended to keep, others for deletion." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <DocumentDuplicateIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Context-Aware Duplicate Resolution</div>
          <p className="text-caption text-text-secondary mt-1">
            AI doesn&apos;t just find duplicates — it intelligently recommends which copy to keep based on
            location priority, name quality, path depth, and file age. Each recommendation includes reasoning.
          </p>
        </div>
      </div>

      {/* Status + Scan */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              activeGroups.length > 0 ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'
            }`}>
              <DocumentDuplicateIcon className={`h-6 w-6 ${
                activeGroups.length > 0 ? 'text-semantic-warning' : 'text-semantic-success'
              }`} />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Scan Status</div>
              <p className="text-caption text-text-secondary mt-1">
                {status ? (
                  `${activeGroups.length} duplicate groups · ${formatBytes(totalWasted)} reclaimable`
                ) : 'Loading...'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              leftIcon={scanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
              onClick={handleScan}
              disabled={scanning}
              data-testid="dup-intel-scan-btn"
            >
              {scanning ? 'Scanning...' : 'Scan Now'}
            </Button>
            {activeGroups.length > 0 && (
              <Button
                variant="secondary"
                leftIcon={bulkAction ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <TrashIcon className="h-5 w-5" />}
                onClick={handleDeleteRecommended}
                disabled={bulkAction || !isPro}
                data-testid="dup-intel-delete-recommended"
              >
                {isPro ? (bulkAction ? 'Deleting...' : 'Delete All Recommended') : 'Upgrade'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="dup-intel-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="dup-intel-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Stats cards */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{activeGroups.length}</div>
            <div className="text-caption text-text-muted">Duplicate Groups</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{formatBytes(totalWasted)}</div>
            <div className="text-caption text-text-muted">Reclaimable</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalFilesDeleted}</div>
            <div className="text-caption text-text-muted">Files Deleted</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{formatBytes(status.stats.totalBytesFreed)}</div>
            <div className="text-caption text-text-muted">Bytes Freed</div>
          </Card>
        </div>
      )}

      {/* Duplicate groups */}
      <Card title="Duplicate Groups" variant="glass" data-testid="dup-intel-groups">
        <div className="flex items-center justify-between mb-3">
          <p className="text-caption text-text-muted">
            {activeGroups.length > 0 ? `${activeGroups.length} group(s) — AI recommends which to keep` : 'No duplicates found'}
          </p>
          {activeGroups.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<TrashIcon className="h-4 w-4" />}
              onClick={handleClearAll}
              data-testid="dup-intel-clear-all"
            >
              Clear All
            </Button>
          )}
        </div>

        {activeGroups.length > 0 ? (
          <div className="space-y-3">
            {activeGroups.slice(0, 20).map((group) => (
              <div
                key={group.id}
                className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface-muted p-4"
                data-testid={`dup-intel-group-${group.id}`}
              >
                {/* Group header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <DocumentDuplicateIcon className="h-5 w-5 text-text-muted" />
                    <span className="text-small font-medium text-text-primary">
                      {group.fileCount} copies of {group.keepFile.name}
                    </span>
                    <Badge tone="brand">{group.fileType}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="warning">{formatBytes(group.wastedBytes)} wasted</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismissGroup(group.id)}
                      data-testid={`dup-intel-dismiss-${group.id}`}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>

                {/* Keep file */}
                <div className="rounded-[var(--avs-radius-sm)] border border-semantic-success/30 bg-semantic-success/5 p-3 mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircleIcon className="h-4 w-4 text-semantic-success" />
                    <span className="text-small font-medium text-text-primary">Keep: {group.keepFile.name}</span>
                    <Badge tone="success">Recommended</Badge>
                  </div>
                  <p className="text-caption text-text-muted font-mono truncate">{group.keepFile.path}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    {group.keepFile.reasons.map((reason, i) => (
                      <span key={i} className="text-caption text-text-secondary">{reason}</span>
                    ))}
                  </div>
                </div>

                {/* Delete files */}
                {group.deleteFiles.map((df) => (
                  <div
                    key={df.path}
                    className="rounded-[var(--avs-radius-sm)] border border-semantic-danger/20 bg-semantic-danger/5 p-3 mb-1"
                    data-testid={`dup-intel-delete-file-${df.path}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <XCircleIcon className="h-4 w-4 text-semantic-danger shrink-0" />
                          <span className="text-small text-text-primary truncate">{df.name}</span>
                        </div>
                        <p className="text-caption text-text-muted font-mono truncate">{df.path}</p>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {df.reasons.map((reason, i) => (
                            <span key={i} className="text-caption text-text-secondary">{reason}</span>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={actingPath === df.path ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                        onClick={() => handleDeleteFile(df.path, df.name)}
                        disabled={actingPath === df.path || !isPro}
                        data-testid={`dup-intel-delete-${df.path}`}
                      >
                        {isPro ? 'Delete' : 'Upgrade'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <DocumentDuplicateIcon className="h-10 w-10 text-text-muted mx-auto mb-2" />
            <p className="text-small text-text-secondary">No duplicate files found.</p>
            <p className="text-caption text-text-muted mt-1">Click &ldquo;Scan Now&rdquo; to check for duplicates.</p>
          </div>
        )}
      </Card>

      {/* Configuration */}
      {status && (
        <Card title="Configuration" variant="glass" data-testid="dup-intel-config">
          <div className="space-y-4">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DocumentDuplicateIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Duplicate Intelligence</div>
                  <p className="text-caption text-text-secondary">Enable or disable duplicate scanning</p>
                </div>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  status.enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="dup-intel-enabled-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Hash algorithm */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CpuChipIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Hash Algorithm</div>
                  <p className="text-caption text-text-secondary">MD5 (fast) or SHA-256 (thorough)</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(['md5', 'sha256'] as const).map((algo) => (
                  <Button
                    key={algo}
                    size="sm"
                    variant={status.config.hashAlgorithm === algo ? 'primary' : 'ghost'}
                    onClick={() => handleAlgorithmChange(algo)}
                    disabled={!isPro || configuring}
                    data-testid={`dup-intel-algo-${algo}`}
                  >
                    {algo.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* File size limits */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-text-primary">Min File Size</div>
                <p className="text-caption text-text-secondary">Skip files smaller than this</p>
              </div>
              <span className="text-small text-text-muted">{status.config.minFileSizeKB} KB</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-text-primary">Max File Size</div>
                <p className="text-caption text-text-secondary">Skip files larger than this</p>
              </div>
              <span className="text-small text-text-muted">{status.config.maxFileSizeMB} MB</span>
            </div>
          </div>
        </Card>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="dup-intel-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can scan and view duplicates for free. Upgrade to Professional to delete files and configure settings.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Duplicate Intelligence')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
