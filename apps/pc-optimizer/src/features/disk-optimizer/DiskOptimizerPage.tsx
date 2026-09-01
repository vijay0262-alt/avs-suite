/**
 * DiskOptimizerPage — Defrag HDDs and TRIM SSDs.
 *
 * Free: analyze drives (see fragmentation level)
 * Pro: analyze + optimize (defrag HDD / TRIM SSD)
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  CircleStackIcon,
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import {
  diskOptimizerService,
  type OptimizerDriveInfo,
  type DriveAnalysis,
  type OptimizeStatus,
} from './diskOptimizer.service';

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(0)} MB`;
  return `${b} B`;
}

export default function DiskOptimizerPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [drives, setDrives] = useState<OptimizerDriveInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Record<string, DriveAnalysis>>({});
  const [optimizeStatus, setOptimizeStatus] = useState<OptimizeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDrives = useCallback(async () => {
    try {
      const result = await diskOptimizerService.listDrives();
      setDrives(result.drives);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to list drives');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrives();
  }, [loadDrives]);

  // Poll optimization status
  useEffect(() => {
    const poll = async () => {
      try {
        const status = await diskOptimizerService.getStatus();
        setOptimizeStatus(status);
      } catch {
        // ignore
      }
    };
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleAnalyze = async (drive: OptimizerDriveInfo) => {
    const driveLetter = drive.device.replace(":", "").replace("\\", "");
    setAnalyzing(driveLetter);
    setError(null);
    try {
      const result = await diskOptimizerService.analyzeDrive(driveLetter);
      setAnalyses((prev) => ({ ...prev, [driveLetter]: result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzing(null);
    }
  };

  const handleOptimize = async (drive: OptimizerDriveInfo) => {
    if (!isPro) {
      showUpgrade('Disk Optimizer');
      return;
    }
    const driveLetter = drive.device.replace(":", "").replace("\\", "");
    setError(null);
    try {
      await diskOptimizerService.optimizeDrive(driveLetter, drive.driveType);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Optimization failed');
    }
  };

  return (
    <div data-testid="page-disk-optimizer" className="space-y-4">
      <PageHeader
        title="Disk Optimizer"
        description="Defragment HDDs for speed and run TRIM on SSDs for longevity."
        actions={<HelpButton text="Analyze drives to see fragmentation levels. Pro users can optimize (defrag HDDs or TRIM SSDs) directly." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <CircleStackIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">How Disk Optimization Works</div>
          <p className="text-caption text-text-secondary mt-1">
            <span className="font-medium">HDD:</span> Defragmentation reorganizes fragmented files for faster access.
            <span className="font-medium ml-2">SSD:</span> TRIM tells the drive which blocks are unused, maintaining write speed.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="disk-opt-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Optimization status */}
      {optimizeStatus?.running && (
        <Card variant="glass" className="p-4" data-testid="disk-opt-progress">
          <div className="flex items-center gap-3">
            <ArrowPathIcon className="h-5 w-5 text-brand-primary animate-spin shrink-0" />
            <div className="flex-1">
              <div className="text-small font-medium text-text-primary">{optimizeStatus.message}</div>
              <div className="text-caption text-text-muted">
                Drive: {optimizeStatus.drive}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Optimization complete */}
      {optimizeStatus?.result && !optimizeStatus.running && (
        <Card variant="glass" className="p-4" data-testid="disk-opt-result">
          <div className="flex items-center gap-3">
            {optimizeStatus.result.success ? (
              <CheckCircleIcon className="h-5 w-5 text-semantic-success shrink-0" />
            ) : (
              <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0" />
            )}
            <div className="flex-1">
              <div className="text-small font-medium text-text-primary">{optimizeStatus.result.message}</div>
              {optimizeStatus.result.action && (
                <div className="text-caption text-text-muted">
                  Action: {optimizeStatus.result.action} · Drive: {optimizeStatus.drive}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Drive list */}
      {loading ? (
        <Card variant="glass" className="p-8 text-center">
          <ArrowPathIcon className="h-8 w-8 text-text-muted mx-auto animate-spin mb-2" />
          <p className="text-small text-text-secondary">Loading drives...</p>
        </Card>
      ) : drives.length === 0 ? (
        <Card variant="glass" className="p-8 text-center">
          <CircleStackIcon className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <p className="text-small text-text-secondary">No drives found.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {drives.map((drive, i) => {
            const driveLetter = drive.device.replace(":", "").replace("\\", "");
            const analysis = analyses[driveLetter];
            const isAnalyzing = analyzing === driveLetter;
            const isOptimizing = optimizeStatus?.running && optimizeStatus?.drive === drive.device;

            return (
              <Card key={i} variant="glass" className="p-4" data-testid={`disk-drive-${i}`}>
                <div className="flex items-center justify-between">
                  {/* Drive info */}
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
                      drive.isSSD ? 'bg-brand-primary/10' : 'bg-semantic-warning/10'
                    }`}>
                      {drive.isSSD ? (
                        <CpuChipIcon className="h-5 w-5 text-brand-primary" />
                      ) : (
                        <CircleStackIcon className="h-5 w-5 text-semantic-warning" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-small font-medium text-text-primary">{drive.device}</span>
                        <Badge tone={drive.isSSD ? 'brand' : 'neutral'}>
                          {drive.driveType === 'Unknown' ? 'Unknown' : drive.isSSD ? 'SSD' : 'HDD'}
                        </Badge>
                      </div>
                      <div className="text-caption text-text-muted mt-0.5">
                        {formatBytes(drive.used)} / {formatBytes(drive.total)} ({Math.round(drive.percent)}% used)
                        {drive.fstype && ` · ${drive.fstype}`}
                      </div>
                      {/* Analysis result */}
                      {analysis && !analysis.error && (
                        <div className="mt-2 flex items-center gap-2">
                          {analysis.needsOptimization ? (
                            <ExclamationTriangleIcon className="h-4 w-4 text-semantic-warning" />
                          ) : (
                            <CheckCircleIcon className="h-4 w-4 text-semantic-success" />
                          )}
                          <span className="text-caption text-text-secondary">
                            {analysis.error ? analysis.error : `Fragmentation: ${analysis.fragmentationPercent.toFixed(1)}%`}
                            {analysis.needsOptimization && ' — Optimization recommended'}
                          </span>
                        </div>
                      )}
                      {analysis?.error && (
                        <div className="mt-2 flex items-center gap-2">
                          <XCircleIcon className="h-4 w-4 text-semantic-danger" />
                          <span className="text-caption text-semantic-danger">{analysis.error}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={isAnalyzing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CircleStackIcon className="h-4 w-4" />}
                      onClick={() => handleAnalyze(drive)}
                      disabled={isAnalyzing || isOptimizing}
                      data-testid={`disk-analyze-${i}`}
                    >
                      {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                    </Button>
                    <Button
                      size="sm"
                      variant={isPro ? 'primary' : 'secondary'}
                      leftIcon={isOptimizing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BoltIcon className="h-4 w-4" />}
                      onClick={() => handleOptimize(drive)}
                      disabled={isOptimizing}
                      data-testid={`disk-optimize-${i}`}
                    >
                      {isOptimizing ? 'Optimizing...' : isPro ? (drive.isSSD ? 'TRIM' : 'Defrag') : 'Upgrade'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="disk-opt-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can analyze drives for free. Upgrade to Professional to defrag HDDs and TRIM SSDs.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Disk Optimizer')} leftIcon={<BoltIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
