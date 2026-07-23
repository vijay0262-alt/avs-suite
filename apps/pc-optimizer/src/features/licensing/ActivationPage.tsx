/**
 * ActivationPage — license activation, deactivation, and status display.
 *
 * Displays:
 * - Current edition and license state
 * - License key input (activate)
 * - Email input
 * - Activate / Deactivate / Refresh buttons
 * - Continue Free button
 * - Device ID
 * - Expiry date
 * - Current version
 *
 * This page is self-contained and does not modify any existing pages.
 */
import { useState } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { useLicense } from './LicenseContext';
import { LICENSE_STATE_LABELS } from '@avs/licensing';
import { getVersionString, getBuildString } from '../../config/version';

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
    } else if (result) {
      setError(result.reason ?? 'Validation failed.');
    } else {
      setError('Unable to refresh license.');
    }
  };

  const stateLabel = LICENSE_STATE_LABELS[state];
  const stateTone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' =
    isActivated && !isInGracePeriod ? 'success' :
    isInGracePeriod ? 'warning' :
    state === 'expired' || state === 'invalid' || state === 'revoked' ? 'danger' :
    'neutral';

  return (
    <div data-testid="page-license-activation" className="space-y-4">
      <PageHeader
        title="License Management"
        description="Activate, manage, or refresh your AVS PC Optimizer license."
      />

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
            <div className="text-text-muted">Activated</div>
            <div className="font-medium text-text-primary mt-1">
              {isActivated ? 'Yes' : 'No'}
            </div>
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
                <div className="font-medium text-text-primary mt-1">
                  {licenseView.maxDevices}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Activated Devices</div>
                <div className="font-medium text-text-primary mt-1">
                  {licenseView.activatedDevices}
                </div>
              </div>
              <div>
                <div className="text-text-muted">Email</div>
                <div className="font-medium text-text-primary mt-1">
                  {licenseView.email}
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
