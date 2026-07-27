import { Card, Button, Badge } from '@avs/ui';
import { useTheme } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
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
import { ArrowRightOnRectangleIcon, UserCircleIcon, ArrowPathIcon, LockClosedIcon, CheckCircleIcon, CloudArrowDownIcon, ArrowDownTrayIcon, XCircleIcon, RocketLaunchIcon } from '@heroicons/react/24/outline';

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
 * SettingsPage — the only page that ships with interactive controls
 * in this initial scaffold. Additional sections (Language, Updates,
 * License, Advanced) will be plugged in as their subsystems arrive.
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
      />

      <div className="space-y-4">
        <Card title="Appearance">
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

        <Card title="Language">
          <p className="text-sm text-text-secondary">
            English is currently the default. Additional locales will be enabled once
            translations complete.
          </p>
        </Card>

        <Card title="Application Edition">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{getEditionString()}</span>
                <Badge tone={edition === 'free' ? 'neutral' : 'brand'}>
                  {edition.toUpperCase()}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {edition === 'free'
                  ? 'Free edition includes basic junk cleaning, startup management, privacy cleaning, and disk analysis.'
                  : 'Professional edition includes all features with priority support.'}
              </p>
            </div>
            {edition === 'free' && (
              <Button variant="primary" onClick={() => showUpgrade('Settings')} data-testid="settings-upgrade">
                Upgrade to Professional
              </Button>
            )}
          </div>
        </Card>

        <Card title="Version">
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

        <Card title="Update Preferences">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-text-primary">Check for updates automatically</div>
                <p className="text-xs text-text-secondary">Not enabled in this build. Future versions will support automatic update checks.</p>
              </div>
              <Button variant="secondary" disabled data-testid="settings-auto-update-toggle">
                Disabled
              </Button>
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

        <Card title="Telemetry">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-text-primary">Anonymous usage data</div>
              <p className="text-xs text-text-secondary">Help improve AVS Shield Optimizer by sending anonymous diagnostics. Future feature.</p>
            </div>
            <Button variant="secondary" disabled data-testid="settings-telemetry-toggle">
              Disabled
            </Button>
          </div>
        </Card>

        <Card title="AVS Shield Account">
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
                      <span key={f} className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs text-text-secondary">
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
                    <span key={f} className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs text-text-secondary">
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
                    <span key={f} className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
                      <LockClosedIcon className="h-3 w-3 text-text-muted" />
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
              <div className="rounded-md bg-semantic-danger/10 border border-semantic-danger/30 px-3 py-2" data-testid="settings-force-update-notice">
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
                <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-brand-primary transition-all"
                    style={{ width: `${downloadProgress.percent}%` }}
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
              <div className="rounded-md bg-semantic-danger/10 border border-semantic-danger/30 px-3 py-2" data-testid="settings-update-error">
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
              <div className="rounded-md bg-semantic-success/10 border border-semantic-success/30 px-3 py-2" data-testid="settings-update-ready">
                <p className="text-sm text-semantic-success">
                  Update is ready to install. Click &quot;Install&quot; to launch the installer. The application will close during installation.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card title="Developer">
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
            <div className="mt-4 border-t border-border pt-4">
              <div className="text-sm font-medium text-text-primary mb-2">Verification Log ({logs.length})</div>
              {logs.length === 0 ? (
                <p className="text-sm text-text-secondary">No verification data yet. Run a Smart Health Scan optimization to populate this log.</p>
              ) : (
                <div className="max-h-96 overflow-auto border border-border rounded-md">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-muted text-text-secondary sticky top-0">
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
                        <tr key={log.id} className="border-t border-border">
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
      </div>
    </div>
  );
}
