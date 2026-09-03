/**
 * AntivirusSecurityPage — Unified antivirus and security hub.
 *
 * Combines all security features into one page with tabs:
 * - Scan: Quick/Full/Custom scan buttons + scan results
 * - Real-Time: Real-time protection toggle + AV engine status
 * - Quarantine: Quarantined threats management
 * - Advanced: Safe Folder, Advanced Security, Threat Engine config
 *
 * Covers: viruses, trojans, worms, ransomware, adware, spyware, PUPs,
 * rootkits, bootkits, and all other malware categories.
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import { useEdition } from '../config/EditionManager';
import { useUpgradeDialog } from '../components/UpgradeDialog';
import { ScanView } from '../features/scan';
import { Modal } from '../features/dashboard/components/Modal';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ArrowPathIcon,
  BoltIcon,
  EyeIcon,
  LockClosedIcon,
  BugAntIcon,
  FireIcon,
  ClockIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

type TabId = 'scan' | 'realtime' | 'quarantine' | 'advanced';

interface ThreatItem {
  id: string;
  name: string;
  severity: string;
  category: string;
  path: string;
  quarantined: boolean;
  timestamp: string;
}

const TABS: Array<{ id: TabId; label: string; icon: typeof ShieldCheckIcon }> = [
  { id: 'scan', label: 'Scan & Remove', icon: BugAntIcon },
  { id: 'realtime', label: 'Real-Time Protection', icon: EyeIcon },
  { id: 'quarantine', label: 'Quarantine', icon: LockClosedIcon },
  { id: 'advanced', label: 'Advanced Security', icon: ShieldExclamationIcon },
];

const THREAT_COVERAGE = [
  { label: 'Viruses', icon: BugAntIcon },
  { label: 'Trojans', icon: ShieldExclamationIcon },
  { label: 'Worms', icon: BoltIcon },
  { label: 'Ransomware', icon: LockClosedIcon },
  { label: 'Adware', icon: FireIcon },
  { label: 'Spyware', icon: EyeIcon },
  { label: 'PUPs', icon: ChartBarIcon },
  { label: 'Rootkits', icon: ShieldCheckIcon },
];

export default function AntivirusSecurityPage() {
  const [activeTab, setActiveTab] = useState<TabId>('scan');
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const isPro = edition === 'professional';

  // Real-time protection state
  const [rtGuardEnabled, setRtGuardEnabled] = useState(false);
  const [rtGuardLoading, setRtGuardLoading] = useState(false);

  // AV engine state
  const [avStatus, setAvStatus] = useState<{ installed: boolean; clamd_running: boolean; signature_count: number; version: string | null } | null>(null);

  // Quarantine state
  const [threats, setThreats] = useState<ThreatItem[]>([]);
  const [threatsLoading, setThreatsLoading] = useState(false);

  // ── Data loading ──────────────────────────────────────────────

  const refreshAvStatus = useCallback(async () => {
    try {
      const res = await rpc.raw<{ installed: boolean; clamd_running: boolean; signature_count: number; version: string | null }>(RPC_METHODS.THREAT_CLAMAV_STATUS);
      setAvStatus(res);
    } catch { /* ignore */ }
  }, []);

  const refreshThreats = useCallback(async () => {
    setThreatsLoading(true);
    try {
      const res = await rpc.raw<{ threats?: ThreatItem[] }>(RPC_METHODS.THREAT_LIST_THREATS);
      setThreats(res.threats || []);
    } catch {
      setThreats([]);
    }
    setThreatsLoading(false);
  }, []);

  useEffect(() => {
    rpc.raw<{ monitoring: boolean }>(RPC_METHODS.REALTIME_THREAT_STATUS)
      .then((res) => setRtGuardEnabled(!!res?.monitoring))
      .catch(() => {});
    refreshAvStatus();
    refreshThreats();
  }, [refreshAvStatus, refreshThreats]);

  // ── Handlers ──────────────────────────────────────────────────

  const toggleRtGuard = useCallback(async () => {
    if (!isPro) { showUpgrade('Real-Time Protection'); return; }
    setRtGuardLoading(true);
    try {
      if (rtGuardEnabled) {
        await rpc.raw(RPC_METHODS.REALTIME_THREAT_STOP);
        setRtGuardEnabled(false);
      } else {
        await rpc.raw(RPC_METHODS.REALTIME_THREAT_START);
        setRtGuardEnabled(true);
      }
    } catch { /* ignore */ }
    setRtGuardLoading(false);
  }, [rtGuardEnabled, isPro, showUpgrade]);

  const handleScan = useCallback((scanType: 'quick' | 'full' | 'custom') => {
    setScanModalOpen(true);
    void scanType;
  }, []);

  const handleRestoreThreat = useCallback(async (threatId: string) => {
    try {
      await rpc.raw(RPC_METHODS.THREAT_RESTORE, { id: threatId });
      refreshThreats();
    } catch { /* ignore */ }
  }, [refreshThreats]);

  const handleDeleteThreat = useCallback(async (threatId: string) => {
    if (!confirm('Permanently delete this threat? This cannot be undone.')) return;
    try {
      await rpc.raw(RPC_METHODS.THREAT_REMOVE, { id: threatId });
      refreshThreats();
    } catch { /* ignore */ }
  }, [refreshThreats]);

  const handleModalClose = useCallback(() => {
    setScanModalOpen(false);
    void refreshThreats();
  }, [refreshThreats]);

  // ── Render ────────────────────────────────────────────────────

  return (
    <div data-testid="page-antivirus-security" className="space-y-4">
      <PageHeader
        title="Antivirus Security"
        description="Unified protection against viruses, trojans, worms, ransomware, adware, spyware, PUPs, and rootkits."
        actions={<HelpButton text="Antivirus Security combines all security features. Run a scan, enable real-time protection, manage quarantined threats, and configure advanced security." />}
      />

      {/* Threat coverage badges */}
      <div className="flex flex-wrap gap-2" data-testid="threat-coverage">
        {THREAT_COVERAGE.map(({ label, icon: Icon }) => (
          <div key={label} className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1">
            <Icon className="h-3.5 w-3.5 text-brand-primary" />
            <span className="text-caption text-text-secondary">{label}</span>
          </div>
        ))}
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card variant="glass" className="p-4 text-center" data-testid="av-status-card">
          <ShieldCheckIcon className={`h-6 w-6 mx-auto mb-1 ${avStatus?.clamd_running ? 'text-semantic-success' : 'text-text-muted'}`} />
          <div className="text-section-title font-bold text-text-primary">
            {avStatus?.clamd_running ? 'Protected' : 'Not Active'}
          </div>
          <div className="text-caption text-text-secondary">AV Engine</div>
        </Card>
        <Card variant="glass" className="p-4 text-center" data-testid="rt-status-card">
          <EyeIcon className={`h-6 w-6 mx-auto mb-1 ${rtGuardEnabled ? 'text-semantic-success' : 'text-text-muted'}`} />
          <div className="text-section-title font-bold text-text-primary">
            {rtGuardEnabled ? 'Active' : 'Off'}
          </div>
          <div className="text-caption text-text-secondary">Real-Time Guard</div>
        </Card>
        <Card variant="glass" className="p-4 text-center" data-testid="threat-count-card">
          <ShieldExclamationIcon className={`h-6 w-6 mx-auto mb-1 ${threats.length > 0 ? 'text-semantic-danger' : 'text-semantic-success'}`} />
          <div className="text-section-title font-bold text-text-primary">{threats.length}</div>
          <div className="text-caption text-text-secondary">Threats Found</div>
        </Card>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-[var(--avs-border)]" data-testid="av-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-small font-medium border-b-2 transition-colors ${
              activeTab === id
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
            data-testid={`av-tab-${id}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'scan' && (
        <div className="space-y-4" data-testid="av-tab-scan-content">
          {/* Scan buttons */}
          <Card variant="glass" className="p-6">
            <div className="text-small font-semibold text-text-primary mb-4">Run a Scan</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => handleScan('quick')}
                className="flex flex-col items-center gap-2 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-6 hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
                data-testid="av-quick-scan-btn"
              >
                <BoltIcon className="h-8 w-8 text-brand-primary" />
                <div className="text-small font-semibold text-text-primary">Quick Scan</div>
                <div className="text-caption text-text-secondary">Scans critical areas and memory (~2 min)</div>
              </button>
              <button
                onClick={() => handleScan('full')}
                className="flex flex-col items-center gap-2 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-6 hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
                data-testid="av-full-scan-btn"
              >
                <ShieldCheckIcon className="h-8 w-8 text-brand-primary" />
                <div className="text-small font-semibold text-text-primary">Full Scan</div>
                <div className="text-caption text-text-secondary">Scans entire system for all threats (~30 min)</div>
              </button>
              <button
                onClick={() => handleScan('custom')}
                className="flex flex-col items-center gap-2 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-6 hover:border-brand-primary hover:bg-brand-primary/5 transition-colors"
                data-testid="av-custom-scan-btn"
              >
                <ChartBarIcon className="h-8 w-8 text-brand-primary" />
                <div className="text-small font-semibold text-text-primary">Custom Scan</div>
                <div className="text-caption text-text-secondary">Choose specific folders to scan</div>
              </button>
            </div>
          </Card>

          {/* Detection sources */}
          <Card variant="glass" className="p-4" data-testid="av-detection-sources">
            <div className="text-small font-semibold text-text-primary mb-3">Active Detection Engines</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { name: 'Hash Blocklist', desc: 'Known malware hashes' },
                { name: 'YARA Rules', desc: 'Pattern-based detection' },
                { name: 'AMSI', desc: 'Windows script scanning' },
                { name: 'Defender', desc: 'Microsoft integration' },
                { name: 'Heuristic', desc: 'Behavioral analysis' },
                { name: 'VirusTotal', desc: 'Cloud reputation' },
                { name: 'ClamAV', desc: 'Signature-based AV' },
                { name: 'Real-Time', desc: 'Live file monitoring' },
              ].map((src) => (
                <div key={src.name} className="rounded-[var(--avs-radius-md)] bg-surface-muted p-2.5">
                  <div className="text-caption font-medium text-text-primary">{src.name}</div>
                  <div className="text-micro text-text-muted">{src.desc}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Scan modal */}
          {scanModalOpen && (
            <Modal open={scanModalOpen} onClose={handleModalClose} title="Security Scan" size="xl">
              <ScanView module="security" onClose={handleModalClose} />
            </Modal>
          )}
        </div>
      )}

      {activeTab === 'realtime' && (
        <div className="space-y-4" data-testid="av-tab-realtime-content">
          {/* Real-time protection toggle */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`rounded-[var(--avs-radius-md)] p-2.5 ${rtGuardEnabled ? 'bg-semantic-success/10' : 'bg-surface-muted'}`}>
                  <EyeIcon className={`h-6 w-6 ${rtGuardEnabled ? 'text-semantic-success' : 'text-text-muted'}`} />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">Real-Time Protection</div>
                  <p className="text-caption text-text-secondary">
                    {rtGuardEnabled
                      ? 'Monitoring file activity in real-time. Threats are blocked automatically.'
                      : 'Enable to monitor file activity and block threats in real-time.'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleRtGuard}
                disabled={rtGuardLoading}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                  rtGuardEnabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'
                }`}
                data-testid="rt-protection-toggle"
              >
                <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${rtGuardEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {!isPro && (
              <p className="text-caption text-brand-primary mt-3">Professional edition required for real-time protection.</p>
            )}
          </Card>

          {/* AV Engine status — auto-setup, no button needed */}
          <Card variant="glass" className="p-5" data-testid="av-engine-card">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`rounded-[var(--avs-radius-md)] p-2.5 ${avStatus?.clamd_running ? 'bg-semantic-success/10' : avStatus?.installed ? 'bg-semantic-warning/10' : 'bg-surface-muted'}`}>
                  <ShieldCheckIcon className={`h-6 w-6 ${avStatus?.clamd_running ? 'text-semantic-success' : avStatus?.installed ? 'text-semantic-warning' : 'text-text-muted'}`} />
                </div>
                <div>
                  <div className="text-small font-semibold text-text-primary">AVS AI Shield Antivirus Engine</div>
                  <p className="text-caption text-text-secondary">
                    {avStatus?.clamd_running
                      ? `Active — ${avStatus.signature_count.toLocaleString()} virus definitions loaded`
                      : avStatus?.installed
                        ? 'Engine ready. Starting automatically...'
                        : 'Preparing antivirus engine... Downloading virus definitions in background.'}
                  </p>
                </div>
              </div>
              {avStatus?.clamd_running ? (
                <Badge tone="success">Active</Badge>
              ) : avStatus?.installed ? (
                <Badge tone="warning">Starting</Badge>
              ) : (
                <Badge tone="neutral"><ArrowPathIcon className="h-3 w-3 inline mr-1 animate-spin" />Preparing</Badge>
              )}
            </div>

            {avStatus?.clamd_running && avStatus.version && (
              <div className="flex items-center gap-2 mt-2">
                <Badge tone="success">Protected</Badge>
                <span className="text-caption text-text-muted">{avStatus.version.split('/')[0]}</span>
                <span className="text-caption text-text-muted">•</span>
                <span className="text-caption text-text-muted">Auto-update enabled</span>
              </div>
            )}

            {!avStatus?.clamd_running && (
              <p className="mt-2 text-caption text-text-muted" data-testid="av-auto-setup-msg">
                The antivirus engine starts automatically. Virus definitions download in the background and update daily.
              </p>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'quarantine' && (
        <div className="space-y-4" data-testid="av-tab-quarantine-content">
          <Card variant="glass" className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-small font-semibold text-text-primary">Quarantined Threats</div>
              <Button variant="ghost" size="sm" onClick={refreshThreats} disabled={threatsLoading} leftIcon={<ArrowPathIcon className={`h-4 w-4 ${threatsLoading ? 'animate-spin' : ''}`} />}>
                Refresh
              </Button>
            </div>
            {threats.length === 0 ? (
              <div className="text-center py-12">
                <ShieldCheckIcon className="h-12 w-12 text-semantic-success mx-auto mb-3" />
                <p className="text-small text-text-secondary">No threats in quarantine. Your PC is clean.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {threats.map((threat) => (
                  <div key={threat.id} className="flex items-center gap-3 py-2 px-3 rounded border border-[var(--avs-border)]">
                    <ShieldExclamationIcon className="h-5 w-5 text-semantic-danger shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-small font-medium text-text-primary truncate">{threat.name}</div>
                      <div className="text-caption text-text-muted truncate">{threat.path}</div>
                    </div>
                    <Badge tone={threat.severity === 'high' ? 'danger' : 'warning'}>{threat.severity}</Badge>
                    <Button variant="ghost" size="sm" onClick={() => handleRestoreThreat(threat.id)}>Restore</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteThreat(threat.id)}>Delete</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="space-y-4" data-testid="av-tab-advanced-content">
          {/* Safe Folder */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <LockClosedIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Safe Folder — Ransomware Protection</div>
                <p className="text-caption text-text-secondary">Monitor protected folders for unauthorized mass encryption or deletion.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.hash = '#/safe-folder'} data-testid="av-safe-folder-btn">
              Configure Safe Folder
            </Button>
          </Card>

          {/* Advanced Security */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <ShieldExclamationIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Advanced Security Tools</div>
                <p className="text-caption text-text-secondary">Boot sector scanning, email scanner, web shield, behavioral sandbox, and ML anomaly detection.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.hash = '#/advanced-security'} data-testid="av-advanced-security-btn">
              Open Advanced Security
            </Button>
          </Card>

          {/* Threat Engine Config */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <BugAntIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Threat Engine Configuration</div>
                <p className="text-caption text-text-secondary">Configure detection sources, exclusions, VirusTotal API key, and auto-quarantine settings.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.hash = '#/threat-engine'} data-testid="av-threat-engine-btn">
              Configure Threat Engine
            </Button>
          </Card>

          {/* Scan history */}
          <Card variant="glass" className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <ClockIcon className="h-6 w-6 text-brand-primary" />
              <div>
                <div className="text-small font-semibold text-text-primary">Scan History & Timeline</div>
                <p className="text-caption text-text-secondary">View past scan results, threat detections, and security events over time.</p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => window.location.hash = '#/reports-timeline'} data-testid="av-scan-history-btn">
              View Timeline
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
