/**
 * BrowserExtensionManagerPage — View, disable, and remove browser extensions.
 *
 * Supports Chrome, Edge, Brave, and Firefox.
 *
 * Free: view extensions only
 * Pro: view + disable + remove + enable (Firefox only)
 */
import { useState, useCallback, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  GlobeAltIcon,
  ArrowPathIcon,
  TrashIcon,
  EyeSlashIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';
import {
  browserExtensionsService,
  type BrowserExtension,
} from './browserExtensions.service';

const BROWSER_ICONS: Record<string, string> = {
  Chrome: '🌐',
  Edge: '🌊',
  Brave: '🦁',
  Firefox: '🦊',
};

const RISKY_PERMISSIONS = new Set([
  'tabs', 'webRequest', 'webRequestBlocking', '<all_urls>',
  'http://*/*', 'https://*/*', 'clipboardWrite', 'clipboardRead',
  'nativeMessaging', 'proxy', 'cookies', 'webNavigation',
]);

function assessRisk(ext: BrowserExtension): { level: 'high' | 'medium' | 'low'; reasons: string[] } {
  const reasons: string[] = [];
  const allPerms = [...ext.permissions, ...ext.hostPermissions];

  const riskyFound = allPerms.filter((p) => RISKY_PERMISSIONS.has(p));
  if (riskyFound.length > 0) {
    reasons.push(`High-risk permissions: ${riskyFound.join(', ')}`);
  }

  if (allPerms.length > 5) {
    reasons.push(`Many permissions (${allPerms.length})`);
  }

  if (!ext.enabled) {
    reasons.push('Extension is disabled');
  }

  if (reasons.length === 0) return { level: 'low', reasons };
  if (riskyFound.length > 0) return { level: 'high', reasons };
  return { level: 'medium', reasons };
}

export default function BrowserExtensionManagerPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [extensions, setExtensions] = useState<BrowserExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [filterBrowser, setFilterBrowser] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [actionResults, setActionResults] = useState<Record<string, { success: boolean; message: string }>>({});

  const loadExtensions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await browserExtensionsService.list();
      setExtensions(result.extensions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load extensions');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRemove = async (ext: BrowserExtension) => {
    if (!isPro) {
      showUpgrade('Browser Extension Manager');
      return;
    }
    const key = `${ext.browser}-${ext.extensionId}`;
    setActingOn(key);
    try {
      const result = await browserExtensionsService.remove(ext.browser, ext.extensionId);
      setActionResults((prev) => ({ ...prev, [key]: result }));
      if (result.success) {
        setExtensions((prev) => prev.filter((e) => !(e.browser === ext.browser && e.extensionId === ext.extensionId)));
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [key]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const handleDisable = async (ext: BrowserExtension) => {
    if (!isPro) {
      showUpgrade('Browser Extension Manager');
      return;
    }
    const key = `${ext.browser}-${ext.extensionId}`;
    setActingOn(key);
    try {
      const result = await browserExtensionsService.disable(ext.browser, ext.extensionId);
      setActionResults((prev) => ({ ...prev, [key]: result }));
      if (result.success) {
        setExtensions((prev) =>
          prev.map((e) =>
            e.browser === ext.browser && e.extensionId === ext.extensionId
              ? { ...e, enabled: false }
              : e,
          ),
        );
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [key]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const handleEnable = async (ext: BrowserExtension) => {
    if (!isPro) {
      showUpgrade('Browser Extension Manager');
      return;
    }
    const key = `${ext.browser}-${ext.extensionId}`;
    setActingOn(key);
    try {
      const result = await browserExtensionsService.enable(ext.browser, ext.extensionId);
      setActionResults((prev) => ({ ...prev, [key]: result }));
      if (result.success) {
        setExtensions((prev) =>
          prev.map((e) =>
            e.browser === ext.browser && e.extensionId === ext.extensionId
              ? { ...e, enabled: true }
              : e,
          ),
        );
      }
    } catch (e) {
      setActionResults((prev) => ({
        ...prev,
        [key]: { success: false, message: e instanceof Error ? e.message : 'Failed' },
      }));
    } finally {
      setActingOn(null);
    }
  };

  const extensionsWithRisk = useMemo(
    () => extensions.map((ext) => ({ ...ext, risk: assessRisk(ext) })),
    [extensions],
  );

  const filtered = useMemo(() => {
    return extensionsWithRisk.filter((ext) => {
      if (filterBrowser !== 'all' && ext.browser !== filterBrowser) return false;
      if (filterRisk !== 'all' && ext.risk.level !== filterRisk) return false;
      return true;
    });
  }, [extensionsWithRisk, filterBrowser, filterRisk]);

  const browsers = useMemo(() => {
    const set = new Set(extensions.map((e) => e.browser));
    return Array.from(set);
  }, [extensions]);

  const stats = useMemo(() => {
    const enabled = extensions.filter((e) => e.enabled).length;
    const disabled = extensions.length - enabled;
    const highRisk = extensionsWithRisk.filter((e) => e.risk.level === 'high').length;
    return { total: extensions.length, enabled, disabled, highRisk };
  }, [extensions, extensionsWithRisk]);

  return (
    <div data-testid="page-browser-ext-manager" className="space-y-4">
      <PageHeader
        title="Browser Extension Manager"
        description="View, disable, and remove browser extensions across Chrome, Edge, Brave, and Firefox."
        actions={<HelpButton text="Click Load Extensions to scan your browsers. Pro users can disable or remove extensions." />}
      />

      {/* Load button */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-3">
              <PuzzlePieceIcon className="h-6 w-6 text-brand-primary" />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Browser Extensions</div>
              <p className="text-caption text-text-secondary mt-1">
                Manage extensions across all installed browsers. Detect risky permissions.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            leftIcon={loading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <GlobeAltIcon className="h-5 w-5" />}
            onClick={loadExtensions}
            disabled={loading}
            data-testid="ext-load-btn"
          >
            {loading ? 'Loading...' : extensions.length > 0 ? 'Refresh' : 'Load Extensions'}
          </Button>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="ext-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Stats + Filters */}
      {extensions.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card variant="glass" className="p-3 text-center" data-testid="ext-stat-total">
              <div className="text-xl font-bold text-text-primary tabular-nums">{stats.total}</div>
              <div className="text-caption text-text-muted">Total</div>
            </Card>
            <Card variant="glass" className="p-3 text-center" data-testid="ext-stat-enabled">
              <div className="text-xl font-bold text-semantic-success tabular-nums">{stats.enabled}</div>
              <div className="text-caption text-text-muted">Enabled</div>
            </Card>
            <Card variant="glass" className="p-3 text-center" data-testid="ext-stat-disabled">
              <div className="text-xl font-bold text-text-muted tabular-nums">{stats.disabled}</div>
              <div className="text-caption text-text-muted">Disabled</div>
            </Card>
            <Card variant="glass" className="p-3 text-center" data-testid="ext-stat-risk">
              <div className="text-xl font-bold text-semantic-danger tabular-nums">{stats.highRisk}</div>
              <div className="text-caption text-text-muted">High Risk</div>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-caption text-text-muted">Browser:</span>
              <select
                value={filterBrowser}
                onChange={(e) => setFilterBrowser(e.target.value)}
                className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-3 py-1.5 text-small text-text-primary"
                data-testid="ext-filter-browser"
              >
                <option value="all">All Browsers</option>
                {browsers.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-caption text-text-muted">Risk:</span>
              <select
                value={filterRisk}
                onChange={(e) => setFilterRisk(e.target.value)}
                className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-3 py-1.5 text-small text-text-primary"
                data-testid="ext-filter-risk"
              >
                <option value="all">All Risk Levels</option>
                <option value="high">High Risk</option>
                <option value="medium">Medium Risk</option>
                <option value="low">Low Risk</option>
              </select>
            </div>
          </div>
        </>
      )}

      {/* Extension list */}
      {extensions.length > 0 && filtered.length === 0 ? (
        <Card variant="glass" className="p-8 text-center">
          <p className="text-small text-text-secondary">No extensions match the current filters.</p>
        </Card>
      ) : filtered.length > 0 ? (
        <div className="space-y-2">
          {filtered.map((ext, i) => {
            const key = `${ext.browser}-${ext.extensionId}`;
            const isActing = actingOn === key;
            const result = actionResults[key];
            const riskTone = ext.risk.level === 'high' ? 'danger' : ext.risk.level === 'medium' ? 'warning' : 'neutral';

            return (
              <Card key={key} variant="glass" className="p-4" data-testid={`ext-item-${i}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="shrink-0 rounded-[var(--avs-radius-sm)] bg-surface-muted p-2 text-lg">
                      {BROWSER_ICONS[ext.browser] || '🌐'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-small font-medium text-text-primary truncate">{ext.name}</span>
                        <Badge tone="neutral">{ext.browser}</Badge>
                        <Badge tone={ext.enabled ? 'success' : 'neutral'}>
                          {ext.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        {ext.risk.level !== 'low' && (
                          <Badge tone={riskTone as 'danger' | 'warning'}>
                            {ext.risk.level === 'high' ? 'High Risk' : 'Medium Risk'}
                          </Badge>
                        )}
                      </div>
                      <div className="text-caption text-text-muted mt-0.5">
                        v{ext.version} · ID: {ext.extensionId.substring(0, 16)}...
                      </div>
                      {ext.description && (
                        <div className="text-caption text-text-secondary mt-1 truncate">{ext.description}</div>
                      )}
                      {ext.risk.reasons.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {ext.risk.reasons.map((reason, ri) => (
                            <div key={ri} className="text-caption text-semantic-warning flex items-start gap-1">
                              <ExclamationTriangleIcon className="h-3 w-3 shrink-0 mt-0.5" />
                              <span>{reason}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {ext.permissions.length > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                          <span className="text-caption text-text-muted">Permissions:</span>
                          {ext.permissions.slice(0, 5).map((perm, pi) => (
                            <span
                              key={pi}
                              className={`text-caption px-1.5 py-0.5 rounded ${
                                RISKY_PERMISSIONS.has(perm)
                                  ? 'bg-semantic-danger/10 text-semantic-danger'
                                  : 'bg-surface-muted text-text-muted'
                              }`}
                            >
                              {perm}
                            </span>
                          ))}
                          {ext.permissions.length > 5 && (
                            <span className="text-caption text-text-muted">+{ext.permissions.length - 5} more</span>
                          )}
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
                    {ext.enabled ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <EyeSlashIcon className="h-4 w-4" />}
                        onClick={() => handleDisable(ext)}
                        disabled={isActing}
                        data-testid={`ext-disable-${i}`}
                      >
                        {isPro ? 'Disable' : 'Upgrade'}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <EyeIcon className="h-4 w-4" />}
                        onClick={() => handleEnable(ext)}
                        disabled={isActing}
                        data-testid={`ext-enable-${i}`}
                      >
                        {isPro ? 'Enable' : 'Upgrade'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={isActing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                      onClick={() => handleRemove(ext)}
                      disabled={isActing}
                      data-testid={`ext-remove-${i}`}
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
      {!isPro && extensions.length > 0 && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="ext-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view extensions for free. Upgrade to Professional to disable, enable, or remove extensions.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Browser Extension Manager')} leftIcon={<PuzzlePieceIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
