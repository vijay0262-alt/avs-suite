/**
 * ActivationPage — license activation, deactivation, and status display.
 *
 * Displays:
 * - Current edition and license state
 * - Connection status to AVS License Server
 * - Product code (AVS_PC_OPTIMIZER) and edition from server
 * - License key input (activate)
 * - Email input
 * - Activate / Deactivate / Refresh buttons
 * - Copy license key
 * - Continue Free button
 * - Device ID, expiry, device count, last validation
 *
 * This page is self-contained and does not modify any existing pages.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { useLicense } from './LicenseContext';
import { LICENSE_STATE_LABELS } from '@avs/licensing';
import { getVersionString, getBuildString } from '../../config/version';

interface SdkInfo {
  status: {
    status: string;
    edition: string;
    expiry: string | null;
    grace_expiry: string | null;
    days_remaining: number | null;
    remaining_devices: number;
    last_validated: string | null;
    is_offline: boolean;
    message: string;
  };
  days_remaining: number | null;
  remaining_devices: number;
  offline_status: string;
  server_url: string;
  fingerprint: string;
  sdk_version: string;
  product_code: string;
  app_version: string;
}

export default function ActivationPage() {
  const {
    state,
    edition,
    isActivated,
    isInGracePeriod,
    licenseView,
    deviceId,
    activate,
    deactivate,
    refresh,
  } = useLicense();

  const [key, setKey] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sdkInfo, setSdkInfo] = useState<SdkInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchSdkInfo = useCallback(async () => {
    try {
      const info = await window.avs.license.getInfo();
      if (info) setSdkInfo(info as SdkInfo);
    } catch {
      // SDK not ready
    }
  }, []);

  useEffect(() => {
    void fetchSdkInfo();
  }, [fetchSdkInfo, state]);

  const handleActivate = async () => {
    if (!key.trim() || !email.trim()) {
      setError('Please enter both license key and email.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await activate(key.trim(), email.trim());
    setLoading(false);
    if (result.success) {
      setSuccess('License activated successfully.');
      setKey('');
      setEmail('');
      void fetchSdkInfo();
    } else {
      setError(result.error ?? 'Activation failed.');
    }
  };

  const handleDeactivate = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await deactivate();
    setLoading(false);
    if (result.success) {
      setSuccess('License deactivated. Reverted to Free edition.');
      void fetchSdkInfo();
    } else {
      setError(result.error ?? 'Deactivation failed.');
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await refresh();
    setLoading(false);
    if (result?.valid) {
      setSuccess('License validated successfully.');
      void fetchSdkInfo();
    } else if (result) {
      setError(result.reason ?? 'Validation failed.');
    } else {
      setError('Unable to refresh license.');
    }
  };

  const handleCopyKey = async () => {
    if (sdkInfo) {
      try {
        await navigator.clipboard.writeText(sdkInfo.fingerprint);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard not available
      }
    }
  };

  const stateLabel = LICENSE_STATE_LABELS[state];
  const stateTone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' =
    isActivated && !isInGracePeriod ? 'success' :
    isInGracePeriod ? 'warning' :
    state === 'expired' || state === 'invalid' || state === 'revoked' ? 'danger' :
    'neutral';

  const isConnected = sdkInfo ? !sdkInfo.status.is_offline : false;
  const productCode = sdkInfo?.product_code ?? 'AVS_PC_OPTIMIZER';
  const serverEdition = sdkInfo?.status.edition ?? edition;
  const lastValidated = sdkInfo?.status.last_validated ?? licenseView?.lastValidation;
  const serverUrl = sdkInfo?.server_url ?? '—';
  const sdkVersion = sdkInfo?.sdk_version ?? '—';
  const daysRemaining = sdkInfo?.days_remaining ?? null;
  const remainingDevices = sdkInfo?.remaining_devices ?? licenseView?.maxDevices ?? 0;
  const maxDevices = licenseView?.maxDevices ?? 0;
  const activeDevices = licenseView?.activatedDevices ?? 0;

  return (
    <div data-testid="page-license-activation" className="space-y-4">
      <PageHeader
        title="License Management"
        description="Activate, manage, or refresh your AVS PC Optimizer license."
      />

      {/* Connection Status */}
      <Card title="Server Connection">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
          <div>
            <div className="text-text-muted">Connection Status</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`h-2 w-2 rounded-full ${isConnected ? 'bg-semantic-success' : 'bg-semantic-danger'}`}
                data-testid="license-connection-indicator"
              />
              <span className="font-medium text-text-primary">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
          <div>
            <div className="text-text-muted">Server URL</div>
            <div className="font-mono text-xs text-text-secondary mt-1 truncate" title={serverUrl}>
              {serverUrl}
            </div>
          </div>
          <div>
            <div className="text-text-muted">SDK Version</div>
            <div className="font-medium text-text-primary mt-1">{sdkVersion}</div>
          </div>
        </div>
      </Card>

      {/* Current Status */}
      <Card title="Current License Status">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-text-muted">Edition</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-medium text-text-primary capitalize">{edition}</span>
              <Badge tone={stateTone}>{stateLabel}</Badge>
            </div>
          </div>
          <div>
            <div className="text-text-muted">Product Code</div>
            <div className="font-mono text-xs text-text-secondary mt-1">{productCode}</div>
          </div>
          <div>
            <div className="text-text-muted">Activated</div>
            <div className="font-medium text-text-primary mt-1">
              {isActivated ? 'Yes' : 'No'}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Server Edition</div>
            <div className="font-medium text-text-primary mt-1 capitalize">{serverEdition}</div>
          </div>
          {licenseView && (
            <>
              <div>
                <div className="text-text-muted">License ID</div>
                <div className="font-mono text-xs text-text-secondary mt-1">
                  {licenseView.licenseId}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Expiry Date</div>
                <div className="font-medium text-text-primary mt-1">
                  {licenseView.expiryDate
                    ? new Date(licenseView.expiryDate).toLocaleDateString()
                    : 'Lifetime'}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Max Devices</div>
                <div className="font-medium text-text-primary mt-1">{maxDevices}</div>
              </div>
              <div>
                <div className="text-text-muted">Activated Devices</div>
                <div className="font-medium text-text-primary mt-1">{activeDevices}</div>
              </div>
              <div>
                <div className="text-text-muted">Remaining Devices</div>
                <div className="font-medium text-text-primary mt-1">{remainingDevices}</div>
              </div>
              {daysRemaining !== null && (
                <div>
                  <div className="text-text-muted">Days Remaining</div>
                  <div className="font-medium text-text-primary mt-1">{daysRemaining}</div>
                </div>
              )}
              <div>
                <div className="text-text-muted">Email</div>
                <div className="font-medium text-text-primary mt-1">
                  {licenseView.email || '—'}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Last Validation</div>
                <div className="font-medium text-text-primary mt-1">
                  {lastValidated
                    ? new Date(lastValidated).toLocaleString()
                    : '—'}
                </div>
              </div>
              {licenseView.graceExpiry && (
                <div>
                  <div className="text-text-muted">Grace Period Ends</div>
                  <div className="font-medium text-semantic-warning mt-1">
                    {new Date(licenseView.graceExpiry).toLocaleDateString()}
                  </div>
                </div>
              )}
            </>
          )}
          <div>
            <div className="text-text-muted">Device ID</div>
            <div className="font-mono text-xs text-text-secondary mt-1">
              {deviceId ?? 'Not available'}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Version</div>
            <div className="font-medium text-text-primary mt-1">
              {getVersionString()} · {getBuildString()}
            </div>
          </div>
        </div>
        {isActivated && sdkInfo && (
          <div className="mt-4 border-t border-border pt-4">
            <Button
              variant="secondary"
              onClick={handleCopyKey}
              data-testid="license-copy-key-btn"
            >
              {copied ? '✓ Copied' : 'Copy Device ID'}
            </Button>
          </div>
        )}
      </Card>

      {/* Activation / Deactivation */}
      {!isActivated ? (
        <Card title="Activate License">
          <div className="space-y-4">
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
            {error && (
              <div className="rounded-md bg-semantic-danger/10 px-3 py-2 text-sm text-semantic-danger">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-semantic-success/10 px-3 py-2 text-sm text-semantic-success">
                {success}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={handleActivate}
                disabled={loading}
                data-testid="license-activate-btn"
              >
                {loading ? 'Activating...' : 'Activate'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setKey('');
                  setEmail('');
                  setError(null);
                  setSuccess(null);
                }}
                data-testid="license-clear-btn"
              >
                Clear
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              Don&apos;t have a license key? You can continue using the Free edition
              with basic features.
            </p>
          </div>
        </Card>
      ) : (
        <Card title="Manage License">
          <div className="space-y-4">
            {error && (
              <div className="rounded-md bg-semantic-danger/10 px-3 py-2 text-sm text-semantic-danger">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-semantic-success/10 px-3 py-2 text-sm text-semantic-success">
                {success}
              </div>
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={handleRefresh}
                disabled={loading}
                data-testid="license-refresh-btn"
              >
                {loading ? 'Refreshing...' : 'Refresh License'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleDeactivate}
                disabled={loading}
                data-testid="license-deactivate-btn"
              >
                {loading ? 'Deactivating...' : 'Deactivate'}
              </Button>
            </div>
            {isInGracePeriod && (
              <div className="rounded-md bg-semantic-warning/10 px-3 py-2 text-sm text-semantic-warning">
                Your license is in a grace period. Please renew to maintain access to Pro features.
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Continue Free */}
      <Card title="Free Edition">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">Continue with Free</div>
            <p className="text-xs text-text-secondary mt-1">
              Use basic junk cleaning, startup management, privacy cleaning, and disk analysis at no cost.
            </p>
          </div>
          <Badge tone="neutral">Active</Badge>
        </div>
      </Card>
    </div>
  );
}
