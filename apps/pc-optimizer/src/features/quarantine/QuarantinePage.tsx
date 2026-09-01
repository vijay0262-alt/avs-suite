/**
 * QuarantinePage — View, restore, and delete quarantined threat files.
 *
 * Free: view quarantined items only
 * Pro: view + restore + delete + clear all
 */
import { useState, useCallback, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  LockClosedIcon,
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ShieldExclamationIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline';
import {
  quarantineService,
  type QuarantineItem,
} from './quarantine.service';

const THREAT_TYPE_TONES: Record<string, 'danger' | 'warning' | 'neutral'> = {
  malware: 'danger',
  virus: 'danger',
  trojan: 'danger',
  ransomware: 'danger',
  pup: 'warning',
  adware: 'warning',
  spyware: 'warning',
  unknown: 'neutral',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function QuarantineVaultPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [confirmClear, setConfirmClear] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await quarantineService.list();
      setItems(result.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load quarantine items');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestore = async (item: QuarantineItem) => {
    if (!isPro) {
      showUpgrade('Quarantine');
      return;
    }
    setActingOn(item.id);
    try {
      const result = await quarantineService.restore(item.id);
      setActionResults((prev) => ({ ...prev, [item.id]: result }));
      if (result.success) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [item.id]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const handleDelete = async (item: QuarantineItem) => {
    if (!isPro) {
      showUpgrade('Quarantine');
      return;
    }
    setActingOn(item.id);
    try {
      const result = await quarantineService.delete(item.id);
      setActionResults((prev) => ({ ...prev, [item.id]: result }));
      if (result.success) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [item.id]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const handleClearAll = async () => {
    if (!isPro) {
      showUpgrade('Quarantine');
      return;
    }
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setActingOn('clear-all');
    setConfirmClear(false);
    try {
      const result = await quarantineService.clear();
      if (result.success) {
        setItems([]);
      }
      setActionResults((prev) => ({ ...prev, 'clear-all': { success: result.success, message: result.message } }));
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        'clear-all': { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const stats = useMemo(() => {
    const totalSize = items.reduce((sum, i) => sum + i.fileSize, 0);
    const byType: Record<string, number> = {};
    for (const item of items) {
      byType[item.threatType] = (byType[item.threatType] || 0) + 1;
    }
    return { total: items.length, totalSize, byType };
  }, [items]);

  return (
    <div data-testid="page-quarantine" className="space-y-4">
      <PageHeader
        title="Quarantine"
        description="View, restore, or permanently delete quarantined threat files in the encrypted vault."
        actions={<HelpButton text="Quarantined files are encrypted and cannot execute. Pro users can restore or permanently delete them." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <LockClosedIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Encrypted Quarantine Vault</div>
          <p className="text-caption text-text-secondary mt-1">
            Threat files are encrypted with a machine-specific key and stored safely.
            Quarantined files cannot execute or harm your system.
          </p>
        </div>
      </div>

      {/* Load + Clear All */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-3">
              <ShieldExclamationIcon className="h-6 w-6 text-semantic-warning" />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Quarantined Items</div>
              <p className="text-caption text-text-secondary mt-1">
                {items.length > 0
                  ? `${items.length} item(s) in quarantine · ${formatSize(stats.totalSize)}`
                  : 'No items in quarantine.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <Button
                variant="ghost"
                leftIcon={actingOn === 'clear-all' ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <TrashIcon className="h-5 w-5" />}
                onClick={handleClearAll}
                disabled={actingOn !== null}
                data-testid="quarantine-clear-btn"
              >
                {confirmClear ? 'Confirm Clear All?' : isPro ? 'Clear All' : 'Upgrade'}
              </Button>
            )}
            <Button
              variant="primary"
              leftIcon={loading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ArrowPathIcon className="h-5 w-5" />}
              onClick={loadItems}
              disabled={loading || actingOn !== null}
              data-testid="quarantine-load-btn"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="quarantine-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Clear all result */}
 {actionResults['clear-all'] && (
        <div className={`rounded-[var(--avs-radius-md)] p-4 flex items-center gap-3 ${
          actionResults['clear-all'].success
            ? 'border border-semantic-success/30 bg-semantic-success/5'
            : 'border border-semantic-danger/30 bg-semantic-danger/5'
        }`} data-testid="quarantine-clear-result">
          {actionResults['clear-all'].success
            ? <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
            : <XCircleIcon className="h-5 w-5 text-semantic-danger" />}
          <span className="text-small text-text-primary">{actionResults['clear-all'].message}</span>
        </div>
      )}

      {/* Stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card variant="glass" className="p-3 text-center" data-testid="quarantine-stat-count">
            <div className="text-xl font-bold text-text-primary tabular-nums">{stats.total}</div>
            <div className="text-caption text-text-muted">Quarantined</div>
          </Card>
          <Card variant="glass" className="p-3 text-center" data-testid="quarantine-stat-size">
            <div className="text-xl font-bold text-text-primary tabular-nums">{formatSize(stats.totalSize)}</div>
            <div className="text-caption text-text-muted">Total Size</div>
          </Card>
          <Card variant="glass" className="p-3 text-center" data-testid="quarantine-stat-types">
            <div className="text-xl font-bold text-text-primary tabular-nums">{Object.keys(stats.byType).length}</div>
            <div className="text-caption text-text-muted">Threat Types</div>
          </Card>
        </div>
      )}

      {/* Quarantine list */}
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item, i) => {
            const isActing = actingOn === item.id;
            const result = actionResults[item.id];
            const tone = THREAT_TYPE_TONES[item.threatType] || 'neutral';

            return (
              <Card key={item.id} variant="glass" className="p-4" data-testid={`quarantine-item-${i}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="shrink-0 rounded-[var(--avs-radius-sm)] bg-semantic-danger/10 p-2">
                      <DocumentIcon className="h-4 w-4 text-semantic-danger" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-small font-medium text-text-primary truncate">{item.threatName}</span>
                        <Badge tone={tone}>{item.threatType}</Badge>
                        <Badge tone="neutral">{item.source}</Badge>
                      </div>
                      <div className="text-caption text-text-muted mt-0.5 truncate font-mono">
                        {item.originalPath}
                      </div>
                      <div className="text-caption text-text-muted mt-0.5">
                        {formatSize(item.fileSize)} · Quarantined {formatDate(item.quarantinedAt)}
                      </div>
                      <div className="text-caption text-text-muted mt-0.5 truncate">
                        SHA256: {item.fileHash.substring(0, 32)}...
                      </div>
                      {result && (
                        <div className={`mt-2 flex items-center gap-1.5 ${result.success ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                          {result.success ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <XCircleIcon className="h-3.5 w-3.5" />}
                          <span className="text-caption">{result.message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowUturnLeftIcon className="h-4 w-4" />}
                      onClick={() => handleRestore(item)}
                      disabled={isActing}
                      data-testid={`quarantine-restore-${i}`}
                    >
                      {isPro ? 'Restore' : 'Upgrade'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                      onClick={() => handleDelete(item)}
                      disabled={isActing}
                      data-testid={`quarantine-delete-${i}`}
                    >
                      {isPro ? 'Delete' : 'Upgrade'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        !loading && !error && (
          <Card variant="glass" className="p-8 text-center" data-testid="quarantine-empty">
            <CheckCircleIcon className="h-12 w-12 text-semantic-success mx-auto mb-3" />
            <div className="text-section-title text-text-primary">Quarantine is Empty</div>
            <p className="text-small text-text-secondary mt-1">
              No threats have been quarantined. Your system appears clean.
            </p>
          </Card>
        )
      )}

      {/* Free edition notice */}
      {!isPro && items.length > 0 && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="quarantine-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view quarantined items for free. Upgrade to Professional to restore or permanently delete items.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Quarantine')} leftIcon={<LockClosedIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
