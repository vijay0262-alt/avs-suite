import { Card, Button, Badge } from '@avs/ui';
import { useTheme } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import type { ThemeMode } from '@avs/shared/types';
import { useEffect, useState } from 'react';
import { useEdition } from '../config/EditionManager';
import { getVersionString, getBuildString, getChannelString, getEditionString } from '../config/version';
import { useUpgradeDialog } from '../components/UpgradeDialog';
import { useAuthStore } from '../features/auth/authStore';
import { useEntitlementStore } from '../features/entitlement/entitlementStore';
import { useFeatureStore, FEATURE_LABELS } from '../features/feature-engine';
import { useUpdateStore } from '../features/update';
import { useSubscriptionStore } from '../features/subscription/subscriptionStore';
import { ArrowRightOnRectangleIcon, UserCircleIcon, ArrowPathIcon, StarIcon, CheckCircleIcon, CloudArrowDownIcon, ArrowDownTrayIcon, XCircleIcon, RocketLaunchIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { onboardingService } from '../features/onboarding/OnboardingProvider';
import { KEYBOARD_SHORTCUTS } from '../components/useKeyboardShortcuts';

interface VerificationLog {
  id: string;
  timestamp: number;
  moduleId: string;
  action: string;
  rpcMethod: string;
  before?: number;
  after?: number;
  durationMs: number;
  success: boolean;
  message?: string;
}

const THEMES: readonly { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

/**
 * SettingsPage — application settings including appearance, edition,
 * updates, account, entitlements, subscriptions, features, and developer tools.
 */
const DEV_STORAGE_KEY = 'avs-developer-mode';
const LOGS_STORAGE_KEY = 'avs-verification-logs';

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const [devMode, setDevMode] = useState(false);
  const [logs, setLogs] = useState<VerificationLog[]>([]);
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const { customer, session, logout } = useAuthStore();
  const { entitlement, created, syncPhase, syncError, lastSyncAt, syncEntitlement } = useEntitlementStore();
  const { editionLabel, enabledFeatures, disabledFeatures, enabledCount, disabledCount, initialized: featureEngineInitialized } = useFeatureStore();
  const { subscription, loading: subLoading, error: subError, lastSyncAt: subLastSyncAt, connectionStatus, serverVersion, serverUrl, sync: syncSubscription } = useSubscriptionStore();
  const {
    status: updateStatus,
    updateInfo,
    manifest: updateManifest,
    downloadProgress,
    installer: updateInstaller,
    error: updateError,
    lastCheckAt: updateLastCheckAt,
    currentVersion: updateCurrentVersion,
    forceUpdate: updateForceUpdate,
    checkForUpdates,
    download: downloadUpdate,
    cancelDownload: cancelUpdateDownload,
    verifyUpdate,
    prepareInstaller,
    launchInstaller,
    clearError: clearUpdateError,
  } = useUpdateStore();

  useEffect(() => {
    try {
      setDevMode(typeof window !== 'undefined' && window.localStorage.getItem(DEV_STORAGE_KEY) === 'true');
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LOGS_STORAGE_KEY) : null;
      setLogs(raw ? (JSON.parse(raw) as VerificationLog[]) : []);
    } catch {
      setLogs([]);
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEV_STORAGE_KEY) setDevMode(e.newValue === 'true');
      if (e.key === LOGS_STORAGE_KEY) {
        try {
          setLogs(e.newValue ? (JSON.parse(e.newValue) as VerificationLog[]) : []);
        } catch {
          setLogs([]);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleDevMode = () => {
    const next = !devMode;
    setDevMode(next);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(DEV_STORAGE_KEY, String(next));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div data-testid="page-settings">
      <PageHeader
        title="Settings"
        description="Configure appearance, updates, and advanced behaviour."
        actions={<HelpButton text="Customize the application's appearance, manage updates, review feature entitlements, and access account information. Changes are saved automatically." />}
      />

      <div className="space-y-4">
        <Card title="Appearance" variant="glass">
          <div className="flex flex-wrap items-center gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.id}
                variant={mode === t.id ? 'primary' : 'secondary'}
                onClick={() => setMode(t.id)}
                data-testid={`settings-theme-${t.id}`}
              >
                {t.label}
              </Button>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Theme is stored locally and re-applied on next launch.
          </p>
        </Card>

        <Card title="Language" variant="glass">
          <p className="text-sm text-text-secondary">
            English is currently the default. Additional locales will be enabled once
            translations complete.
          </p>
        </Card>

        <Card title="Edition" variant="glass">
          <div className="space-y-4">
            {edition === 'professional' ? (
              /* Premium License Card for Professional users */
              <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/30 bg-gradient-to-br from-brand-primary/10 to-transparent p-6" data-testid="pro-license-card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-1 mb-2">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <StarIcon key={i} className="h-4 w-4 text-brand-primary" />
                      ))}
                    </div>
                    <h3 className="text-lg font-bold text-text-primary">AVS Shield Professional</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-semantic-success/15 border border-semantic-success/30 px-2 py-0.5 text-xs font-medium text-semantic-success">
                        <CheckCircleIcon className="h-3 w-3" />
                        Active
                      </span>
                      {subscription && subscription.expires_at && (
                        <span className="text-xs text-text-muted">
                          Expires: {new Date(subscription.expires_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      )}
                      {subscription && !subscription.expires_at && (
                        <span className="text-xs text-text-muted">Lifetime License</span>
                      )}
                    </div>
                  </div>
                  <div
                    className="h-12 w-12 rounded-[var(--avs-radius-md)] flex items-center justify-center shrink-0"
                    style={{ background: 'var(--avs-gradient-brand)' }}
                  >
                    <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15L15 9.75" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
                    </svg>
                  </div>
                </div>

                <div className="border-t border-brand-primary/20 pt-4">
                  <p className="text-xs font-medium text-text-muted mb-3">Included with your subscription</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      { label: 'AI Copilot Unlimited', icon: SparklesIcon },
                      { label: 'AI Active Protection', icon: CheckCircleIcon },
                      { label: 'Unlimited Optimization', icon: RocketLaunchIcon },
                      { label: 'Predictive Health', icon: ArrowPathIcon },
                      { label: 'Priority Updates', icon: CloudArrowDownIcon },
                      { label: 'Background Monitoring', icon: CheckCircleIcon },
                    ].map((feat) => (
                      <div key={feat.label} className="flex items-center gap-2">
                        <feat.icon className="h-4 w-4 text-brand-primary shrink-0" />
                        <span className="text-sm text-text-secondary">{feat.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Standard Edition display for Free users */
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{getEditionString()}</span>
                    <Badge tone={edition === 'free' ? 'neutral' : 'brand'}>
                      {edition.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    Free edition: Understand your PC. Analyze, inspect, and manually improve your system.
                  </p>
                </div>
                <Button variant="primary" onClick={() => showUpgrade('Settings')} data-testid="settings-upgrade" leftIcon={<StarIcon className="h-4 w-4" />}>
                  Upgrade to Professional
                </Button>
              </div>
            )}

            {subscription && edition === 'free' && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm border-t border-[var(--avs-border)] pt-3">
                <span className="text-text-muted">Activated License</span>
                <span className="text-text-primary">{subscription.plan}</span>
                <span className="text-text-muted">Status</span>
                <span className="text-text-primary">{subscription.status}</span>
                <span className="text-text-muted">Started</span>
                <span className="text-text-primary">{subscription.started_at ? new Date(subscription.started_at).toLocaleDateString() : '\u2014'}</span>
                <span className="text-text-muted">Expires</span>
                <span className="text-text-primary">{subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : 'Lifetime'}</span>
              </div>
            )}

            <div className="border-t border-[var(--avs-border)] pt-3">
              <div className="text-xs font-medium text-text-muted mb-2">Feature Comparison</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="text-text-muted">
                    <tr>
                      <th className="p-2">Capability</th>
                      <th className="p-2 text-center">Free</th>
                      <th className="p-2 text-center">Professional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'AI Dashboard & Health Scores', free: true, pro: true },
                      { label: 'AI Daily Briefing', free: '1/day', pro: 'Unlimited' },
                      { label: 'AI Smart Optimize', free: '5/run', pro: 'Unlimited' },
                      { label: 'AI Copilot Questions', free: '20/day', pro: 'Unlimited' },
                      { label: 'Junk Cleaner', free: '500 MB/run', pro: 'Unlimited' },
                      { label: 'Registry Cleaner', free: '50 issues', pro: 'Unlimited' },
                      { label: 'Startup Manager', free: '3 entries', pro: 'Unlimited' },
                      { label: 'Browser Cleaner', free: '1 browser', pro: 'All browsers' },
                      { label: 'Duplicate Finder', free: '20 files', pro: 'Unlimited' },
                      { label: 'Large File Analyzer', free: '10 files', pro: 'Unlimited' },
                      { label: 'Software Uninstaller', free: 'Manual', pro: 'Batch + cleanup' },
                      { label: 'Process Intelligence', free: 'Top 10', pro: 'Unlimited' },
                      { label: 'Hardware Center History', free: '24 hours', pro: 'Unlimited' },
                      { label: 'Predictive Health', free: '7-day', pro: 'Unlimited' },
                      { label: 'Real-Time Protection', free: false, pro: true },
                      { label: 'Scheduled Scans', free: false, pro: true },
                      { label: 'Automatic Optimization', free: false, pro: true },
                      { label: 'Background Monitoring', free: false, pro: true },
                      { label: 'Export Formats', free: 'PDF', pro: 'PDF, CSV, JSON, Excel' },
                      { label: 'Priority Support', free: false, pro: true },
                    ].map((row) => (
                      <tr key={row.label} className="border-t border-[var(--avs-border)]">
                        <td className="p-2 text-text-secondary">{row.label}</td>
                        <td className="p-2 text-center">
                          {row.free === true ? (
                            <CheckCircleIcon className="inline h-3.5 w-3.5 text-semantic-success" />
                          ) : row.free === false ? (
                            <span className="text-text-muted">\u2014</span>
                          ) : (
                            <span className="text-text-secondary">{row.free}</span>
                          )}
                        </td>
                        <td className="p-2 text-center">
                          {row.pro === true ? (
                            <CheckCircleIcon className="inline h-3.5 w-3.5 text-semantic-success" />
                          ) : (
                            <span className="text-text-primary font-medium">{row.pro}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Version" variant="glass">
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-text-muted">Version</dt>
              <dd className="font-medium text-text-primary">{getVersionString()}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Build</dt>
              <dd className="font-medium text-text-primary">{getBuildString()}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Channel</dt>
              <dd className="font-medium text-text-primary">{getChannelString()}</dd>
            </div>
          </dl>
        </Card>

        <Card title="Update Preferences" variant="glass">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Check for updates automatically</div>
                <p className="text-xs text-text-secondary">Automatic update checks run every 24 hours. Use the Check Now button to check immediately.</p>
              </div>
              <Badge tone="success" data-testid="settings-auto-update-toggle">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Update channel</div>
                <p className="text-xs text-text-secondary">Stable channel is recommended for most users.</p>
              </div>
              <Badge tone="brand">Stable</Badge>
            </div>
          </div>
        </Card>

        <Card title="Telemetry" variant="glass">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Anonymous usage data</div>
              <p className="text-xs text-text-secondary">Help improve AVS Shield Optimizer by sending anonymous diagnostics. No personal data is collected.</p>
            </div>
            <Badge tone="neutral" data-testid="settings-telemetry-toggle">Disabled</Badge>
          </div>
        </Card>

        <Card title="AVS Shield Account" variant="glass">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserCircleIcon className="h-10 w-10 text-text-muted" aria-hidden />
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {customer?.display_name ?? session?.customerName ?? 'AVS Shield Customer'}
                </div>
                <div className="text-xs text-text-secondary">
                  {customer?.email ?? session?.customerEmail ?? '—'}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={
                    (customer?.account_status ?? session?.accountStatus) === 'ACTIVE' ? 'success' :
                    (customer?.account_status ?? session?.accountStatus) === 'PENDING_EMAIL_VERIFICATION' ? 'warning' :
                    'neutral'
                  }>
                    {customer?.account_status ?? session?.accountStatus ?? 'UNKNOWN'}
                  </Badge>
                </div>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={logout}
              leftIcon={<ArrowRightOnRectangleIcon className="h-4 w-4" />}
              data-testid="settings-logout"
            >
              Log Out
            </Button>
          </div>
        </Card>

        <Card
          title="Optimizer Entitlement"
          variant="glass"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void syncEntitlement('optimizer')}
              loading={syncPhase === 'syncing'}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              data-testid="settings-entitlement-resync"
            >
              Sync
            </Button>
          }
        >
          {entitlement ? (
            <div className="space-y-2" data-testid="settings-entitlement-info">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-text-muted">Product</span>
                <span className="text-text-primary">{entitlement.product_name}</span>
                <span className="text-text-muted">Edition</span>
                <span className="text-text-primary">{entitlement.edition}</span>
                <span className="text-text-muted">Status</span>
                <span>
                  <Badge tone={entitlement.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {entitlement.status}
                  </Badge>
                </span>
                <span className="text-text-muted">Activation Type</span>
                <span className="text-text-primary">{entitlement.activation_type}</span>
                <span className="text-text-muted">Auto Renew</span>
                <span className="text-text-primary">{entitlement.auto_renew ? 'Yes' : 'No'}</span>
                <span className="text-text-muted">Provisioning</span>
                <span className="text-text-primary">{created ? 'Newly created' : 'Existing'}</span>
                <span className="text-text-muted">Valid Until</span>
                <span className="text-text-primary">{entitlement.valid_until ?? 'Lifetime'}</span>
                <span className="text-text-muted">Last Sync</span>
                <span className="text-text-primary">{lastSyncAt ? new Date(lastSyncAt).toLocaleString() : '—'}</span>
              </div>
            </div>
          ) : syncError ? (
            <div className="space-y-2" data-testid="settings-entitlement-error">
              <p className="text-sm text-semantic-danger">{syncError}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void syncEntitlement('optimizer')}
                data-testid="settings-entitlement-retry"
              >
                Retry Sync
              </Button>
            </div>
          ) : syncPhase === 'syncing' ? (
            <p className="text-sm text-text-muted" data-testid="settings-entitlement-syncing">
              Synchronizing entitlement…
            </p>
          ) : (
            <p className="text-sm text-text-muted" data-testid="settings-entitlement-empty">
              No entitlement synced yet.
            </p>
          )}
        </Card>

        <Card
          title="Subscription"
          variant="glass"
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void syncSubscription()}
              loading={subLoading}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              data-testid="settings-subscription-refresh"
            >
              Refresh
            </Button>
          }
        >
          {subscription ? (
            <div className="space-y-2" data-testid="settings-subscription-info">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-text-muted">Plan</span>
                <span className="text-text-primary">{subscription.plan}</span>
                <span className="text-text-muted">Status</span>
                <span>
                  <Badge tone={subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {subscription.status}
                  </Badge>
                </span>
                <span className="text-text-muted">Started</span>
                <span className="text-text-primary">{subscription.started_at ? new Date(subscription.started_at).toLocaleDateString() : '—'}</span>
                <span className="text-text-muted">Expires</span>
                <span className="text-text-primary">{subscription.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : '—'}</span>
                <span className="text-text-muted">Last Sync</span>
                <span className="text-text-primary">{subLastSyncAt ? new Date(subLastSyncAt).toLocaleString() : '—'}</span>
                <span className="text-text-muted">Connection</span>
                <span>
                  <Badge tone={connectionStatus === 'connected' ? 'success' : connectionStatus === 'checking' ? 'warning' : 'danger'}>
                    {connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'checking' ? 'Checking…' : 'Disconnected'}
                  </Badge>
                </span>
                <span className="text-text-muted">Server</span>
                <span className="font-mono text-xs text-text-primary">{serverUrl}</span>
                <span className="text-text-muted">API Version</span>
                <span className="text-text-primary">{serverVersion ? `v${serverVersion}` : '—'}</span>
              </div>

              {subscription.features.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-text-muted mb-1">Features</div>
                  <div className="flex flex-wrap gap-1">
                    {subscription.features.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1 rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-2 py-0.5 text-xs text-text-secondary">
                        <CheckCircleIcon className="h-3 w-3 text-semantic-success" />
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : subError ? (
            <div className="space-y-2" data-testid="settings-subscription-error">
              <p className="text-sm text-semantic-danger">{subError}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void syncSubscription()}
                data-testid="settings-subscription-retry"
              >
                Retry
              </Button>
            </div>
          ) : subLoading ? (
            <p className="text-sm text-text-muted" data-testid="settings-subscription-loading">
              Loading subscription…
            </p>
          ) : (
            <p className="text-sm text-text-muted" data-testid="settings-subscription-empty">
              No subscription data available.
            </p>
          )}
        </Card>

        <Card
          title="Feature Engine"
          variant="glass"
          actions={
            <Badge tone={featureEngineInitialized ? 'success' : 'neutral'}>
              {featureEngineInitialized ? 'Active' : 'Inactive'}
            </Badge>
          }
        >
          <div className="space-y-3" data-testid="settings-feature-engine">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-text-muted">License Edition</span>
              <span className="text-text-primary">{editionLabel}</span>
              <span className="text-text-muted">Enabled Features</span>
              <span className="text-text-primary">{enabledCount} / {enabledCount + disabledCount}</span>
              <span className="text-text-muted">Disabled Features</span>
              <span className="text-text-primary">{disabledCount}</span>
            </div>

            {enabledFeatures.length > 0 && (
              <div>
                <div className="text-xs font-medium text-text-muted mb-1">Enabled</div>
                <div className="flex flex-wrap gap-1">
                  {enabledFeatures.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-2 py-0.5 text-xs text-text-secondary">
                      <CheckCircleIcon className="h-3 w-3 text-semantic-success" />
                      {FEATURE_LABELS[f]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {disabledFeatures.length > 0 && (
              <div>
                <div className="text-xs font-medium text-text-muted mb-1">Disabled</div>
                <div className="flex flex-wrap gap-1">
                  {disabledFeatures.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-2 py-0.5 text-xs text-text-muted">
                      <StarIcon className="h-3 w-3 text-semantic-warning/60" />
                      {FEATURE_LABELS[f]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Updates"
          variant="glass"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void checkForUpdates('optimizer')}
                loading={updateStatus === 'checking'}
                leftIcon={<CloudArrowDownIcon className="h-4 w-4" />}
                data-testid="settings-update-check"
              >
                Check Now
              </Button>
              {updateStatus === 'downloading' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cancelUpdateDownload()}
                  leftIcon={<XCircleIcon className="h-4 w-4" />}
                  data-testid="settings-update-cancel"
                >
                  Cancel
                </Button>
              )}
              {updateStatus === 'update-available' && updateManifest && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void downloadUpdate('optimizer')}
                  leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />}
                  data-testid="settings-update-download"
                >
                  Download
                </Button>
              )}
              {updateStatus === 'downloaded' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void verifyUpdate()}
                  data-testid="settings-update-verify"
                >
                  Verify
                </Button>
              )}
              {updateStatus === 'verified' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void prepareInstaller()}
                  data-testid="settings-update-prepare"
                >
                  Prepare
                </Button>
              )}
              {updateStatus === 'ready' && updateInstaller && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void launchInstaller()}
                  leftIcon={<RocketLaunchIcon className="h-4 w-4" />}
                  data-testid="settings-update-install"
                >
                  Install
                </Button>
              )}
            </div>
          }
        >
          <div className="space-y-3" data-testid="settings-update-section">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-text-muted">Current Version</span>
              <span className="text-text-primary">{updateCurrentVersion}</span>
              <span className="text-text-muted">Latest Version</span>
              <span className="text-text-primary">{updateInfo?.latestVersion ?? '—'}</span>
              <span className="text-text-muted">Release Channel</span>
              <span className="text-text-primary">{updateManifest?.releaseChannel ?? '—'}</span>
              <span className="text-text-muted">Published Date</span>
              <span className="text-text-primary">{updateManifest?.publishedAt ? new Date(updateManifest.publishedAt).toLocaleDateString() : '—'}</span>
              <span className="text-text-muted">File Size</span>
              <span className="text-text-primary">{updateManifest?.fileSize ? `${(updateManifest.fileSize / 1024 / 1024).toFixed(1)} MB` : '—'}</span>
              <span className="text-text-muted">Update Status</span>
              <span>
                <Badge tone={
                  updateStatus === 'no-update' ? 'success' :
                  updateStatus === 'update-available' ? 'warning' :
                  updateStatus === 'downloading' || updateStatus === 'verifying' || updateStatus === 'preparing' ? 'neutral' :
                  updateStatus === 'downloaded' || updateStatus === 'verified' || updateStatus === 'ready' ? 'success' :
                  updateStatus === 'error' ? 'danger' : 'neutral'
                }>
                  {updateStatus}
                </Badge>
              </span>
              <span className="text-text-muted">Last Check</span>
              <span className="text-text-primary">{updateLastCheckAt ? new Date(updateLastCheckAt).toLocaleString() : '—'}</span>
            </div>

            {updateForceUpdate && updateStatus === 'update-available' && (
              <div className="rounded-[var(--avs-radius-md)] bg-semantic-danger/10 border border-semantic-danger/30 px-3 py-2" data-testid="settings-force-update-notice">
                <p className="text-sm text-semantic-danger">
                  A mandatory update is available. Premium features will be limited until the update is installed.
                </p>
              </div>
            )}

            {downloadProgress && updateStatus === 'downloading' && (
              <div data-testid="settings-download-progress">
                <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                  <span>Downloading… {downloadProgress.percent.toFixed(0)}%</span>
                  <span>{(downloadProgress.downloadedBytes / 1024 / 1024).toFixed(1)} / {(downloadProgress.totalBytes / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--avs-surface-muted)] overflow-hidden">
                  <div
                    className="h-full transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
                    style={{ background: 'var(--avs-gradient-brand)', width: `${downloadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {updateManifest?.releaseNotes && updateStatus === 'update-available' && (
              <div>
                <div className="text-xs font-medium text-text-muted mb-1">Release Notes</div>
                <p className="text-sm text-text-secondary whitespace-pre-line">{updateManifest.releaseNotes}</p>
              </div>
            )}

            {updateError && (
              <div className="rounded-[var(--avs-radius-md)] bg-semantic-danger/10 border border-semantic-danger/30 px-3 py-2" data-testid="settings-update-error">
                <p className="text-sm text-semantic-danger">{updateError}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearUpdateError()}
                  className="mt-1"
                >
                  Dismiss
                </Button>
              </div>
            )}

            {updateStatus === 'ready' && updateInstaller && (
              <div className="rounded-[var(--avs-radius-md)] bg-semantic-success/10 border border-semantic-success/30 px-3 py-2" data-testid="settings-update-ready">
                <p className="text-sm text-semantic-success">
                  Update is ready to install. Click &quot;Install&quot; to launch the installer. The application will close during installation.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Developer" variant="glass">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Developer Verification Mode</div>
              <p className="text-xs text-text-secondary">
                Shows every RPC call, backend function, files deleted, entries disabled and before/after values.
              </p>
            </div>
            <Button variant={devMode ? 'primary' : 'secondary'} onClick={toggleDevMode}>
              {devMode ? 'Enabled' : 'Disabled'}
            </Button>
          </div>

          {devMode && (
            <div className="mt-4 border-t border-[var(--avs-border)] pt-4">
              <div className="text-sm font-medium text-text-primary mb-2">Verification Log ({logs.length})</div>
              {logs.length === 0 ? (
                <p className="text-sm text-text-secondary">No verification data yet. Run a Smart Health Scan optimization to populate this log.</p>
              ) : (
                <div className="max-h-96 overflow-auto border border-[var(--avs-border)] rounded-[var(--avs-radius-md)]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--avs-surface-muted)] text-text-secondary sticky top-0">
                      <tr>
                        <th className="p-2">Time</th>
                        <th className="p-2">Module</th>
                        <th className="p-2">Action</th>
                        <th className="p-2">RPC</th>
                        <th className="p-2">Before</th>
                        <th className="p-2">After</th>
                        <th className="p-2">Duration</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-t border-[var(--avs-border)]">
                          <td className="p-2 tabular-nums">{new Date(log.timestamp).toLocaleTimeString()}</td>
                          <td className="p-2">{log.moduleId}</td>
                          <td className="p-2">{log.action}</td>
                          <td className="p-2 font-mono">{log.rpcMethod}</td>
                          <td className="p-2 tabular-nums">{log.before ?? '-'}</td>
                          <td className="p-2 tabular-nums">{log.after ?? '-'}</td>
                          <td className="p-2 tabular-nums">{log.durationMs}ms</td>
                          <td className={`p-2 ${log.success ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                            {log.success ? 'OK' : 'FAIL'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Onboarding & Help" variant="glass">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Restart Welcome Tour</div>
                <p className="text-xs text-text-secondary">
                  Replay the first-run onboarding experience and guided tour.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => onboardingService.resetOnboarding()}
                leftIcon={<SparklesIcon className="h-4 w-4" />}
                data-testid="settings-restart-onboarding"
              >
                Restart
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Learning Mode</div>
                <p className="text-xs text-text-secondary">
                  Show contextual tips and hints throughout the application.
                </p>
              </div>
              <Button
                variant={onboardingService.isLearningMode() ? 'primary' : 'secondary'}
                onClick={() => onboardingService.setLearningMode(!onboardingService.isLearningMode())}
                data-testid="settings-learning-mode"
              >
                {onboardingService.isLearningMode() ? 'Enabled' : 'Disabled'}
              </Button>
            </div>
          </div>
        </Card>

        <Card title="Keyboard Shortcuts" variant="glass">
          <div className="space-y-1.5" data-testid="settings-keyboard-shortcuts">
            {KEYBOARD_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="flex items-center justify-between py-1">
                <span className="text-sm text-text-secondary">{shortcut.description}</span>
                <kbd className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] px-2 py-0.5 text-xs font-mono text-text-primary">
                  {shortcut.keys}
                </kbd>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
