import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@avs/ui';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ComputerDesktopIcon,
  FireIcon,
  ArrowUpTrayIcon,
  EyeIcon,
  LockClosedIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import { PageHeader } from '../../components/PageHeader';
import { dashboardService } from '../dashboard/dashboard.service';
import type { DashboardMetrics, SecurityMetrics, WindowsInfo } from '../dashboard/dashboard.types';

interface SecurityItemProps {
  label: string;
  description: string;
  status: 'active' | 'inactive' | 'warning' | 'unknown';
  icon: React.ComponentType<{ className?: string }>;
}

function SecurityItem({ label, description, status, icon: Icon }: SecurityItemProps) {
  const statusConfig = {
    active: { color: 'text-semantic-success', bg: 'bg-semantic-success/10', icon: CheckCircleIcon, text: 'Active' },
    inactive: { color: 'text-semantic-danger', bg: 'bg-semantic-danger/10', icon: XCircleIcon, text: 'Inactive' },
    warning: { color: 'text-semantic-warning', bg: 'bg-semantic-warning/10', icon: ExclamationTriangleIcon, text: 'Attention needed' },
    unknown: { color: 'text-text-muted', bg: 'bg-surface-muted', icon: ExclamationTriangleIcon, text: 'Unknown' },
  };
  const cfg = statusConfig[status];
  const StatusIcon = cfg.icon;

  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border border-border hover:border-border-hover transition-colors">
      <div className={`p-2.5 rounded-lg ${cfg.bg}`}>
        <Icon className={`h-6 w-6 ${cfg.color}`} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
          <div className={`flex items-center gap-1.5 ${cfg.color}`}>
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-medium">{cfg.text}</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-text-secondary">{description}</p>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function SecurityPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await dashboardService.refreshCache();
      const data = await dashboardService.getMetrics();
      setMetrics(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load security status';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const security: SecurityMetrics | undefined = metrics?.security;
  const windows: WindowsInfo | undefined = metrics?.windows;

  const securityItems: SecurityItemProps[] = useMemo(() => {
    if (!security) return [];
    return [
      {
        label: 'Windows Defender',
        description: security.defender.enabled
          ? 'Antivirus protection is enabled and monitoring your system.'
          : 'Antivirus protection is disabled. Enable Windows Defender for protection.',
        status: security.defender.enabled ? 'active' : 'inactive',
        icon: ShieldCheckIcon,
      },
      {
        label: 'Real-time Protection',
        description: security.realTimeProtection
          ? 'Real-time scanning is active, blocking threats as they appear.'
          : 'Real-time scanning is off. Your system may be vulnerable to new threats.',
        status: security.realTimeProtection ? 'active' : 'inactive',
        icon: EyeIcon,
      },
      {
        label: 'Firewall',
        description: security.firewall.enabled
          ? 'Windows Firewall is active and filtering network traffic.'
          : 'Windows Firewall is disabled. Your PC is exposed to network attacks.',
        status: security.firewall.enabled ? 'active' : 'inactive',
        icon: FireIcon,
      },
      {
        label: 'Windows Updates',
        description: security.updates.pendingUpdates > 0
          ? `${security.updates.pendingUpdates} pending update(s) available. Install them to stay protected.`
          : 'Your system is up to date with the latest security patches.',
        status: security.updates.pendingUpdates > 0 ? 'warning' : 'active',
        icon: ArrowUpTrayIcon,
      },
      {
        label: 'SmartScreen',
        description: security.smartScreen
          ? 'SmartScreen is active and helps protect against malicious websites and downloads.'
          : 'SmartScreen is disabled. Enable it for additional web protection.',
        status: security.smartScreen ? 'active' : 'inactive',
        icon: LockClosedIcon,
      },
      {
        label: 'Secure Boot',
        description: windows?.secureBoot
          ? 'Secure Boot is enabled, preventing unauthorized firmware from loading at startup.'
          : 'Secure Boot is not enabled. Your boot process may be vulnerable to tampering.',
        status: windows?.secureBoot ? 'active' : 'warning',
        icon: ComputerDesktopIcon,
      },
      {
        label: 'TPM (Trusted Platform Module)',
        description: windows?.tpmStatus
          ? 'TPM is present and available for encryption and security features.'
          : 'No TPM detected. Some security features like BitLocker may not be available.',
        status: windows?.tpmStatus ? 'active' : 'warning',
        icon: CpuChipIcon,
      },
    ];
  }, [security, windows]);

  const activeCount = securityItems.filter((i) => i.status === 'active').length;
  const totalCount = securityItems.length;

  return (
    <div data-testid="page-security" className="space-y-6">
      <PageHeader
        title="Security"
        description="Real-time security status and protection settings for your PC."
        actions={
          <Button
            variant="secondary"
            onClick={() => void fetchMetrics()}
            disabled={loading}
            leftIcon={<ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        }
      />

      {loading && !metrics && (
        <Card>
          <div className="py-8 text-center">
            <ArrowPathIcon className="h-8 w-8 text-text-muted animate-spin mx-auto mb-3" />
            <p className="text-text-secondary">Loading security status...</p>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <div className="py-6 text-center">
            <ExclamationTriangleIcon className="h-8 w-8 text-semantic-danger mx-auto mb-3" />
            <p className="text-semantic-danger mb-4">{error}</p>
            <Button onClick={() => void fetchMetrics()}>Retry</Button>
          </div>
        </Card>
      )}

      {metrics && (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">Protection Summary</p>
                <p className="text-2xl font-bold text-text-primary mt-1">
                  {activeCount}/{totalCount} protections active
                </p>
              </div>
              <div className={`p-3 rounded-xl ${activeCount === totalCount ? 'bg-semantic-success/10' : activeCount >= totalCount - 2 ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'}`}>
                <ShieldCheckIcon
                  className={`h-8 w-8 ${activeCount === totalCount ? 'text-semantic-success' : activeCount >= totalCount - 2 ? 'text-semantic-warning' : 'text-semantic-danger'}`}
                />
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {securityItems.map((item) => (
              <SecurityItem key={item.label} {...item} />
            ))}
          </div>

          {windows && (
            <Card title="System Information">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Windows Version</p>
                  <p className="text-sm text-text-primary mt-1">{windows.version}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Build</p>
                  <p className="text-sm text-text-primary mt-1">{windows.build}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Uptime</p>
                  <p className="text-sm text-text-primary mt-1">{formatUptime(windows.uptime)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Administrator</p>
                  <p className="text-sm text-text-primary mt-1">{windows.isAdministrator ? 'Yes' : 'No'}</p>
                </div>
                {windows.battery && (
                  <>
                    <div>
                      <p className="text-xs text-text-muted">Battery</p>
                      <p className="text-sm text-text-primary mt-1">
                        {windows.battery.percent}%{windows.battery.powerPlugged ? ' (Plugged in)' : ''}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}

          {metrics.performance && (
            <Card title="Storage & Performance">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Temp Files</p>
                  <p className="text-sm text-text-primary mt-1">{formatBytes(metrics.performance.temporaryFilesSize)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Recycle Bin</p>
                  <p className="text-sm text-text-primary mt-1">{formatBytes(metrics.performance.recycleBinSize)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Browser Cache</p>
                  <p className="text-sm text-text-primary mt-1">{formatBytes(metrics.performance.browserCacheSize)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Startup Apps</p>
                  <p className="text-sm text-text-primary mt-1">{metrics.performance.startupApps}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
