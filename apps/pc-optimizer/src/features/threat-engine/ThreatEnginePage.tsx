/**
 * ThreatEnginePage — AVS Shield Threat Engine.
 *
 * Unified antivirus / anti-malware scanning powered by multiple detection
 * sources: hash blocklist, YARA rules, ClamAV signatures, and VirusTotal.
 *
 * Free: scan (quick / full / custom) + view results
 * Pro: scan + view + quarantine / remove threats + configure advanced sources
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
  threatEngineService,
  type ThreatEngineStatus,
  type ThreatScanStatus,
  type ThreatScanResult,
  type ThreatInfo,
  type ThreatHistoryEntry,
  type ThreatDefinitionCounts,
  type ThreatSeverity,
  type ThreatScanType,
  type ClamAvStatus,
  type ClamAvSetupStatus,
} from './threatEngine.service';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
  ArchiveBoxIcon,
  EyeSlashIcon,
  ClockIcon,
  CpuChipIcon,
  DocumentTextIcon,
  KeyIcon,
  FolderOpenIcon,
  BoltIcon,
  ChartBarIcon,
  BeakerIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';

// ── Helpers ─────────────────────────────────────────────────────

const SEVERITY_TONE: Record<
  ThreatSeverity,
  'danger' | 'warning' | 'neutral' | 'info'
> = {
  critical: 'danger',
  high: 'warning',
  medium: 'neutral',
  low: 'info',
};

const SEVERITY_TEXT: Record<ThreatSeverity, string> = {
  critical: 'text-semantic-danger',
  high: 'text-semantic-warning',
  medium: 'text-text-secondary',
  low: 'text-semantic-info',
};

const SEVERITY_BG: Record<ThreatSeverity, string> = {
  critical: 'bg-semantic-danger/10',
  high: 'bg-semantic-warning/10',
  medium: 'bg-surface-muted',
  low: 'bg-semantic-info/10',
};

const SEVERITY_BORDER: Record<ThreatSeverity, string> = {
  critical: 'border-semantic-danger/30',
  high: 'border-semantic-warning/30',
  medium: 'border-[var(--avs-border)]',
  low: 'border-semantic-info/30',
};

const SOURCE_LABELS: Record<string, string> = {
  hash_blocklist: 'Hash Blocklist',
  yara: 'YARA Rules',
  clamav: 'ClamAV',
  virustotal: 'VirusTotal',
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return 'Never';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

// ── Component ───────────────────────────────────────────────────

export default function ThreatEnginePage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ThreatEngineStatus | null>(null);
  const [definitions, setDefinitions] = useState<ThreatDefinitionCounts | null>(null);

  // Scan state
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<ThreatScanStatus | null>(null);
  const [scanResult, setScanResult] = useState<ThreatScanResult | null>(null);
  const [customPath, setCustomPath] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);

  // Action state
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Definitions update
  const [updatingDefs, setUpdatingDefs] = useState(false);
  const [defsResult, setDefsResult] = useState<string | null>(null);

  // ClamAV state
  const [clamAvStatus, setClamAvStatus] = useState<ClamAvStatus | null>(null);
  const [clamAvSetupStatus, setClamAvSetupStatus] = useState<ClamAvSetupStatus | null>(null);
  const [clamAvSetupLoading, setClamAvSetupLoading] = useState(false);
  const [clamAvStarting, setClamAvStarting] = useState(false);
  const [clamAvMessage, setClamAvMessage] = useState<string | null>(null);

  // Config
  const [configOpen, setConfigOpen] = useState(false);
  const [configEnabledSources, setConfigEnabledSources] = useState<string[]>([]);
  const [configApiKey, setConfigApiKey] = useState('');
  const [configMaxFileSize, setConfigMaxFileSize] = useState(50);
  const [configAutoQuarantine, setConfigAutoQuarantine] = useState(false);
  const [configExcludePaths, setConfigExcludePaths] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // History
  const [history, setHistory] = useState<ThreatHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Bootstrap ──────────────────────────────────────────────────

  const loadStatus = useCallback(async () => {
    try {
      const s = await threatEngineService.getStatus();
      setStatus(s);
      setDefinitions(s.definitions);
      setConfigEnabledSources(s.config.enabled_sources ?? []);
      setConfigApiKey(s.config.virustotal_api_key ?? '');
      setConfigMaxFileSize(s.config.scan_max_file_size_mb ?? 50);
      setConfigAutoQuarantine(s.config.auto_quarantine ?? false);
      setConfigExcludePaths((s.config.exclude_paths ?? []).join('\n'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load threat engine status');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await threatEngineService.getHistory();
      setHistory(res.history ?? []);
    } catch {
      // Non-fatal — history is supplementary
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadClamAvStatus = useCallback(async () => {
    try {
      const [statusRes, setupRes] = await Promise.all([
        threatEngineService.getClamAvStatus(),
        threatEngineService.getClamAvSetupStatus(),
      ]);
      if (statusRes.success) setClamAvStatus(statusRes.status);
      if (setupRes.success) setClamAvSetupStatus(setupRes.status);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadStatus();
      await loadHistory();
      void loadClamAvStatus();
      setLoading(false);
    })();
  }, [loadStatus, loadHistory, loadClamAvStatus]);

  // ── Scan polling ───────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollScan = useCallback(
    async (scanId: string) => {
      try {
        const s = await threatEngineService.getScanStatus(scanId);
        setScanStatus(s);

        if (s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled') {
          stopPolling();
          setScanning(false);
          // Fetch full result
          try {
            const result = await threatEngineService.getScanResult(scanId);
            setScanResult(result);
          } catch (e) {
            setScanError(e instanceof Error ? e.message : 'Failed to fetch scan result');
          }
          // Refresh status + history
          void loadStatus();
          void loadHistory();
        }
      } catch (e) {
        stopPolling();
        setScanning(false);
        setScanError(e instanceof Error ? e.message : 'Failed to poll scan status');
      }
    },
    [stopPolling, loadStatus, loadHistory],
  );

  const startScan = useCallback(
    async (scanType: ThreatScanType, path?: string) => {
      setScanning(true);
      setScanError(null);
      setScanResult(null);
      setScanStatus(null);
      try {
        let res;
        if (scanType === 'quick') {
          res = await threatEngineService.quickScan();
        } else if (scanType === 'full') {
          res = await threatEngineService.fullScan();
        } else {
          if (!path) {
            setScanError('Please specify a path for a custom scan');
            setScanning(false);
            return;
          }
          res = await threatEngineService.scan(path, 'custom');
        }

        if (!res.success) {
          setScanError('Failed to start scan');
          setScanning(false);
          return;
        }

        setScanStatus({
          scan_id: res.scan_id,
          status: 'running',
          progress: 0,
          files_scanned: 0,
          files_total: res.files_total,
          threats_found: 0,
        });

        // Start polling
        stopPolling();
        pollRef.current = setInterval(() => {
          void pollScan(res.scan_id);
        }, 1500);
      } catch (e) {
        setScanError(e instanceof Error ? e.message : 'Failed to start scan');
        setScanning(false);
      }
    },
    [stopPolling, pollScan],
  );

  const handleCancelScan = useCallback(async () => {
    if (!scanStatus) return;
    try {
      await threatEngineService.cancelScan(scanStatus.scan_id);
      stopPolling();
      setScanning(false);
      setScanStatus((prev) => (prev ? { ...prev, status: 'cancelled' } : null));
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Failed to cancel scan');
    }
  }, [scanStatus, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ── Threat actions ─────────────────────────────────────────────

  const handleQuarantine = async (threat: ThreatInfo) => {
    if (!isPro) {
      showUpgrade('Threat Engine');
      return;
    }
    setActingOn(threat.id);
    setActionError(null);
    try {
      await threatEngineService.quarantineThreat(threat.file_path, threat);
      // Remove from results
      setScanResult((prev) =>
        prev
          ? {
              ...prev,
              threats: prev.threats.filter((t) => t.id !== threat.id),
              threats_found: prev.threats_found - 1,
            }
          : null,
      );
      void loadStatus();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to quarantine threat');
    } finally {
      setActingOn(null);
    }
  };

  const handleRemove = async (threat: ThreatInfo) => {
    if (!isPro) {
      showUpgrade('Threat Engine');
      return;
    }
    setActingOn(threat.id);
    setActionError(null);
    try {
      await threatEngineService.removeThreat(threat.file_path);
      setScanResult((prev) =>
        prev
          ? {
              ...prev,
              threats: prev.threats.filter((t) => t.id !== threat.id),
              threats_found: prev.threats_found - 1,
            }
          : null,
      );
      void loadStatus();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to remove threat');
    } finally {
      setActingOn(null);
    }
  };

  const handleIgnore = (threat: ThreatInfo) => {
    setScanResult((prev) =>
      prev
        ? {
            ...prev,
            threats: prev.threats.filter((t) => t.id !== threat.id),
            threats_found: prev.threats_found - 1,
          }
        : null,
    );
  };

  // ── Definitions ────────────────────────────────────────────────

  const handleUpdateDefs = async () => {
    setUpdatingDefs(true);
    setDefsResult(null);
    try {
      const res = await threatEngineService.updateDefinitions(true);
      if (res.success) {
        const counts = Object.values(res.results);
        const updated = counts.filter((r) => r.updated).length;
        setDefsResult(`Updated ${updated} source(s) successfully`);
        void loadStatus();
        void loadClamAvStatus();
      } else {
        setDefsResult('Definition update failed');
      }
    } catch (e) {
      setDefsResult(e instanceof Error ? e.message : 'Failed to update definitions');
    } finally {
      setUpdatingDefs(false);
    }
  };

  // ── ClamAV ─────────────────────────────────────────────────────

  const handleClamAvSetup = async () => {
    setClamAvSetupLoading(true);
    setClamAvMessage(null);
    try {
      const res = await threatEngineService.setupClamAv();
      setClamAvMessage(res.message || (res.success ? 'Setup started' : 'Setup failed'));
      void loadClamAvStatus();
    } catch (e) {
      setClamAvMessage(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setClamAvSetupLoading(false);
    }
  };

  const handleClamAvStart = async () => {
    setClamAvStarting(true);
    setClamAvMessage(null);
    try {
      const res = await threatEngineService.startClamAvDaemon();
      setClamAvMessage(res.message || (res.success ? 'Daemon started' : 'Failed to start'));
      void loadClamAvStatus();
    } catch (e) {
      setClamAvMessage(e instanceof Error ? e.message : 'Failed to start daemon');
    } finally {
      setClamAvStarting(false);
    }
  };

  // ── Config ─────────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    if (!isPro) {
      showUpgrade('Threat Engine');
      return;
    }
    setSavingConfig(true);
    setConfigSaved(false);
    setActionError(null);
    try {
      const excludeList = configExcludePaths
        .split('\n')
        .map((p) => p.trim())
        .filter(Boolean);
      const res = await threatEngineService.configure({
        enabled_sources: configEnabledSources,
        virustotal_api_key: configApiKey,
        scan_max_file_size_mb: configMaxFileSize,
        auto_quarantine: configAutoQuarantine,
        exclude_paths: excludeList,
      });
      if (res.success) {
        setConfigSaved(true);
        void loadStatus();
        setTimeout(() => setConfigSaved(false), 3000);
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Failed to save configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  const toggleSource = (source: string) => {
    setConfigEnabledSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source],
    );
  };

  const allSources = ['hash_blocklist', 'yara', 'clamav', 'virustotal'];
  const advancedSources = ['virustotal'];

  // ── Render ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div data-testid="page-threat-engine" className="space-y-4">
        <PageHeader
          title="Threat Engine"
          description="Unified antivirus and anti-malware scanning powered by hash blocklists, YARA rules, ClamAV signatures, and VirusTotal."
          actions={
            <div className="flex items-center gap-2">
              <ProStatusPill />
              <HelpButton text="The Threat Engine scans your files using multiple detection sources. Quick Scan checks common malware locations, Full Scan checks your entire system, and Custom Scan lets you pick a folder." />
            </div>
          }
        />
        <ModuleLoadingState message="Loading threat engine…" testId="threat-engine-loading" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div data-testid="page-threat-engine" className="space-y-4">
        <PageHeader
          title="Threat Engine"
          description="Unified antivirus and anti-malware scanning powered by hash blocklists, YARA rules, ClamAV signatures, and VirusTotal."
          actions={
            <div className="flex items-center gap-2">
              <ProStatusPill />
              <HelpButton text="The Threat Engine scans your files using multiple detection sources." />
            </div>
          }
        />
        <ModuleErrorState
          message={error}
          onRetry={() => {
            setError(null);
            void loadStatus();
          }}
          testId="threat-engine-error"
        />
      </div>
    );
  }

  const progressPct = scanStatus
    ? scanStatus.files_total > 0
      ? Math.round((scanStatus.files_scanned / scanStatus.files_total) * 100)
      : scanStatus.progress
    : 0;

  return (
    <div data-testid="page-threat-engine" className="space-y-4">
      <PageHeader
        title="Threat Engine"
        description="Unified antivirus and anti-malware scanning powered by hash blocklists, YARA rules, ClamAV signatures, and VirusTotal."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <HelpButton text="The Threat Engine scans your files using multiple detection sources. Quick Scan checks common malware locations, Full Scan checks your entire system, and Custom Scan lets you pick a folder. Pro users can quarantine, remove, and configure advanced sources like VirusTotal." />
          </div>
        }
      />

      {/* Status overview */}
      {status && (
        <Card variant="glass" className="p-6" data-testid="threat-engine-status">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
                  status.status === 'active' || status.status === 'scanning'
                    ? 'bg-semantic-success/10'
                    : status.status === 'error'
                      ? 'bg-semantic-danger/10'
                      : 'bg-surface-muted'
                }`}
              >
                {status.status === 'active' || status.status === 'scanning' ? (
                  <ShieldCheckIcon className="h-6 w-6 text-semantic-success" />
                ) : status.status === 'error' ? (
                  <ShieldExclamationIcon className="h-6 w-6 text-semantic-danger" />
                ) : (
                  <ShieldCheckIcon className="h-6 w-6 text-text-muted" />
                )}
              </div>
              <div>
                <div className="text-section-title text-text-primary">Engine Status</div>
                <div className="flex items-center gap-2 mt-1">
                  <Badge
                    tone={
                      status.status === 'active' || status.status === 'scanning'
                        ? 'success'
                        : status.status === 'error'
                          ? 'danger'
                          : 'neutral'
                    }
                    dot
                  >
                    {status.status === 'active'
                      ? 'Active'
                      : status.status === 'scanning'
                        ? 'Scanning'
                        : status.status === 'error'
                          ? 'Error'
                          : 'Idle'}
                  </Badge>
                  {status.active_scans > 0 && (
                    <span className="text-caption text-text-muted">
                      {status.active_scans} active scan{status.active_scans > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Enabled sources */}
            <div className="flex flex-wrap items-center gap-2" data-testid="threat-enabled-sources">
              {allSources.map((src) => {
                const enabled = status.enabled_sources.includes(src);
                const isAdvanced = advancedSources.includes(src);
                return (
                  <span
                    key={src}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium ${
                      enabled
                        ? 'bg-semantic-success/10 text-semantic-success border border-semantic-success/20'
                        : 'bg-surface-muted text-text-muted border border-[var(--avs-border)]'
                    }`}
                  >
                    {enabled ? (
                      <CheckCircleIcon className="h-3.5 w-3.5" />
                    ) : (
                      <XCircleIcon className="h-3.5 w-3.5" />
                    )}
                    {SOURCE_LABELS[src] || src}
                    {isAdvanced && !isPro && (
                      <span className="text-caption text-brand-primary">Pro</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Definitions */}
      {definitions && (
        <Card variant="glass" className="p-5" data-testid="threat-definitions">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                <DocumentTextIcon className="h-5 w-5 text-brand-primary" />
              </div>
              <div>
                <div className="text-small font-semibold text-text-primary">Threat Definitions</div>
                <div className="text-caption text-text-muted mt-0.5">
                  Last updated: {formatRelative(definitions.last_updated)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6" data-testid="threat-def-counts">
              <DefStat label="Hash Blocklist" value={definitions.hash_blocklist} />
              <DefStat label="YARA Rules" value={definitions.yara_rules} />
              <DefStat label="ClamAV Sigs" value={definitions.clamav_signatures} />
            </div>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={
                updatingDefs ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowPathIcon className="h-4 w-4" />
                )
              }
              onClick={handleUpdateDefs}
              disabled={updatingDefs}
              data-testid="threat-update-defs"
            >
              {updatingDefs ? 'Updating…' : 'Update Definitions'}
            </Button>
          </div>

          {defsResult && (
            <div
              className="mt-3 text-caption text-text-secondary"
              data-testid="threat-defs-result"
            >
              {defsResult}
            </div>
          )}
        </Card>
      )}

      {/* ClamAV Setup & Status */}
      <Card variant="glass" className="p-5" data-testid="threat-clamav-card">
        <div className="flex items-center gap-3 mb-4">
          <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
            <BeakerIcon className="h-5 w-5 text-brand-primary" />
          </div>
          <div className="flex-1">
            <div className="text-small font-semibold text-text-primary">ClamAV Antivirus Engine</div>
            <div className="text-caption text-text-muted mt-0.5">
              Open-source signature-based malware scanner. Download and install ClamAV portable to enable additional detection.
            </div>
          </div>
          {clamAvStatus?.clamd_running && (
            <Badge tone="success" data-testid="clamav-running-badge">Running</Badge>
          )}
          {clamAvStatus && !clamAvStatus.clamd_running && clamAvStatus.installed && (
            <Badge tone="warning" data-testid="clamav-stopped-badge">Stopped</Badge>
          )}
          {clamAvStatus && !clamAvStatus.installed && (
            <Badge tone="neutral" data-testid="clamav-not-installed-badge">Not Installed</Badge>
          )}
        </div>

        {/* Status info */}
        {clamAvStatus && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="clamav-status-grid">
            <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
              <div className="text-lg font-bold text-text-primary">
                {clamAvStatus.signature_count.toLocaleString()}
              </div>
              <div className="text-caption text-text-muted">Signatures</div>
            </div>
            <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
              <div className="text-lg font-bold text-text-primary">
                {clamAvStatus.version ? clamAvStatus.version.split('/')[0] : '—'}
              </div>
              <div className="text-caption text-text-muted">Version</div>
            </div>
            <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
              <div className="text-lg font-bold text-text-primary">
                {clamAvStatus.installed ? 'Yes' : 'No'}
              </div>
              <div className="text-caption text-text-muted">Installed</div>
            </div>
            <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
              <div className="text-lg font-bold text-text-primary">
                {clamAvSetupStatus?.setup_in_progress ? 'Yes' : 'No'}
              </div>
              <div className="text-caption text-text-muted">Setup Running</div>
            </div>
          </div>
        )}

        {/* Setup progress */}
        {clamAvSetupStatus?.setup_in_progress && clamAvSetupStatus.setup_progress && (
          <div className="mb-4 p-3 rounded bg-semantic-info/5 border border-semantic-info/20" data-testid="clamav-setup-progress">
            <div className="text-small font-medium text-text-primary">
              Setup in progress: {String((clamAvSetupStatus.setup_progress as Record<string, unknown>).phase || '...')}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {clamAvStatus && !clamAvStatus.installed && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleClamAvSetup}
              disabled={clamAvSetupLoading || !!clamAvSetupStatus?.setup_in_progress}
              leftIcon={
                clamAvSetupLoading ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <BeakerIcon className="h-4 w-4" />
                )
              }
              data-testid="clamav-setup-btn"
            >
              {clamAvSetupLoading ? 'Starting...' : 'Install ClamAV'}
            </Button>
          )}
          {clamAvStatus?.installed && !clamAvStatus.clamd_running && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleClamAvStart}
              disabled={clamAvStarting}
              leftIcon={
                clamAvStarting ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayIcon className="h-4 w-4" />
                )
              }
              data-testid="clamav-start-btn"
            >
              {clamAvStarting ? 'Starting...' : 'Start Daemon'}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadClamAvStatus()}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            data-testid="clamav-refresh-btn"
          >
            Refresh
          </Button>
        </div>

        {clamAvMessage && (
          <div className="mt-3 text-caption text-text-secondary" data-testid="clamav-message">
            {clamAvMessage}
          </div>
        )}
      </Card>

      {/* Scan controls */}
      <Card variant="glass" className="p-6" data-testid="threat-scan-controls">
        <div className="flex items-center gap-3 mb-4">
          <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-2.5">
            <ShieldExclamationIcon className="h-5 w-5 text-semantic-warning" />
          </div>
          <div>
            <div className="text-section-title text-text-primary">Run a Scan</div>
            <p className="text-caption text-text-secondary mt-0.5">
              Quick Scan checks common malware locations. Full Scan checks your entire system. Custom Scan targets a specific folder.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            size="lg"
            leftIcon={
              scanning ? (
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
              ) : (
                <BoltIcon className="h-5 w-5" />
              )
            }
            onClick={() => startScan('quick')}
            disabled={scanning}
            data-testid="threat-quick-scan"
          >
            {scanning ? 'Scanning…' : 'Quick Scan'}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            leftIcon={<ShieldCheckIcon className="h-5 w-5" />}
            onClick={() => startScan('full')}
            disabled={scanning}
            data-testid="threat-full-scan"
          >
            Full Scan
          </Button>

          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1">
              <FolderOpenIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="C:\Users or a folder path…"
                disabled={scanning}
                className="w-full h-10 pl-9 pr-3 rounded-[var(--avs-radius-md)] bg-surface-muted border border-[var(--avs-border)] text-small text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary focus-visible:shadow-focus"
                data-testid="threat-custom-path"
              />
            </div>
            <Button
              variant="secondary"
              size="lg"
              leftIcon={<FolderOpenIcon className="h-5 w-5" />}
              onClick={() => startScan('custom', customPath)}
              disabled={scanning || !customPath.trim()}
              data-testid="threat-custom-scan"
            >
              Custom Scan
            </Button>
          </div>
        </div>
      </Card>

      {/* Scan error */}
      {scanError && (
        <div
          className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3"
          data-testid="threat-scan-error"
        >
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Scan Error</div>
            <p className="text-caption text-text-secondary mt-1">{scanError}</p>
          </div>
        </div>
      )}

      {/* Scan progress */}
      {scanStatus && scanning && (
        <Card variant="glass" className="p-6" data-testid="threat-scan-progress">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <ArrowPathIcon className="h-5 w-5 text-brand-primary animate-spin" />
              <div>
                <div className="text-small font-semibold text-text-primary">
                  Scanning… {progressPct}%
                </div>
                <div className="text-caption text-text-muted">
                  {scanStatus.files_scanned.toLocaleString()} /{' '}
                  {scanStatus.files_total.toLocaleString()} files
                  {scanStatus.threats_found > 0 && (
                    <span className="text-semantic-danger">
                      {' · '}
                      {scanStatus.threats_found} threat{scanStatus.threats_found > 1 ? 's' : ''} found
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<XCircleIcon className="h-4 w-4" />}
              onClick={handleCancelScan}
              data-testid="threat-cancel-scan"
            >
              Cancel
            </Button>
          </div>
          {/* Progress bar */}
          <div
            className="h-2 w-full rounded-full bg-surface-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-gradient-brand transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </Card>
      )}

      {/* Scan results */}
      {scanResult && !scanning && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="threat-scan-summary">
            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
                  <ChartBarIcon className="h-5 w-5 text-brand-primary" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Files Scanned</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">
                    {scanResult.files_scanned.toLocaleString()}
                  </div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-danger/10 p-2.5">
                  <ShieldExclamationIcon className="h-5 w-5 text-semantic-danger" />
                </div>
                <div>
                  <div className="text-caption text-text-muted">Threats Found</div>
                  <div className="text-small font-semibold text-text-primary tabular-nums">
                    {scanResult.threats_found}
                  </div>
                </div>
              </div>
            </Card>

            <Card variant="glass" className="p-4">
              <div className="flex items-center gap-3">
                <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-semantic-success/10 p-2.5">
                  {scanResult.status === 'completed' ? (
                    <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
                  ) : (
                    <XCircleIcon className="h-5 w-5 text-text-muted" />
                  )}
                </div>
                <div>
                  <div className="text-caption text-text-muted">Scan Status</div>
                  <div className="text-small font-semibold text-text-primary capitalize">
                    {scanResult.status}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Errors from scan */}
          {scanResult.errors.length > 0 && (
            <div
              className="rounded-[var(--avs-radius-md)] border border-semantic-warning/30 bg-semantic-warning/5 p-4"
              data-testid="threat-scan-warnings"
            >
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5" />
                <div>
                  <div className="text-small font-medium text-text-primary">
                    {scanResult.errors.length} warning{scanResult.errors.length > 1 ? 's' : ''}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {scanResult.errors.slice(0, 5).map((err, i) => (
                      <li key={i} className="text-caption text-text-secondary">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Threat list */}
          {scanResult.threats.length > 0 ? (
            <Card
              title={`Detected Threats (${scanResult.threats.length})`}
              variant="glass"
              data-testid="threat-list"
            >
              <div className="space-y-2">
                {scanResult.threats.map((threat, i) => (
                  <div
                    key={threat.id || i}
                    className={`rounded-[var(--avs-radius-sm)] border ${SEVERITY_BORDER[threat.severity]} ${SEVERITY_BG[threat.severity]} px-4 py-3`}
                    data-testid={`threat-item-${i}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div
                          className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${SEVERITY_BG[threat.severity]}`}
                        >
                          <ShieldExclamationIcon
                            className={`h-4 w-4 ${SEVERITY_TEXT[threat.severity]}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-small font-medium text-text-primary truncate">
                              {threat.file_name}
                            </span>
                            <Badge tone={SEVERITY_TONE[threat.severity]}>
                              {threat.severity}
                            </Badge>
                            <Badge tone="neutral">
                              {SOURCE_LABELS[threat.detection_source] || threat.detection_source}
                            </Badge>
                          </div>
                          <div className="text-caption text-text-muted mt-0.5 truncate">
                            {threat.threat_name}
                            {threat.threat_type && ` · ${threat.threat_type}`}
                          </div>
                          <div className="text-caption text-text-muted mt-0.5 truncate">
                            {threat.file_path}
                          </div>
                          {threat.details && (
                            <div className="text-caption text-text-secondary mt-1">
                              {threat.details}
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-1.5 text-caption text-text-muted">
                            <span>
                              Confidence:{' '}
                              <span className="font-medium text-text-secondary">
                                {Math.round(threat.confidence * 100)}%
                              </span>
                            </span>
                            <span>Size: {formatBytes(threat.file_size)}</span>
                            {threat.sha256 && (
                              <span className="truncate max-w-[120px]" title={threat.sha256}>
                                SHA256: {threat.sha256.slice(0, 12)}…
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="secondary"
                          leftIcon={
                            actingOn === threat.id ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArchiveBoxIcon className="h-4 w-4" />
                            )
                          }
                          onClick={() => handleQuarantine(threat)}
                          disabled={actingOn === threat.id}
                          data-testid={`threat-quarantine-${i}`}
                        >
                          {isPro ? 'Quarantine' : 'Upgrade'}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          leftIcon={
                            actingOn === threat.id ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <TrashIcon className="h-4 w-4" />
                            )
                          }
                          onClick={() => handleRemove(threat)}
                          disabled={actingOn === threat.id}
                          data-testid={`threat-remove-${i}`}
                        >
                          {isPro ? 'Remove' : 'Upgrade'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<EyeSlashIcon className="h-4 w-4" />}
                          onClick={() => handleIgnore(threat)}
                          data-testid={`threat-ignore-${i}`}
                        >
                          Ignore
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <ModuleEmptyState
              icon={CheckCircleIcon}
              title="No Threats Found"
              message="Your system appears clean. No threats were detected during this scan."
              testId="threat-all-clean"
            />
          )}
        </>
      )}

      {/* Action error */}
      {actionError && (
        <div
          className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3"
          data-testid="threat-action-error"
        >
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Action Failed</div>
            <p className="text-caption text-text-secondary mt-1">{actionError}</p>
          </div>
        </div>
      )}

      {/* Configuration panel */}
      <Card variant="glass" data-testid="threat-config-panel">
        <button
          className="w-full flex items-center justify-between p-5 text-left"
          onClick={() => setConfigOpen((v) => !v)}
          data-testid="threat-config-toggle"
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-brand-primary/10 p-2.5">
              <CpuChipIcon className="h-5 w-5 text-brand-primary" />
            </div>
            <div>
              <div className="text-small font-semibold text-text-primary">
                Engine Configuration
              </div>
              <div className="text-caption text-text-muted">
                Enable detection sources, set VirusTotal API key, configure exclusions
              </div>
            </div>
          </div>
          <span className="text-text-muted text-small">
            {configOpen ? 'Collapse' : 'Expand'}
          </span>
        </button>

        {configOpen && (
          <div className="border-t border-[var(--avs-border)] p-5 space-y-5">
            {/* Enabled sources */}
            <div data-testid="threat-config-sources">
              <div className="text-small font-medium text-text-primary mb-2">
                Detection Sources
              </div>
              <div className="flex flex-wrap gap-3">
                {allSources.map((src) => {
                  const enabled = configEnabledSources.includes(src);
                  const isAdvanced = advancedSources.includes(src);
                  const locked = isAdvanced && !isPro;
                  return (
                    <label
                      key={src}
                      className={`flex items-center gap-2 rounded-[var(--avs-radius-md)] border px-3 py-2 cursor-pointer ${
                        enabled
                          ? 'border-brand-primary/30 bg-brand-primary/5'
                          : 'border-[var(--avs-border)] bg-surface-muted'
                      } ${locked ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() => {
                          if (locked) {
                            showUpgrade('Threat Engine');
                            return;
                          }
                          toggleSource(src);
                        }}
                        className="h-4 w-4 accent-[var(--avs-brand-primary)]"
                        data-testid={`threat-config-source-${src}`}
                      />
                      <span className="text-small text-text-primary">
                        {SOURCE_LABELS[src] || src}
                      </span>
                      {locked && (
                        <span className="text-caption text-brand-primary">Pro</span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* VirusTotal API key */}
            <div data-testid="threat-config-apikey">
              <label className="text-small font-medium text-text-primary flex items-center gap-2">
                <KeyIcon className="h-4 w-4 text-text-muted" />
                VirusTotal API Key
                {!isPro && <span className="text-caption text-brand-primary">Pro</span>}
              </label>
              <input
                type="password"
                value={configApiKey}
                onChange={(e) => setConfigApiKey(e.target.value)}
                disabled={!isPro}
                placeholder={isPro ? 'Enter your VirusTotal API key…' : 'Professional required'}
                className="mt-2 w-full h-10 px-3 rounded-[var(--avs-radius-md)] bg-surface-muted border border-[var(--avs-border)] text-small text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary focus-visible:shadow-focus disabled:cursor-not-allowed"
                data-testid="threat-config-apikey-input"
              />
              <p className="text-caption text-text-muted mt-1">
                Get a free API key at virustotal.com. Required for VirusTotal source.
              </p>
            </div>

            {/* Max file size */}
            <div data-testid="threat-config-maxsize">
              <label className="text-small font-medium text-text-primary">
                Max File Size (MB): {configMaxFileSize}
              </label>
              <input
                type="range"
                min={1}
                max={500}
                step={1}
                value={configMaxFileSize}
                onChange={(e) => setConfigMaxFileSize(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--avs-brand-primary)]"
                data-testid="threat-config-maxsize-input"
              />
              <p className="text-caption text-text-muted mt-1">
                Files larger than this are skipped during scanning.
              </p>
            </div>

            {/* Auto quarantine */}
            <div className="flex items-center gap-3" data-testid="threat-config-autoquarantine">
              <input
                type="checkbox"
                checked={configAutoQuarantine}
                onChange={(e) => setConfigAutoQuarantine(e.target.checked)}
                disabled={!isPro}
                className="h-4 w-4 accent-[var(--avs-brand-primary)]"
                id="threat-auto-quarantine"
              />
              <label htmlFor="threat-auto-quarantine" className="text-small text-text-primary">
                Auto-quarantine detected threats
                {!isPro && <span className="text-caption text-brand-primary ml-2">Pro</span>}
              </label>
            </div>

            {/* Exclude paths */}
            <div data-testid="threat-config-excludes">
              <label className="text-small font-medium text-text-primary">
                Excluded Paths (one per line)
              </label>
              <textarea
                value={configExcludePaths}
                onChange={(e) => setConfigExcludePaths(e.target.value)}
                disabled={!isPro}
                placeholder={'C:\\Windows\\Temp\nC:\\Program Files\\AVS'}
                rows={3}
                className="mt-2 w-full px-3 py-2 rounded-[var(--avs-radius-md)] bg-surface-muted border border-[var(--avs-border)] text-small text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-primary focus-visible:shadow-focus disabled:cursor-not-allowed font-mono"
                data-testid="threat-config-excludes-input"
              />
            </div>

            {/* Save button */}
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="md"
                leftIcon={
                  savingConfig ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircleIcon className="h-4 w-4" />
                  )
                }
                onClick={handleSaveConfig}
                disabled={savingConfig}
                data-testid="threat-config-save"
              >
                {savingConfig ? 'Saving…' : isPro ? 'Save Configuration' : 'Upgrade to Configure'}
              </Button>
              {configSaved && (
                <span
                  className="text-small text-semantic-success flex items-center gap-1"
                  data-testid="threat-config-saved"
                >
                  <CheckCircleIcon className="h-4 w-4" />
                  Saved
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Scan history */}
      <Card
        title="Scan History"
        variant="glass"
        data-testid="threat-history"
      >
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <ArrowPathIcon className="h-6 w-6 text-text-muted animate-spin" />
          </div>
        ) : history.length === 0 ? (
          <ModuleEmptyState
            icon={ClockIcon}
            title="No Scan History"
            message="Your completed scans will appear here."
            testId="threat-history-empty"
          />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {history.map((entry, i) => (
              <div
                key={entry.scan_id || i}
                className="rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3"
                data-testid={`threat-history-${i}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${
                        entry.threats_found > 0
                          ? 'bg-semantic-danger/10'
                          : 'bg-semantic-success/10'
                      }`}
                    >
                      {entry.threats_found > 0 ? (
                        <ShieldExclamationIcon className="h-4 w-4 text-semantic-danger" />
                      ) : (
                        <CheckCircleIcon className="h-4 w-4 text-semantic-success" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-small font-medium text-text-primary capitalize">
                          {entry.scan_type} Scan
                        </span>
                        <Badge tone={entry.threats_found > 0 ? 'danger' : 'success'}>
                          {entry.threats_found} threat{entry.threats_found !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <div className="text-caption text-text-muted mt-0.5">
                        {formatTime(entry.started_at)}
                        {entry.completed_at && ` → ${formatTime(entry.completed_at)}`}
                        {' · '}
                        {entry.files_scanned.toLocaleString()} files scanned
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Free edition notice */}
      {!isPro && (
        <div
          className="rounded-[var(--avs-radius-md)] border border-amber-400/30 bg-amber-400/5 p-4 flex items-center justify-between"
          data-testid="threat-free-notice"
        >
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can scan and view threats for free. Upgrade to Professional to quarantine,
              remove threats, and configure advanced sources like VirusTotal.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => showUpgrade('Threat Engine')}
            leftIcon={<ShieldCheckIcon className="h-4 w-4" />}
            data-testid="threat-upgrade-btn"
          >
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function DefStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-small font-semibold text-text-primary tabular-nums">
        {value.toLocaleString()}
      </div>
      <div className="text-caption text-text-muted">{label}</div>
    </div>
  );
}
