/**
 * DiagnosticsPage — generates a support package with system info,
 * license status, and application logs.
 *
 * Exports a ZIP file containing:
 * - System Information (Windows version, CPU, RAM, Disk)
 * - Application Version
 * - SDK Version
 * - License Status
 * - Update Status
 * - Logs (application, SDK, updater, IPC, optimizer)
 * - Errors
 */
import { useState, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { useLicense } from './LicenseContext';
import { getVersionString, getBuildString } from '../../config/version';

interface DiagnosticsData {
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

interface SystemInfo {
  windows_version: string;
  cpu: string;
  ram_gb: number;
  disk_gb: number;
}

export default function DiagnosticsPage() {
  const { state, edition } = useLicense();
  const [diag, setDiag] = useState<DiagnosticsData | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ success: boolean; error?: string } | null>(null);

  useEffect(() => {
    Promise.all([
      window.avs.license.getInfo().catch(() => null),
      window.avs.rpc.call<SystemInfo>('system.info').catch(() => null),
    ]).then(([licenseInfo, systemInfo]) => {
      setDiag(licenseInfo as DiagnosticsData | null);
      setSysInfo(systemInfo);
      setLoading(false);
    });
  }, []);

  const handleExport = async () => {
    setExporting(true);
    setExportResult(null);
    try {
      const result = await window.avs.license.exportDiagnostics();
      setExportResult({ success: result.success, error: result.error });
    } catch (err) {
      setExportResult({ success: false, error: err instanceof Error ? err.message : 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div data-testid="page-diagnostics" className="space-y-4">
      <PageHeader
        title="Diagnostics"
        description="System information and support diagnostics export."
      />

      {/* System Information */}
      <Card title="System Information">
        {loading ? (
          <div className="text-sm text-text-muted">Loading...</div>
        ) : sysInfo ? (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-text-muted">Windows Version</div>
              <div className="font-medium text-text-primary mt-1">{sysInfo.windows_version}</div>
            </div>
            <div>
              <div className="text-text-muted">CPU</div>
              <div className="font-medium text-text-primary mt-1">{sysInfo.cpu}</div>
            </div>
            <div>
              <div className="text-text-muted">RAM</div>
              <div className="font-medium text-text-primary mt-1">{sysInfo.ram_gb} GB</div>
            </div>
            <div>
              <div className="text-text-muted">Disk</div>
              <div className="font-medium text-text-primary mt-1">{sysInfo.disk_gb} GB</div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-muted">System information unavailable.</div>
        )}
      </Card>

      {/* Application Info */}
      <Card title="Application">
        <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
          <div>
            <div className="text-text-muted">Version</div>
            <div className="font-medium text-text-primary mt-1">{getVersionString()}</div>
          </div>
          <div>
            <div className="text-text-muted">Build</div>
            <div className="font-medium text-text-primary mt-1">{getBuildString()}</div>
          </div>
          <div>
            <div className="text-text-muted">SDK Version</div>
            <div className="font-medium text-text-primary mt-1">
              {diag?.sdk_version ?? 'Unknown'}
            </div>
          </div>
          <div>
            <div className="text-text-muted">Product</div>
            <div className="font-medium text-text-primary mt-1">
              {diag?.product_code ?? 'AVS PC Optimizer'}
            </div>
          </div>
        </div>
      </Card>

      {/* License Status */}
      <Card title="License Status">
        {diag ? (
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <div className="text-text-muted">Edition</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-medium text-text-primary capitalize">{edition}</span>
                <Badge tone={state === 'expired' || state === 'invalid' ? 'danger' : 'neutral'}>{state}</Badge>
              </div>
            </div>
            <div>
              <div className="text-text-muted">Days Remaining</div>
              <div className="font-medium text-text-primary mt-1">
                {diag.days_remaining ?? 'Lifetime'}
              </div>
            </div>
            <div>
              <div className="text-text-muted">Offline Status</div>
              <div className="font-medium text-text-primary mt-1">{diag.offline_status}</div>
            </div>
            <div>
              <div className="text-text-muted">Server URL</div>
              <div className="font-mono text-xs text-text-secondary mt-1">{diag.server_url}</div>
            </div>
            <div>
              <div className="text-text-muted">Device Fingerprint</div>
              <div className="font-mono text-xs text-text-secondary mt-1">{diag.fingerprint}</div>
            </div>
            <div>
              <div className="text-text-muted">Last Validated</div>
              <div className="font-medium text-text-primary mt-1">
                {diag.status.last_validated
                  ? new Date(diag.status.last_validated).toLocaleString()
                  : 'Never'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-text-muted">No license information available.</div>
        )}
      </Card>

      {/* Export */}
      <Card title="Export Diagnostics">
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Export a diagnostics package containing system information, license status,
            and application logs. This can be shared with AVS Support for troubleshooting.
          </p>
          {exportResult && (
            <div className={`rounded-md px-3 py-2 text-sm ${
              exportResult.success
                ? 'bg-semantic-success/10 text-semantic-success'
                : 'bg-semantic-danger/10 text-semantic-danger'
            }`}>
              {exportResult.success
                ? 'Diagnostics exported successfully.'
                : `Export failed: ${exportResult.error}`}
            </div>
          )}
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={exporting}
            data-testid="diagnostics-export-btn"
          >
            {exporting ? 'Exporting...' : 'Export Diagnostics Package'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
