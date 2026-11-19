/**
 * AdvancedSecurityPage — AVS AI Shield Advanced Threat Protection.
 *
 * Tier 3 features:
 * - Behavioral sandbox — observe executable behavior
 * - ML anomaly classifier — statistical process behavior analysis
 * - Web shield / URL filtering — phishing and malicious URL detection
 * - Ransomware vaccine — canary files and active blocking
 * - Email attachment scanner
 * - Boot sector / MBR scanner
 *
 * Free: view status
 * Pro: all actions (analyze, start/stop, scan, configure)
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import {
  ModuleLoadingState,
  ModuleErrorState,
  ModuleEmptyState,
} from '../../components/ModuleStates';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import { ProStatusPill } from '../licensing/ProStatusBadge';
import {
  advancedSecurityService,
  type AdvancedSecurityStatus,
  type MLAnomaly,
  type RansomwareAlert,
  type UrlCheckResult,
  type SandboxResult,
  type EmailScanResult,
  type BootScanResult,
  type RiskLevel,
} from './advancedSecurity.service';
import {
  scamDetectorService,
  type ScamAnalysisResult,
  type PhoneCheckResult,
  type Sensitivity,
  type GuardAlert,
  type GuardStatus,
  type ScamWaves,
  type FamilyConfig,
  type SafeBankingStatus,
} from './scamDetector.service';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PlayIcon,
  StopIcon,
  GlobeAltIcon,
  LockClosedIcon,
  EnvelopeIcon,
  ComputerDesktopIcon,
  BeakerIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

// ── Helpers ─────────────────────────────────────────────────────

const RISK_TONE: Record<RiskLevel, 'success' | 'info' | 'warning' | 'danger'> = {
  safe: 'success',
  low: 'info',
  medium: 'warning',
  high: 'danger',
  critical: 'danger',
};

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function formatRelative(ts: string | null | undefined): string {
  if (!ts) return 'Never';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  } catch {
    return ts;
  }
}

// ─── Tab definitions ─────────────────────────────────────────────

type TabId = 'sandbox' | 'ml' | 'web' | 'ransomware' | 'email' | 'boot' | 'scam' | 'safebanking';

const TABS: { id: TabId; label: string; icon: typeof BeakerIcon }[] = [
  { id: 'sandbox', label: 'Behavioral Sandbox', icon: BeakerIcon },
  { id: 'ml', label: 'ML Anomaly', icon: ChartBarIcon },
  { id: 'web', label: 'Web Shield', icon: GlobeAltIcon },
  { id: 'ransomware', label: 'Ransomware Vaccine', icon: LockClosedIcon },
  { id: 'email', label: 'Email Scanner', icon: EnvelopeIcon },
  { id: 'boot', label: 'Boot Sector', icon: ComputerDesktopIcon },
  { id: 'scam', label: 'Scam Assistant', icon: ExclamationTriangleIcon },
  { id: 'safebanking', label: 'Safe Banking', icon: LockClosedIcon },
];

// ── Component ───────────────────────────────────────────────────

export default function AdvancedSecurityPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AdvancedSecurityStatus | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('sandbox');
  const [actionLoading, setActionLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await advancedSecurityService.getStatus();
      setStatus(res.status);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Poll when ML or ransomware is running
  useEffect(() => {
    const mlRunning = status?.ml_anomaly?.running;
    const ransomwareRunning = status?.ransomware_vaccine?.running;
    if (mlRunning || ransomwareRunning) {
      pollRef.current = setInterval(() => {
        advancedSecurityService.getStatus().then((r) => setStatus(r.status)).catch(() => {});
      }, 5000);
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status?.ml_anomaly?.running, status?.ransomware_vaccine?.running]);

  const guard = (fn: () => void) => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    fn();
  };

  if (loading) {
    return (
      <div data-testid="page-advanced-security">
        <PageHeader title="Advanced Security" />
        <ModuleLoadingState />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div data-testid="page-advanced-security">
        <PageHeader title="Advanced Security" />
        <ModuleErrorState message={error} onRetry={refreshStatus} />
      </div>
    );
  }

  return (
    <div data-testid="page-advanced-security">
      <PageHeader
        title="Advanced Security"
        description="Behavioral analysis, ML anomaly detection, web shield, ransomware vaccine, email scanner, and boot sector protection."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <HelpButton text="Advanced Security provides Tier 3 threat protection: behavioral sandboxing of suspicious files, ML-based process anomaly detection, URL filtering against phishing blocklists, canary-file ransomware detection, email attachment scanning, and MBR/boot sector analysis." />
          </div>
        }
      />

      <div className="space-y-4">
        {error && (
          <Card variant="glass">
            <p className="text-small text-semantic-danger">{error}</p>
          </Card>
        )}

        {/* Module availability overview */}
        <Card title="Module Status" variant="glass">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {TABS.map((tab) => {
              const moduleStatus = status?.[`${tab.id}_anomaly` as keyof AdvancedSecurityStatus] ||
                status?.[tab.id as keyof AdvancedSecurityStatus];
              const available = moduleStatus && typeof moduleStatus === 'object' && 'available' in moduleStatus
                ? (moduleStatus as { available: boolean }).available
                : false;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${activeTab === tab.id ? 'border-brand-primary bg-brand-primary/5' : 'border-[var(--avs-border)] hover:bg-[var(--avs-surface-hover)]'}`}
                  data-testid={`tab-${tab.id}`}
                >
                  <tab.icon className={`h-6 w-6 ${available ? 'text-semantic-success' : 'text-text-muted'}`} />
                  <span className="text-caption text-text-secondary text-center">{tab.label}</span>
                  <Badge tone={available ? 'success' : 'neutral'}>
                    {available ? 'Active' : 'N/A'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Tab content */}
        {activeTab === 'sandbox' && <SandboxTab status={status} isPro={isPro} guard={guard} actionLoading={actionLoading} setActionLoading={setActionLoading} />}
        {activeTab === 'ml' && <MLTab status={status} isPro={isPro} guard={guard} actionLoading={actionLoading} setActionLoading={setActionLoading} />}
        {activeTab === 'web' && <WebShieldTab status={status} isPro={isPro} guard={guard} actionLoading={actionLoading} setActionLoading={setActionLoading} />}
        {activeTab === 'ransomware' && <RansomwareTab status={status} isPro={isPro} guard={guard} actionLoading={actionLoading} setActionLoading={setActionLoading} />}
        {activeTab === 'email' && <EmailTab status={status} isPro={isPro} guard={guard} actionLoading={actionLoading} setActionLoading={setActionLoading} />}
        {activeTab === 'boot' && <BootTab status={status} isPro={isPro} guard={guard} actionLoading={actionLoading} setActionLoading={setActionLoading} />}
        {activeTab === 'scam' && <ScamAssistantTab />}
        {activeTab === 'safebanking' && <SafeBankingTab />}

        {!isPro && (
          <Card variant="glass" className="border-brand-primary/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-brand-primary">Free Edition</div>
                <div className="text-caption text-text-secondary mt-1">
                  Upgrade to Professional to use advanced security features.
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={() => showUpgrade()} data-testid="upgrade-btn">
                Upgrade
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Sandbox Tab ─────────────────────────────────────────────────

function SandboxTab({
  status,
  isPro,
  guard,
  actionLoading,
  setActionLoading,
}: {
  status: AdvancedSecurityStatus | null;
  isPro: boolean;
  guard: (fn: () => void) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}) {
  const [filePath, setFilePath] = useState('');
  const [result, setResult] = useState<SandboxResult | null>(null);

  const handleAnalyze = async () => {
    if (!filePath.trim()) return;
    setActionLoading(true);
    try {
      const res = await advancedSecurityService.sandboxAnalyze(filePath.trim());
      setResult(res.result);
    } catch (e) {
      setResult(null);
    }
    setActionLoading(false);
  };

  return (
    <Card title="Behavioral Sandbox" variant="glass" data-testid="sandbox-tab">
      <p className="text-small text-text-secondary mb-4">
        Observe executable behavior in a controlled environment. The sandbox records a system baseline,
        launches the file, and scores suspicious activity (process creation, network connections, file/registry changes).
      </p>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="C:\path\to\suspicious.exe"
          className="flex-1 px-3 py-2 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small"
          data-testid="sandbox-file-input"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => guard(handleAnalyze)}
          disabled={!isPro || actionLoading || !filePath.trim()}
          leftIcon={actionLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BeakerIcon className="h-4 w-4" />}
          data-testid="sandbox-analyze-btn"
        >
          Analyze
        </Button>
      </div>

      <div className="text-caption text-text-muted mb-4">
        Analyses run: {status?.behavioral_sandbox?.analyses_run ?? 0} ·
        Observation time: {status?.behavioral_sandbox?.observation_time ?? 10}s
      </div>

      {result && (
        <div className="mt-4 p-4 rounded border border-[var(--avs-border)]" data-testid="sandbox-result">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={result.verdict === 'malicious' ? 'danger' : result.verdict === 'suspicious' ? 'warning' : 'success'}>
              {result.verdict}
            </Badge>
            <span className="text-small text-text-secondary">Score: {result.score}</span>
            <span className="text-caption text-text-muted">Duration: {result.duration}s</span>
          </div>
          {result.indicators.length > 0 && (
            <div className="space-y-1">
              {result.indicators.map((ind, i) => (
                <div key={i} className="flex items-center gap-2 text-small">
                  <ExclamationTriangleIcon className="h-4 w-4 text-semantic-warning shrink-0" />
                  <span className="text-text-secondary flex-1">{ind.description}</span>
                  <span className="text-text-muted">+{ind.score}</span>
                </div>
              ))}
            </div>
          )}
          {result.indicators.length === 0 && result.verdict === 'benign' && (
            <div className="flex items-center gap-2 text-small text-semantic-success">
              <CheckCircleIcon className="h-5 w-5" />
              No suspicious behavior detected
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── ML Anomaly Tab ──────────────────────────────────────────────

function MLTab({
  status,
  isPro,
  guard,
  actionLoading,
  setActionLoading,
}: {
  status: AdvancedSecurityStatus | null;
  isPro: boolean;
  guard: (fn: () => void) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}) {
  const [anomalies, setAnomalies] = useState<MLAnomaly[]>([]);
  const [training, setTraining] = useState(false);

  const loadAnomalies = async () => {
    try {
      const res = await advancedSecurityService.mlAnomalies();
      setAnomalies(res.anomalies || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadAnomalies();
  }, []);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await advancedSecurityService.mlStart();
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await advancedSecurityService.mlStop();
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleTrain = async () => {
    setTraining(true);
    try {
      await advancedSecurityService.mlTrain(60);
    } catch { /* ignore */ }
    setTraining(false);
  };

  const running = status?.ml_anomaly?.running;

  return (
    <Card title="ML Anomaly Classifier" variant="glass" data-testid="ml-tab">
      <p className="text-small text-text-secondary mb-4">
        Statistical process behavior analysis. Detects anomalous CPU, memory, thread, and network activity using z-score deviation
        {status?.ml_anomaly?.model_type ? ` (${status.ml_anomaly.model_type})` : ''}.
      </p>

      <div className="flex items-center gap-2 mb-4">
        {!running ? (
          <Button variant="primary" size="sm" onClick={() => guard(handleStart)} disabled={!isPro || actionLoading}
            leftIcon={<PlayIcon className="h-4 w-4" />} data-testid="ml-start-btn">
            Start Monitoring
          </Button>
        ) : (
          <Button variant="danger" size="sm" onClick={handleStop} disabled={actionLoading}
            leftIcon={<StopIcon className="h-4 w-4" />} data-testid="ml-stop-btn">
            Stop Monitoring
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => guard(handleTrain)} disabled={!isPro || training}
          leftIcon={training ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ChartBarIcon className="h-4 w-4" />}
          data-testid="ml-train-btn">
          {training ? 'Training...' : 'Train Baseline'}
        </Button>
        <Button variant="ghost" size="sm" onClick={loadAnomalies} leftIcon={<EyeIcon className="h-4 w-4" />}>
          Refresh
        </Button>
      </div>

      <div className="text-caption text-text-muted mb-4">
        Baseline samples: {status?.ml_anomaly?.baseline_samples ?? 0} ·
        Anomalies detected: {status?.ml_anomaly?.anomalies_detected ?? 0}
      </div>

      {anomalies.length === 0 ? (
        <ModuleEmptyState message="No anomalies detected. Start monitoring to collect data." />
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="ml-anomalies-list">
          {anomalies.map((a, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded border border-semantic-warning/30 bg-semantic-warning/5">
              <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-small font-medium text-text-primary">{a.process_name} (PID {a.pid})</span>
                  <Badge tone={a.severity === 'critical' ? 'danger' : a.severity === 'high' ? 'warning' : 'neutral'}>
                    {a.severity}
                  </Badge>
                  <span className="text-caption text-text-muted">{formatTime(a.timestamp)}</span>
                </div>
                <div className="text-caption text-text-secondary mt-1">
                  Score: {a.score} · {a.reasons.join(', ')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Web Shield Tab ──────────────────────────────────────────────

function WebShieldTab({
  status,
  isPro,
  guard,
  actionLoading,
  setActionLoading,
}: {
  status: AdvancedSecurityStatus | null;
  isPro: boolean;
  guard: (fn: () => void) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}) {
  const [url, setUrl] = useState('');
  const [result, setResult] = useState<UrlCheckResult | null>(null);
  const [updatingFeeds, setUpdatingFeeds] = useState(false);

  const handleCheck = async () => {
    if (!url.trim()) return;
    setActionLoading(true);
    try {
      const res = await advancedSecurityService.webCheck(url.trim());
      setResult(res.result);
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleUpdateFeeds = async () => {
    setUpdatingFeeds(true);
    try {
      await advancedSecurityService.webUpdateFeeds(true);
    } catch { /* ignore */ }
    setUpdatingFeeds(false);
  };

  return (
    <Card title="Web Shield / URL Filtering" variant="glass" data-testid="web-tab">
      <p className="text-small text-text-secondary mb-4">
        Check URLs against phishing blocklists and malicious URL databases. Detects brand impersonation, lookalike domains, and suspicious TLDs.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://suspicious-url.com"
          className="flex-1 px-3 py-2 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small"
          data-testid="web-url-input"
        />
        <Button variant="primary" size="sm" onClick={() => guard(handleCheck)} disabled={!isPro || actionLoading || !url.trim()}
          leftIcon={actionLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <MagnifyingGlassIcon className="h-4 w-4" />}
          data-testid="web-check-btn">
          Check URL
        </Button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="text-caption text-text-muted">
          URLs checked: {status?.web_shield?.urls_checked ?? 0} ·
          Threats blocked: {status?.web_shield?.threats_blocked ?? 0}
        </div>
        <Button variant="secondary" size="sm" onClick={() => guard(handleUpdateFeeds)} disabled={!isPro || updatingFeeds}
          leftIcon={updatingFeeds ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
          data-testid="web-update-feeds-btn">
          {updatingFeeds ? 'Updating...' : 'Update Feeds'}
        </Button>
      </div>

      {(() => {
        const intel = status?.web_shield?.intel;
        if (!intel?.configured) {
          return (
            <div className="mb-4 text-caption text-text-muted" data-testid="web-intel-status">
              Threat intelligence: not configured — using local checks only.
            </div>
          );
        }
        const entries = (intel.url_count ?? 0) + (intel.host_count ?? 0);
        const hours = intel.age_seconds != null ? Math.floor(intel.age_seconds / 3600) : null;
        const freshness = intel.stale
          ? 'out of date'
          : hours != null && hours >= 1 ? `updated ${hours}h ago` : 'up to date';
        return (
          <div className="mb-4 text-caption text-text-muted" data-testid="web-intel-status">
            Threat intelligence: {entries.toLocaleString()} indicators
            {intel.version ? ` · v${intel.version}` : ''} · {freshness}
            {intel.last_error ? ` · last sync error: ${intel.last_error}` : ''}
          </div>
        );
      })()}

      {result && (
        <div className="mt-4 p-4 rounded border border-[var(--avs-border)]" data-testid="web-result">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={RISK_TONE[result.risk_level]}>{result.risk_level}</Badge>
            <span className="text-small font-medium">
              {result.safe ? 'URL appears safe' : 'URL is potentially dangerous'}
            </span>
          </div>
          {result.reasons.length > 0 && (
            <div className="space-y-1">
              {result.reasons.map((reason, i) => (
                <div key={i} className="text-caption text-text-secondary flex items-start gap-1">
                  <ExclamationTriangleIcon className="h-3 w-3 text-semantic-warning shrink-0 mt-0.5" />
                  {reason}
                </div>
              ))}
            </div>
          )}
          {result.categories.length > 0 && (
            <div className="mt-2 flex gap-1 flex-wrap">
              {result.categories.map((cat) => (
                <Badge key={cat} tone="neutral">{cat}</Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Ransomware Tab ──────────────────────────────────────────────

function RansomwareTab({
  status,
  isPro,
  guard,
  actionLoading,
  setActionLoading,
}: {
  status: AdvancedSecurityStatus | null;
  isPro: boolean;
  guard: (fn: () => void) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}) {
  const [alerts, setAlerts] = useState<RansomwareAlert[]>([]);

  const loadAlerts = async () => {
    try {
      const res = await advancedSecurityService.ransomwareAlerts();
      setAlerts(res.alerts || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await advancedSecurityService.ransomwareStart();
      await loadAlerts();
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await advancedSecurityService.ransomwareStop();
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleDeploy = async () => {
    setActionLoading(true);
    try {
      await advancedSecurityService.ransomwareDeploy();
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const running = status?.ransomware_vaccine?.running;

  return (
    <Card title="Ransomware Vaccine" variant="glass" data-testid="ransomware-tab">
      <p className="text-small text-text-secondary mb-4">
        Deploys canary files in protected directories. If ransomware encrypts or deletes these decoy files, an alert is triggered immediately.
      </p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {!running ? (
          <Button variant="primary" size="sm" onClick={() => guard(handleStart)} disabled={!isPro || actionLoading}
            leftIcon={<PlayIcon className="h-4 w-4" />} data-testid="ransomware-start-btn">
            Start Protection
          </Button>
        ) : (
          <Button variant="danger" size="sm" onClick={handleStop} disabled={actionLoading}
            leftIcon={<StopIcon className="h-4 w-4" />} data-testid="ransomware-stop-btn">
            Stop Protection
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => guard(handleDeploy)} disabled={!isPro || actionLoading}
          leftIcon={<LockClosedIcon className="h-4 w-4" />} data-testid="ransomware-deploy-btn">
          Deploy Canaries
        </Button>
        <Button variant="ghost" size="sm" onClick={loadAlerts} leftIcon={<EyeIcon className="h-4 w-4" />}>
          Refresh Alerts
        </Button>
      </div>

      <div className="text-caption text-text-muted mb-4">
        Canary files: {status?.ransomware_vaccine?.canary_files_deployed ?? 0} ·
        Alerts: {status?.ransomware_vaccine?.alerts_triggered ?? 0} ·
        Protected dirs: {status?.ransomware_vaccine?.protected_dirs?.length ?? 0}
      </div>

      {alerts.length === 0 ? (
        <ModuleEmptyState message="No ransomware alerts. Your files are safe." />
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto" data-testid="ransomware-alerts-list">
          {alerts.map((alert, i) => (
            <div key={i} className="flex items-start gap-2 p-3 rounded border border-semantic-danger/30 bg-semantic-danger/5">
              <ExclamationTriangleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge tone={alert.severity === 'critical' ? 'danger' : 'warning'}>{alert.severity}</Badge>
                  <span className="text-caption text-text-muted">{formatTime(alert.timestamp)}</span>
                </div>
                <div className="text-small text-text-primary mt-1">{alert.file_path}</div>
                <div className="text-caption text-text-secondary">
                  Event: {alert.event_type}
                  {alert.process_name && ` · Process: ${alert.process_name}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Email Scanner Tab ───────────────────────────────────────────

function EmailTab({
  status,
  isPro,
  guard,
  actionLoading,
  setActionLoading,
}: {
  status: AdvancedSecurityStatus | null;
  isPro: boolean;
  guard: (fn: () => void) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}) {
  const [filePath, setFilePath] = useState('');
  const [result, setResult] = useState<EmailScanResult | null>(null);

  const handleScan = async () => {
    if (!filePath.trim()) return;
    setActionLoading(true);
    try {
      const res = await advancedSecurityService.emailScan(filePath.trim());
      setResult(res.result);
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  return (
    <Card title="Email Attachment Scanner" variant="glass" data-testid="email-tab">
      <p className="text-small text-text-secondary mb-4">
        Scan email attachments for malicious content: dangerous extensions, macro-enabled Office docs, double extensions, embedded executables in archives.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={filePath}
          onChange={(e) => setFilePath(e.target.value)}
          placeholder="C:\path\to\attachment.ext"
          className="flex-1 px-3 py-2 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small"
          data-testid="email-file-input"
        />
        <Button variant="primary" size="sm" onClick={() => guard(handleScan)} disabled={!isPro || actionLoading || !filePath.trim()}
          leftIcon={actionLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <EnvelopeIcon className="h-4 w-4" />}
          data-testid="email-scan-btn">
          Scan
        </Button>
      </div>

      <div className="text-caption text-text-muted mb-4">
        Files scanned: {status?.email_scanner?.files_scanned ?? 0} ·
        Threats found: {status?.email_scanner?.threats_found ?? 0} ·
        Last scan: {formatRelative(status?.email_scanner?.last_scan)}
      </div>

      {result && (
        <div className="mt-4 p-4 rounded border border-[var(--avs-border)]" data-testid="email-result">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={result.threat_level === 'malicious' ? 'danger' : result.threat_level === 'suspicious' ? 'warning' : 'success'}>
              {result.threat_level}
            </Badge>
            <span className="text-small font-medium">
              {result.safe ? 'File appears safe' : 'File is potentially dangerous'}
            </span>
          </div>
          <div className="text-caption text-text-muted mb-2">
            {result.file_info.name} · {result.file_info.extension} · {result.file_info.size} bytes
          </div>
          {result.threats.length > 0 && (
            <div className="space-y-1">
              {result.threats.map((threat, i) => (
                <div key={i} className="text-caption text-text-secondary flex items-start gap-1">
                  <ExclamationTriangleIcon className="h-3 w-3 text-semantic-warning shrink-0 mt-0.5" />
                  {threat.description}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Boot Sector Tab ─────────────────────────────────────────────

function BootTab({
  status,
  isPro,
  guard,
  actionLoading,
  setActionLoading,
}: {
  status: AdvancedSecurityStatus | null;
  isPro: boolean;
  guard: (fn: () => void) => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}) {
  const [result, setResult] = useState<BootScanResult | null>(null);
  const [backing, setBacking] = useState(false);

  const handleScan = async () => {
    setActionLoading(true);
    try {
      const res = await advancedSecurityService.bootScan();
      setResult(res.result);
    } catch { /* ignore */ }
    setActionLoading(false);
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      await advancedSecurityService.bootBackup();
    } catch { /* ignore */ }
    setBacking(false);
  };

  return (
    <Card title="Boot Sector / MBR Scanner" variant="glass" data-testid="boot-tab">
      <p className="text-small text-text-secondary mb-4">
        Scan the Master Boot Record (MBR) for bootkit malware. Validates boot signature, partition table, and checks against known bootkit signatures.
        Requires administrator privileges.
      </p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Button variant="primary" size="sm" onClick={() => guard(handleScan)} disabled={!isPro || actionLoading}
          leftIcon={actionLoading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ComputerDesktopIcon className="h-4 w-4" />}
          data-testid="boot-scan-btn">
          Scan MBR
        </Button>
        <Button variant="secondary" size="sm" onClick={() => guard(handleBackup)} disabled={!isPro || backing}
          leftIcon={backing ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
          data-testid="boot-backup-btn">
          {backing ? 'Backing up...' : 'Backup MBR'}
        </Button>
      </div>

      <div className="text-caption text-text-muted mb-4">
        Last scan: {formatRelative(status?.boot_scanner?.last_scan)} ·
        Threats found: {status?.boot_scanner?.threats_found ?? 0}
      </div>

      {result && (
        <div className="mt-4 p-4 rounded border border-[var(--avs-border)]" data-testid="boot-result">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone={result.safe ? 'success' : 'danger'}>
              {result.safe ? 'Safe' : 'Threats Detected'}
            </Badge>
            <span className="text-small text-text-secondary">
              Drive: {result.mbr_info.drive}
            </span>
          </div>
          <div className="text-caption text-text-muted space-y-1">
            <div>Boot signature: {result.mbr_info.boot_signature_valid ? 'Valid' : 'Invalid'}</div>
            <div>Partition entries: {result.mbr_info.partition_entries}</div>
            <div>Active partitions: {result.mbr_info.active_partitions}</div>
            <div>Boot code: {result.mbr_info.boot_code_type}</div>
          </div>
          {result.threats.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.threats.map((threat, i) => (
                <div key={i} className="flex items-start gap-1 text-small text-semantic-danger">
                  <ExclamationTriangleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                  {threat.description}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Scam Assistant Tab ──────────────────────────────────────────

const VERDICT_TONE: Record<string, 'success' | 'info' | 'warning' | 'danger'> = {
  scam: 'danger',
  suspicious: 'warning',
  likely_legitimate: 'info',
  insufficient_content: 'info',
};

function ScamAssistantTab() {
  const [text, setText] = useState('');
  const [imagePath, setImagePath] = useState('');
  const [phone, setPhone] = useState('');
  const [sensitivity, setSensitivity] = useState<Sensitivity>('balanced');
  const [result, setResult] = useState<ScamAnalysisResult | null>(null);
  const [phoneResult, setPhoneResult] = useState<PhoneCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guards, setGuards] = useState<GuardStatus | null>(null);
  const [alerts, setAlerts] = useState<GuardAlert[]>([]);
  const [waves, setWaves] = useState<ScamWaves | null>(null);

  const refreshGuards = useCallback(async () => {
    try {
      const [s, a, w] = await Promise.all([
        scamDetectorService.guardsStatus(),
        scamDetectorService.guardsAlerts(10),
        scamDetectorService.scamWaves(),
      ]);
      if (s.result) setGuards(s.result);
      if (a.result) setAlerts(a.result);
      if (w.result) setWaves(w.result);
    } catch { /* guards optional */ }
  }, []);

  useEffect(() => { refreshGuards(); }, [refreshGuards]);

  const toggleGuards = async () => {
    try {
      const res = guards?.running
        ? await scamDetectorService.guardsStop()
        : await scamDetectorService.guardsStart();
      if (res.result) setGuards(res.result);
    } catch { /* ignore */ }
  };

  const analyze = async (kind: 'text' | 'image') => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = kind === 'text'
        ? await scamDetectorService.analyzeText(text, sensitivity)
        : await scamDetectorService.analyzeImage(imagePath.trim(), sensitivity);
      if (res.success && res.result) setResult(res.result);
      else setError(res.error || 'Analysis failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    }
    setLoading(false);
  };

  const checkPhone = async () => {
    if (!phone.trim()) return;
    setPhoneResult(null);
    try {
      const res = await scamDetectorService.checkPhone(phone.trim());
      if (res.success && res.result) setPhoneResult(res.result);
    } catch { /* ignore */ }
  };

  return (
    <>
    <Card title="Scam Assistant" variant="glass" data-testid="scam-tab">
      <p className="text-small text-text-secondary mb-4">
        Paste a suspicious message, email, or chat — or point to a screenshot.
        AVS analyzes it on this PC for scam tactics, impersonation, dangerous
        links, and payment demands. Nothing leaves your device.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <label className="text-caption text-text-muted">Sensitivity</label>
        <select
          value={sensitivity}
          onChange={(e) => setSensitivity(e.target.value as Sensitivity)}
          className="px-2 py-1.5 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small"
          data-testid="scam-sensitivity"
        >
          <option value="high">High — family / elder use</option>
          <option value="balanced">Balanced</option>
          <option value="low">Low — fewer flags</option>
        </select>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the suspicious message, email, or chat here…"
        rows={5}
        className="w-full px-3 py-2 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small mb-3"
        data-testid="scam-text-input"
      />

      <div className="flex items-center gap-2 mb-4">
        <Button variant="primary" size="sm" onClick={() => analyze('text')}
          disabled={loading || !text.trim()}
          leftIcon={loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <MagnifyingGlassIcon className="h-4 w-4" />}
          data-testid="scam-analyze-btn">
          Analyze message
        </Button>
        <input
          type="text"
          value={imagePath}
          onChange={(e) => setImagePath(e.target.value)}
          placeholder="C:\path\to\screenshot.png"
          className="flex-1 px-3 py-2 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small"
          data-testid="scam-image-input"
        />
        <Button variant="secondary" size="sm" onClick={() => analyze('image')}
          disabled={loading || !imagePath.trim()}
          leftIcon={<EyeIcon className="h-4 w-4" />}
          data-testid="scam-image-btn">
          Scan screenshot
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-4 pb-4 border-b border-[var(--avs-border)]">
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Check a phone number (e.g. 1-800-555-0199)"
          className="flex-1 px-3 py-2 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small"
          data-testid="scam-phone-input"
        />
        <Button variant="secondary" size="sm" onClick={checkPhone}
          disabled={!phone.trim()} data-testid="scam-phone-btn">
          Check number
        </Button>
      </div>

      {phoneResult && (
        <div className="mb-4 p-3 rounded border border-[var(--avs-border)]" data-testid="scam-phone-result">
          <Badge tone={phoneResult.verdict === 'suspicious' ? 'warning' : 'info'}>
            {phoneResult.verdict}
          </Badge>
          <span className="text-caption text-text-secondary ml-2">{phoneResult.advice}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded border border-semantic-danger/30 text-small text-semantic-danger" data-testid="scam-error">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-2 p-4 rounded border border-[var(--avs-border)]" data-testid="scam-result">
          <div className="flex items-center gap-3 mb-3">
            <Badge tone={VERDICT_TONE[result.verdict] || 'info'}>{result.verdict.replace(/_/g, ' ')}</Badge>
            <span className="text-small">Score {result.score}/100</span>
            <span className="text-caption text-text-muted">confidence: {result.confidence}</span>
          </div>

          {result.tactics.length > 0 && (
            <div className="mb-3">
              <div className="text-caption text-text-muted mb-1">Detected tactics</div>
              <div className="space-y-1">
                {result.tactics.map((t) => (
                  <div key={t.id} className="text-caption text-text-secondary flex items-start gap-1">
                    <ExclamationTriangleIcon className="h-3 w-3 text-semantic-warning shrink-0 mt-0.5" />
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(result.entities.urls.length > 0 || result.entities.phones.length > 0 || result.entities.crypto.length > 0) && (
            <div className="mb-3 text-caption text-text-muted">
              {result.entities.urls.length > 0 && <div>Links: {result.entities.urls.join(', ')}</div>}
              {result.entities.phones.length > 0 && <div>Numbers: {result.entities.phones.join(', ')}</div>}
              {result.entities.crypto.length > 0 && <div>Crypto addresses found: {result.entities.crypto.length}</div>}
            </div>
          )}

          {result.advice.length > 0 && (
            <div>
              <div className="text-caption text-text-muted mb-1">What to do</div>
              <ul className="space-y-1">
                {result.advice.map((a, i) => (
                  <li key={i} className="text-caption text-text-secondary flex items-start gap-1">
                    <CheckCircleIcon className="h-3 w-3 text-semantic-success shrink-0 mt-0.5" />
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.extracted_text && (
            <details className="mt-3">
              <summary className="text-caption text-text-muted cursor-pointer">Extracted text</summary>
              <pre className="mt-1 text-caption text-text-muted whitespace-pre-wrap">{result.extracted_text}</pre>
            </details>
          )}
        </div>
      )}
    </Card>

    <Card title="Scam Protection Guards" variant="glass" data-testid="scam-guards">
      <div className="flex items-center justify-between mb-3">
        <p className="text-small text-text-secondary flex-1 mr-4">
          Watches for remote-access tools (AnyDesk, TeamViewer, Quick Assist…) starting
          after a blocked scam page, and for crypto clipboard hijacking.
        </p>
        <Button variant={guards?.running ? 'secondary' : 'primary'} size="sm"
          onClick={toggleGuards} data-testid="guards-toggle">
          {guards?.running ? 'Stop guards' : 'Start guards'}
        </Button>
      </div>
      <div className="text-caption text-text-muted mb-3">
        Status: {guards?.running ? 'running' : 'stopped'} ·
        Watching {guards?.rat_tools_watched ?? 0} remote-access tools
      </div>

      {alerts.length > 0 && (
        <div className="mb-3" data-testid="guard-alerts">
          <div className="text-caption text-text-muted mb-1">Recent alerts</div>
          <div className="space-y-1">
            {alerts.map((a, i) => (
              <div key={i} className="text-caption flex items-start gap-1">
                <ExclamationTriangleIcon className={`h-3 w-3 shrink-0 mt-0.5 ${a.severity === 'critical' ? 'text-semantic-danger' : 'text-semantic-warning'}`} />
                <span className="text-text-secondary">{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <FamilyAlertConfig />

      {waves && waves.waves.length > 0 && (
        <div data-testid="scam-waves">
          <div className="text-caption text-text-muted mb-1">
            Scam Wave Alerts — community reports (last {waves.window_hours}h)
          </div>
          <div className="space-y-1">
            {waves.waves.slice(0, 8).map((w, i) => (
              <div key={i} className="text-caption text-text-secondary flex justify-between">
                <span>{w.type === 'host' ? w.value : `${w.value} scams`}</span>
                <span className="text-text-muted">{w.reports} reports</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
    </>
  );
}

// ── Family Alert Config ─────────────────────────────────────────

function FamilyAlertConfig() {
  const [cfg, setCfg] = useState<FamilyConfig | null>(null);
  const [topic, setTopic] = useState('');
  const [contact, setContact] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    scamDetectorService.familyConfig().then((r) => {
      if (r.result) {
        setCfg(r.result);
        setTopic(r.result.ntfy_topic);
        setContact(r.result.contact_name);
      }
    }).catch(() => {});
  }, []);

  const save = async (enabled: boolean) => {
    const r = await scamDetectorService.familyConfig({
      enabled, ntfy_topic: topic, contact_name: contact,
    });
    if (r.result) { setCfg(r.result); setMsg(enabled ? 'Family alerts on' : 'Family alerts off'); }
  };

  const test = async () => {
    const r = await scamDetectorService.testFamilyAlert();
    setMsg(r.result?.sent ? 'Test alert sent' : `Send failed${r.result?.errors ? ': ' + r.result.errors[0] : ''}`);
  };

  return (
    <div className="mb-3 p-3 rounded border border-[var(--avs-border)]" data-testid="family-config">
      <div className="text-caption text-text-muted mb-2">
        Family alerts — notify a trusted contact on critical events (free via ntfy app)
      </div>
      <div className="flex items-center gap-2 mb-2">
        <input type="text" value={contact} onChange={(e) => setContact(e.target.value)}
          placeholder="Contact name (e.g. Daughter)"
          className="w-40 px-2 py-1.5 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-caption" />
        <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)}
          placeholder="ntfy topic (e.g. avs-family-9x2k)"
          className="flex-1 px-2 py-1.5 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-caption"
          data-testid="family-topic" />
      </div>
      <div className="flex items-center gap-2">
        <Button variant={cfg?.enabled ? 'secondary' : 'primary'} size="sm"
          onClick={() => save(!cfg?.enabled)} disabled={!topic.trim()}
          data-testid="family-toggle">
          {cfg?.enabled ? 'Disable' : 'Enable'}
        </Button>
        <Button variant="secondary" size="sm" onClick={test}
          disabled={!cfg?.enabled} data-testid="family-test">
          Send test
        </Button>
        {msg && <span className="text-caption text-text-muted">{msg}</span>}
      </div>
    </div>
  );
}

// ── Safe Banking Tab ────────────────────────────────────────────

function SafeBankingTab() {
  const [status, setStatus] = useState<SafeBankingStatus | null>(null);
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [launched, setLaunched] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await scamDetectorService.safeBankingStatus();
      if (r.result) setStatus(r.result);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async () => {
    setError(null);
    const r = await scamDetectorService.safeBankingAdd(domain.trim());
    if (r.success) { setDomain(''); refresh(); }
    else setError(r.error || 'Could not add site');
  };

  const remove = async (d: string) => {
    await scamDetectorService.safeBankingRemove(d);
    refresh();
  };

  const open = async (d: string) => {
    setError(null);
    const r = await scamDetectorService.safeBankingLaunch(d);
    if (r.success && r.result) setLaunched(`${r.result.url} in ${r.result.browser}`);
    else setError(r.error || 'Launch failed');
  };

  return (
    <Card title="Safe Banking" variant="glass" data-testid="safe-banking-tab">
      <p className="text-small text-text-secondary mb-4">
        Opens your bank in an isolated browser profile — separate cookies, no
        extensions, no sync — so banking sessions cannot be touched by anything
        in your everyday browser.
      </p>

      {status && (
        <div className="text-caption text-text-muted mb-4">
          Browsers found: {Object.keys(status.browsers).join(', ') || 'none'}
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="yourbank.com"
          className="flex-1 px-3 py-2 rounded border border-[var(--avs-border)] bg-[var(--avs-surface)] text-small"
          data-testid="sb-domain-input"
        />
        <Button variant="primary" size="sm" onClick={add} disabled={!domain.trim()}
          data-testid="sb-add-btn">
          Add trusted site
        </Button>
      </div>

      {error && <div className="mb-3 text-small text-semantic-danger" data-testid="sb-error">{error}</div>}
      {launched && <div className="mb-3 text-small text-semantic-success">Opened {launched}</div>}

      {status && status.sites.length > 0 ? (
        <div className="space-y-2" data-testid="sb-sites">
          {status.sites.map((d) => (
            <div key={d} className="flex items-center justify-between p-2.5 rounded border border-[var(--avs-border)]">
              <span className="text-small font-medium">{d}</span>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => open(d)}
                  leftIcon={<LockClosedIcon className="h-3.5 w-3.5" />}>
                  Open protected
                </Button>
                <Button variant="secondary" size="sm" onClick={() => remove(d)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-caption text-text-muted">
          No trusted banking sites yet. Add your bank domain above (e.g. chase.com).
        </div>
      )}
    </Card>
  );
}
