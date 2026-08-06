/**
 * LicenseExpiryBanner — shows a non-intrusive warning when the license
 * has expired, is in grace period, or is about to expire.
 *
 * In the thin-client architecture, license status comes from the
 * backend sync response. This banner reads from the syncStore.
 */
import { useCallback } from 'react';
import { Button, Badge } from '@avs/ui';
import { useSyncStore } from '../features/sync/syncStore';
import { useNavigate } from 'react-router-dom';

export function LicenseExpiryBanner() {
  const { data: syncData, isOffline } = useSyncStore();
  const navigate = useNavigate();

  const handleRenew = useCallback(() => {
    navigate('/license');
  }, [navigate]);

  const license = syncData?.license;
  if (!license) return null;

  const licenseStatus = license.status.toUpperCase();

  if (licenseStatus === 'EXPIRED') {
    return (
      <div
        className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-semantic-danger/10 px-4 py-3"
        data-testid="license-expiry-banner"
      >
        <div className="flex items-center gap-3">
          <Badge tone="danger">Expired</Badge>
          <p className="text-small text-semantic-danger">
            Your license has expired. Renew to continue using premium features.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleRenew} data-testid="license-expiry-renew-btn">
          Renew License
        </Button>
      </div>
    );
  }

  if (licenseStatus === 'REVOKED' || licenseStatus === 'INVALID') {
    return (
      <div
        className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-semantic-danger/10 px-4 py-3"
        data-testid="license-invalid-banner"
      >
        <div className="flex items-center gap-3">
          <Badge tone="danger">{licenseStatus === 'REVOKED' ? 'Revoked' : 'Invalid'}</Badge>
          <p className="text-small text-semantic-danger">
            Your license is {licenseStatus.toLowerCase()}. Please contact support to restore premium features.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleRenew} data-testid="license-invalid-activate-btn">
          Go to License
        </Button>
      </div>
    );
  }

  if (isOffline && syncData?.subscription.expires_at) {
    const expiry = new Date(syncData.subscription.expires_at);
    const now = new Date();
    if (expiry < now) {
      return (
        <div
          className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-semantic-warning/10 px-4 py-3"
          data-testid="license-grace-banner"
        >
          <div className="flex items-center gap-3">
            <Badge tone="warning">Offline</Badge>
            <p className="text-small text-semantic-warning">
              Your subscription expired on {expiry.toLocaleDateString()}. Reconnect to sync your license status.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={handleRenew} data-testid="license-grace-renew-btn">
            Go to License
          </Button>
        </div>
      );
    }
  }

  return null;
}
