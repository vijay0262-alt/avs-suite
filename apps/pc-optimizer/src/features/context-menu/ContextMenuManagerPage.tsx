/**
 * ContextMenuManagerPage — Manage right-click context menu entries.
 *
 * Free: view context menu entries only
 * Pro: view + disable + enable + remove entries
 */
import { useState, useCallback, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  ClipboardDocumentListIcon,
  ArrowPathIcon,
  EyeSlashIcon,
  EyeIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import {
  contextMenuService,
  type ContextMenuEntry,
} from './contextMenu.service';

export default function ContextMenuManagerPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [entries, setEntries] = useState<ContextMenuEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [filterContext, setFilterContext] = useState<string>('all');
  const [filterState, setFilterState] = useState<string>('all');
  const [actionResults, setActionResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await contextMenuService.list();
      setEntries(result.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load context menu entries');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDisable = async (entry: ContextMenuEntry) => {
    if (!isPro) {
      showUpgrade('Context Menu Manager');
      return;
    }
    setActingOn(entry.id);
    try {
      const result = await contextMenuService.disable(entry.hive, entry.regPath);
      setActionResults((prev) => ({ ...prev, [entry.id]: result }));
      if (result.success) {
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, enabled: false } : e)),
        );
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [entry.id]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const handleEnable = async (entry: ContextMenuEntry) => {
    if (!isPro) {
      showUpgrade('Context Menu Manager');
      return;
    }
    setActingOn(entry.id);
    try {
      const result = await contextMenuService.enable(entry.hive, entry.regPath);
      setActionResults((prev) => ({ ...prev, [entry.id]: result }));
      if (result.success) {
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, enabled: true } : e)),
        );
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [entry.id]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const handleRemove = async (entry: ContextMenuEntry) => {
    if (!isPro) {
      showUpgrade('Context Menu Manager');
      return;
    }
    setActingOn(entry.id);
    try {
      const result = await contextMenuService.remove(entry.hive, entry.regPath);
      setActionResults((prev) => ({ ...prev, [entry.id]: result }));
      if (result.success) {
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [entry.id]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const contexts = useMemo(() => {
    const set = new Set(entries.map((e) => e.context));
    return Array.from(set);
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      if (filterContext !== 'all' && entry.context !== filterContext) return false;
      if (filterState === 'enabled' && !entry.enabled) return false;
      if (filterState === 'disabled' && entry.enabled) return false;
      return true;
    });
  }, [entries, filterContext, filterState]);

  const stats = useMemo(() => {
    const enabled = entries.filter((e) => e.enabled).length;
    const disabled = entries.length - enabled;
    return { total: entries.length, enabled, disabled };
  }, [entries]);

  return (
    <div data-testid="page-context-menu-manager" className="space-y-4">
      <PageHeader
        title="Context Menu Manager"
        description="Manage right-click context menu entries in Windows Explorer. Disable, enable, or remove entries."
        actions={<HelpButton text="Click Load Entries to scan your context menu. Pro users can disable, enable, or remove entries." />}
      />

      {/* Warning banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-semantic-warning/30 bg-semantic-warning/5 p-4 flex items-start gap-3">
        <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Caution: Registry Changes</div>
          <p className="text-caption text-text-secondary mt-1">
            Context menu entries are stored in the Windows registry. Removing an entry is permanent.
            Disabling is reversible. Always disable first if you are unsure.
          </p>
        </div>
      </div>

      {/* Load button */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-3">
              <ClipboardDocumentListIcon className="h-6 w-6 text-brand-primary" />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Context Menu Entries</div>
              <p className="text-caption text-text-secondary mt-1">
                Scan the registry for right-click context menu items across all file types and locations.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            leftIcon={loading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ClipboardDocumentListIcon className="h-5 w-5" />}
            onClick={loadEntries}
            disabled={loading}
            data-testid="cm-load-btn"
          >
            {loading ? 'Loading...' : entries.length > 0 ? 'Refresh' : 'Load Entries'}
          </Button>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="cm-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stats + Filters */}
      {entries.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card variant="glass" className="p-3 text-center" data-testid="cm-stat-total">
              <div className="text-xl font-bold text-text-primary tabular-nums">{stats.total}</div>
              <div className="text-caption text-text-muted">Total Entries</div>
            </Card>
            <Card variant="glass" className="p-3 text-center" data-testid="cm-stat-enabled">
              <div className="text-xl font-bold text-semantic-success tabular-nums">{stats.enabled}</div>
              <div className="text-caption text-text-muted">Enabled</div>
            </Card>
            <Card variant="glass" className="p-3 text-center" data-testid="cm-stat-disabled">
              <div className="text-xl font-bold text-semantic-warning tabular-nums">{stats.disabled}</div>
              <div className="text-caption text-text-muted">Disabled</div>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-caption text-text-muted">Context:</span>
              <select
                value={filterContext}
                onChange={(e) => setFilterContext(e.target.value)}
                className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-3 py-1.5 text-small text-text-primary"
                data-testid="cm-filter-context"
              >
                <option value="all">All Contexts</option>
                {contexts.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-caption text-text-muted">State:</span>
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-3 py-1.5 text-small text-text-primary"
                data-testid="cm-filter-state"
              >
                <option value="all">All States</option>
                <option value="enabled">Enabled Only</option>
                <option value="disabled">Disabled Only</option>
              </select>
            </div>
          </div>
        </>
      )}

      {/* Entry list */}
      {entries.length > 0 && filtered.length === 0 ? (
        <Card variant="glass" className="p-8 text-center">
          <p className="text-small text-text-secondary">No entries match the current filters.</p>
        </Card>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((entry, i) => {
            const isActing = actingOn === entry.id;
            const result = actionResults[entry.id];

            return (
              <Card key={entry.id} variant="glass" className="p-4" data-testid={`cm-item-${i}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${
                      entry.enabled ? 'bg-semantic-success/10' : 'bg-semantic-warning/10'
                    }`}>
                      {entry.enabled ? (
                        <CheckCircleIcon className="h-4 w-4 text-semantic-success" />
                      ) : (
                        <EyeSlashIcon className="h-4 w-4 text-semantic-warning" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-small font-medium text-text-primary truncate">{entry.name}</span>
                        <Badge tone="neutral">{entry.context}</Badge>
                        <Badge tone={entry.enabled ? 'success' : 'warning'}>
                          {entry.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="text-caption text-text-muted mt-0.5">
                        {entry.hive} · {entry.subkey}
                      </div>
                      {entry.command && (
                        <div className="text-caption text-text-secondary mt-1 truncate font-mono">
                          {entry.command}
                        </div>
                      )}
                      {result && (
                        <div className={`mt-2 flex items-center gap-1.5 ${result.success ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                          {result.success ? <CheckCircleIcon className="h-3.5 w-3.5" /> : <XCircleIcon className="h-3.5 w-3.5" />}
                          <span className="text-caption">{result.message}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    {entry.enabled ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <EyeSlashIcon className="h-4 w-4" />}
                        onClick={() => handleDisable(entry)}
                        disabled={isActing}
                        data-testid={`cm-disable-${i}`}
                      >
                        {isPro ? 'Disable' : 'Upgrade'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <EyeIcon className="h-4 w-4" />}
                        onClick={() => handleEnable(entry)}
                        disabled={isActing}
                        data-testid={`cm-enable-${i}`}
                      >
                        {isPro ? 'Enable' : 'Upgrade'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                      onClick={() => handleRemove(entry)}
                      disabled={isActing}
                      data-testid={`cm-remove-${i}`}
                    >
                      {isPro ? 'Remove' : 'Upgrade'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {/* Free edition notice */}
      {!isPro && entries.length > 0 && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="cm-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view context menu entries for free. Upgrade to Professional to disable, enable, or remove entries.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Context Menu Manager')} leftIcon={<ClipboardDocumentListIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
