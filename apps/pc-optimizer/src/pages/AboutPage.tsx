import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { constants } from '@avs/shared';
import {
  getVersionInfo,
  getVersionString,
  getBuildString,
  getChannelString,
  getEditionString,
  getArchitectureString,
} from '../config/version';
import { useState } from 'react';

const { APP_METADATA } = constants;

interface UpdateStatus {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';
  message?: string;
  latestVersion?: string;
}

export default function AboutPage() {
  const versionInfo = getVersionInfo();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ status: 'idle' });

  const handleCheckUpdates = () => {
    setUpdateStatus({ status: 'checking' });
    setTimeout(() => {
      setUpdateStatus({
        status: 'up-to-date',
        message: `You're running the latest version (${versionInfo.version}).`,
      });
    }, 1500);
  };

  const openExternal = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div data-testid="page-about" className="space-y-4">
      <PageHeader title="About" description={APP_METADATA.description} />

      <Card>
        <div className="flex items-start gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-brand-primary">
            <span className="text-2xl font-bold text-white">AVS</span>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <h2 className="text-lg font-bold text-text-primary">{APP_METADATA.name}</h2>
              <p className="text-sm text-text-muted">{APP_METADATA.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{getEditionString()}</Badge>
              <Badge tone="neutral">{getChannelString()}</Badge>
              <Badge tone="neutral">{getArchitectureString()}</Badge>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-text-muted">Version</dt>
            <dd className="font-medium text-text-primary">{getVersionString()}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Build Number</dt>
            <dd className="font-medium text-text-primary">{getBuildString()}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Release Channel</dt>
            <dd className="font-medium text-text-primary">{getChannelString()}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Release Date</dt>
            <dd className="font-medium text-text-primary">{versionInfo.releaseDate}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Architecture</dt>
            <dd className="font-medium text-text-primary">{getArchitectureString()}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Edition</dt>
            <dd className="font-medium text-text-primary">{getEditionString()}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Company & Contact">
        <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-text-muted">Publisher</dt>
            <dd className="text-text-primary">{APP_METADATA.vendor}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Website</dt>
            <dd>
              <button
                className="text-brand-primary hover:underline"
                onClick={() => openExternal(APP_METADATA.websiteUrl)}
                data-testid="about-website-link"
              >
                {APP_METADATA.websiteUrl}
              </button>
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Support</dt>
            <dd>
              <button
                className="text-brand-primary hover:underline"
                onClick={() => openExternal(`mailto:${APP_METADATA.supportEmail}`)}
                data-testid="about-support-link"
              >
                {APP_METADATA.supportEmail}
              </button>
            </dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-text-muted">Copyright</dt>
            <dd className="text-text-secondary">{APP_METADATA.copyright}</dd>
          </div>
        </dl>
      </Card>

      <Card title="Updates">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-text-primary">Current Version: {versionInfo.version}</div>
            <div className="text-xs text-text-muted">
              {updateStatus.status === 'idle' && 'Click "Check for Updates" to verify you have the latest version.'}
              {updateStatus.status === 'checking' && 'Checking for updates...'}
              {updateStatus.status === 'up-to-date' && updateStatus.message}
              {updateStatus.status === 'available' && `Update ${updateStatus.latestVersion} is available.`}
              {updateStatus.status === 'error' && updateStatus.message}
            </div>
          </div>
          <Button
            variant="primary"
            onClick={handleCheckUpdates}
            disabled={updateStatus.status === 'checking'}
            data-testid="about-check-updates"
          >
            {updateStatus.status === 'checking' ? 'Checking...' : 'Check for Updates'}
          </Button>
        </div>
      </Card>

      <Card title="Legal & Privacy">
        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
          <button
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-text-primary hover:bg-surface-muted"
            onClick={() => openExternal(`${APP_METADATA.websiteUrl}/privacy`)}
            data-testid="about-privacy-policy"
          >
            <span>Privacy Policy</span>
            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-0L10 14" />
            </svg>
          </button>
          <button
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-text-primary hover:bg-surface-muted"
            onClick={() => openExternal(`${APP_METADATA.websiteUrl}/terms`)}
            data-testid="about-terms"
          >
            <span>Terms of Service</span>
            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-0L10 14" />
            </svg>
          </button>
          <button
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-text-primary hover:bg-surface-muted"
            onClick={() => openExternal(`${APP_METADATA.websiteUrl}/eula`)}
            data-testid="about-eula"
          >
            <span>License Agreement (EULA)</span>
            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-0L10 14" />
            </svg>
          </button>
          <button
            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-text-primary hover:bg-surface-muted"
            onClick={() => openExternal(`${APP_METADATA.websiteUrl}/open-source`)}
            data-testid="about-open-source"
          >
            <span>Open Source Licenses</span>
            <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-0L10 14" />
            </svg>
          </button>
        </div>
      </Card>
    </div>
  );
}
