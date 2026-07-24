/**
 * LicenseExpiryBanner — shows a non-intrusive warning when the license
 * has expired, is in grace period, or is about to expire.
 *
 * Does NOT crash or block the UI. Does NOT delete user data.
 * Shows actionable messages to renew or reactivate.
 */
import { useCallback } from 'react';
import { Button, Badge } from '@avs/ui';
import { useLicense } from '../features/licensing/LicenseContext';
import { useNavigate } from 'react-router-dom';

export function LicenseExpiryBanner() {
  const { state, isInGracePeriod, licenseView } = useLicense();
  const navigate = useNavigate();

  const handleRenew = useCallback(() => {
    navigate('/license');
  }, [navigate]);

  if (state === 'expired') {
    return (
      <div
        className="flex items-center justify-between rounded-md bg-semantic-danger/10 px-4 py-3"
        data-testid="license-expiry-banner"
      >
        <div className="flex items-center gap-3">
          <Badge tone="danger">Expired</Badge>
          <p className="text-sm text-semantic-danger">
            Your license has expired. Renew to continue using premium features.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleRenew} data-testid="license-expiry-renew-btn">
          Renew License
        </Button>
      </div>
    );
  }

  if (state === 'invalid' || state === 'revoked') {
    return (
      <div
        className="flex items-center justify-between rounded-md bg-semantic-danger/10 px-4 py-3"
        data-testid="license-invalid-banner"
      >
        <div className="flex items-center gap-3">
          <Badge tone="danger">{state === 'revoked' ? 'Revoked' : 'Invalid'}</Badge>
          <p className="text-sm text-semantic-danger">
            Your license is {state}. Please activate a valid license to restore premium features.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleRenew} data-testid="license-invalid-activate-btn">
          Activate License
        </Button>
      </div>
    );
  }

  if (isInGracePeriod) {
    const graceExpiry = licenseView?.graceExpiry;
    const graceText = graceExpiry
      ? `Grace period ends ${new Date(graceExpiry).toLocaleDateString()}`
      : 'Grace period active';

    return (
      <div
        className="flex items-center justify-between rounded-md bg-semantic-warning/10 px-4 py-3"
        data-testid="license-grace-banner"
      >
        <div className="flex items-center gap-3">
          <Badge tone="warning">Grace Period</Badge>
          <p className="text-sm text-semantic-warning">
            {graceText}. Premium features remain available. Please renew to avoid interruption.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleRenew} data-testid="license-grace-renew-btn">
          Renew License
        </Button>
      </div>
    );
  }

  return null;
}
