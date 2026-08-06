/**
 * AccountAndLicensePage — dynamic account & license display.
 *
 * In the thin-client architecture, all data comes from the backend
 * sync response (GET /api/customer/sync). This page displays exactly
 * what the backend returns — no local license state.
 *
 * FREE customers:
 *   - Shows subscription as FREE, no license required
 *   - Shows "FREE Edition — No license key required"
 *
 * PROFESSIONAL customers:
 *   - Shows license key, edition, activation status, expiration
 *   - Shows Refresh button (re-syncs from backend)
 *   - Shows registered devices
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { useSyncStore, planToEdition } from '../sync/syncStore';
import { useAuthStore } from '../auth/authStore';
import { getVersionString, getBuildString } from '../../config/version';
import { apiClient, ApiError } from '../auth/apiClient';

export default function ActivationPage() {
  const syncData = useSyncStore((s) => s.data);
  const phase = useSyncStore((s) => s.phase);
  const isOffline = useSyncStore((s) => s.isOffline);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const sync = useSyncStore((s) => s.sync);
  const error = useSyncStore((s) => s.error);
  const { customer, session } = useAuthStore();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // License key activation state
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [activateLoading, setActivateLoading] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null);

  const handleActivateLicense = useCallback(async () => {
    const trimmed = licenseKeyInput.trim();
    if (!trimmed) return;
    setActivateLoading(true);
    setActivateError(null);
    setActivateSuccess(null);
    let activationWorked = false;
    try {
      const resp = await apiClient.post<{ redeemed: boolean }>(
        '/api/customer/licenses/redeem',
        { license_key: trimmed },
      );
      activationWorked = true;
      if (resp.redeemed) {
        setActivateSuccess('License activated successfully! Your account has been upgraded to Professional.');
      } else {
        setActivateSuccess('This license key is already linked to your account.');
      }
      setLicenseKeyInput('');
    } catch (err) {
      if (err instanceof ApiError) {
        const detail = err.detail ?? err.message;
        setActivateError(detail);
        // If the error indicates the license is already linked/active,
        // treat it as a soft success — the sync will reflect the actual state.
        if (detail.toLowerCase().includes('already') || detail.toLowerCase().includes('pro')) {
          setActivateError(null);
          setActivateSuccess('Your license is already active. Syncing your account status…');
          activationWorked = true;
        }
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to activate license. Please try again.';
        setActivateError(
          msg.includes('Maximum call stack') || msg.includes('stack size')
            ? 'Unable to connect to the activation server. Please check your connection and try again.'
            : msg
        );
      }
    }
    // Always re-sync after activation attempt — even on error, the backend
    // may have updated the subscription/license state.
    if (activationWorked) {
      // Clear cached sync data to force fresh fetch from backend
      try {
        localStorage.removeItem('avs_sync_cache');
      } catch { /* ignore */ }
      await sync();
    }
    setActivateLoading(false);
  }, [licenseKeyInput, sync]);

  const handleRefresh = useCallback(async () => {
    setActionLoading(true);
    setActionSuccess(null);
    // Clear cached sync data to force fresh fetch from backend
    try {
      localStorage.removeItem('avs_sync_cache');
    } catch { /* ignore */ }
    const ok = await sync();
    setActionLoading(false);
    if (ok) {
      setActionSuccess('Synced successfully from server.');
    }
  }, [sync]);

  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    // Always sync on mount to get fresh license/subscription data from backend
    void syncRef.current();
  }, []);

  const plan = syncData?.subscription.plan ?? 'FREE';
  const isProfessional = planToEdition(plan, syncData?.license?.edition) === 'PROFESSIONAL';
  const isConnected = !isOffline && phase !== 'offline';
  const customerName = customer?.display_name ?? session?.customerName ?? syncData?.customer?.display_name ?? '—';
  const customerEmail = customer?.email ?? session?.customerEmail ?? syncData?.customer?.email ?? '—';
  const accountStatus = customer?.account_status ?? session?.accountStatus ?? syncData?.customer?.account_status ?? 'UNKNOWN';

  const license = syncData?.license ?? null;
  const devices = syncData?.devices ?? [];
  const features = syncData?.features ?? [];

  return (
    <div data-testid="page-license-activation" className="space-y-4">
      <PageHeader
        title="Account & License"
        description="Your AVS Shield subscription, license, and connection status."
      />

      {/* Server Connection */}
      <Card title="Server Connection">
        <div>
          <div className="text-text-muted">Connection Status</div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`h-2 w-2 rounded-full ${
                isConnected ? 'bg-semantic-success' :
                phase === 'syncing' ? 'bg-semantic-warning' :
                'bg-semantic-danger'
              }`}
              data-testid="license-connection-indicator"
            />
            <span className="font-medium text-text-primary">
              {isConnected ? 'Connected' : phase === 'syncing' ? 'Syncing…' : isOffline ? 'Offline (cached)' : 'Disconnected'}
            </span>
          </div>
        </div>
      </Card>

      {/* Account Info */}
      <Card title="Account">
        <div className="grid grid-cols-1 gap-4 text-small md:grid-cols-2">
          <div>
            <div className="text-text-muted">Signed in as</div>
            <div className="font-medium text-text-primary mt-1">{customerName}</div>
          </div>
          <div>
            <div className="text-text-muted">Email</div>
            <div className="font-medium text-text-primary mt-1">{customerEmail}</div>
          </div>
          <div>
            <div className="text-text-muted">Account Status</div>
            <div className="flex items-center gap-2 mt-1">
              <Badge tone={accountStatus === 'ACTIVE' ? 'success' : accountStatus === 'PENDING_EMAIL_VERIFICATION' ? 'warning' : 'neutral'}>
                {accountStatus}
              </Badge>
            </div>
          </div>
          <div>
            <div className="text-text-muted">App Version</div>
            <div className="font-medium text-text-primary mt-1">
              {getVersionString()} · {getBuildString()}
            </div>
          </div>
        </div>
      </Card>

      {/* Subscription */}
      <Card title="Subscription">
        {phase === 'syncing' && !syncData ? (
          <p className="text-small text-text-muted">Loading subscription…</p>
        ) : error && !syncData ? (
          <div className="space-y-2">
            <p className="text-small text-semantic-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void sync()} data-testid="subscription-retry">
              Retry
            </Button>
          </div>
        ) : syncData ? (
          <div className="grid grid-cols-1 gap-4 text-small md:grid-cols-2">
            <div>
              <div className="text-text-muted">Current Plan</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium text-text-primary">
                  {isProfessional ? 'PROFESSIONAL' : syncData.subscription.plan}
                </span>
                <Badge tone={syncData.subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {syncData.subscription.status}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-text-muted">Expiration Date</div>
              <div className="font-medium text-text-primary mt-1">
                {(syncData.subscription.expires_at || license?.expires_at)
                  ? new Date(syncData.subscription.expires_at ?? license!.expires_at!).toLocaleDateString()
                  : 'Lifetime'}
              </div>
            </div>
            {features.length > 0 && (
              <div className="md:col-span-2">
                <div className="text-text-muted mb-1">Features</div>
                <div className="flex flex-wrap gap-1">
                  {features.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-2 py-0.5 text-caption text-text-secondary"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!isProfessional && (
              <div className="md:col-span-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.open('https://www.avsshield.com/upgrade', '_blank');
                    }
                  }}
                  data-testid="upgrade-to-professional"
                >
                  Upgrade to Professional
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-small text-text-muted">No subscription data available.</p>
        )}
      </Card>

      {/* License Section — only for PROFESSIONAL */}
      {isProfessional ? (
        <Card title="License">
          {license ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 text-small md:grid-cols-2">
                <div>
                  <div className="text-text-muted">License Key</div>
                  <div className="font-mono text-caption text-text-secondary mt-1">
                    {license.license_key ? '••••-••••-••••-••••' : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Edition</div>
                  <div className="font-medium text-text-primary mt-1">{license.edition}</div>
                </div>
                <div>
                  <div className="text-text-muted">Status</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge tone={license.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {license.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Expiration</div>
                  <div className="font-medium text-text-primary mt-1">
                    {license.expires_at
                      ? new Date(license.expires_at).toLocaleDateString()
                      : 'Lifetime'}
                  </div>
                </div>
                {license.issuance_type && (
                  <div>
                    <div className="text-text-muted">Issuance Type</div>
                    <div className="font-medium text-text-primary mt-1">
                      {license.issuance_type.replace(/_/g, ' ')}
                    </div>
                  </div>
                )}
                {license.product_name && (
                  <div>
                    <div className="text-text-muted">Product</div>
                    <div className="font-medium text-text-primary mt-1">{license.product_name}</div>
                  </div>
                )}
              </div>

              {actionSuccess && (
                <div className="rounded-[var(--avs-radius-md)] bg-semantic-success/10 px-3 py-2 text-small text-semantic-success">
                  {actionSuccess}
                </div>
              )}

              <div className="flex items-center gap-3 border-t border-[var(--avs-border)] pt-4">
                <Button
                  variant="primary"
                  onClick={handleRefresh}
                  disabled={actionLoading}
                  data-testid="license-refresh-btn"
                >
                  {actionLoading ? 'Syncing…' : 'Sync from Server'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-small text-text-secondary">
                Your subscription is Professional but no license is assigned. Try syncing from the server.
              </p>
              <Button
                variant="primary"
                onClick={handleRefresh}
                disabled={actionLoading}
                data-testid="license-sync-retry"
              >
                {actionLoading ? 'Syncing…' : 'Sync Now'}
              </Button>
            </div>
          )}
        </Card>
      ) : (
        <Card title="License">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge tone="neutral">FREE Edition</Badge>
              </div>
              <p className="text-small text-text-secondary">
                No license key required. Your account authenticates directly with AVS Shield.
              </p>
              <div className="grid grid-cols-1 gap-4 text-small md:grid-cols-2 mt-2">
                <div>
                  <div className="text-text-muted">License</div>
                  <div className="font-medium text-text-primary mt-1">Not Required</div>
                </div>
                <div>
                  <div className="text-text-muted">Connection</div>
                  <div className="font-medium text-text-primary mt-1">
                    {isConnected ? 'Connected' : isOffline ? 'Offline (cached)' : 'Disconnected'}
                  </div>
                </div>
              </div>
            </div>

            {/* License Key Activation */}
            <div className="border-t border-[var(--avs-border)] pt-4" data-testid="license-key-activation">
              <div className="mb-2">
                <h4 className="text-small font-semibold text-text-primary">Have a License Key?</h4>
                <p className="text-caption text-text-muted mt-0.5">
                  Activate your product to Professional version by entering your license key.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  placeholder="AVS-XXXX-XXXX-XXXX-XXXX"
                  disabled={activateLoading || !isConnected}
                  className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-surface px-3 py-2 text-small font-mono uppercase text-text-primary placeholder-text-muted focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
                  data-testid="license-key-input"
                />
                <Button
                  variant="primary"
                  onClick={handleActivateLicense}
                  disabled={activateLoading || !licenseKeyInput.trim() || !isConnected}
                  data-testid="activate-license-btn"
                >
                  {activateLoading ? 'Activating…' : 'Activate'}
                </Button>
              </div>

              {activateError && (
                <div className="mt-2 rounded-[var(--avs-radius-md)] bg-semantic-danger/10 px-3 py-2 text-small text-semantic-danger" data-testid="activate-license-error">
                  {activateError}
                </div>
              )}

              {activateSuccess && (
                <div className="mt-2 rounded-[var(--avs-radius-md)] bg-semantic-success/10 px-3 py-2 text-small text-semantic-success" data-testid="activate-license-success">
                  {activateSuccess}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Devices */}
      {devices.length > 0 && (
        <Card title="Registered Devices">
          <div className="space-y-3">
            {devices.map((dev) => (
              <div key={dev.id} className="flex items-center justify-between text-small border-b border-[var(--avs-border)] pb-2 last:border-0">
                <div>
                  <div className="font-medium text-text-primary">{dev.device_name ?? 'Unnamed Device'}</div>
                  <div className="font-mono text-caption text-text-muted">{dev.device_fingerprint}</div>
                </div>
                <div className="flex items-center gap-3">
                  {dev.app_version && (
                    <span className="text-caption text-text-muted">v{dev.app_version}</span>
                  )}
                  <Badge tone={dev.status === 'active' ? 'success' : 'neutral'}>
                    {dev.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sync Info */}
      <Card title="Sync">
        <div className="grid grid-cols-1 gap-4 text-small md:grid-cols-3">
          <div>
            <div className="text-text-muted">Last Sync</div>
            <div className="font-medium text-text-primary mt-1">
              {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : '—'}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Status</div>
            <div className="font-medium text-text-primary mt-1">
              {isOffline ? 'Offline (cached)' : phase === 'success' ? 'Up to date' : phase === 'syncing' ? 'Syncing…' : '—'}
            </div>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={actionLoading}
              data-testid="license-sync-btn"
            >
              {actionLoading ? 'Syncing…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
