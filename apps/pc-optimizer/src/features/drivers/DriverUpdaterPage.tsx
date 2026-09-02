/**
 * DriverUpdaterPage — Scan for outdated drivers and install updates.
 *
 * Free: scan only (see outdated drivers + available updates)
 * Pro: scan + install updates via Windows Update
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  CpuChipIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import {
  driverUpdaterService,
  type ScanOutdatedResult,
  type OutdatedDriver,
  type AvailableUpdate,
  type DownloadLink,
} from './driverUpdater.service';

export default function DriverUpdaterPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanOutdatedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatingTitles, setUpdatingTitles] = useState<Set<string>>(new Set());
  const [updateResults, setUpdateResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [downloadLinks, setDownloadLinks] = useState<DownloadLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setScanResult(null);
    setUpdateResults({});
    try {
      const result = await driverUpdaterService.scanOutdated();
      setScanResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scan drivers');
    } finally {
      setScanning(false);
    }
  }, []);

  const handleUpdate = useCallback(async (update: AvailableUpdate) => {
    if (!isPro) {
      showUpgrade('Driver Updater');
      return;
    }

    setUpdatingTitles((prev) => new Set(prev).add(update.Title));
    try {
      const result = await driverUpdaterService.updateDriver(update.Title);
      setUpdateResults((prev) => ({
        ...prev,
        [update.Title]: { success: result.success, message: result.message },
      }));
    } catch (e) {
      setUpdateResults((prev) => ({
        ...prev,
        [update.Title]: {
          success: false,
          message: e instanceof Error ? e.message : 'Update failed',
        },
      }));
    } finally {
      setUpdatingTitles((prev) => {
        const next = new Set(prev);
        next.delete(update.Title);
        return next;
      });
    }
  }, [isPro, showUpgrade]);

  const fetchDownloadLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const result = await driverUpdaterService.getDownloadLinks();
      if (result.supported) {
        setDownloadLinks(result.links);
      }
    } catch {
      /* ignore — links are optional enhancement */
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  useEffect(() => {
    if (scanResult && scanResult.outdated.length > 0) {
      fetchDownloadLinks();
    }
  }, [scanResult, fetchDownloadLinks]);

  return (
    <div data-testid="page-driver-updater" className="space-y-4">
      <PageHeader
        title="Driver Updater"
        description="Scan for outdated drivers and install updates from Windows Update."
        actions={<HelpButton text="Click Scan to check for outdated drivers and available updates. Pro users can install updates directly." />}
      />

      {/* Scan button */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-3">
              <CpuChipIcon className="h-6 w-6 text-brand-primary" />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Driver Scan</div>
              <p className="text-caption text-text-secondary mt-1">
                Check for outdated, unsigned, and updated drivers on your system.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            leftIcon={scanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ArrowDownTrayIcon className="h-5 w-5" />}
            onClick={handleScan}
            disabled={scanning}
            data-testid="driver-scan-btn"
          >
            {scanning ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="driver-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Scan Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Scan results */}
      {scanResult && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card variant="glass" className="p-4" data-testid="driver-summary-outdated">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-2.5">
                  <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Outdated Drivers</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">{scanResult.outdatedCount}</div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4" data-testid="driver-summary-updates">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <ArrowDownTrayIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Updates Available</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">{scanResult.updatesAvailableCount}</div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4" data-testid="driver-summary-scanned">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-success/10 p-2.5">
                  <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Scan Complete</div>
                  <div className="text-small font-semibold text-text-primary">
                    {new Date(scanResult.scannedAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Available updates (from Windows Update) */}
          {scanResult.updatesAvailable.length > 0 && (
            <Card title="Available Updates from Windows Update" variant="glass" data-testid="driver-updates-list">
              <div className="space-y-2">
                {scanResult.updatesAvailable.map((update, i) => {
                  const isUpdating = updatingTitles.has(update.Title);
                  const result = updateResults[update.Title];
                  return (
                    <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-small font-medium text-text-primary truncate">{update.Title}</div>
                        <div className="text-caption text-text-muted mt-0.5">
                          {update.DriverManufacturer && `${update.DriverManufacturer} · `}
                          {update.DriverClass || 'Driver'}
                          {update.DriverVerDate && ` · ${update.DriverVerDate}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {result ? (
                          result.success ? (
                            <Badge tone="success"><CheckCircleIcon className="h-3 w-3 inline mr-1" />Installed</Badge>
                          ) : (
                            <Badge tone="danger"><XCircleIcon className="h-3 w-3 inline mr-1" />Failed</Badge>
                          )
                        ) : (
                          <Button
                            size="sm"
                            variant={isPro ? 'primary' : 'secondary'}
                            leftIcon={isUpdating ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
                            onClick={() => handleUpdate(update)}
                            disabled={isUpdating}
                            data-testid={`driver-update-btn-${i}`}
                          >
                            {isUpdating ? 'Installing...' : isPro ? 'Install' : 'Upgrade'}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Outdated drivers (heuristic detection) */}
          {scanResult.outdated.length > 0 && (
            <Card title="Outdated or Problematic Drivers" variant="glass" data-testid="driver-outdated-list">
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {scanResult.outdated.map((driver, i) => (
                  <OutdatedDriverRow key={i} driver={driver} index={i} />
                ))}
              </div>
            </Card>
          )}

          {/* Manufacturer download links */}
          {downloadLinks.length > 0 && (
            <Card title="Manufacturer Download Links" variant="glass" data-testid="driver-mfg-links">
              <p className="text-caption text-text-secondary mb-3">
                Get the latest drivers directly from your hardware manufacturer&apos;s official download page.
              </p>
              <div className="space-y-2">
                {downloadLinks.map((link, i) => (
                  <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <LinkIcon className="h-5 w-5 text-brand-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-small font-medium text-text-primary truncate">{link.manufacturer}</div>
                        <div className="text-caption text-text-muted truncate">
                          {link.category} · {link.deviceName}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {link.autoDetectUrl && (
                        <a
                          href={link.autoDetectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-caption text-brand-primary hover:underline"
                        >
                          Auto-Detect
                        </a>
                      )}
                      <a
                        href={link.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-[var(--avs-radius-sm)] bg-brand-primary px-3 py-1.5 text-caption font-medium text-white hover:bg-brand-primary-dark"
                        data-testid={`driver-mfg-link-${i}`}
                      >
                        <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {loadingLinks && (
            <div className="flex items-center gap-2 text-caption text-text-secondary" data-testid="driver-mfg-loading">
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
              Fetching manufacturer links...
            </div>
          )}

          {/* All good message */}
          {scanResult.outdated.length === 0 && scanResult.updatesAvailable.length === 0 && (
            <Card variant="glass" className="p-8 text-center" data-testid="driver-all-good">
              <CheckCircleIcon className="h-12 w-12 text-semantic-success mx-auto mb-3" />
              <div className="text-section-title text-text-primary">All Drivers Up to Date</div>
              <p className="text-small text-text-secondary mt-1">
                No outdated drivers or available updates found. Your system is running the latest drivers.
              </p>
            </Card>
          )}
        </>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="driver-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can scan for outdated drivers for free. Upgrade to Professional to install driver updates automatically.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Driver Updater')} leftIcon={<ShieldCheckIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}

function OutdatedDriverRow({ driver, index }: { driver: OutdatedDriver; index: number }) {
  const severityColor = driver.severity === 'high' ? 'danger' : 'warning';
  return (
    <div className="rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3" data-testid={`driver-outdated-${index}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-small font-medium text-text-primary truncate">{driver.DeviceName}</div>
          <div className="text-caption text-text-muted mt-0.5">
            {driver.Manufacturer} · {driver.DeviceClass} · v{driver.DriverVersion}
            {driver.DriverDate && ` · ${driver.DriverDate}`}
          </div>
        </div>
        <Badge tone={severityColor as 'danger' | 'warning'}>
          {driver.severity === 'high' ? 'High' : 'Medium'}
        </Badge>
      </div>
      <div className="mt-2 space-y-1">
        {driver.reasons.map((reason, ri) => (
          <div key={ri} className="text-caption text-text-secondary flex items-start gap-1.5">
            <ExclamationTriangleIcon className="h-3 w-3 text-text-muted shrink-0 mt-0.5" />
            <span>{reason}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
