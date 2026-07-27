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
import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { useSyncStore } from '../sync/syncStore';
import { useAuthStore } from '../auth/authStore';
import { getVersionString, getBuildString } from '../../config/version';

export default function ActivationPage() {
  const { data: syncData, phase, isOffline, lastSyncAt, sync, error } = useSyncStore();
  const { customer, session } = useAuthStore();

  const [actionLoading, setActionLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setActionLoading(true);
    setActionSuccess(null);
    const ok = await sync();
    setActionLoading(false);
    if (ok) {
      setActionSuccess('Synced successfully from server.');
    }
  }, [sync]);

  useEffect(() => {
    if (!syncData) void sync();
  }, [syncData, sync]);

  const plan = syncData?.subscription.plan ?? 'FREE';
  const isProfessional = plan.toUpperCase() === 'PROFESSIONAL';
  const isConnected = !isOffline && phase !== 'offline';
  const serverVersion = syncData?.server_version ?? null;

  const customerName = customer?.display_name ?? session?.customerName ?? syncData?.customer?.display_name ?? '—';
  const customerEmail = customer?.email ?? session?.customerEmail ?? syncData?.customer?.email ?? '—';
  const accountStatus = customer?.account_status ?? session?.accountStatus ?? syncData?.customer?.account_status ?? 'UNKNOWN';

  const license = syncData?.license ?? null;
  const devices = syncData?.devices ?? [];
  const features = syncData?.features ?? [];
  const serverUrl = 'https://api.avsshield.com';

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
          <div>
            <div className="text-text-muted">Server</div>
            <div className="font-mono text-xs text-text-secondary mt-1">
              {serverUrl}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Server Version</div>
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
        {phase === 'syncing' && !syncData ? (
          <p className="text-sm text-text-muted">Loading subscription…</p>
        ) : error && !syncData ? (
          <div className="space-y-2">
            <p className="text-sm text-semantic-danger">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void sync()} data-testid="subscription-retry">
              Retry
            </Button>
          </div>
        ) : syncData ? (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-text-muted">Current Plan</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium text-text-primary">{syncData.subscription.plan}</span>
                <Badge tone={syncData.subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {syncData.subscription.status}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-text-muted">Expiration Date</div>
              <div className="font-medium text-text-primary mt-1">
                {syncData.subscription.expires_at
                  ? new Date(syncData.subscription.expires_at).toLocaleDateString()
                  : '—'}
              </div>
            </div>
            {features.length > 0 && (
              <div className="md:col-span-2">
                <div className="text-text-muted mb-1">Features</div>
                <div className="flex flex-wrap gap-1">
                  {features.map((f) => (
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
          {license ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
                <div>
                  <div className="text-text-muted">License Key</div>
                  <div className="font-mono text-xs text-text-secondary mt-1">
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
                <div className="rounded-md bg-semantic-success/10 px-3 py-2 text-sm text-semantic-success">
                  {actionSuccess}
                </div>
              )}

              <div className="flex items-center gap-3 border-t border-border pt-4">
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
              <p className="text-sm text-text-secondary">
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
                  {isConnected ? 'Connected' : isOffline ? 'Offline (cached)' : 'Disconnected'}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Devices */}
      {devices.length > 0 && (
        <Card title="Registered Devices">
          <div className="space-y-3">
            {devices.map((dev) => (
              <div key={dev.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                <div>
                  <div className="font-medium text-text-primary">{dev.device_name ?? 'Unnamed Device'}</div>
                  <div className="font-mono text-xs text-text-muted">{dev.device_fingerprint}</div>
                </div>
                <div className="flex items-center gap-3">
                  {dev.app_version && (
                    <span className="text-xs text-text-muted">v{dev.app_version}</span>
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
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
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
