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
import { useTraySettings } from '../hooks/useTraySettings';

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
  const [learningMode, setLearningMode] = useState(false);
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const { settings: traySettings, startupEnabled, loading: trayLoading, updateSettings: updateTray, enableStartup, disableStartup } = useTraySettings();
  const { customer, session, logout } = useAuthStore();
  const { entitlement, created, syncPhase, syncError, lastSyncAt, syncEntitlement } = useEntitlementStore();
  const { editionLabel, enabledFeatures, disabledFeatures, enabledCount, disabledCount, initialized: featureEngineInitialized } = useFeatureStore();
  const subscription = useSubscriptionStore((s) => s.subscription);
  const subLoading = useSubscriptionStore((s) => s.loading);
  const subError = useSubscriptionStore((s) => s.error);
  const subLastSyncAt = useSubscriptionStore((s) => s.lastSyncAt);
  const connectionStatus = useSubscriptionStore((s) => s.connectionStatus);
  const syncSubscription = useSubscriptionStore((s) => s.sync);
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
      setLearningMode(onboardingService.isLearningMode());
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
          <p className="mt-3 text-caption text-text-muted">
            Theme is stored locally and re-applied on next launch.
          </p>
        </Card>

        <Card title="Background & System Tray" variant="glass">
          <div className="space-y-4">
            {/* Close behavior */}
            <div>
              <div className="text-small font-medium text-text-primary mb-2">When closing AVS Shield</div>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="closeBehavior"
                    checked={traySettings.closeBehavior === 'minimize-to-tray'}
                    onChange={() => updateTray({ closeBehavior: 'minimize-to-tray' })}
                    className="h-4 w-4 accent-[var(--avs-brand-primary)]"
                  />
                  <div>
                    <span className="text-small text-text-primary">Minimize to System Tray (Default)</span>
                    <p className="text-caption text-text-muted">Window hides to tray. Protection continues in the background.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="closeBehavior"
                    checked={traySettings.closeBehavior === 'exit'}
                    onChange={() => updateTray({ closeBehavior: 'exit' })}
                    className="h-4 w-4 accent-[var(--avs-brand-primary)]"
                  />
                  <div>
                    <span className="text-small text-text-primary">Exit Application</span>
                    <p className="text-caption text-text-muted">Closing the window exits AVS Shield. Protection stops.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Start with Windows */}
            <div className="border-t border-[var(--avs-border)] pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-small font-medium text-text-primary">Start AVS Shield with Windows</div>
                  <p className="text-caption text-text-secondary">
                    {edition === 'professional'
                      ? 'Launch AVS Shield automatically when Windows starts. Protection begins immediately.'
                      : 'Professional feature. Enable to start AVS Shield with Windows for continuous protection.'}
                  </p>
                </div>
                <button
                  onClick={() => startupEnabled ? disableStartup() : enableStartup()}
                  disabled={trayLoading}
                  className={`relative h-6 w-11 rounded-full transition-colors ${startupEnabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'}`}
                >
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${startupEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            {/* Notifications */}
            <div className="border-t border-[var(--avs-border)] pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-small font-medium text-text-primary">Notifications</div>
                  <p className="text-caption text-text-secondary">Show native Windows notifications for security and system events.</p>
                </div>
                <button
                  onClick={() => updateTray({ notificationsEnabled: !traySettings.notificationsEnabled })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${traySettings.notificationsEnabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'}`}
                >
                  <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${traySettings.notificationsEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Language" variant="glass">
          <p className="text-small text-text-secondary">
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
                    <h3 className="text-section-title text-text-primary">AVS Shield Professional</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 rounded-full bg-semantic-success/15 border border-semantic-success/30 px-2 py-0.5 text-caption font-medium text-semantic-success">
                        <CheckCircleIcon className="h-3 w-3" />
                        Active
                      </span>
                      {subscription && subscription.expires_at && (
                        <span className="text-caption text-text-muted">
                          Expires: {new Date(subscription.expires_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      )}
                      {subscription && !subscription.expires_at && (
                        <span className="text-caption text-text-muted">Lifetime License</span>
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
                  <p className="text-caption font-medium text-text-muted mb-3">Included with your subscription</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      { label: 'Active Protection', icon: CheckCircleIcon },
                      { label: 'Unlimited Optimization', icon: RocketLaunchIcon },
                      { label: 'Predictive Health', icon: ArrowPathIcon },
                      { label: 'Priority Updates', icon: CloudArrowDownIcon },
                      { label: 'Background Monitoring', icon: CheckCircleIcon },
                      { label: 'Smart Optimize', icon: SparklesIcon },
                    ].map((feat) => (
                      <div key={feat.label} className="flex items-center gap-2">
                        <feat.icon className="h-4 w-4 text-brand-primary shrink-0" />
                        <span className="text-small text-text-secondary">{feat.label}</span>
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
                    <span className="text-small font-medium text-text-primary">{getEditionString()}</span>
                    <Badge tone={edition === 'free' ? 'neutral' : 'brand'}>
                      {edition.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-caption text-text-secondary">
                    Free edition: Understand your PC. Analyze, inspect, and manually improve your system.
                  </p>
                </div>
                <Button variant="primary" onClick={() => showUpgrade('Settings')} data-testid="settings-upgrade" leftIcon={<StarIcon className="h-4 w-4" />}>
                  Upgrade to Professional
                </Button>
              </div>
            )}

            {subscription && edition === 'free' && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-small border-t border-[var(--avs-border)] pt-3">
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
              <div className="text-caption font-medium text-text-muted mb-2">Feature Comparison</div>
              <div className="overflow-x-auto">
                <table className="w-full text-caption text-left">
                  <thead className="text-text-muted">
                    <tr>
                      <th className="p-2">Capability</th>
                      <th className="p-2 text-center">Free</th>
                      <th className="p-2 text-center">Professional</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Dashboard & Health Scores', free: true, pro: true },
                      { label: 'Daily Briefing', free: '1/day', pro: 'Unlimited' },
                      { label: 'Smart Optimize', free: '5/run', pro: 'Unlimited' },
                      { label: 'Junk Cleaner', free: '500 MB/run', pro: 'Unlimited' },
                      { label: 'Registry Cleaner', free: '50 issues', pro: 'Unlimited' },
                      { label: 'Startup Manager', free: '3 entries', pro: 'Unlimited' },
                      { label: 'Browser Cleaner', free: '1 browser', pro: 'All browsers' },
                      { label: 'Duplicate Finder', free: '20 files', pro: 'Unlimited' },
                      { label: 'Disk Analyzer', free: '10 files', pro: 'Unlimited' },
                      { label: 'Software Uninstaller', free: 'Manual', pro: 'Batch + cleanup' },
                      { label: 'Process Intelligence', free: 'Top 10', pro: 'Unlimited' },
                      { label: 'Hardware Center History', free: '24 hours', pro: 'Unlimited' },
                      { label: 'Predictive Health', free: '7-day', pro: 'Unlimited' },
                      { label: 'Real-Time Protection', free: 'Pro only', pro: true },
                      { label: 'Scheduled Scans', free: 'Pro only', pro: true },
                      { label: 'Automatic Optimization', free: 'Pro only', pro: true },
                      { label: 'Background Monitoring', free: 'Pro only', pro: true },
                      { label: 'Priority Support', free: 'Pro only', pro: true },
                    ].map((row) => (
                      <tr key={row.label} className="border-t border-[var(--avs-border)]">
                        <td className="p-2 text-text-secondary">{row.label}</td>
                        <td className="p-2 text-center">
                          {row.free === true ? (
                            <CheckCircleIcon className="inline h-3.5 w-3.5 text-semantic-success" />
                          ) : (
                            <span className={row.free === 'Pro only' ? 'text-text-muted italic' : 'text-text-secondary'}>{row.free}</span>
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
          <dl className="grid grid-cols-2 gap-3 text-small md:grid-cols-3">
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
                <div className="text-small font-medium text-text-primary">Check for updates automatically</div>
                <p className="text-caption text-text-secondary">Automatic update checks run every 24 hours. Use the Check Now button to check immediately.</p>
              </div>
              <Badge tone="success" data-testid="settings-auto-update-toggle">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-text-primary">Update channel</div>
                <p className="text-caption text-text-secondary">Stable channel is recommended for most users.</p>
              </div>
              <Badge tone="brand">Stable</Badge>
            </div>
          </div>
        </Card>

        {/* Telemetry disabled */}
        {/* <Card title="Telemetry" variant="glass"> ... </Card> */}

        <Card title="AVS Shield Account" variant="glass">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UserCircleIcon className="h-10 w-10 text-text-muted" aria-hidden />
              <div>
                <div className="text-small font-medium text-text-primary">
                  {customer?.display_name ?? session?.customerName ?? 'AVS Shield Customer'}
                </div>
                <div className="text-caption text-text-secondary">
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

        {/* Optimizer Entitlement disabled */}
        {/* Subscription disabled */}
        {/* Feature Engine disabled */}
        {/* Updates section disabled */}
        {/* Developer section disabled */}
        {/* Onboarding & Help disabled */}
        {/* Keyboard Shortcuts disabled */}
      </div>
    </div>
  );
}
