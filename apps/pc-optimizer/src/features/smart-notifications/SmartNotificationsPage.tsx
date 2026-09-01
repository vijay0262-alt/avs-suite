/**
 * SmartNotificationsPage — AI-powered contextual actionable notifications.
 *
 * Aggregates data from all AVS subsystems and generates intelligent notifications
 * with actionable recommendations.
 *
 * Free: view, dismiss, clear all
 * Pro: execute actions, configure categories
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  BellAlertIcon,
  ArrowPathIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  BoltIcon,
  SparklesIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import {
  smartNotificationsService,
  type SmartNotification,
  type SmartNotifStats,
  type SmartNotifConfig,
} from './smartNotifications.service';

const PRIORITY_CONFIG: Record<string, { tone: 'danger' | 'warning' | 'info' | 'neutral'; icon: typeof BoltIcon; label: string }> = {
  critical: { tone: 'danger', icon: ExclamationTriangleIcon, label: 'Critical' },
  high: { tone: 'warning', icon: BellAlertIcon, label: 'High' },
  normal: { tone: 'info', icon: InformationCircleIcon, label: 'Normal' },
  low: { tone: 'neutral', icon: CheckCircleIcon, label: 'Low' },
};

const CATEGORY_LABELS: Record<string, string> = {
  performance: 'Performance',
  security: 'Security',
  maintenance: 'Maintenance',
  optimization: 'Optimization',
  predictive: 'Predictive',
};

const CATEGORY_ICONS: Record<string, typeof BoltIcon> = {
  performance: BoltIcon,
  security: BellAlertIcon,
  maintenance: TrashIcon,
  optimization: SparklesIcon,
  predictive: ChartBarIcon,
};

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

export default function SmartNotificationsPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [stats, setStats] = useState<SmartNotifStats | null>(null);
  const [config, setConfig] = useState<SmartNotifConfig | null>(null);
  const [generating, setGenerating] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [listResult, statsResult] = await Promise.all([
        smartNotificationsService.list({ limit: 30 }),
        smartNotificationsService.getStats(),
      ]);
      setNotifications(listResult.notifications);
      setStats(statsResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    }
  }, []);

  useEffect(() => {
    loadAll();
    // Load config
    smartNotificationsService.list({ limit: 1 }).then(() => {
      // Config is loaded via stats — we need a separate call
    }).catch(() => { /* ignore */ });
  }, [loadAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await smartNotificationsService.generate();
      setActionMessage(`Generated ${result.generated} new notification(s)`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate notifications');
    } finally {
      setGenerating(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await smartNotificationsService.dismiss(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dismiss');
    }
  };

  const handleAction = async (notif: SmartNotification) => {
    if (!isPro) {
      showUpgrade('Smart Notifications');
      return;
    }
    if (!notif.action) return;
    setActingId(notif.id);
    setError(null);
    try {
      const result = await smartNotificationsService.action(notif.id);
      setActionMessage(`Action triggered: ${result.action.label}`);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to execute action');
    } finally {
      setActingId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      await smartNotificationsService.clearAll();
      setNotifications([]);
      await loadAll();
      setActionMessage('All notifications cleared');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear');
    }
  };

  const handleCategoryToggle = async (category: string) => {
    if (!isPro || !config) return;
    setConfiguring(true);
    try {
      const newCats = { ...config.categories, [category]: !config.categories[category as keyof typeof config.categories] };
      const result = await smartNotificationsService.configure({ categories: newCats });
      setConfig(result.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
    } finally {
      setConfiguring(false);
    }
  };

  const handleEnabledToggle = async () => {
    if (!isPro || !config) return;
    setConfiguring(true);
    try {
      const result = await smartNotificationsService.configure({ enabled: !config.enabled });
      setConfig(result.config);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  return (
    <div data-testid="page-smart-notifications" className="space-y-4">
      <PageHeader
        title="AI Smart Notifications"
        description="Contextual, actionable alerts that correlate data across all AVS subsystems."
        actions={<HelpButton text="AI analyzes your system — junk accumulation, predictive maintenance, workload, performance, security — and generates smart notifications with actionable recommendations instead of generic alerts." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <BellAlertIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">AI Notification Intelligence</div>
          <p className="text-caption text-text-secondary mt-1">
            Smart notifications correlate multiple data sources, provide specific actionable recommendations,
            prioritize by urgency, and rate-limit to prevent notification fatigue.
          </p>
        </div>
      </div>

      {/* Stats + Generate */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-3 bg-brand-primary/10">
              <BellAlertIcon className="h-6 w-6 text-brand-primary" />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Notification Center</div>
              <p className="text-caption text-text-secondary mt-1">
                {stats ? `${stats.active} active · ${stats.total} total · ${stats.acted} acted on` : 'Loading...'}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            leftIcon={generating ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
            onClick={handleGenerate}
            disabled={generating}
            data-testid="smart-notif-generate-btn"
          >
            {generating ? 'Analyzing...' : 'Scan Now'}
          </Button>
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="smart-notif-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="smart-notif-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{stats.active}</div>
            <div className="text-caption text-text-muted">Active</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{stats.dismissed}</div>
            <div className="text-caption text-text-muted">Dismissed</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{stats.acted}</div>
            <div className="text-caption text-text-muted">Acted On</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{stats.totalGenerated}</div>
            <div className="text-caption text-text-muted">Generated</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">
              {Object.keys(stats.byCategory || {}).length}
            </div>
            <div className="text-caption text-text-muted">Categories</div>
          </Card>
        </div>
      )}

      {/* Notifications list */}
      <Card title="Active Notifications" variant="glass" data-testid="smart-notif-list">
        <div className="flex items-center justify-between mb-3">
          <p className="text-caption text-text-muted">
            {notifications.length > 0 ? `${notifications.length} notifications` : 'No notifications'}
          </p>
          {notifications.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<TrashIcon className="h-4 w-4" />}
              onClick={handleClearAll}
              data-testid="smart-notif-clear-all"
            >
              Clear All
            </Button>
          )}
        </div>

        {notifications.length > 0 ? (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const priConfig = PRIORITY_CONFIG[notif.priority] ?? PRIORITY_CONFIG.normal!;
              const CatIcon = CATEGORY_ICONS[notif.category] || BoltIcon;

              return (
                <div
                  key={notif.id}
                  className={`rounded-[var(--avs-radius-md)] border p-4 ${
                    notif.priority === 'critical' ? 'border-semantic-danger/30 bg-semantic-danger/5' :
                    notif.priority === 'high' ? 'border-semantic-warning/30 bg-semantic-warning/5' :
                    'border-[var(--avs-border)] bg-surface-muted'
                  }`}
                  data-testid={`smart-notif-item-${notif.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${
                      priConfig.tone === 'danger' ? 'bg-semantic-danger/10' :
                      priConfig.tone === 'warning' ? 'bg-semantic-warning/10' :
                      'bg-brand-primary/10'
                    }`}>
                      <CatIcon className={`h-5 w-5 ${
                        priConfig.tone === 'danger' ? 'text-semantic-danger' :
                        priConfig.tone === 'warning' ? 'text-semantic-warning' :
                        'text-brand-primary'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-small font-medium text-text-primary">{notif.title}</span>
                        <Badge tone={priConfig.tone}>{priConfig.label}</Badge>
                        <Badge tone="neutral">{CATEGORY_LABELS[notif.category] || notif.category}</Badge>
                        {notif.acted && <Badge tone="success">Acted</Badge>}
                      </div>
                      <p className="text-caption text-text-secondary mt-1">{notif.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-caption text-text-muted">{formatDate(notif.timestamp)}</span>
                        {notif.action && !notif.acted && (
                          <Button
                            size="sm"
                            variant="primary"
                            leftIcon={actingId === notif.id ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BoltIcon className="h-4 w-4" />}
                            onClick={() => handleAction(notif)}
                            disabled={actingId === notif.id}
                            data-testid={`smart-notif-action-${notif.id}`}
                          >
                            {isPro ? (actingId === notif.id ? '...' : notif.action.label) : 'Upgrade'}
                          </Button>
                        )}
                        {!notif.dismissed && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDismiss(notif.id)}
                            data-testid={`smart-notif-dismiss-${notif.id}`}
                          >
                            Dismiss
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircleIcon className="h-10 w-10 text-semantic-success mx-auto mb-2" />
            <p className="text-small text-text-secondary">No active notifications. Your system is running smoothly.</p>
            <p className="text-caption text-text-muted mt-1">Click &ldquo;Scan Now&rdquo; to check for issues.</p>
          </div>
        )}
      </Card>

      {/* Configuration */}
      <Card title="Configuration" variant="glass" data-testid="smart-notif-config">
        <div className="space-y-4">
          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BellAlertIcon className="h-5 w-5 text-text-muted" />
              <div>
                <div className="text-small font-medium text-text-primary">Smart Notifications</div>
                <p className="text-caption text-text-secondary">Enable or disable AI notification generation</p>
              </div>
            </div>
            <button
              onClick={handleEnabledToggle}
              disabled={!isPro || configuring || !config}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                config?.enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
              }`}
              data-testid="smart-notif-enabled-toggle"
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config?.enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* Category toggles */}
          <div>
            <div className="text-small font-medium text-text-primary mb-2">Notification Categories</div>
            <div className="space-y-2">
              {(Object.keys(CATEGORY_LABELS) as string[]).map((cat) => {
                const Icon = CATEGORY_ICONS[cat] || BoltIcon;
                const enabled = config?.categories?.[cat as keyof typeof config.categories] ?? true;
                return (
                  <div key={cat} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-text-muted" />
                      <span className="text-small text-text-primary">{CATEGORY_LABELS[cat]}</span>
                    </div>
                    <button
                      onClick={() => handleCategoryToggle(cat)}
                      disabled={!isPro || configuring}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                        enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                      }`}
                      data-testid={`smart-notif-cat-${cat}`}
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

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="smart-notif-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view and dismiss notifications for free. Upgrade to Professional to execute actions and configure categories.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Smart Notifications')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
