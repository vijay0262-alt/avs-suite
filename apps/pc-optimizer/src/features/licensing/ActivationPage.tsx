/**
 * AccountAndLicensePage — dynamic account & license display.
 *
 * Replaces the old static ActivationPage. The backend is the single
 * source of truth — this page displays exactly what the API returns.
 *
 * FREE customers:
 *   - Shows subscription as FREE, no license required
 *   - Hides license key input, activate button, refresh button
 *   - Shows "FREE Edition — No license key required"
 *
 * PROFESSIONAL customers:
 *   - Shows license key, edition, activation status, expiration
 *   - Shows Refresh License button
 *   - Activate License only appears if no Professional license exists
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { useLicense } from './LicenseContext';
import { useAuthStore } from '../auth/authStore';
import { useSubscriptionStore } from '../subscription/subscriptionStore';
import { getVersionString, getBuildString } from '../../config/version';

export default function ActivationPage() {
  const {
    isActivated,
    isInGracePeriod,
    licenseView,
    deviceId,
    activate,
    deactivate,
    refresh,
  } = useLicense();

  const { customer, session } = useAuthStore();
  const { subscription, loading, error, lastSyncAt, connectionStatus, serverVersion, serverUrl, sync, checkConnection } = useSubscriptionStore();

  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    await Promise.all([sync(), checkConnection()]);
  }, [sync, checkConnection]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleActivate = async () => {
    if (!key.trim() || !email.trim()) {
      setActionError('Please enter both license key and email.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await activate(key.trim(), email.trim());
    setActionLoading(false);
    if (result.success) {
      setActionSuccess('License activated successfully.');
      setKey('');
      setEmail('');
      void sync();
    } else {
      setActionError(result.error ?? 'Activation failed.');
    }
  };

  const handleDeactivate = async () => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await deactivate();
    setActionLoading(false);
    if (result.success) {
      setActionSuccess('License deactivated. Reverted to Free edition.');
      void sync();
    } else {
      setActionError(result.error ?? 'Deactivation failed.');
    }
  };

  const handleRefresh = async () => {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const result = await refresh();
    setActionLoading(false);
    if (result?.valid) {
      setActionSuccess('License validated successfully.');
      void sync();
    } else if (result) {
      setActionError(result.reason ?? 'Validation failed.');
    } else {
      setActionError('Unable to refresh license.');
    }
  };

  const plan = subscription?.plan ?? 'FREE';
  const isProfessional = plan.toUpperCase() === 'PROFESSIONAL';
  const isConnected = connectionStatus === 'connected';

  const customerName = customer?.display_name ?? session?.customerName ?? '—';
  const customerEmail = customer?.email ?? session?.customerEmail ?? '—';
  const accountStatus = customer?.account_status ?? session?.accountStatus ?? 'UNKNOWN';

  return (
    <div data-testid="page-license-activation" className="space-y-4">
      <PageHeader
        title="Account & License"
        description="Your AVS Shield subscription, license, and connection status."
      />

      {/* Server Connection */}
      <Card title="Server Connection">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-text-muted">Connection Status</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`h-2 w-2 rounded-full ${
                  isConnected ? 'bg-semantic-success' :
                  connectionStatus === 'checking' ? 'bg-semantic-warning' :
                  'bg-semantic-danger'
                }`}
                data-testid="license-connection-indicator"
              />
              <span className="font-medium text-text-primary">
                {isConnected ? 'Connected' : connectionStatus === 'checking' ? 'Checking…' : 'Disconnected'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-text-muted">Server</div>
            <div className="font-mono text-xs text-text-secondary mt-1">
              {serverUrl}
            </div>
          </div>
          <div>
            <div className="text-text-muted">API Version</div>
            <div className="font-medium text-text-primary mt-1">
              {serverVersion ? `v${serverVersion}` : '—'}
            </div>
          </div>
        </div>
      </Card>

      {/* Account Info */}
      <Card title="Account">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
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
        {loading && !subscription ? (
          <p className="text-sm text-text-muted">Loading subscription…</p>
        ) : error && !subscription ? (
          <div className="space-y-2">
            <p className="text-sm text-semantic-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void sync()} data-testid="subscription-retry">
              Retry
            </Button>
          </div>
        ) : subscription ? (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-text-muted">Current Plan</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium text-text-primary">{subscription.plan}</span>
                <Badge tone={subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {subscription.status}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-text-muted">Expiration Date</div>
              <div className="font-medium text-text-primary mt-1">
                {subscription.expires_at
                  ? new Date(subscription.expires_at).toLocaleDateString()
                  : '—'}
              </div>
            </div>
            {subscription.features.length > 0 && (
              <div className="md:col-span-2">
                <div className="text-text-muted mb-1">Features</div>
                <div className="flex flex-wrap gap-1">
                  {subscription.features.map((f) => (
                    <span
                      key={f}
                      className="inline-flex items-center rounded-md bg-surface-muted px-2 py-0.5 text-xs text-text-secondary"
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
          <p className="text-sm text-text-muted">No subscription data available.</p>
        )}
      </Card>

      {/* License Section — only for PROFESSIONAL */}
      {isProfessional ? (
        <Card title="License">
          {isActivated && licenseView ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                <div>
                  <div className="text-text-muted">License Key</div>
                  <div className="font-mono text-xs text-text-secondary mt-1">
                    {licenseView.hasKey ? '••••-••••-••••-••••' : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Edition</div>
                  <div className="font-medium text-text-primary mt-1">PROFESSIONAL</div>
                </div>
                <div>
                  <div className="text-text-muted">Activated</div>
                  <div className="font-medium text-text-primary mt-1">
                    {isActivated ? 'Yes' : 'No'}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted">Expiration</div>
                  <div className="font-medium text-text-primary mt-1">
                    {licenseView.expiryDate
                      ? new Date(licenseView.expiryDate).toLocaleDateString()
                      : 'Lifetime'}
                  </div>
                </div>
                {licenseView.maxDevices > 0 && (
                  <div>
                    <div className="text-text-muted">Devices</div>
                    <div className="font-medium text-text-primary mt-1">
                      {licenseView.activatedDevices} / {licenseView.maxDevices}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-text-muted">Device ID</div>
                  <div className="font-mono text-xs text-text-secondary mt-1">
                    {deviceId && deviceId !== 'pending-device-id' ? deviceId : 'Acquiring...'}
                  </div>
                </div>
              </div>

              {actionError && (
                <div className="rounded-md bg-semantic-danger/10 px-3 py-2 text-sm text-semantic-danger">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="rounded-md bg-semantic-success/10 px-3 py-2 text-sm text-semantic-success">
                  {actionSuccess}
                </div>
              )}
              {isInGracePeriod && (
                <div className="rounded-md bg-semantic-warning/10 px-3 py-2 text-sm text-semantic-warning">
                  Your license is in a grace period. Please renew to maintain access to Professional features.
                </div>
              )}

              <div className="flex items-center gap-3 border-t border-border pt-4">
                <Button
                  variant="primary"
                  onClick={handleRefresh}
                  disabled={actionLoading}
                  data-testid="license-refresh-btn"
                >
                  {actionLoading ? 'Refreshing…' : 'Refresh License'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleDeactivate}
                  disabled={actionLoading}
                  data-testid="license-deactivate-btn"
                >
                  {actionLoading ? 'Deactivating…' : 'Deactivate'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                Your subscription is Professional but no license is activated on this device.
                Enter your license key below to activate.
              </p>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  License Key
                </label>
                <input
                  type="text"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-brand-primary focus:outline-none"
                  data-testid="license-key-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:border-brand-primary focus:outline-none"
                  data-testid="license-email-input"
                />
              </div>
              {actionError && (
                <div className="rounded-md bg-semantic-danger/10 px-3 py-2 text-sm text-semantic-danger">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="rounded-md bg-semantic-success/10 px-3 py-2 text-sm text-semantic-success">
                  {actionSuccess}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={handleActivate}
                  disabled={actionLoading}
                  data-testid="license-activate-btn"
                >
                  {actionLoading ? 'Activating…' : 'Activate License'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setKey('');
                    setEmail('');
                    setActionError(null);
                    setActionSuccess(null);
                  }}
                  data-testid="license-clear-btn"
                >
                  Clear
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card title="License">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge tone="neutral">FREE Edition</Badge>
            </div>
            <p className="text-sm text-text-secondary">
              No license key required. Your account authenticates directly with AVS Shield.
            </p>
            <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 mt-2">
              <div>
                <div className="text-text-muted">License</div>
                <div className="font-medium text-text-primary mt-1">Not Required</div>
              </div>
              <div>
                <div className="text-text-muted">Connection</div>
                <div className="font-medium text-text-primary mt-1">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Server</div>
                <div className="font-mono text-xs text-text-secondary mt-1">{serverUrl}</div>
              </div>
              <div>
                <div className="text-text-muted">Device</div>
                <div className="font-medium text-text-primary mt-1">
                  {deviceId && deviceId !== 'pending-device-id' ? 'Registered' : 'Acquiring...'}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Sync Info */}
      <Card title="Sync">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-text-muted">Last Sync</div>
            <div className="font-medium text-text-primary mt-1">
              {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : '—'}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Server</div>
            <div className="font-mono text-xs text-text-secondary mt-1">{serverUrl}</div>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchAll()}
              disabled={loading}
              data-testid="license-sync-btn"
            >
              {loading ? 'Syncing…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
