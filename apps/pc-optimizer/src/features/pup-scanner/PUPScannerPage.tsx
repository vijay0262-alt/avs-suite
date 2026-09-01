/**
 * PUPScannerPage — Detect Potentially Unwanted Programs.
 *
 * Detects: bundled installers, optimizer scams, fake antivirus,
 * browser hijackers, crypto miners, download managers.
 *
 * Free: scan + view results
 * Pro: scan + view + ignore/unignore programs
 */
import { useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  ShieldExclamationIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeSlashIcon,
  EyeIcon,
  CpuChipIcon,
  GlobeAltIcon,
  TruckIcon,
  BugAntIcon,
} from '@heroicons/react/24/outline';
import {
  pupScannerService,
  type PUPResult,
  type PUPScanResponse,
} from './pupScanner.service';

const PUP_TYPE_ICONS: Record<string, typeof ShieldExclamationIcon> = {
  optimizer_scam: CpuChipIcon,
  fake_antivirus: ShieldExclamationIcon,
  browser_hijacker: GlobeAltIcon,
  crypto_mining: CpuChipIcon,
  download_manager: TruckIcon,
  pup_publisher: BugAntIcon,
  pup: BugAntIcon,
};

const PUP_TYPE_LABELS: Record<string, string> = {
  optimizer_scam: 'Optimizer Scam',
  fake_antivirus: 'Fake Antivirus',
  browser_hijacker: 'Browser Hijacker',
  crypto_mining: 'Crypto Mining',
  download_manager: 'Download Manager',
  pup_publisher: 'Known PUP Publisher',
  pup: 'Potentially Unwanted Program',
};

export default function PUPScannerPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<PUPScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ignoring, setIgnoring] = useState<string | null>(null);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setScanResult(null);
    try {
      const result = await pupScannerService.scan();
      setScanResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scan for PUPs');
    } finally {
      setScanning(false);
    }
  }, []);

  const handleIgnore = async (pup: PUPResult) => {
    if (!isPro) {
      showUpgrade('PUP Scanner');
      return;
    }
    setIgnoring(pup.name);
    try {
      await pupScannerService.ignore(pup.name);
      // Remove from results
      setScanResult((prev) => prev ? {
        ...prev,
        pups: prev.pups.filter((p) => p.name !== pup.name),
        pupCount: prev.pupCount - 1,
      } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to ignore PUP');
    } finally {
      setIgnoring(null);
    }
  };

  const severityTone = (sev: string): 'danger' | 'warning' | 'neutral' => {
    if (sev === 'high') return 'danger';
    if (sev === 'medium') return 'warning';
    return 'neutral';
  };

  return (
    <div data-testid="page-pup-scanner" className="space-y-4">
      <PageHeader
        title="PUP Scanner"
        description="Detect Potentially Unwanted Programs — adware, browser hijackers, fake antivirus, optimizer scams, and more."
        actions={<HelpButton text="Click Scan to check installed programs for potentially unwanted software. Pro users can ignore false positives." />}
      />

      {/* Scan button */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-3">
              <ShieldExclamationIcon className="h-6 w-6 text-semantic-warning" />
            </div>
            <div>
              <div className="text-section-title text-text-primary">PUP Detection Scan</div>
              <p className="text-caption text-text-secondary mt-1">
                Scans installed programs for adware, browser hijackers, fake antivirus, optimizer scams, and crypto miners.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            leftIcon={scanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ShieldExclamationIcon className="h-5 w-5" />}
            onClick={handleScan}
            disabled={scanning}
            data-testid="pup-scan-btn"
          >
            {scanning ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="pup-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Scan results */}
      {scanResult && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card variant="glass" className="p-4" data-testid="pup-summary-count">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-2.5">
                  <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">PUPs Detected</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">{scanResult.pupCount}</div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4" data-testid="pup-summary-scanned">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <CpuChipIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Programs Scanned</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">{scanResult.totalPrograms}</div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4" data-testid="pup-summary-strong">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-danger/10 p-2.5">
                  <ShieldExclamationIcon className="h-5 w-5 text-semantic-danger" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Strong Indicators</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">{scanResult.summary.strongIndicators}</div>
                </div>
              </div>
            </Card>
          </div>

          {/* PUP list */}
          {scanResult.pupCount > 0 ? (
            <Card title="Detected Potentially Unwanted Programs" variant="glass" data-testid="pup-list">
              <div className="space-y-2">
                {scanResult.pups.map((pup, i) => {
                  const Icon = PUP_TYPE_ICONS[pup.pupType] || BugAntIcon;
                  return (
                    <div key={i} className="rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3" data-testid={`pup-item-${i}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${
                            pup.severity === 'high' ? 'bg-semantic-danger/10' :
                            pup.severity === 'medium' ? 'bg-semantic-warning/10' : 'bg-surface-muted'
                          }`}>
                            <Icon className={`h-4 w-4 ${
                              pup.severity === 'high' ? 'text-semantic-danger' :
                              pup.severity === 'medium' ? 'text-semantic-warning' : 'text-text-muted'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-small font-medium text-text-primary truncate">{pup.name}</span>
                              <Badge tone={severityTone(pup.severity)}>
                                {pup.severity}
                              </Badge>
                              {pup.isStrong && <Badge tone="danger">Strong</Badge>}
                            </div>
                            <div className="text-caption text-text-muted mt-0.5">
                              {PUP_TYPE_LABELS[pup.pupType] || pup.pupType}
                              {pup.publisher && ` · ${pup.publisher}`}
                              {pup.version && ` · v${pup.version}`}
                            </div>
                            {/* Indicators */}
                            <div className="mt-2 space-y-1">
                              {pup.indicators.map((ind, ri) => (
                                <div key={ri} className="text-caption text-text-secondary flex items-start gap-1.5">
                                  <ExclamationTriangleIcon className="h-3 w-3 text-text-muted shrink-0 mt-0.5" />
                                  <span>{ind.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={ignoring === pup.name ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <EyeSlashIcon className="h-4 w-4" />}
                            onClick={() => handleIgnore(pup)}
                            disabled={ignoring === pup.name}
                            data-testid={`pup-ignore-${i}`}
                          >
                            {isPro ? 'Ignore' : 'Upgrade'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <Card variant="glass" className="p-8 text-center" data-testid="pup-all-good">
              <CheckCircleIcon className="h-12 w-12 text-semantic-success mx-auto mb-3" />
              <div className="text-section-title text-text-primary">No PUPs Detected</div>
              <p className="text-small text-text-secondary mt-1">
                No potentially unwanted programs found. Your system appears clean.
              </p>
            </Card>
          )}
        </>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="pup-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can scan for PUPs for free. Upgrade to Professional to ignore false positives and manage your ignore list.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('PUP Scanner')} leftIcon={<EyeIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
