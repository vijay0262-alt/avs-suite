import { Card, Button, Badge, GaugeCard, StatTile } from '@avs/ui';
import { useTheme } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import type { ThemeMode } from '@avs/shared/types';
import { useEffect, useState, useCallback } from 'react';
import { useEdition } from '../config/EditionManager';
import { getVersionString, getBuildString, getEditionString } from '../config/version';
import { useUpgradeDialog } from '../components/UpgradeDialog';
import { useAuthStore } from '../features/auth/authStore';
import { useSubscriptionStore } from '../features/subscription/subscriptionStore';
import { ArrowRightOnRectangleIcon, UserCircleIcon, ArrowPathIcon, StarIcon, CheckCircleIcon, CloudArrowDownIcon, RocketLaunchIcon, SparklesIcon, DevicePhoneMobileIcon, CpuChipIcon, Cog6ToothIcon, CircleStackIcon } from '@heroicons/react/24/outline';
import { useTraySettings } from '../hooks/useTraySettings';
import { useScheduledCleanup } from '../features/scheduled-cleanup/useScheduledCleanup';
import { useJunkMonitor } from '../features/scheduled-cleanup/useJunkMonitor';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';

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

export default function SettingsPage() {
  const { mode, setMode } = useTheme();
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const { settings: traySettings, startupEnabled, loading: trayLoading, updateSettings: updateTray, enableStartup, disableStartup } = useTraySettings();
  const { customer, session, logout } = useAuthStore();
  const subscription = useSubscriptionStore((s) => s.subscription);
  const { settings: schedSettings, loading: schedLoading, saving: schedSaving, saveSettings: saveSchedSettings } = useScheduledCleanup();
  const { status: junkStatus } = useJunkMonitor();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pingStatus, setPingStatus] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    // Sync dev mode state from localStorage
    const syncDevMode = () => {
      try {
        const stored = typeof window !== 'undefined' && window.localStorage.getItem(DEV_STORAGE_KEY) === 'true';
        // devMode state is read by the tray settings hook
        if (stored) {
          document.documentElement.setAttribute('data-dev-mode', 'true');
        } else {
          document.documentElement.removeAttribute('data-dev-mode');
        }
      } catch {
        // ignore
      }
    };
    syncDevMode();
    const onStorage = (e: StorageEvent) => {
      if (e.key === DEV_STORAGE_KEY) syncDevMode();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <div data-testid="page-settings">
      <PageHeader
        title="Settings"
        description="Customize appearance, updates, and app preferences."
        actions={<HelpButton text="Change the app's appearance, manage updates, review your subscription, and access account information. Changes are saved automatically." />}
      />

      {/* Hero status section — System Mechanic style */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="settings-hero-section">
        {/* Gauge */}
        <GaugeCard
          title={edition === 'professional' ? 'Professional' : 'Free Edition'}
          value={edition === 'professional' ? 100 : 30}
          unit=""
          tone={edition === 'professional' ? 'success' : 'brand'}
          icon={<Cog6ToothIcon className="h-6 w-6" />}
          description={edition === 'professional' ? 'All features active' : 'Limited features'}
          data-testid="settings-hero-gauge"
        />

        {/* Key stats */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <StatTile
            label="Version"
            value={getVersionString()}
            hint={`Build ${getBuildString()}`}
            icon={<CircleStackIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Theme"
            value={mode}
            hint="Appearance"
            icon={<SparklesIcon className="h-5 w-5" />}
            variant="glass"
          />
          <StatTile
            label="Startup"
            value={startupEnabled ? 'Enabled' : 'Disabled'}
            hint="Start with Windows"
            icon={<RocketLaunchIcon className="h-5 w-5" />}
            variant="glass"
            accentColor={startupEnabled ? 'var(--avs-success)' : undefined}
          />
          <StatTile
            label="Account"
            value={customer?.display_name ?? session?.customerName ?? '—'}
            hint={customer?.email ?? session?.customerEmail ?? '—'}
            icon={<UserCircleIcon className="h-5 w-5" />}
            variant="glass"
          />
        </div>
      </div>

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
              <div className="text-small font-medium text-text-primary mb-2">When closing AVS AI Shield</div>
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
                    <p className="text-caption text-text-muted">Closing the window exits AVS AI Shield. Protection stops.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Start with Windows */}
            <div className="border-t border-[var(--avs-border)] pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-small font-medium text-text-primary">Start AVS AI Shield with Windows</div>
                  <p className="text-caption text-text-secondary">
                    {edition === 'professional'
                      ? 'Launch AVS AI Shield automatically when Windows starts. Protection begins immediately.'
                      : 'Professional feature. Enable to start AVS AI Shield with Windows for continuous protection.'}
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

        {/* ── Scheduled Cleaning ─────────────────────────────── */}
        <Card title="Scheduled Cleaning" variant="glass" data-testid="settings-scheduled-cleanup">
          <div className="space-y-4">
            {edition === 'free' && (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-small font-medium text-text-primary">Automatic Cleanup Schedule</div>
                  <p className="text-caption text-text-secondary">
                    Professional feature. Schedule automatic cleanup when your PC is idle — no manual scanning needed.
                  </p>
                </div>
                <Button variant="primary" onClick={() => showUpgrade('Scheduled Cleaning')} leftIcon={<StarIcon className="h-4 w-4" />} data-testid="scheduled-cleanup-upgrade">
                  Upgrade
                </Button>
              </div>
            )}
            {edition === 'professional' && (
              <>
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-small font-medium text-text-primary">Enable Scheduled Cleanup</div>
                    <p className="text-caption text-text-secondary">Automatically clean junk files on a schedule.</p>
                  </div>
                  <button
                    onClick={() => saveSchedSettings({ scheduled_cleanup_enabled: !schedSettings.scheduled_cleanup_enabled })}
                    disabled={schedSaving || schedLoading}
                    className={`relative h-6 w-11 rounded-full transition-colors ${schedSettings.scheduled_cleanup_enabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'}`}
                    data-testid="scheduled-cleanup-toggle"
                  >
                    <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${schedSettings.scheduled_cleanup_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {schedSettings.scheduled_cleanup_enabled && (
                  <div className="border-t border-[var(--avs-border)] pt-4 space-y-4">
                    {/* Frequency */}
                    <div>
                      <div className="text-small font-medium text-text-primary mb-2">Frequency</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: 'daily', label: 'Daily' },
                          { id: 'weekly', label: 'Weekly' },
                          { id: 'on_idle', label: 'When PC is Idle' },
                        ].map((opt) => (
                          <Button
                            key={opt.id}
                            variant={schedSettings.scheduled_cleanup_frequency === opt.id ? 'primary' : 'secondary'}
                            onClick={() => saveSchedSettings({ scheduled_cleanup_frequency: opt.id })}
                            disabled={schedSaving}
                            data-testid={`scheduled-cleanup-freq-${opt.id}`}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Time (for daily/weekly) */}
                    {schedSettings.scheduled_cleanup_frequency !== 'on_idle' && (
                      <div>
                        <div className="text-small font-medium text-text-primary mb-2">Time</div>
                        <input
                          type="time"
                          value={schedSettings.scheduled_cleanup_time}
                          onChange={(e) => saveSchedSettings({ scheduled_cleanup_time: e.target.value })}
                          disabled={schedSaving}
                          className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary"
                          data-testid="scheduled-cleanup-time"
                        />
                      </div>
                    )}

                    {/* Day (for weekly) */}
                    {schedSettings.scheduled_cleanup_frequency === 'weekly' && (
                      <div>
                        <div className="text-small font-medium text-text-primary mb-2">Day of Week</div>
                        <div className="flex flex-wrap gap-2">
                          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
                            <Button
                              key={d}
                              variant={schedSettings.scheduled_cleanup_day === d ? 'primary' : 'secondary'}
                              onClick={() => saveSchedSettings({ scheduled_cleanup_day: d })}
                              disabled={schedSaving}
                              data-testid={`scheduled-cleanup-day-${d}`}
                            >
                              {d}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Junk Monitor */}
                <div className="border-t border-[var(--avs-border)] pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-small font-medium text-text-primary">Junk Accumulation Monitor</div>
                      <p className="text-caption text-text-secondary">
                        Get notified when junk files exceed a threshold.
                        {junkStatus && junkStatus.total_bytes > 0 && (
                          <span className="block mt-1 text-text-muted">
                            Current: {(junkStatus.total_gb).toFixed(2)} GB detected
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => saveSchedSettings({ junk_monitor_enabled: !schedSettings.junk_monitor_enabled })}
                      disabled={schedSaving || schedLoading}
                      className={`relative h-6 w-11 rounded-full transition-colors ${schedSettings.junk_monitor_enabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'}`}
                      data-testid="junk-monitor-toggle"
                    >
                      <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${schedSettings.junk_monitor_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

                {schedSettings.junk_monitor_enabled && (
                  <div className="border-t border-[var(--avs-border)] pt-4">
                    <div className="text-small font-medium text-text-primary mb-2">Notify when junk exceeds</div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="0.5"
                        max="10"
                        step="0.5"
                        value={schedSettings.junk_monitor_threshold_gb}
                        onChange={(e) => saveSchedSettings({ junk_monitor_threshold_gb: parseFloat(e.target.value) })}
                        disabled={schedSaving}
                        className="flex-1 accent-[var(--avs-brand-primary)]"
                        data-testid="junk-monitor-threshold"
                      />
                      <span className="text-small font-medium text-text-primary tabular-nums w-16 text-right">
                        {schedSettings.junk_monitor_threshold_gb} GB
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
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
                    <h3 className="text-section-title text-text-primary">AVS AI Shield Professional</h3>
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
                      { label: 'AI Active Protection', icon: CheckCircleIcon },
                      { label: 'AI Smart Optimization', icon: RocketLaunchIcon },
                      { label: 'AI Predictive Health', icon: ArrowPathIcon },
                      { label: 'AI Process Intelligence', icon: CpuChipIcon },
                      { label: 'AI Hardware Intelligence', icon: CloudArrowDownIcon },
                      { label: 'Real-Time Protection & Scans', icon: CheckCircleIcon },
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
                      { label: 'AI Active Protection', free: '—', pro: true },
                      { label: 'AI Smart Optimization', free: 'Limited', pro: true },
                      { label: 'AI Predictive Health', free: '7-day history', pro: true },
                      { label: 'AI Process Intelligence', free: 'Top 10 only', pro: true },
                      { label: 'AI Hardware Intelligence', free: true, pro: true },
                      { label: 'Real-Time Threat Protection', free: '—', pro: true },
                      { label: 'Junk Cleaner', free: '500 MB/run', pro: 'Unlimited' },
                      { label: 'Registry Cleaner', free: '50 issues/run', pro: 'Unlimited' },
                      { label: 'Startup Manager', free: '3 entries', pro: 'Unlimited' },
                      { label: 'Browser Cleaner', free: '1 browser', pro: 'All browsers' },
                      { label: 'Duplicate Finder', free: '20 files', pro: 'Unlimited' },
                      { label: 'Disk Analyzer', free: '10 files', pro: 'Unlimited' },
                      { label: 'Large Files Finder', free: true, pro: true },
                      { label: 'Software Uninstaller', free: 'Manual', pro: 'Batch + cleanup' },
                      { label: 'Scheduled Scans & Auto-Care', free: '—', pro: true },
                      { label: 'Privacy Score', free: 'Basic', pro: 'Advanced' },
                      { label: 'Game / Movie Mode', free: '—', pro: true },
                      { label: 'AI Assistant & Help Center', free: true, pro: true },
                      { label: 'Priority Support', free: '—', pro: true },
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

        <Card title="AVS AI Shield Account" variant="glass">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <UserCircleIcon className="h-10 w-10 text-text-muted shrink-0" aria-hidden />
              <div className="min-w-0 overflow-hidden">
                <div className="text-small font-medium text-text-primary truncate" title={customer?.display_name ?? session?.customerName ?? ''}>
                  {customer?.display_name ?? session?.customerName ?? 'AVS AI Shield Customer'}
                </div>
                <div className="text-caption text-text-secondary truncate" title={customer?.email ?? session?.customerEmail ?? ''}>
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

          {edition === 'professional' && (
            <DeviceManagement />
          )}
        </Card>

        {/* Optimizer Entitlement disabled */}
        {/* Subscription disabled */}
        {/* Feature Engine disabled */}

        {/* Updates */}
        <Card title="App Updates" variant="glass">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-text-primary">Check for updates</div>
                <p className="text-caption text-text-secondary">
                  Check if a new version of AVS AI Shield is available.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    const { useUpdateStore } = await import('../features/update/updateStore');
                    await useUpdateStore.getState().checkForUpdates('optimizer');
                  } catch { /* ignore */ }
                }}
                data-testid="settings-check-updates-btn"
              >
                Check Now
              </Button>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
              <div>
                <div className="text-small font-medium text-text-primary">Auto-update</div>
                <p className="text-caption text-text-secondary">
                  Automatically download and install updates when available.
                </p>
              </div>
              <button
                onClick={() => {
                  const newVal = !(typeof window !== 'undefined' && window.localStorage.getItem('avs-auto-update') === 'true');
                  try {
                    if (newVal) window.localStorage.setItem('avs-auto-update', 'true');
                    else window.localStorage.removeItem('avs-auto-update');
                  } catch { /* ignore */ }
                  forceUpdate((v) => v + 1);
                }}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  (typeof window !== 'undefined' && window.localStorage.getItem('avs-auto-update') === 'true') ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="auto-update-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${(typeof window !== 'undefined' && window.localStorage.getItem('avs-auto-update') === 'true') ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
        </Card>

        {/* Advanced Settings toggle */}
        <div className="pt-2">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-caption text-text-secondary hover:text-text-primary transition-colors"
          >
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>
        </div>

        {/* Developer — hidden behind advanced toggle to keep UI clean */}
        {showAdvanced && (
        <Card title="Developer" variant="glass">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-text-primary">Debug mode</div>
                <p className="text-caption text-text-secondary">
                  Enable verbose logging and RPC diagnostics for troubleshooting.
                </p>
              </div>
              <button
                onClick={() => {
                  const newVal = !(typeof window !== 'undefined' && window.localStorage.getItem('avs-debug-mode') === 'true');
                  try {
                    if (newVal) window.localStorage.setItem('avs-debug-mode', 'true');
                    else window.localStorage.removeItem('avs-debug-mode');
                  } catch { /* ignore */ }
                  forceUpdate((v) => v + 1);
                }}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  (typeof window !== 'undefined' && window.localStorage.getItem('avs-debug-mode') === 'true') ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="debug-mode-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${(typeof window !== 'undefined' && window.localStorage.getItem('avs-debug-mode') === 'true') ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
              <div>
                <div className="text-small font-medium text-text-primary">Backend RPC ping</div>
                <p className="text-caption text-text-secondary">
                  Test the connection to the AVS AI Shield backend.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {pingStatus && (
                  <span className={`text-caption ${pingStatus.includes('responding') ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                    {pingStatus}
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    setPingStatus('Pinging…');
                    try {
                      const res = await rpc.raw<{ pong: boolean }>(RPC_METHODS.SYSTEM_PING);
                      setPingStatus(res?.pong ? 'Backend is responding' : 'Backend responded but no pong');
                    } catch {
                      setPingStatus('Backend ping failed.');
                    }
                  }}
                  data-testid="settings-rpc-ping-btn"
                >
                  Ping Backend
                </Button>
              </div>
            </div>
          </div>
        </Card>
        )}

        {/* Keyboard Shortcuts disabled */}
      </div>
    </div>
  );
}

// ── Device Management ─────────────────────────────────────────

function DeviceManagement() {
  const [devices, setDevices] = useState<Array<{ device_name: string; device_fingerprint: string; is_current: boolean; last_seen: string | null; activated_at: string | null }>>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [devRes, remRes] = await Promise.all([
        rpc.raw<{ devices?: typeof devices; max_devices?: number }>(RPC_METHODS.LICENSE_LIST_DEVICES),
        rpc.raw<{ remaining_devices: number }>(RPC_METHODS.LICENSE_REMAINING_DEVICES),
      ]);
      setDevices(devRes.devices || []);
      setRemaining(remRes.remaining_devices ?? 0);
    } catch {
      setError('Could not load device information. Please try again.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDeactivate = async (fingerprint: string, name: string) => {
    if (!confirm(`Deactivate "${name}"? This will free up a device slot.`)) return;
    setDeactivating(fingerprint);
    try {
      await rpc.raw(RPC_METHODS.LICENSE_DEACTIVATE_DEVICE, { device_fingerprint: fingerprint });
      refresh();
    } catch {
      setError('Could not deactivate the device. Please try again.');
    }
    setDeactivating(null);
  };

  return (
    <div className="border-t border-[var(--avs-border)] pt-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-small font-medium text-text-primary">Device Management</div>
          <p className="text-caption text-text-secondary">
            Manage devices activated under your Professional license.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} data-testid="settings-list-devices">
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <p className="text-caption text-semantic-danger mb-2">{error}</p>
      )}

      {remaining !== null && (
        <p className="text-caption text-text-muted mb-3">
          {remaining} device slot{remaining !== 1 ? 's' : ''} remaining
        </p>
      )}

      {devices.length > 0 ? (
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.device_fingerprint} className="flex items-center gap-2 py-2 px-3 rounded border border-[var(--avs-border)]">
              <DevicePhoneMobileIcon className="h-5 w-5 text-text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-small text-text-primary truncate">
                  {d.device_name}
                  {d.is_current && <span className="text-caption text-brand-primary ml-2">(This PC)</span>}
                </div>
                <div className="text-caption text-text-muted">
                  {d.last_seen ? `Last seen: ${new Date(d.last_seen).toLocaleDateString()}` : 'Never seen'}
                  {d.activated_at && ` · Activated: ${new Date(d.activated_at).toLocaleDateString()}`}
                </div>
              </div>
              {!d.is_current && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeactivate(d.device_fingerprint, d.device_name)}
                  disabled={deactivating === d.device_fingerprint}
                  data-testid={`deactivate-device-${d.device_fingerprint}`}
                >
                  {deactivating === d.device_fingerprint ? '...' : 'Deactivate'}
                </Button>
              )}
            </div>
          ))}
        </div>
      ) : !loading && !error ? (
        <p className="text-caption text-text-muted">No devices found.</p>
      ) : null}
    </div>
  );
}
