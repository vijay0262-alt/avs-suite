/**
 * PredictiveMaintenancePage — AI predicts when cleanup is needed.
 *
 * Free: view prediction status and history
 * Pro: configure, take sample, clear data
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  ChartBarIcon,
  ArrowPathIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  predictiveService,
  type PredictiveStatus,
  type PredictiveSample,
  type PredictiveHistoryEntry,
} from './predictive.service';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function PredictiveMaintenancePage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<PredictiveStatus | null>(null);
  const [samples, setSamples] = useState<PredictiveSample[]>([]);
  const [predictions, setPredictions] = useState<PredictiveHistoryEntry[]>([]);
  const [sampling, setSampling] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const result = await predictiveService.getStatus();
      setStatus(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load status');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const result = await predictiveService.getHistory(50);
      setSamples(result.samples);
      setPredictions(result.predictions);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    loadStatus();
    loadHistory();
  }, [loadStatus, loadHistory]);

  const handleSample = async () => {
    if (!isPro) {
      showUpgrade('Predictive Maintenance');
      return;
    }
    setSampling(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await predictiveService.sample();
      setActionMessage(`Sample taken: ${formatBytes(result.sample.totalBytes)} junk detected`);
      await loadStatus();
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to take sample');
    } finally {
      setSampling(false);
    }
  };

  const handleThresholdChange = async (value: number) => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await predictiveService.configure({ thresholdGB: value });
      setActionMessage(result.message);
      await loadStatus();
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
      const result = await predictiveService.configure({ enabled: !status.config.enabled });
      setActionMessage(result.message);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  const handleClearData = async () => {
    if (!isPro) {
      showUpgrade('Predictive Maintenance');
      return;
    }
    setConfiguring(true);
    try {
      const result = await predictiveService.clearData();
      setActionMessage(result.message);
      setSamples([]);
      setPredictions([]);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear data');
    } finally {
      setConfiguring(false);
    }
  };

  const prediction = status?.prediction;
  const config = status?.config;
  const needsCleanup = prediction?.daysUntilCleanup !== null && prediction?.daysUntilCleanup !== undefined && prediction.daysUntilCleanup <= 1;
  const isWarning = prediction?.daysUntilCleanup !== null && prediction?.daysUntilCleanup !== undefined && prediction.daysUntilCleanup > 1 && prediction.daysUntilCleanup <= 7;

  return (
    <div data-testid="page-predictive" className="space-y-4">
      <PageHeader
        title="AI Predictive Maintenance"
        description="AI learns your junk accumulation rate and predicts when cleanup will be needed."
        actions={<HelpButton text="The AI takes periodic samples of your junk size and uses linear regression to predict when cleanup is needed. Pro users can configure thresholds and take samples." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <SparklesIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">AI-Powered Prediction</div>
          <p className="text-caption text-text-secondary mt-1">
            Tracks junk accumulation over time using linear regression. Predicts when your junk files
            will reach the cleanup threshold so you can clean before it impacts performance.
          </p>
        </div>
      </div>

      {/* Prediction status */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              needsCleanup ? 'bg-semantic-danger/10' :
              isWarning ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'
            }`}>
              {needsCleanup ? (
                <ExclamationTriangleIcon className="h-6 w-6 text-semantic-danger" />
              ) : isWarning ? (
                <ClockIcon className="h-6 w-6 text-semantic-warning" />
              ) : (
                <CheckCircleIcon className="h-6 w-6 text-semantic-success" />
              )}
            </div>
            <div>
              <div className="text-section-title text-text-primary">Prediction Status</div>
              <p className="text-caption text-text-secondary mt-1">
                {prediction?.recommendedAction || 'No prediction available yet'}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            leftIcon={sampling ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ChartBarIcon className="h-5 w-5" />}
            onClick={handleSample}
            disabled={sampling || configuring}
            data-testid="predictive-sample-btn"
          >
            {sampling ? 'Sampling...' : isPro ? 'Take Sample' : 'Upgrade'}
          </Button>
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="predictive-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="predictive-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Prediction details */}
      {prediction && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card variant="glass" className="p-3 text-center" data-testid="predictive-stat-current">
            <div className="text-xl font-bold text-text-primary tabular-nums">{formatBytes(prediction.currentJunkBytes)}</div>
            <div className="text-caption text-text-muted">Current Junk</div>
          </Card>
          <Card variant="glass" className="p-3 text-center" data-testid="predictive-stat-rate">
            <div className="text-xl font-bold text-text-primary tabular-nums">{formatBytes(prediction.accumulationRateBytesPerDay)}</div>
            <div className="text-caption text-text-muted">Per Day</div>
          </Card>
          <Card variant="glass" className="p-3 text-center" data-testid="predictive-stat-days">
            <div className="text-xl font-bold text-text-primary tabular-nums">
              {prediction.daysUntilCleanup !== null ? `${prediction.daysUntilCleanup}d` : '∞'}
            </div>
            <div className="text-caption text-text-muted">Until Cleanup</div>
          </Card>
          <Card variant="glass" className="p-3 text-center" data-testid="predictive-stat-confidence">
            <div className="text-xl font-bold text-text-primary tabular-nums">
              {Math.round(prediction.confidence * 100)}%
            </div>
            <div className="text-caption text-text-muted">Confidence</div>
          </Card>
        </div>
      )}

      {/* Prediction details card */}
      {prediction && prediction.predictedDate && (
        <Card title="Prediction Details" variant="glass" data-testid="predictive-details">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Predicted Cleanup Date</span>
              <span className="text-small font-medium text-text-primary">{formatDate(prediction.predictedDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Days Until Cleanup</span>
              <span className="text-small font-medium text-text-primary">
                {prediction.daysUntilCleanup !== null ? `${prediction.daysUntilCleanup} days` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Accumulation Rate</span>
              <span className="text-small font-medium text-text-primary">
                {formatBytes(prediction.accumulationRateBytesPerDay)}/day
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Model Confidence</span>
              <Badge tone={prediction.confidence > 0.7 ? 'success' : prediction.confidence > 0.4 ? 'warning' : 'neutral'}>
                {Math.round(prediction.confidence * 100)}%
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Recommendation</span>
              <span className="text-small text-text-primary text-right max-w-[60%]">{prediction.recommendedAction}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Configuration */}
      {config && (
        <Card title="Configuration" variant="glass" data-testid="predictive-config">
          <div className="space-y-4">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SparklesIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Predictive Maintenance</div>
                  <p className="text-caption text-text-secondary">Enable or disable prediction tracking</p>
                </div>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  config.enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="predictive-enabled-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Threshold */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ChartBarIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Cleanup Threshold</div>
                  <p className="text-caption text-text-secondary">Junk size that triggers cleanup recommendation</p>
                </div>
              </div>
              <select
                value={config.thresholdGB}
                onChange={(e) => handleThresholdChange(Number(e.target.value))}
                disabled={!isPro || configuring}
                className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-surface px-3 py-1.5 text-small text-text-primary disabled:opacity-50"
                data-testid="predictive-threshold"
              >
                <option value={1}>1 GB</option>
                <option value={2}>2 GB</option>
                <option value={5}>5 GB</option>
                <option value={10}>10 GB</option>
                <option value={20}>20 GB</option>
              </select>
            </div>

            {/* Sample info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClockIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Sample Interval</div>
                  <p className="text-caption text-text-secondary">How often junk is measured</p>
                </div>
              </div>
              <span className="text-small text-text-muted">
                Every {config.sampleIntervalMinutes} min
              </span>
            </div>

            {/* Data info */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-text-primary">Collected Data</div>
                <p className="text-caption text-text-secondary">
                  {status?.sampleCount ?? 0} samples · Last: {formatDate(status?.lastSampleAt ?? null)}
                </p>
              </div>
              {status && status.sampleCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  leftIcon={<TrashIcon className="h-4 w-4" />}
                  onClick={handleClearData}
                  disabled={!isPro || configuring}
                  data-testid="predictive-clear-data"
                >
                  {isPro ? 'Clear Data' : 'Upgrade'}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Accumulation chart (simple bar chart) */}
      {samples.length > 1 && (
        <Card title="Junk Accumulation History" variant="glass" data-testid="predictive-chart">
          <div className="space-y-1">
            {samples.slice(-20).map((sample, i) => {
              const maxBytes = Math.max(...samples.slice(-20).map((s) => s.totalBytes), 1);
              const widthPercent = (sample.totalBytes / maxBytes) * 100;
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-caption text-text-muted w-20 shrink-0">
                    {formatDate(sample.timestamp).split(' ')[0]}
                  </span>
                  <div className="flex-1 h-4 bg-surface-muted rounded-sm overflow-hidden">
                    <div
                      className={`h-full rounded-sm ${
                        needsCleanup ? 'bg-semantic-danger' : isWarning ? 'bg-semantic-warning' : 'bg-brand-primary'
                      }`}
                      style={{ width: `${Math.max(2, widthPercent)}%` }}
                    />
                  </div>
                  <span className="text-caption text-text-muted w-20 shrink-0 text-right tabular-nums">
                    {formatBytes(sample.totalBytes)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Prediction history */}
      {predictions.length > 0 && (
        <Card title="Prediction History" variant="glass" data-testid="predictive-prediction-history">
          <div className="space-y-1">
            {predictions.slice(-10).reverse().map((pred, i) => (
              <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-small text-text-primary">{formatDate(pred.timestamp)}</span>
                </div>
                <div className="flex items-center gap-3 text-caption text-text-muted">
                  <span>{formatBytes(pred.currentJunkBytes)}</span>
                  <span>{pred.daysUntilCleanup !== null ? `${pred.daysUntilCleanup}d` : '∞'}</span>
                  <Badge tone={pred.confidence > 0.7 ? 'success' : 'warning'}>
                    {Math.round(pred.confidence * 100)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="predictive-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view predictions for free. Upgrade to Professional to configure thresholds, take samples, and clear data.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Predictive Maintenance')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
