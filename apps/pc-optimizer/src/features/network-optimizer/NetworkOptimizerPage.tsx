/**
 * NetworkOptimizerPage — Optimize TCP/IP settings, DNS, and MTU for better internet speed.
 *
 * Free: analyze current settings and view recommendations
 * Pro: analyze + apply optimizations + revert to defaults
 */
import { useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  WifiIcon,
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowUturnLeftIcon,
  GlobeAltIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';
import {
  networkOptimizerService,
  type AnalyzeResult,
  type OptimizeResult,
  type RevertResult,
  type NetworkSetting,
} from './networkOptimizer.service';

const CATEGORY_LABELS: Record<string, string> = {
  latency: 'Latency',
  throughput: 'Throughput',
  reliability: 'Reliability',
};

const CATEGORY_ICONS: Record<string, typeof BoltIcon> = {
  latency: BoltIcon,
  throughput: GlobeAltIcon,
  reliability: CheckCircleIcon,
};

export default function NetworkOptimizerPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [analyzing, setAnalyzing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [revertResult, setRevertResult] = useState<RevertResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setOptimizeResult(null);
    setRevertResult(null);
    try {
      const result = await networkOptimizerService.analyze();
      setAnalysis(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze network settings');
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const handleOptimize = async () => {
    if (!isPro) {
      showUpgrade('Network Optimizer');
      return;
    }
    setOptimizing(true);
    setError(null);
    try {
      const result = await networkOptimizerService.optimize();
      setOptimizeResult(result);
      if (result.success) {
        // Re-analyze to show updated state
        await handleAnalyze();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to optimize network');
    } finally {
      setOptimizing(false);
    }
  };

  const handleRevert = async () => {
    if (!isPro) {
      showUpgrade('Network Optimizer');
      return;
    }
    setReverting(true);
    setError(null);
    try {
      const result = await networkOptimizerService.revert();
      setRevertResult(result);
      if (result.success) {
        await handleAnalyze();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revert settings');
    } finally {
      setReverting(false);
    }
  };

  const isOptimized = analysis?.optimized || optimizeResult?.success;

  return (
    <div data-testid="page-network-optimizer" className="space-y-4">
      <PageHeader
        title="Network Optimizer"
        description="Optimize TCP/IP settings, DNS, and MTU for faster internet and lower latency."
        actions={<HelpButton text="Click Analyze to check your current network settings. Pro users can apply optimizations and revert to defaults." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <WifiIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">NetBooster Technology</div>
          <p className="text-caption text-text-secondary mt-1">
            Optimizes Windows TCP/IP stack parameters including ACK frequency, Nagle&apos;s algorithm, window scaling,
            selective ACK, and send/receive window sizes. All changes are backed up before applying.
          </p>
        </div>
      </div>

      {/* Status + Actions */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              isOptimized ? 'bg-semantic-success/10' : 'bg-brand-primary/10'
            }`}>
              <WifiIcon className={`h-6 w-6 ${isOptimized ? 'text-semantic-success' : 'text-brand-primary'}`} />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Network Status</div>
              <p className="text-caption text-text-secondary mt-1">
                {isOptimized ? 'Network is optimized for performance.' : 'Network settings are at default values.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={analyzing ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <CpuChipIcon className="h-5 w-5" />}
              onClick={handleAnalyze}
              disabled={analyzing || optimizing || reverting}
              data-testid="net-analyze-btn"
            >
              {analyzing ? 'Analyzing...' : 'Analyze'}
            </Button>
            {isOptimized ? (
              <Button
                variant="primary"
                leftIcon={reverting ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <ArrowUturnLeftIcon className="h-5 w-5" />}
                onClick={handleRevert}
                disabled={analyzing || optimizing || reverting}
                data-testid="net-revert-btn"
              >
                {reverting ? 'Reverting...' : isPro ? 'Revert' : 'Upgrade'}
              </Button>
            ) : (
              <Button
                variant="primary"
                leftIcon={optimizing ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
                onClick={handleOptimize}
                disabled={analyzing || optimizing || reverting || (analysis !== null && analysis.recommendationCount === 0)}
                data-testid="net-optimize-btn"
              >
                {optimizing ? 'Optimizing...' : isPro ? 'Optimize Now' : 'Upgrade'}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="net-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Optimize result */}
      {optimizeResult && (
        <Card variant="glass" className="p-4" data-testid="net-optimize-result">
          <div className="flex items-center gap-3 mb-3">
            {optimizeResult.success ? (
              <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
            ) : (
              <XCircleIcon className="h-5 w-5 text-semantic-danger" />
            )}
            <div className="flex-1">
              <div className="text-small font-medium text-text-primary">{optimizeResult.message}</div>
              {optimizeResult.note && (
                <div className="text-caption text-semantic-warning mt-1 flex items-center gap-1">
                  <ExclamationTriangleIcon className="h-3 w-3" />
                  {optimizeResult.note}
                </div>
              )}
            </div>
          </div>
          {optimizeResult.applied.length > 0 && (
            <div className="space-y-1">
              <div className="text-caption text-text-muted font-medium">Applied Changes:</div>
              {optimizeResult.applied.map((item, i) => (
                <div key={i} className="text-caption text-text-secondary flex items-center gap-2">
                  <CheckCircleIcon className="h-3 w-3 text-semantic-success shrink-0" />
                  <span>{item.name}: {String(item.oldValue)} → {item.newValue}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Revert result */}
      {revertResult && (
        <Card variant="glass" className="p-4" data-testid="net-revert-result">
          <div className="flex items-center gap-3">
            {revertResult.success ? (
              <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
            ) : (
              <XCircleIcon className="h-5 w-5 text-semantic-danger" />
            )}
            <div className="flex-1">
              <div className="text-small font-medium text-text-primary">{revertResult.message}</div>
              {revertResult.note && (
                <div className="text-caption text-semantic-warning mt-1 flex items-center gap-1">
                  <ExclamationTriangleIcon className="h-3 w-3" />
                  {revertResult.note}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Analysis results */}
      {analysis && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card variant="glass" className="p-4" data-testid="net-summary-recommendations">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-2.5">
                  <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Recommendations</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">{analysis.recommendationCount}</div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4" data-testid="net-summary-adapters">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <WifiIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Active Adapters</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">{analysis.adapters.length}</div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4" data-testid="net-summary-status">
              <div className="flex items-center gap-3">
                <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
                  analysis.optimized ? 'bg-semantic-success/10' : 'bg-surface-muted'
                }`}>
                  {analysis.optimized ? (
                    <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
                  ) : (
                    <CpuChipIcon className="h-5 w-5 text-text-muted" />
                  )}
                </div>
                <div>
                  <div className="text-caption text-text-muted">Status</div>
                  <div className="text-small font-semibold text-text-primary">
                    {analysis.optimized ? 'Optimized' : 'Default'}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Network adapters */}
          {analysis.adapters.length > 0 && (
            <Card title="Network Adapters" variant="glass" data-testid="net-adapters">
              <div className="space-y-2">
                {analysis.adapters.map((adapter, i) => (
                  <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3">
                    <div className="flex items-center gap-3">
                      <WifiIcon className="h-4 w-4 text-brand-primary" />
                      <span className="text-small font-medium text-text-primary">{adapter.name}</span>
                    </div>
                    <div className="flex items-center gap-4 text-caption text-text-muted">
                      <span>MTU: {adapter.mtu}</span>
                      {adapter.speed > 0 && <span>Speed: {adapter.speed} Mbps</span>}
                      <Badge tone="success">Active</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* DNS servers */}
          {analysis.dnsServers.length > 0 && (
            <Card title="DNS Servers" variant="glass" data-testid="net-dns">
              <div className="flex items-center gap-2 flex-wrap">
                {analysis.dnsServers.map((dns, i) => (
                  <span key={i} className="text-small text-text-primary bg-surface-muted px-3 py-1.5 rounded-[var(--avs-radius-sm)]">
                    {dns}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {/* Settings list */}
          <Card title="TCP/IP Settings" variant="glass" data-testid="net-settings">
            <div className="space-y-2">
              {analysis.currentSettings.map((setting, i) => (
                <SettingRow key={i} setting={setting} index={i} />
              ))}
            </div>
          </Card>
        </>
      )}

      {/* Free edition notice */}
      {!isPro && analysis && analysis.recommendationCount > 0 && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="net-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can analyze network settings for free. Upgrade to Professional to apply optimizations and revert changes.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Network Optimizer')} leftIcon={<BoltIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}

function SettingRow({ setting, index }: { setting: NetworkSetting; index: number }) {
  const Icon = CATEGORY_ICONS[setting.category] || CpuChipIcon;
  const needsOpt = setting.needsOptimization;

  return (
    <div className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3" data-testid={`net-setting-${index}`}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${
          needsOpt ? 'bg-semantic-warning/10' : 'bg-semantic-success/10'
        }`}>
          <Icon className={`h-4 w-4 ${needsOpt ? 'text-semantic-warning' : 'text-semantic-success'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-small font-medium text-text-primary">{setting.name}</span>
            <Badge tone="neutral">{CATEGORY_LABELS[setting.category] || setting.category}</Badge>
            {needsOpt ? (
              <Badge tone="warning">Needs Optimization</Badge>
            ) : (
              <Badge tone="success">Optimal</Badge>
            )}
          </div>
          <div className="text-caption text-text-secondary mt-0.5">{setting.description}</div>
          <div className="text-caption text-text-muted mt-0.5">
            Current: {setting.currentValue ?? 'default'} · Recommended: {setting.recommendedValue}
          </div>
        </div>
      </div>
    </div>
  );
}
