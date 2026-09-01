/**
 * AnomalyDetectionPage — AI behavioral malware detection beyond signatures.
 *
 * Monitors running processes for suspicious behavioral patterns:
 *  - Suspicious names (typosquatting, random strings, double extensions)
 *  - Suspicious execution locations (temp, downloads, appdata)
 *  - High CPU + memory (possible crypto miner)
 *  - Many child processes (possible worm)
 *  - No executable path (possible injection)
 *  - Unusual extensions (.scr, .bat, .cmd)
 *
 * Free: scan, view, dismiss, clear all
 * Pro: configure sensitivity, view baseline
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  ShieldExclamationIcon,
  ArrowPathIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  BoltIcon,
  SparklesIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import {
  anomalyService,
  type Anomaly,
  type AnomalyStatus,
} from './anomaly.service';

const SEVERITY_CONFIG: Record<string, { tone: 'danger' | 'warning' | 'info' | 'neutral'; label: string }> = {
  critical: { tone: 'danger', label: 'Critical' },
  high: { tone: 'warning', label: 'High' },
  normal: { tone: 'info', label: 'Normal' },
  low: { tone: 'neutral', label: 'Low' },
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function AnomalyDetectionPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<AnomalyStatus | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [scanning, setScanning] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [statusResult, listResult] = await Promise.all([
        anomalyService.getStatus(),
        anomalyService.listAnomalies({ limit: 50 }),
      ]);
      setStatus(statusResult);
      setAnomalies(listResult.anomalies);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load anomaly data');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await anomalyService.scan();
      if (result.success) {
        setActionMessage(`Scanned ${result.scannedProcesses} processes, found ${result.count} anomalies`);
        await loadAll();
      } else {
        setError(result.message || 'Scan failed');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scan');
    } finally {
      setScanning(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await anomalyService.dismiss(id);
      setAnomalies((prev) => prev.filter((a) => a.id !== id));
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to dismiss');
    }
  };

  const handleClearAll = async () => {
    try {
      await anomalyService.clearAll();
      setAnomalies([]);
      await loadAll();
      setActionMessage('All anomalies cleared');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear');
    }
  };

  const handleSensitivityChange = async (value: string) => {
    if (!isPro) {
      showUpgrade('Anomaly Detection');
      return;
    }
    setConfiguring(true);
    try {
      const result = await anomalyService.configure({ sensitivity: value as 'low' | 'normal' | 'high' });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update config');
    } finally {
      setConfiguring(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await anomalyService.configure({ enabled: !status.enabled });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  const activeAnomalies = anomalies.filter((a) => !a.dismissed);
  const criticalCount = activeAnomalies.filter((a) => a.severity === 'critical').length;
  const highCount = activeAnomalies.filter((a) => a.severity === 'high').length;

  return (
    <div data-testid="page-anomaly" className="space-y-4">
      <PageHeader
        title="AI Anomaly Detection"
        description="Behavioral malware detection beyond signatures — AI analyzes process behavior for suspicious patterns."
        actions={<HelpButton text="AI monitors running processes for behavioral indicators of compromise: suspicious names, execution from temp locations, high CPU+memory (miners), mass child spawning (worms), process injection, and more. Each indicator contributes to an anomaly score." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <ShieldExclamationIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Behavioral Analysis Engine</div>
          <p className="text-caption text-text-secondary mt-1">
            Detects malware and unwanted software by analyzing behavioral patterns rather than relying on signatures.
            Catches zero-day threats, fileless malware, and suspicious activity that signature-based scanners miss.
          </p>
        </div>
      </div>

      {/* Status + Scan */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              criticalCount > 0 ? 'bg-semantic-danger/10' :
              highCount > 0 ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'
            }`}>
              <ShieldExclamationIcon className={`h-6 w-6 ${
                criticalCount > 0 ? 'text-semantic-danger' :
                highCount > 0 ? 'text-semantic-warning' : 'text-semantic-success'
              }`} />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Detection Status</div>
              <p className="text-caption text-text-secondary mt-1">
                {status ? (
                  `${activeAnomalies.length} active anomalies` +
                  (criticalCount > 0 ? ` · ${criticalCount} critical` : '') +
                  (highCount > 0 ? ` · ${highCount} high` : '') +
                  ` · ${status.stats.totalScans} scans performed`
                ) : 'Loading...'}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            leftIcon={scanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
            onClick={handleScan}
            disabled={scanning}
            data-testid="anomaly-scan-btn"
          >
            {scanning ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="anomaly-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="anomaly-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Stats cards */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{activeAnomalies.length}</div>
            <div className="text-caption text-text-muted">Active</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-semantic-danger tabular-nums">{criticalCount}</div>
            <div className="text-caption text-text-muted">Critical</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-semantic-warning tabular-nums">{highCount}</div>
            <div className="text-caption text-text-muted">High</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalScans}</div>
            <div className="text-caption text-text-muted">Total Scans</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalAnomalies}</div>
            <div className="text-caption text-text-muted">Total Found</div>
          </Card>
        </div>
      )}

      {/* Anomalies list */}
      <Card title="Detected Anomalies" variant="glass" data-testid="anomaly-list">
        <div className="flex items-center justify-between mb-3">
          <p className="text-caption text-text-muted">
            {activeAnomalies.length > 0 ? `${activeAnomalies.length} active anomaly(s)` : 'No active anomalies'}
          </p>
          {activeAnomalies.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<TrashIcon className="h-4 w-4" />}
              onClick={handleClearAll}
              data-testid="anomaly-clear-all"
            >
              Clear All
            </Button>
          )}
        </div>

        {activeAnomalies.length > 0 ? (
          <div className="space-y-2">
            {activeAnomalies.map((anomaly) => {
              const sevConfig = SEVERITY_CONFIG[anomaly.severity] ?? SEVERITY_CONFIG.low!;
              return (
                <div
                  key={anomaly.id}
                  className={`rounded-[var(--avs-radius-md)] border p-4 ${
                    anomaly.severity === 'critical' ? 'border-semantic-danger/30 bg-semantic-danger/5' :
                    anomaly.severity === 'high' ? 'border-semantic-warning/30 bg-semantic-warning/5' :
                    'border-[var(--avs-border)] bg-surface-muted'
                  }`}
                  data-testid={`anomaly-item-${anomaly.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${
                      sevConfig.tone === 'danger' ? 'bg-semantic-danger/10' :
                      sevConfig.tone === 'warning' ? 'bg-semantic-warning/10' : 'bg-brand-primary/10'
                    }`}>
                      <ShieldExclamationIcon className={`h-5 w-5 ${
                        sevConfig.tone === 'danger' ? 'text-semantic-danger' :
                        sevConfig.tone === 'warning' ? 'text-semantic-warning' : 'text-brand-primary'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-small font-medium text-text-primary">{anomaly.name}</span>
                        <Badge tone={sevConfig.tone}>{sevConfig.label}</Badge>
                        <Badge tone="neutral">Score: {anomaly.score}</Badge>
                      </div>
                      <p className="text-caption text-text-muted mt-1 font-mono truncate">
                        PID {anomaly.pid} · {anomaly.exe || 'no path'}
                      </p>
                      <div className="mt-2 space-y-1">
                        {anomaly.indicators.map((ind, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-caption text-semantic-warning shrink-0">•</span>
                            <span className="text-caption text-text-secondary">{ind}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-caption text-text-muted">
                        <span>CPU: {anomaly.cpuPercent.toFixed(1)}%</span>
                        <span>RAM: {anomaly.memoryMB.toFixed(0)} MB</span>
                        {anomaly.childCount > 0 && <span>Children: {anomaly.childCount}</span>}
                        <span>{formatDate(anomaly.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDismiss(anomaly.id)}
                          data-testid={`anomaly-dismiss-${anomaly.id}`}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CheckCircleIcon className="h-10 w-10 text-semantic-success mx-auto mb-2" />
            <p className="text-small text-text-secondary">No anomalies detected. Your system looks clean.</p>
            <p className="text-caption text-text-muted mt-1">Click &ldquo;Scan Now&rdquo; to check for suspicious behavior.</p>
          </div>
        )}
      </Card>

      {/* Configuration */}
      {status && (
        <Card title="Configuration" variant="glass" data-testid="anomaly-config">
          <div className="space-y-4">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShieldExclamationIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Anomaly Detection</div>
                  <p className="text-caption text-text-secondary">Enable or disable behavioral scanning</p>
                </div>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  status.enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="anomaly-enabled-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Sensitivity */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CpuChipIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Sensitivity</div>
                  <p className="text-caption text-text-secondary">Detection sensitivity level</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {(['low', 'normal', 'high'] as const).map((level) => (
                  <Button
                    key={level}
                    size="sm"
                    variant={status.sensitivity === level ? 'primary' : 'ghost'}
                    onClick={() => handleSensitivityChange(level)}
                    disabled={!isPro || configuring}
                    data-testid={`anomaly-sensitivity-${level}`}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            {/* Min score */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-text-primary">Min Score to Report</div>
                <p className="text-caption text-text-secondary">Only report anomalies with score {'>='} this value</p>
              </div>
              <span className="text-small text-text-muted">{status.config.minScoreToReport}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="anomaly-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can scan, view, and dismiss anomalies for free. Upgrade to Professional to configure sensitivity and view behavioral baseline.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Anomaly Detection')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
