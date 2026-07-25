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
import { useLicenseStore } from '../features/license/licenseStore';
import { ArrowRightOnRectangleIcon, UserCircleIcon, ArrowPathIcon, TrashIcon } from '@heroicons/react/24/outline';

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
  const { license, activationState, validation, syncStatus, error: licenseError, lastRefreshAt, refresh: refreshLicense, clear: clearLicense } = useLicenseStore();

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
                  : 'Pro edition includes all features with priority support.'}
              </p>
            </div>
            {edition === 'free' && (
              <Button variant="primary" onClick={() => showUpgrade('Settings')} data-testid="settings-upgrade">
                Upgrade to Pro
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
              <p className="text-xs text-text-secondary">Help improve AVS PC Optimizer by sending anonymous diagnostics. Future feature.</p>
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
          title="License"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refreshLicense('optimizer')}
                loading={syncStatus === 'syncing'}
                leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                data-testid="settings-license-refresh"
              >
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearLicense()}
                leftIcon={<TrashIcon className="h-4 w-4" />}
                data-testid="settings-license-clear"
              >
                Clear Cache
              </Button>
            </div>
          }
        >
          {license ? (
            <div className="space-y-2" data-testid="settings-license-info">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-text-muted">License Key</span>
                <span className="font-mono text-text-primary">{license.license_key}</span>
                <span className="text-text-muted">Edition</span>
                <span className="text-text-primary">{license.edition}</span>
                <span className="text-text-muted">Status</span>
                <span>
                  <Badge tone={license.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {license.status}
                  </Badge>
                </span>
                <span className="text-text-muted">Issued</span>
                <span className="text-text-primary">{license.issued_at ? new Date(license.issued_at).toLocaleDateString() : '—'}</span>
                <span className="text-text-muted">Expiration</span>
                <span className="text-text-primary">{license.expires_at ? new Date(license.expires_at).toLocaleDateString() : 'Lifetime'}</span>
                <span className="text-text-muted">Activation</span>
                <span>
                  <Badge tone={activationState === 'activated' ? 'success' : activationState === 'offline' ? 'warning' : 'neutral'}>
                    {activationState}
                  </Badge>
                </span>
                <span className="text-text-muted">Last Refresh</span>
                <span className="text-text-primary">{lastRefreshAt ? new Date(lastRefreshAt).toLocaleString() : '—'}</span>
                <span className="text-text-muted">Validation</span>
                <span className="text-text-primary">{validation?.message ?? '—'}</span>
              </div>
            </div>
          ) : licenseError ? (
            <div className="space-y-2" data-testid="settings-license-error">
              <p className="text-sm text-semantic-danger">{licenseError}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void refreshLicense('optimizer')}
                data-testid="settings-license-retry"
              >
                Retry Activation
              </Button>
            </div>
          ) : syncStatus === 'syncing' ? (
            <p className="text-sm text-text-muted" data-testid="settings-license-syncing">
              Activating license…
            </p>
          ) : (
            <p className="text-sm text-text-muted" data-testid="settings-license-empty">
              No license activated yet.
            </p>
          )}
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
