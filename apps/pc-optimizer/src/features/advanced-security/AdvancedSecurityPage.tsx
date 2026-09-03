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

type TabId = 'sandbox' | 'ml' | 'web' | 'ransomware' | 'email' | 'boot';

const TABS: { id: TabId; label: string; icon: typeof BeakerIcon }[] = [
  { id: 'sandbox', label: 'Behavioral Sandbox', icon: BeakerIcon },
  { id: 'ml', label: 'ML Anomaly', icon: ChartBarIcon },
  { id: 'web', label: 'Web Shield', icon: GlobeAltIcon },
  { id: 'ransomware', label: 'Ransomware Vaccine', icon: LockClosedIcon },
  { id: 'email', label: 'Email Scanner', icon: EnvelopeIcon },
  { id: 'boot', label: 'Boot Sector', icon: ComputerDesktopIcon },
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
