/**
 * AboutPage — displays application, SDK, and license information.
 *
 * Shows:
 * - Current Version
 * - Build
 * - SDK Version
 * - Server Version
 * - Product
 * - Edition
 * - License Status
 * - Update Channel
 */
import { useState, useEffect } from 'react';
import { Card, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { useLicense } from './LicenseContext';
import { getVersionString, getBuildString, getChannelString, getFullVersionDisplay } from '../../config/version';

interface LicenseInfo {
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

export default function AboutPage() {
  const { state, edition, isActivated, isInGracePeriod } = useLicense();
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.avs.license.getInfo()
      .then((data) => setInfo(data as LicenseInfo | null))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, []);

  const stateTone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' =
    isActivated && !isInGracePeriod ? 'success' :
    isInGracePeriod ? 'warning' :
    state === 'expired' || state === 'invalid' || state === 'revoked' ? 'danger' :
    'neutral';

  return (
    <div data-testid="page-about" className="space-y-4">
      <PageHeader
        title="About"
        description="Application version, license, and system information."
      />

      {/* Application Info */}
      <Card title="Application">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-text-muted">Product</div>
            <div className="font-medium text-text-primary mt-1">
              {info?.product_code ?? 'AVS PC Optimizer'}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Version</div>
            <div className="font-medium text-text-primary mt-1">
              {getVersionString()}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Build</div>
            <div className="font-medium text-text-primary mt-1">
              {getBuildString()}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Channel</div>
            <div className="font-medium text-text-primary mt-1">
              {getChannelString()}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Full Version</div>
            <div className="font-medium text-text-primary mt-1">
              {getFullVersionDisplay()}
            </div>
          </div>
        </div>
      </Card>

      {/* License Info */}
      <Card title="License">
        {loading ? (
          <div className="text-sm text-text-muted">Loading license information...</div>
        ) : info ? (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-text-muted">Edition</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium text-text-primary capitalize">{edition}</span>
                <Badge tone={stateTone}>{state}</Badge>
              </div>
            </div>
            <div>
              <div className="text-text-muted">Status</div>
              <div className="font-medium text-text-primary mt-1">
                {info.status.message}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Days Remaining</div>
              <div className="font-medium text-text-primary mt-1">
                {info.days_remaining ?? 'Lifetime'}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Remaining Devices</div>
              <div className="font-medium text-text-primary mt-1">
                {info.remaining_devices}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Offline Status</div>
              <div className="font-medium text-text-primary mt-1">
                {info.offline_status}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Last Validated</div>
              <div className="font-medium text-text-primary mt-1">
                {info.status.last_validated
                  ? new Date(info.status.last_validated).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-muted">No license information available.</div>
        )}
      </Card>

      {/* SDK / Server Info */}
      <Card title="Platform">
        {info ? (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-text-muted">SDK Version</div>
              <div className="font-medium text-text-primary mt-1">
                {info.sdk_version}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Server URL</div>
              <div className="font-mono text-xs text-text-secondary mt-1">
                {info.server_url}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Device Fingerprint</div>
              <div className="font-mono text-xs text-text-secondary mt-1">
                {info.fingerprint}
              </div>
            </div>
            <div>
              <div className="text-text-muted">App Version (SDK)</div>
              <div className="font-medium text-text-primary mt-1">
                {info.app_version}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-muted">Platform information unavailable.</div>
        )}
      </Card>
    </div>
  );
}
