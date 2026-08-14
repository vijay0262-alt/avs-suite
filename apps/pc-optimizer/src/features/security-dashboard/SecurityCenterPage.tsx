/**
 * SecurityCenterPage — unified AI Security Center.
 *
 * Single page with tabbed sections covering the entire security workflow:
 *   Overview · Scan · Threats · Investigation · Remediation · Reports · Settings
 *
 * Connects SecurityCenterViewModel to the UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, Button, Badge, CollapsibleSection } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleLoadingState, ModuleEmptyState } from '../../components/ModuleStates';
import { ProStatusBanner, ProStatusPill, ProFeatureIndicator, ProOnlySection } from '../licensing/ProStatusBadge';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { canUse } from '../licensing/FeatureGate';
import { LockClosedIcon as LockIconSmall } from '@heroicons/react/24/solid';
import {
  SecurityCenterViewModel,
  type SecurityCenterTab,
  type ScanMode,
} from './SecurityCenterViewModel';
import type { Threat, ThreatCategory, ThreatSeverity } from '../security-center/types';
import type { ThreatInvestigation } from '../security-investigation/types';
import type { RemediationPlan } from '../security-remediation/types';
import {
  ShieldCheckIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  BeakerIcon,
  WrenchScrewdriverIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
  ClockIcon,
  CircleStackIcon,
  BugAntIcon,
  EyeIcon,
  LockClosedIcon,
  GlobeAltIcon,
  CpuChipIcon,
  WifiIcon,
  TrashIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  XMarkIcon,
  ChevronRightIcon,
  ChartBarIcon,
  FireIcon,
  ComputerDesktopIcon,
  SparklesIcon,
  CommandLineIcon,
  CogIcon,
  ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import {
  SECURITY_SCAN_PHASES,
  type ScanTreeNode,
  type LiveThreatCard,
} from './securityScanTypes';
import { UnifiedSecurityScanResults } from './UnifiedSecurityScanResults';
import { ScanView } from '../scan';

const TABS: { id: SecurityCenterTab; label: string; icon: typeof ShieldCheckIcon }[] = [
  { id: 'overview', label: 'Overview', icon: ShieldCheckIcon },
  { id: 'scan', label: 'Scan', icon: MagnifyingGlassIcon },
  { id: 'threats', label: 'Threats', icon: ExclamationTriangleIcon },
  { id: 'investigation', label: 'Investigation', icon: BeakerIcon },
  { id: 'remediation', label: 'Remediation', icon: WrenchScrewdriverIcon },
  { id: 'reports', label: 'Reports', icon: DocumentTextIcon },
  { id: 'settings', label: 'Settings', icon: Cog6ToothIcon },
];

const SIDEBAR_SCAN_MODES: { id: ScanMode; label: string; description: string; icon: typeof MagnifyingGlassIcon }[] = [
  { id: 'quick', label: 'Quick Scan', description: 'Fast scan of critical system areas (~10 sec)', icon: MagnifyingGlassIcon },
  { id: 'full', label: 'Full Scan', description: 'Deep scan of all files, folders & paths (~2-5 min)', icon: ShieldCheckIcon },
  { id: 'custom', label: 'Custom Scan', description: 'Scan specific folders or drives', icon: ComputerDesktopIcon },
];

const SEVERITY_COLORS: Record<ThreatSeverity, string> = {
  info: 'text-[var(--avs-text-secondary)]',
  low: 'text-[var(--avs-info)]',
  medium: 'text-[var(--avs-warning)]',
  high: 'text-[var(--avs-danger)]',
  critical: 'text-[var(--avs-danger)]',
};

const SEVERITY_BG: Record<ThreatSeverity, string> = {
  info: 'bg-[var(--avs-info)]/10',
  low: 'bg-[var(--avs-info)]/10',
  medium: 'bg-[var(--avs-warning)]/10',
  high: 'bg-[var(--avs-danger)]/10',
  critical: 'bg-[var(--avs-danger)]/20',
};

const CATEGORY_LABELS: Record<string, string> = {
  spyware: 'Spyware',
  adware: 'Adware',
  malware: 'Malware',
  trojans: 'Trojan',
  ransomware: 'Ransomware',
  pup: 'PUP',
  pua: 'PUA',
  browser_hijacker: 'Browser Hijacker',
  crypto_miner: 'Crypto Miner',
  keylogger: 'Keylogger',
  rootkit: 'Rootkit',
  bootkit: 'Bootkit',
  backdoor: 'Backdoor',
  dropper: 'Dropper',
  downloader: 'Downloader',
  unsafe_script: 'Unsafe Script',
  suspicious_scheduled_task: 'Suspicious Task',
  suspicious_service: 'Suspicious Service',
  suspicious_startup_entry: 'Suspicious Startup',
  unknown: 'Unknown',
};

const THREAT_CATEGORIES: { key: ThreatCategory; label: string; icon: typeof EyeIcon }[] = [
  { key: 'spyware', label: 'Spyware', icon: EyeIcon },
  { key: 'malware', label: 'Malware', icon: BugAntIcon },
  { key: 'adware', label: 'Adware', icon: TrashIcon },
  { key: 'ransomware', label: 'Ransomware', icon: LockClosedIcon },
  { key: 'browser_hijacker', label: 'Browser Hijacker', icon: GlobeAltIcon },
  { key: 'crypto_miner', label: 'Crypto Miner', icon: CpuChipIcon },
  { key: 'trojans', label: 'Trojans', icon: ExclamationTriangleIcon },
  { key: 'pup', label: 'PUP', icon: CircleStackIcon },
];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SecurityCenterPage() {
  const vm = useMemo(() => new SecurityCenterViewModel(), []);
  const state = useViewModel(vm);
  const location = useLocation();

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  useEffect(() => {
    const navState = location.state as { tab?: SecurityCenterTab; mode?: ScanMode; category?: string } | null;
    if (navState?.tab) {
      vm.setActiveTab(navState.tab);
      if (navState.category && navState.tab === 'threats') {
        vm.setThreatFilter({ category: navState.category as ThreatCategory | 'all' });
      }
    }
  }, [location.state, vm]);

  if (state.bootstrap === 'loading') {
    return (
      <div className="px-6 py-6">
        <PageHeader title="AI Security Center" description="Unified AI-powered security protection, investigation, and remediation." />
        <ModuleLoadingState message="Initializing security engines…" />
      </div>
    );
  }

  if (state.bootstrap === 'error') {
    return (
      <div className="px-6 py-6">
        <PageHeader title="AI Security Center" />
        <Card>
          <div className="py-8 text-center">
            <ExclamationTriangleIcon className="mx-auto h-10 w-10 text-[var(--avs-danger)]" />
            <p className="mt-4 text-body font-medium text-[var(--avs-text-primary)]">Something went wrong</p>
            <p className="mt-1 text-caption text-[var(--avs-text-muted)]">{state.bootstrapError}</p>
            <Button className="mt-4" size="sm" onClick={() => vm.bootstrap()} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <ProStatusBanner compact />

      {/* ── ABOVE THE FOLD ─────────────────────────────────────────── */}
      {/* Security Score + Scan Now */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
            state.securityScore >= 80 ? 'bg-semantic-success/10' : state.securityScore >= 60 ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
          }`}>
            <ShieldCheckIcon className={`h-8 w-8 ${
              state.securityScore >= 80 ? 'text-semantic-success' : state.securityScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
            }`} />
          </div>
          <div>
            <h1 className="text-page-title text-text-primary">AI Security Center</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-small font-semibold text-text-primary tabular-nums">{state.securityScore}<span className="text-caption text-text-muted">/100</span></span>
              <span className={`text-caption font-medium ${
                state.securityScore >= 80 ? 'text-semantic-success' : state.securityScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
              }`}>
                {state.securityScore >= 80 ? 'Protected' : state.securityScore >= 60 ? 'At Risk' : 'Unprotected'}
              </span>
              {state.activeThreats.length > 0 && (
                <span className="text-caption text-semantic-danger">{state.activeThreats.length} active threats</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ProStatusPill />
          <ScanView
            module="security"
            mode="full"
            buttonLabel="Run Security Scan"
            onClose={() => {}}
            className="shrink-0 w-72"
          />
        </div>
      </div>

      {/* Primary: 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Threat Status */}
        <Card variant="glass" className="p-4" data-testid="security-threat-status">
          <div className="text-caption text-text-muted">Threat Status</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${state.activeThreats.length > 0 ? 'text-semantic-danger' : 'text-semantic-success'}`}>
            {state.activeThreats.length}
          </div>
          <div className="text-caption text-text-muted mt-0.5">
            {state.activeThreats.length > 0 ? 'Active threats' : 'No threats'}
          </div>
        </Card>

        {/* Card 2: Files Scanned */}
        <Card variant="glass" className="p-4" data-testid="security-files-scanned">
          <div className="text-caption text-text-muted">Files Scanned</div>
          <div className="mt-1 text-2xl font-bold text-text-primary tabular-nums">
            {state.scanHistory[0]?.itemsScanned?.toLocaleString() ?? '0'}
          </div>
          <div className="text-caption text-text-muted mt-0.5">
            {state.scanHistory[0] ? 'Last scan' : 'No scans yet'}
          </div>
        </Card>

        {/* Card 3: Threats Removed */}
        <Card variant="glass" className="p-4" data-testid="security-threats-removed">
          <div className="text-caption text-text-muted">Threats Removed</div>
          <div className="mt-1 text-2xl font-bold text-text-primary tabular-nums">
            {state.scanHistory.reduce((sum, s) => sum + (s.threatsResolved ?? 0), 0)}
          </div>
          <div className="text-caption text-text-muted mt-0.5">All time</div>
        </Card>

        {/* Card 4: Last Scan */}
        <Card variant="glass" className="p-4" data-testid="security-last-scan">
          <div className="text-caption text-text-muted">Last Scan</div>
          <div className="mt-1 text-small font-semibold text-text-primary">
            {state.snapshot?.lastScan ? formatTimeAgo(state.snapshot.lastScan) : 'Never'}
          </div>
          <div className="text-caption text-text-muted mt-0.5">
            {state.snapshot?.protectionStatus.realTimeProtection ? 'Real-time active' : 'Real-time off'}
          </div>
        </Card>
      </div>

      {/* Tab Bar */}
      <div className="mb-2 flex gap-1 overflow-x-auto rounded-[var(--avs-radius-lg)] bg-[var(--avs-surface-muted)] p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = state.activeTab === tab.id;
          const badge = tab.id === 'threats' && state.activeThreats.length > 0
            ? state.activeThreats.length
            : tab.id === 'investigation' && state.activeInvestigations.length > 0
            ? state.activeInvestigations.length
            : null;

          return (
            <button
              key={tab.id}
              onClick={() => vm.setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-[var(--avs-radius-md)] px-4 py-2 text-small font-medium transition-all duration-[var(--avs-duration-fast)] ${
                isActive
                  ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-sm'
                  : 'text-[var(--avs-text-secondary)] hover:text-[var(--avs-text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {badge !== null && (
                <span className="ml-1 rounded-full bg-[var(--avs-danger)] px-1.5 py-0.5 text-caption font-bold text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {state.activeTab === 'overview' && <OverviewTab vm={vm} />}
      {state.activeTab === 'scan' && <ScanTab vm={vm} />}
      {state.activeTab === 'threats' && <ThreatsTab vm={vm} />}
      {state.activeTab === 'investigation' && <InvestigationTab vm={vm} />}
      {state.activeTab === 'remediation' && <RemediationTab vm={vm} />}
      {state.activeTab === 'reports' && <ReportsTab vm={vm} />}
      {state.activeTab === 'settings' && <SettingsTab vm={vm} />}
    </div>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────

function OverviewTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const snapshot = s.snapshot;

  return (
    <div className="space-y-4">
      {/* Panel 1: Protection & Threats */}
      <CollapsibleSection title="Protection & Threats" icon={<ShieldCheckIcon className="h-5 w-5" />} storageKey="sec-protection-threats">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card variant="glass">
            <div className="space-y-3">
              <StatusRow label="Real-Time Protection" value={snapshot?.protectionStatus.realTimeProtection ? 'Active' : 'Standby'} ok={snapshot?.protectionStatus.realTimeProtection ?? false} />
              <StatusRow label="Definitions" value={snapshot?.protectionStatus.definitionsActive ? 'Up to Date' : 'Unknown'} ok={snapshot?.protectionStatus.definitionsActive ?? false} />
              <StatusRow label="Overall Protected" value={snapshot?.protectionStatus.overallProtected ? 'Yes' : 'No'} ok={snapshot?.protectionStatus.overallProtected ?? false} />
              <StatusRow label="Definitions Version" value={snapshot?.definitionsVersion ?? '1.0.0'} ok={true} />
              <StatusRow label="Last Scan" value={snapshot?.lastScan ? formatTimeAgo(snapshot.lastScan) : 'Never'} ok={!!snapshot?.lastScan} />
              <ProOnlySection>
                <div className="pt-3 border-t border-[var(--avs-border)] space-y-2">
                  <ProFeatureIndicator icon={ShieldCheckIcon} label="Real-Time Protection Active" />
                  <ProFeatureIndicator icon={ClockIcon} label="Scheduled Scans Enabled" />
                  <ProFeatureIndicator icon={ArrowPathIcon} label="Automatic Quarantine" />
                  <ProFeatureIndicator icon={WrenchScrewdriverIcon} label="Automatic Remediation" />
                </div>
              </ProOnlySection>
            </div>
          </Card>

          <Card variant="glass">
            <div className="space-y-2">
              {s.capabilities.map((cap) => (
                <div key={cap.name} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                  <div>
                    <p className="text-small font-medium text-[var(--avs-text-primary)]">{cap.description}</p>
                    <p className="text-caption text-[var(--avs-text-muted)]">{cap.name}</p>
                  </div>
                  <Badge tone={cap.enabled ? 'success' : 'neutral'}>
                    {cap.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
              ))}
              {s.capabilities.length === 0 && (
                <p className="py-4 text-center text-small text-[var(--avs-text-muted)]">No capabilities data</p>
              )}
            </div>
          </Card>
        </div>
          {/* Threat Categories (inline) */}
          <div className="pt-4 border-t border-[var(--avs-border)]">
            <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-3">Threat Categories</h4>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {THREAT_CATEGORIES.map((cat) => {
            const count = s.threats.filter(t => t.category === cat.key).length;
            const activeCount = s.threats.filter(t => t.category === cat.key && t.status === 'active').length;
            const Icon = cat.icon;
            return (
              <div key={cat.key} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-[var(--avs-text-secondary)]" />
                  <span className="text-small font-medium text-[var(--avs-text-primary)]">{cat.label}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-statistic-sm text-[var(--avs-text-primary)]">{count}</span>
                  {activeCount > 0 && <span className="text-caption text-[var(--avs-danger)]">{activeCount} active</span>}
                </div>
              </div>
            );
          })}
            </div>
          </div>
      </CollapsibleSection>

      {/* Panel 2: Scan History */}
      <CollapsibleSection title="Scan History" icon={<ClockIcon className="h-5 w-5" />} storageKey="sec-scan-history">
        {s.scanHistory.length === 0 ? (
          <ModuleEmptyState icon={ClockIcon} title="No scans yet" message="Run your first scan to see history." />
        ) : (
          <div className="space-y-2">
            {s.scanHistory.slice(-5).reverse().map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${entry.status === 'completed' ? 'bg-[var(--avs-success)]' : 'bg-[var(--avs-danger)]'}`} />
                  <div>
                    <p className="text-small font-medium text-[var(--avs-text-primary)] capitalize">{entry.scanType} Scan</p>
                    <p className="text-caption text-[var(--avs-text-muted)]">{formatTimeAgo(entry.timestamp)} · {formatDuration(entry.duration)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-caption text-[var(--avs-text-secondary)]">{entry.itemsScanned} items</span>
                  <span className={`text-small font-semibold ${entry.threatsDetected > 0 ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-success)]'}`}>
                    {entry.threatsDetected} threats
                  </span>
                  <span className="text-small font-bold text-[var(--avs-text-primary)]">{entry.securityScore}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleSection>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-small text-[var(--avs-text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-[var(--avs-success)]' : 'bg-[var(--avs-warning)]'}`} />
        <span className="text-small font-medium text-[var(--avs-text-primary)]">{value}</span>
      </div>
    </div>
  );
}

// ─── Scan Tab ───────────────────────────────────────────────────────

function ScanTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;

  return (
    <div className="flex gap-6">
      {/* Left Sidebar — Scan Types + Scan Now Button */}
      <div className="w-64 shrink-0 space-y-4">
        <Card variant="glass">
          <div className="space-y-2">
            <p className="px-1 text-micro font-semibold uppercase tracking-[var(--avs-tracking-widest)] text-[var(--avs-text-muted)]">Scan Type</p>
            {SIDEBAR_SCAN_MODES.map((mode) => {
              const Icon = mode.icon;
              const isSelected = s.scanMode === mode.id;
              return (
                <button
                  key={mode.id}
                  disabled
                  className={`w-full rounded-[var(--avs-radius-md)] border p-3 text-left transition-all duration-[var(--avs-duration-fast)] ${
                    isSelected
                      ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]/10'
                      : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)] hover:border-[var(--avs-border-hover)]'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-[var(--avs-brand-primary)]' : 'text-[var(--avs-text-secondary)]'}`} />
                    <span className="text-small font-semibold text-[var(--avs-text-primary)]">{mode.label}</span>
                  </div>
                  <p className="mt-1 text-caption text-[var(--avs-text-muted)]">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Last Scan Result summary in sidebar */}
        {s.lastScanResult && !s.isScanning && (
          <Card title="Last Scan" variant="glass">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-caption text-[var(--avs-text-muted)]">Type</span>
                <span className="text-small font-medium text-[var(--avs-text-primary)] capitalize">{s.lastScanResult.scanType}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption text-[var(--avs-text-muted)]">Duration</span>
                <span className="text-small font-medium text-[var(--avs-text-primary)]">{formatDuration(s.lastScanResult.duration)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption text-[var(--avs-text-muted)]">Threats</span>
                <span className={`text-small font-semibold ${s.lastScanResult.threats.length > 0 ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-success)]'}`}>
                  {s.lastScanResult.threats.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption text-[var(--avs-text-muted)]">Score</span>
                <span className="text-statistic-sm text-[var(--avs-text-primary)]">{s.lastScanResult.securityScore}</span>
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Right / Main Section — Scan Experience */}
      <div className="flex-1 space-y-6">
        {s.isScanning ? (
          <ScanView module="security" mode="full" onClose={() => {}} />
        ) : s.aiSummary ? (
          <UnifiedSecurityScanResults vm={vm} isPro={canUse('security.remediate')} />
        ) : (
          <ScanIdleView vm={vm} />
        )}
      </div>
    </div>
  );
}

// ─── Scan Idle View ─────────────────────────────────────────────────

function ScanIdleView({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const phases = s.scanMode === 'full' ? SECURITY_SCAN_PHASES : SECURITY_SCAN_PHASES.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Hero — Scan Readiness */}
      <Card variant="glass" className="p-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-brand-primary/10 p-4">
            <ShieldCheckIcon className="h-10 w-10 text-brand-primary" aria-hidden />
          </div>
          <div>
            <h3 className="text-section-title text-text-primary">
              {s.scanMode === 'full' ? 'Full System Security Scan' : s.scanMode === 'custom' ? 'Custom Scan' : 'Quick Security Scan'}
            </h3>
            <p className="mt-2 max-w-xl text-small text-text-secondary leading-relaxed">
              {s.scanMode === 'full'
                ? 'A comprehensive 14-phase security scan covering processes, system directories, user profile, registry, scheduled tasks, services, browser security, PowerShell scripts, persistence, behavior analysis, threat investigation, and AI remediation planning.'
                : 'A fast scan of critical system areas — processes, registry, scheduled tasks, and behavior analysis.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Phase Preview */}
      <Card title="Scan Phases" variant="glass">
        <div className="space-y-2">
          {phases.map((phase, idx) => (
            <div key={phase.id} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--avs-surface)] text-caption font-bold text-[var(--avs-text-muted)]">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-small font-medium text-[var(--avs-text-primary)]">{phase.label}</p>
                <p className="text-caption text-[var(--avs-text-muted)] truncate">{phase.description}</p>
              </div>
              <span className="text-caption font-medium text-[var(--avs-text-muted)] shrink-0">
                {phase.startPercent}–{phase.endPercent}%
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Scan Progress View (live scanning) ──────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScanProgressView({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const phases = s.scanMode === 'full' ? SECURITY_SCAN_PHASES : SECURITY_SCAN_PHASES.slice(0, 6);
  const currentPhase = phases[s.scanPhaseIndex];
  const elapsed = s.scanStartTime ? Date.now() - s.scanStartTime : 0;
  const [displayProgress, setDisplayProgress] = useState(s.scanOverallProgress);

  // Smooth progress bar interpolation
  useEffect(() => {
    if (displayProgress === s.scanOverallProgress) return;
    const diff = s.scanOverallProgress - displayProgress;
    if (Math.abs(diff) < 0.5) {
      setDisplayProgress(s.scanOverallProgress);
      return;
    }
    const raf = requestAnimationFrame(() => {
      setDisplayProgress(prev => prev + diff * 0.15);
    });
    return () => cancelAnimationFrame(raf);
  }, [s.scanOverallProgress, displayProgress]);

  return (
    <div className="space-y-4">
      {/* Current Phase + Progress Bar */}
      <Card variant="glass" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-primary" />
            </span>
            <div>
              <p className="text-small font-semibold text-text-primary">
                Phase {s.scanPhaseIndex + 1} of {phases.length}: {currentPhase?.label ?? 'Scanning…'}
              </p>
              <p className="text-caption text-text-muted">{currentPhase?.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-caption tabular-nums text-text-muted">{formatDuration(elapsed)}</span>
            {s.scanEstimatedRemaining != null && s.scanEstimatedRemaining > 0 && (
              <span className="text-caption text-text-muted">~{formatDuration(s.scanEstimatedRemaining)} left</span>
            )}
          </div>
        </div>

        {/* Smooth progress bar */}
        <div className="h-3 overflow-hidden rounded-full bg-[var(--avs-surface-muted)]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, displayProgress)}%`,
              background: 'var(--avs-gradient-brand, var(--avs-brand-primary))',
              transition: 'width 80ms linear',
            }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-caption text-text-muted">
            {s.scanCurrentModule} {s.scanCurrentFolder ? `· ${s.scanCurrentFolder}` : ''}
          </span>
          <span className="text-small font-bold tabular-nums text-text-primary">{Math.round(displayProgress)}%</span>
        </div>
        {s.scanCurrentFile && (
          <div className="mt-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-2 py-1.5">
            <div className="text-caption text-text-muted mb-0.5">Current file:</div>
            <div className="text-caption font-mono text-text-secondary truncate" title={s.scanCurrentFile}>
              {s.scanCurrentFile}
            </div>
          </div>
        )}
      </Card>

      {/* Live Dashboard Stats */}
      <Card title="Live Dashboard" variant="glass">
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <LiveStatBox label="Files Scanned" value={s.scanLiveStats.filesScanned} icon={CircleStackIcon} />
          <LiveStatBox label="Registry Keys" value={s.scanLiveStats.registryKeysChecked} icon={CogIcon} />
          <LiveStatBox label="Processes" value={s.scanLiveStats.processesAnalyzed} icon={CpuChipIcon} />
          <LiveStatBox label="Services" value={s.scanLiveStats.servicesChecked} icon={Cog6ToothIcon} />
          <LiveStatBox label="Scheduled Tasks" value={s.scanLiveStats.scheduledTasks} icon={ClockIcon} />
          <LiveStatBox label="Browser Objects" value={s.scanLiveStats.browserObjects} icon={GlobeAltIcon} />
          <LiveStatBox label="Scripts" value={s.scanLiveStats.scriptsInspected} icon={CommandLineIcon} />
          <LiveStatBox label="Threats Found" value={s.scanLiveStats.threatsFound} icon={ExclamationTriangleIcon} danger={s.scanLiveStats.threatsFound > 0} />
          <LiveStatBox label="AI Confidence" value={s.scanLiveStats.aiConfidence ? `${s.scanLiveStats.aiConfidence}%` : '—'} icon={SparklesIcon} />
          <LiveStatBox label="Persistence" value={s.scanLiveStats.persistenceEntries} icon={ShieldExclamationIcon} />
          <LiveStatBox label="Unsigned EXEs" value={s.scanLiveStats.unsignedExecutables} icon={BugAntIcon} danger={s.scanLiveStats.unsignedExecutables > 0} />
          <LiveStatBox label="Providers" value={s.scanLiveStats.providersLoaded} icon={EyeIcon} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Scan Tree */}
        <Card title="Scan Tree" variant="glass">
          <div className="space-y-1.5">
            {s.scanTree.map((node) => (
              <ScanTreeRow key={node.id} node={node} />
            ))}
          </div>
        </Card>

        {/* Live Threat Cards */}
        <Card title={`Threats Detected (${s.liveThreats.length})`} variant="glass">
          {s.liveThreats.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <ShieldCheckIcon className="h-8 w-8 text-[var(--avs-success)]" />
              <p className="mt-2 text-small text-[var(--avs-text-muted)]">No threats detected so far</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {s.liveThreats.map((threat) => (
                <LiveThreatRow key={threat.id} threat={threat} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ScanTreeRow({ node }: { node: ScanTreeNode }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;

  const statusIcon = {
    pending: <div className="h-3 w-3 rounded-full border-2 border-[var(--avs-border)]" />,
    scanning: <ArrowPathIcon className="h-3 w-3 animate-spin text-[var(--avs-brand-primary)]" />,
    complete: <CheckIcon className="h-3 w-3 text-[var(--avs-success)]" />,
    error: <XMarkIcon className="h-3 w-3 text-[var(--avs-danger)]" />,
  };

  return (
    <div>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={`flex w-full items-center gap-2 rounded-[var(--avs-radius-md)] px-2 py-1.5 text-left transition-colors ${
          node.status === 'scanning' ? 'bg-[var(--avs-brand-primary)]/10' : 'hover:bg-[var(--avs-surface-muted)]'
        }`}
      >
        <span className="shrink-0">{statusIcon[node.status]}</span>
        <span className={`text-small ${node.status === 'scanning' ? 'font-medium text-[var(--avs-text-primary)]' : node.status === 'complete' ? 'text-[var(--avs-text-secondary)]' : 'text-[var(--avs-text-muted)]'}`}>
          {node.label}
        </span>
        {node.itemsScanned > 0 && (
          <span className="ml-auto text-caption text-[var(--avs-text-muted)]">{node.itemsScanned} items</span>
        )}
        {node.threatsFound > 0 && (
          <span className="text-caption font-medium text-[var(--avs-danger)]">{node.threatsFound} threats</span>
        )}
        {hasChildren && (
          <ChevronRightIcon className={`h-3 w-3 text-[var(--avs-text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>
      {expanded && hasChildren && (
        <div className="ml-5 space-y-1">
          {node.children!.map((child) => (
            <ScanTreeRow key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveThreatRow({ threat }: { threat: LiveThreatCard }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] border border-[var(--avs-danger)]/20 bg-[var(--avs-danger)]/5 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 text-[var(--avs-danger)]" />
          <span className="text-small font-semibold text-[var(--avs-text-primary)]">{threat.name}</span>
        </div>
        <span className="text-caption font-bold text-[var(--avs-danger)]">{threat.confidence}%</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-[var(--avs-text-muted)]">
        <span><span className="font-medium text-[var(--avs-text-secondary)]">Type:</span> {threat.type}</span>
        <span><span className="font-medium text-[var(--avs-text-secondary)]">Risk:</span> {threat.risk}</span>
        <span><span className="font-medium text-[var(--avs-text-secondary)]">Status:</span> {threat.status}</span>
      </div>
      <div className="mt-1 text-caption text-[var(--avs-text-muted)] truncate" title={threat.location}>
        <span className="font-medium text-[var(--avs-text-secondary)]">Location:</span> {threat.location}
      </div>
      <div className="mt-0.5 text-caption text-[var(--avs-text-muted)]">
        <span className="font-medium text-[var(--avs-text-secondary)]">Action:</span> {threat.actionPlanned}
      </div>
    </div>
  );
}

function LiveStatBox({ label, value, icon: Icon, danger }: { label: string; value: number | string; icon: typeof ShieldCheckIcon; danger?: boolean }) {
  return (
    <div className={`rounded-[var(--avs-radius-md)] p-3 ${danger ? 'bg-[var(--avs-danger)]/10' : 'bg-[var(--avs-surface-muted)]'}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${danger ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-text-muted)]'}`} />
        <span className="text-caption text-[var(--avs-text-muted)] truncate">{label}</span>
      </div>
      <p className={`mt-1 text-statistic-sm tabular-nums ${danger ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-text-primary)]'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

// ─── AI Summary Screen ──────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScanAISummary({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const summary = s.aiSummary!;
  const scoreColor = summary.securityScore >= 80 ? 'var(--avs-success)' : summary.securityScore >= 60 ? 'var(--avs-warning)' : 'var(--avs-danger)';
  const { dialogElement } = useFeatureGuard();
  const canRemediate = canUse('security.remediate');

  return (
    <div className="space-y-6">
      {/* Security Score Hero */}
      <Card variant="glass" className="p-6">
        <div className="flex flex-col items-center gap-6">
          {/* Score Circle */}
          <div className="relative flex h-32 w-32 items-center justify-center">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="56" fill="none" stroke="var(--avs-surface-muted)" strokeWidth="8" />
              <circle
                cx="64" cy="64" r="56" fill="none" stroke={scoreColor} strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 56}`}
                strokeDashoffset={`${2 * Math.PI * 56 * (1 - summary.securityScore / 100)}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 1s ease-out' }}
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-statistic" style={{ color: scoreColor }}>{summary.securityScore}</span>
              <span className="text-caption text-[var(--avs-text-muted)]">Security Score</span>
            </div>
          </div>

          {/* AI Verdict */}
          <div className="text-center max-w-2xl">
            <div className="flex items-center justify-center gap-2 mb-2">
              <SparklesIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
              <h3 className="text-section-title text-text-primary">AI Verdict</h3>
            </div>
            <p className="text-small text-text-secondary leading-relaxed">{summary.aiVerdict}</p>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 w-full max-w-2xl">
            <SummaryStatBox label="Threats Found" value={summary.threatsFound} icon={ExclamationTriangleIcon} tone={summary.threatsFound > 0 ? 'danger' : 'success'} />
            <SummaryStatBox label="Neutralized" value={summary.threatsNeutralized} icon={CheckIcon} tone="success" />
            <SummaryStatBox label="Manual Review" value={summary.manualReviewRequired} icon={EyeIcon} tone={summary.manualReviewRequired > 0 ? 'warning' : 'success'} />
            <SummaryStatBox label="Scan Duration" value={formatDuration(summary.scanDuration)} icon={ClockIcon} tone="info" />
          </div>
        </div>
      </Card>

      {/* Protected Areas + Risk */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Protected Areas" variant="glass">
          <div className="flex flex-wrap gap-2">
            {summary.protectedAreas.map((area) => (
              <div key={area} className="flex items-center gap-1.5 rounded-full bg-[var(--avs-success)]/10 px-3 py-1.5">
                <CheckIcon className="h-3.5 w-3.5 text-[var(--avs-success)]" />
                <span className="text-caption font-medium text-[var(--avs-text-primary)]">{area}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Risk Assessment" variant="glass">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-small text-[var(--avs-text-secondary)]">Estimated Risk</span>
              <Badge tone={summary.estimatedRisk === 'Low' ? 'success' : summary.estimatedRisk === 'Moderate' ? 'warning' : 'danger'}>
                {summary.estimatedRisk}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-small text-[var(--avs-text-secondary)]">Files Scanned</span>
              <span className="text-small font-medium text-[var(--avs-text-primary)]">{summary.filesScanned.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-small text-[var(--avs-text-secondary)]">Items Analyzed</span>
              <span className="text-small font-medium text-[var(--avs-text-primary)]">{summary.itemsScanned.toLocaleString()}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Threats Found List */}
      {s.lastScanResult && s.lastScanResult.threats.length > 0 && (
        <Card title={`Threats Found (${s.lastScanResult.threats.length})`} variant="glass">
          <div className="space-y-2">
            {s.lastScanResult.threats.map((threat) => (
              <div key={threat.id} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`rounded-[var(--avs-radius-md)] p-1.5 ${SEVERITY_BG[threat.severity]}`}>
                      <ExclamationTriangleIcon className={`h-4 w-4 ${SEVERITY_COLORS[threat.severity]}`} />
                    </div>
                    <div>
                      <p className="text-small font-semibold text-[var(--avs-text-primary)]">{threat.name}</p>
                      <p className="text-caption text-[var(--avs-text-muted)]">{CATEGORY_LABELS[threat.category] ?? threat.category} · {threat.detectionSource}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={threat.status === 'active' ? 'danger' : 'neutral'}>{threat.status}</Badge>
                    <span className={`text-caption font-bold ${SEVERITY_COLORS[threat.severity]}`}>{(threat.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {threat.affectedAssets.length > 0 && threat.affectedAssets[0] && (
                  <p className="mt-1.5 text-caption text-[var(--avs-text-muted)] truncate" title={threat.affectedAssets[0].path}>
                    📁 {threat.affectedAssets[0].path}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* One-Click Actions */}
      <Card variant="glass" className="p-5">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            onClick={() => {
              if (s.lastScanResult && s.lastScanResult.threats.length > 0) {
                const inv = s.investigations.find(i => i.threatIds.some(tid => s.lastScanResult!.threats.some(t => t.id === tid)));
                if (inv) {
                  vm.createRemediationPlan(inv.id);
                  vm.setActiveTab('remediation');
                }
              }
            }}
            disabled={summary.threatsFound === 0}
            leftIcon={<WrenchScrewdriverIcon className="h-5 w-5" />}
          >
            {canRemediate ? 'Quarantine All' : 'Quarantine All (Pro)'}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => vm.setActiveTab('threats')}
            leftIcon={<ExclamationTriangleIcon className="h-5 w-5" />}
          >
            Review Findings
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => vm.setActiveTab('investigation')}
            leftIcon={<BeakerIcon className="h-5 w-5" />}
          >
            Open Investigation
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={() => {
              vm.dismissSummary();
              vm.setActiveTab('scan');
            }}
            leftIcon={<ArrowPathIcon className="h-5 w-5" />}
          >
            Scan Again
          </Button>
        </div>
      </Card>
      {dialogElement}
    </div>
  );
}

function SummaryStatBox({ label, value, icon: Icon, tone }: { label: string; value: number | string; icon: typeof ShieldCheckIcon; tone: 'success' | 'warning' | 'danger' | 'info' }) {
  const toneColor = tone === 'success' ? 'var(--avs-success)' : tone === 'warning' ? 'var(--avs-warning)' : tone === 'danger' ? 'var(--avs-danger)' : 'var(--avs-info)';
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3 text-center">
      <Icon className="mx-auto h-5 w-5" style={{ color: toneColor }} />
      <p className="mt-1.5 text-statistic-sm text-[var(--avs-text-primary)]">{value}</p>
      <p className="text-caption text-[var(--avs-text-muted)]">{label}</p>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ShieldCheckIcon }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--avs-text-muted)]" />
        <span className="text-caption text-[var(--avs-text-muted)]">{label}</span>
      </div>
      <p className="mt-1 text-statistic-sm capitalize text-[var(--avs-text-primary)]">{value}</p>
    </div>
  );
}

// ─── Threats Tab ────────────────────────────────────────────────────

function ThreatsTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const threats = s.filteredThreats;

  const categories: (ThreatCategory | 'all')[] = ['all', ...THREAT_CATEGORIES.map(c => c.key)];
  const severities: (ThreatSeverity | 'all')[] = ['all', 'critical', 'high', 'medium', 'low', 'info'];

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card variant="glass">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-caption font-semibold text-[var(--avs-text-secondary)]">Category:</span>
            <select
              value={s.threatFilter.category}
              onChange={(e) => vm.setThreatFilter({ category: e.target.value as ThreatCategory | 'all' })}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-small text-[var(--avs-text-primary)] focus:outline-none focus-visible:shadow-focus"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : CATEGORY_LABELS[c] ?? c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption font-semibold text-[var(--avs-text-secondary)]">Severity:</span>
            <select
              value={s.threatFilter.severity}
              onChange={(e) => vm.setThreatFilter({ severity: e.target.value as ThreatSeverity | 'all' })}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-small text-[var(--avs-text-primary)] focus:outline-none focus-visible:shadow-focus"
            >
              {severities.map(sv => <option key={sv} value={sv}>{sv === 'all' ? 'All Severities' : sv.charAt(0).toUpperCase() + sv.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption font-semibold text-[var(--avs-text-secondary)]">Status:</span>
            <select
              value={s.threatFilter.status}
              onChange={(e) => vm.setThreatFilter({ status: e.target.value as Threat['status'] | 'all' })}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-small text-[var(--avs-text-primary)] focus:outline-none focus-visible:shadow-focus"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="resolved">Resolved</option>
              <option value="quarantined">Quarantined</option>
              <option value="ignored">Ignored</option>
              <option value="false_positive">False Positive</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Search threats…"
            value={s.threatFilter.searchQuery}
            onChange={(e) => vm.setThreatFilter({ searchQuery: e.target.value })}
            className="ml-auto rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-1 text-small text-[var(--avs-text-primary)] placeholder:text-[var(--avs-text-muted)] focus:outline-none focus-visible:shadow-focus"
          />
        </div>
      </Card>

      {/* Threats List */}
      {threats.length === 0 ? (
        <ModuleEmptyState
          icon={ShieldCheckIcon}
          title="No threats found"
          message={s.threats.length === 0 ? 'Run a scan to detect threats.' : 'No threats match the current filters.'}
          action={s.threats.length === 0 ? <Button size="sm" onClick={() => { vm.setActiveTab('scan'); }}>Run Quick Scan</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {threats.map((threat) => (
            <ThreatCard key={threat.id} threat={threat} vm={vm} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThreatCard({ threat, vm }: { threat: Threat; vm: SecurityCenterViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const { guard, dialogElement } = useFeatureGuard();
  const canRemediate = canUse('security.remediate');

  return (
    <Card variant="glass" className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between py-1 text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`rounded-[var(--avs-radius-md)] p-2 ${SEVERITY_BG[threat.severity]}`}>
            <ExclamationTriangleIcon className={`h-5 w-5 ${SEVERITY_COLORS[threat.severity]}`} />
          </div>
          <div>
            <p className="text-small font-semibold text-[var(--avs-text-primary)]">{threat.name}</p>
            <p className="text-caption text-[var(--avs-text-muted)]">
              {CATEGORY_LABELS[threat.category] ?? threat.category} · {threat.detectionSource} · {formatTimeAgo(threat.detectionTime)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={threat.status === 'active' ? 'danger' : threat.status === 'resolved' ? 'success' : 'neutral'}>
            {threat.status}
          </Badge>
          <span className={`text-caption font-bold ${SEVERITY_COLORS[threat.severity]}`}>
            {(threat.confidence * 100).toFixed(0)}%
          </span>
          <ChevronRightIcon className={`h-4 w-4 text-[var(--avs-text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[var(--avs-border)] pt-3">
          {/* Explanation */}
          <div>
            <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">AI Explanation</p>
            <p className="mt-1 text-small text-[var(--avs-text-primary)]">{threat.explanation}</p>
          </div>

          {/* Recommendation */}
          <div>
            <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">Recommendation</p>
            <p className="mt-1 text-small text-[var(--avs-text-primary)]">{threat.recommendation}</p>
          </div>

          {/* Evidence */}
          {threat.evidence.length > 0 && (
            <div>
              <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">Evidence ({threat.evidence.length})</p>
              <div className="mt-1 space-y-1">
                {threat.evidence.map((ev, i) => (
                  <div key={i} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-2 py-1 text-caption text-[var(--avs-text-secondary)]">
                    <span className="font-medium text-[var(--avs-text-primary)]">{ev.type}:</span> {ev.description}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Affected Assets */}
          {threat.affectedAssets.length > 0 && (
            <div>
              <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">Affected Assets ({threat.affectedAssets.length})</p>
              <div className="mt-1 space-y-1">
                {threat.affectedAssets.map((asset, i) => (
                  <div key={i} className="flex items-center gap-2 text-caption text-[var(--avs-text-secondary)]">
                    <span className="rounded bg-[var(--avs-surface-muted)] px-1.5 py-0.5 font-medium text-[var(--avs-text-primary)]">{asset.type}</span>
                    <span>{asset.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MITRE */}
          {threat.mitreAttack && (
            <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-danger)]/5 border border-[var(--avs-danger)]/20 p-2">
              <p className="text-caption font-semibold text-[var(--avs-danger)]">MITRE ATT&CK</p>
              <p className="mt-0.5 text-caption text-[var(--avs-text-secondary)]">
                {threat.mitreAttack.tactic} → {threat.mitreAttack.technique}
                {threat.mitreAttack.subtechnique && ` → ${threat.mitreAttack.subtechnique}`}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => {
              const inv = vm.state.investigations.find(i => i.threatIds.includes(threat.id));
              if (inv) { vm.selectInvestigation(inv.id); vm.setActiveTab('investigation'); }
            }} leftIcon={<BeakerIcon className="h-4 w-4" />}>
              Investigate
            </Button>
            {threat.canRemediate && (
              canRemediate ? (
                <Button size="sm" variant="danger" onClick={() => {
                  const inv = vm.state.investigations.find(i => i.threatIds.includes(threat.id));
                  if (inv) { vm.createRemediationPlan(inv.id); vm.setActiveTab('remediation'); }
                }} leftIcon={<WrenchScrewdriverIcon className="h-4 w-4" />}>
                  Remediate
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => guard('security.remediate', 'Security Center', () => {
                    const inv = vm.state.investigations.find(i => i.threatIds.includes(threat.id));
                    if (inv) { vm.createRemediationPlan(inv.id); vm.setActiveTab('remediation'); }
                  }, {
                    limitDescription: 'Threats are detected but cannot be removed in the Free edition.',
                    proBenefit: 'Quarantine and remove detected threats automatically with AVS Shield Pro.',
                  })}
                  leftIcon={<LockIconSmall className="h-4 w-4" />}
                >
                  Remediate (Pro)
                </Button>
              )
            )}
          </div>
          {dialogElement}
        </div>
      )}
    </Card>
  );
}

// ─── Investigation Tab ──────────────────────────────────────────────

function InvestigationTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const selected = s.selectedInvestigation;

  if (s.investigations.length === 0 && !selected) {
    return (
      <ModuleEmptyState
        icon={BeakerIcon}
        title="No investigations"
        message="Threats detected by scans will be automatically investigated here."
        action={<Button size="sm" onClick={() => { vm.setActiveTab('scan'); }}>Run Full Scan</Button>}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      {/* Investigation List */}
      <Card title="Investigations" variant="glass" padded={false}>
        <div className="max-h-[600px] overflow-y-auto p-3">
          {s.investigations.map((inv) => (
            <button
              key={inv.id}
              onClick={() => vm.selectInvestigation(inv.id)}
              className={`mb-2 w-full rounded-[var(--avs-radius-md)] border p-3 text-left transition-all ${
                s.selectedInvestigationId === inv.id
                  ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]/10'
                  : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)] hover:border-[var(--avs-border-hover)]'
              }`}
            >
              <p className="text-small font-semibold text-[var(--avs-text-primary)]">{inv.summary.title}</p>
              <p className="mt-0.5 text-caption text-[var(--avs-text-muted)]">{inv.summary.oneLiner}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={inv.status === 'open' ? 'warning' : inv.status === 'resolved' ? 'success' : 'neutral'}>
                  {inv.status}
                </Badge>
                <span className="text-caption text-[var(--avs-text-muted)]">{inv.threatIds.length} threats</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Investigation Detail */}
      {selected ? (
        <InvestigationDetail inv={selected} vm={vm} />
      ) : (
        <Card variant="glass">
          <div className="py-12 text-center">
            <BeakerIcon className="mx-auto h-10 w-10 text-[var(--avs-text-muted)]" />
            <p className="mt-4 text-small text-[var(--avs-text-muted)]">Select an investigation to view details</p>
          </div>
        </Card>
      )}
    </div>
  );
}

function InvestigationDetail({ inv, vm }: { inv: ThreatInvestigation; vm: SecurityCenterViewModel }) {
  const { guard, dialogElement } = useFeatureGuard();
  const canRemediate = canUse('security.remediate');

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card title="Threat Summary" variant="glass">
        <div className="space-y-3">
          <div>
            <p className="text-small font-semibold text-[var(--avs-text-primary)]">{inv.summary.title}</p>
            <p className="mt-1 text-small text-[var(--avs-text-secondary)]">{inv.summary.oneLiner}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox label="Severity" value={inv.severity.level} icon={FireIcon} />
            <StatBox label="Confidence" value={`${(inv.confidence.score * 100).toFixed(0)}%`} icon={ShieldCheckIcon} />
            <StatBox label="Risk" value={inv.risk} icon={ExclamationTriangleIcon} />
            <StatBox label="Threats" value={inv.threatIds.length.toString()} icon={BugAntIcon} />
          </div>
        </div>
      </Card>

      {/* AI Explanation */}
      <Card title="AI Explanation" variant="glass">
        <div className="space-y-3">
          <div>
            <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">What Happened</p>
            <p className="mt-1 text-small text-[var(--avs-text-primary)]">{inv.explanation.whatHappened}</p>
          </div>
          <div>
            <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">Why Detected</p>
            <p className="mt-1 text-small text-[var(--avs-text-primary)]">{inv.explanation.whyDetected}</p>
          </div>
          <div>
            <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">User-Friendly Explanation</p>
            <p className="mt-1 text-small text-[var(--avs-text-primary)]">{inv.explanation.userFriendlyExplanation}</p>
          </div>
          <div>
            <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">Confidence Reasoning</p>
            <p className="mt-1 text-small text-[var(--avs-text-primary)]">{inv.confidence.reasoning}</p>
          </div>
          {inv.explanation.possibleFalsePositiveFactors.length > 0 && (
            <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-warning)]/10 border border-[var(--avs-warning)]/20 p-2">
              <p className="text-caption font-semibold text-[var(--avs-warning)]">Possible False Positive Factors</p>
              <ul className="mt-1 space-y-0.5">
                {inv.explanation.possibleFalsePositiveFactors.map((f, i) => (
                  <li key={i} className="text-caption text-[var(--avs-text-secondary)]">• {f}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>

      {/* Timeline */}
      {inv.timeline.length > 0 && (
        <Card title="Investigation Timeline" variant="glass">
          <div className="space-y-2">
            {inv.timeline.map((event) => (
              <div key={event.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`h-2 w-2 rounded-full ${event.severity === 'critical' || event.severity === 'high' ? 'bg-[var(--avs-danger)]' : event.severity === 'medium' ? 'bg-[var(--avs-warning)]' : 'bg-[var(--avs-info)]'}`} />
                  <div className="h-full w-px bg-[var(--avs-border)]" />
                </div>
                <div className="pb-3">
                  <p className="text-small font-medium text-[var(--avs-text-primary)]">{event.description}</p>
                  <p className="text-caption text-[var(--avs-text-muted)]">{event.type} · {formatTimeAgo(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Evidence */}
      {inv.evidence.total > 0 && (
        <Card title={`Evidence (${inv.evidence.total})`} variant="glass">
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-caption">
              <Badge tone="neutral">Quality: {inv.evidence.evidenceQuality}</Badge>
              {inv.evidence.strongestEvidence && (
                <span className="text-[var(--avs-text-muted)]">Strongest: {inv.evidence.strongestEvidence.type}</span>
              )}
            </div>
            {inv.evidence.items.map((item, i) => (
              <div key={i} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-caption font-medium text-[var(--avs-text-primary)]">{item.type}</span>
                  <span className="text-caption text-[var(--avs-text-muted)]">{item.source}</span>
                </div>
                <p className="mt-1 text-caption text-[var(--avs-text-secondary)]">{item.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Affected Components */}
      {inv.affectedComponents.length > 0 && (
        <Card title="Affected Components" variant="glass">
          <div className="space-y-2">
            {inv.affectedComponents.map((comp, i) => (
              <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <div>
                  <span className="rounded bg-[var(--avs-surface)] px-1.5 py-0.5 text-caption font-medium text-[var(--avs-text-primary)]">{comp.type}</span>
                  <span className="ml-2 text-small text-[var(--avs-text-primary)]">{comp.name}</span>
                </div>
                <span className="text-caption text-[var(--avs-text-muted)]">{comp.status}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* MITRE ATT&CK */}
      {inv.mitreAttack.length > 0 && (
        <Card title="MITRE ATT&CK Mapping" variant="glass">
          <div className="space-y-2">
            {inv.mitreAttack.map((m, i) => (
              <div key={i} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-danger)]/20 bg-[var(--avs-danger)]/5 p-3">
                <p className="text-small font-semibold text-[var(--avs-danger)]">{m.tactic}</p>
                <p className="text-small text-[var(--avs-text-primary)]">{m.technique}{m.subtechnique && ` → ${m.subtechnique}`}</p>
                {m.reference && <p className="mt-1 text-caption text-[var(--avs-text-muted)]">{m.reference}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Relationship Graph */}
      {inv.relationshipGraph.totalNodes > 0 && (
        <Card title="Relationship Graph" variant="glass">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Nodes" value={inv.relationshipGraph.totalNodes.toString()} icon={CircleStackIcon} />
              <StatBox label="Edges" value={inv.relationshipGraph.totalEdges.toString()} icon={WifiIcon} />
              <StatBox label="Clusters" value={inv.relationshipGraph.clusters.length.toString()} icon={ChartBarIcon} />
            </div>
            {inv.relationshipGraph.clusters.map((cluster) => (
              <div key={cluster.id} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2">
                <p className="text-caption font-semibold text-[var(--avs-text-primary)]">{cluster.label}</p>
                <p className="text-caption text-[var(--avs-text-muted)]">{cluster.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recommended Actions */}
      {inv.recommendedActions.length > 0 && (
        <Card title="Recommended Actions" variant="glass">
          <div className="space-y-2">
            {inv.recommendedActions.map((action) => (
              <div key={action.id} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-small font-semibold text-[var(--avs-text-primary)]">{action.action}</p>
                  <Badge tone={action.priority === 'immediate' ? 'danger' : action.priority === 'high' ? 'warning' : 'neutral'}>
                    {action.priority}
                  </Badge>
                </div>
                <p className="mt-1 text-caption text-[var(--avs-text-secondary)]">{action.reason}</p>
                <p className="mt-1 text-caption text-[var(--avs-text-muted)]">Difficulty: {action.estimatedDifficulty}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Actions */}
      <Card variant="glass">
        <div className="flex flex-wrap gap-2">
          {canRemediate ? (
            <Button size="sm" onClick={() => vm.createRemediationPlan(inv.id)} leftIcon={<WrenchScrewdriverIcon className="h-4 w-4" />}>
              Create Remediation Plan
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => guard('security.remediate', 'Security Center', () => vm.createRemediationPlan(inv.id), {
                limitDescription: 'Remediation plans are not available in the Free edition.',
                proBenefit: 'Create and execute remediation plans to quarantine or remove threats with AVS Shield Pro.',
              })}
              leftIcon={<LockIconSmall className="h-4 w-4" />}
            >
              Create Remediation Plan (Pro)
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => vm.updateInvestigationStatus(inv.id, 'resolved')} leftIcon={<CheckIcon className="h-4 w-4" />}>
            Mark Resolved
          </Button>
          <Button size="sm" variant="secondary" onClick={() => vm.updateInvestigationStatus(inv.id, 'false_positive')} leftIcon={<XMarkIcon className="h-4 w-4" />}>
            Mark False Positive
          </Button>
          <Button size="sm" variant="ghost" onClick={() => vm.generateInvestigationReport(inv.id)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>
            Generate Report
          </Button>
        </div>
      </Card>
      {dialogElement}
    </div>
  );
}

// ─── Remediation Tab ────────────────────────────────────────────────

function RemediationTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const qs = s.quarantineSummary;
  const canRemediate = canUse('security.remediate');

  return (
    <div className="space-y-6">
      {/* Free edition notice */}
      {!canRemediate && (
        <Card variant="glass" className="border-[var(--avs-brand-primary)]/30 bg-[var(--avs-brand-primary)]/5">
          <div className="flex items-center gap-3">
            <LockIconSmall className="h-5 w-5 shrink-0 text-[var(--avs-brand-primary)]" />
            <div>
              <p className="text-small font-semibold text-[var(--avs-text-primary)]">Quarantine & Remediation are Pro features</p>
              <p className="text-caption text-[var(--avs-text-secondary)]">
                You can view detected threats and investigations for free. Upgrade to AVS Shield Pro to quarantine, remove, and remediate threats.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card variant="glass" className="p-4">
          <LockClosedIcon className="h-6 w-6 text-[var(--avs-warning)]" />
          <p className="mt-2 text-statistic text-[var(--avs-text-primary)]">{qs?.activeQuarantine ?? 0}</p>
          <p className="text-caption text-[var(--avs-text-muted)]">Quarantined Items</p>
        </Card>
        <Card variant="glass" className="p-4">
          <ArrowUturnLeftIcon className="h-6 w-6 text-[var(--avs-info)]" />
          <p className="mt-2 text-statistic text-[var(--avs-text-primary)]">{qs?.restored ?? 0}</p>
          <p className="text-caption text-[var(--avs-text-muted)]">Restored</p>
        </Card>
        <Card variant="glass" className="p-4">
          <TrashIcon className="h-6 w-6 text-[var(--avs-danger)]" />
          <p className="mt-2 text-statistic text-[var(--avs-text-primary)]">{qs?.deleted ?? 0}</p>
          <p className="text-caption text-[var(--avs-text-muted)]">Deleted</p>
        </Card>
        <Card variant="glass" className="p-4">
          <WrenchScrewdriverIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
          <p className="mt-2 text-statistic text-[var(--avs-text-primary)]">{s.plans.length}</p>
          <p className="text-caption text-[var(--avs-text-muted)]">Remediation Plans</p>
        </Card>
      </div>

      {/* Plans */}
      <Card title="Remediation Plans" variant="glass">
        {s.plans.length === 0 ? (
          <ModuleEmptyState icon={WrenchScrewdriverIcon} title="No remediation plans" message="Create a plan from an investigation to remediate threats." />
        ) : (
          <div className="space-y-3">
            {s.plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} vm={vm} />
            ))}
          </div>
        )}
      </Card>

      {/* Quarantine */}
      <Card title="Quarantine" variant="glass">
        {qs && qs.activeQuarantine === 0 ? (
          <ModuleEmptyState icon={LockClosedIcon} title="Quarantine is empty" message="Quarantined items will appear here." />
        ) : (
          <div className="space-y-2">
            {qs && (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <StatBox label="Total Items" value={qs.totalItems.toString()} icon={CircleStackIcon} />
                <StatBox label="Active" value={qs.activeQuarantine.toString()} icon={LockClosedIcon} />
                <StatBox label="Total Size" value={`${(qs.totalSize / 1024).toFixed(1)} KB`} icon={ComputerDesktopIcon} />
                <StatBox label="Newest" value={qs.newestQuarantine ? formatTimeAgo(qs.newestQuarantine) : 'N/A'} icon={ClockIcon} />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Remediation History */}
      {s.remediationHistory && (
        <Card title="Remediation History" variant="glass">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox label="Total Actions" value={s.remediationHistory.totalActions.toString()} icon={CircleStackIcon} />
            <StatBox label="Completed" value={s.remediationHistory.successfulActions.toString()} icon={CheckIcon} />
            <StatBox label="Failed" value={s.remediationHistory.failedActions.toString()} icon={XMarkIcon} />
            <StatBox label="Rolled Back" value={s.remediationHistory.rolledBackActions.toString()} icon={ArrowUturnLeftIcon} />
          </div>
        </Card>
      )}
    </div>
  );
}

function PlanCard({ plan, vm }: { plan: RemediationPlan; vm: SecurityCenterViewModel }) {
  const { guard, dialogElement } = useFeatureGuard();
  const canRemediate = canUse('security.remediate');

  return (
    <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-small font-semibold text-[var(--avs-text-primary)]">{plan.summary}</p>
          <p className="text-caption text-[var(--avs-text-muted)]">{plan.totalActions} actions · {formatTimeAgo(plan.createdAt)}</p>
        </div>
        <Badge tone={plan.status === 'completed' ? 'success' : plan.status === 'executing' ? 'warning' : plan.status === 'failed' ? 'danger' : 'neutral'}>
          {plan.status}
        </Badge>
      </div>

      {/* Actions List */}
      <div className="mt-3 space-y-1">
        {plan.actions.map((action) => (
          <div key={action.id} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface)] px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 rounded-full ${
                action.status === 'completed' ? 'bg-[var(--avs-success)]' :
                action.status === 'failed' ? 'bg-[var(--avs-danger)]' :
                action.status === 'executing' ? 'bg-[var(--avs-warning)]' :
                action.status === 'rolled_back' ? 'bg-[var(--avs-info)]' :
                'bg-[var(--avs-text-muted)]'
              }`} />
              <span className="text-caption font-medium text-[var(--avs-text-primary)]">{action.type}</span>
              <span className="text-caption text-[var(--avs-text-muted)]">{action.target.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-caption text-[var(--avs-text-muted)]">{action.riskLevel}</span>
              {action.status === 'completed' && action.reversible && action.rollbackId && (
                canRemediate ? (
                  <Button size="sm" variant="ghost" onClick={() => vm.rollbackAction(action.id)} leftIcon={<ArrowUturnLeftIcon className="h-3 w-3" />}>
                    Undo
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => guard('security.remediate', 'Security Center', () => vm.rollbackAction(action.id), {
                      limitDescription: 'Rollback of remediation actions is not available in the Free edition.',
                      proBenefit: 'Undo remediation actions with AVS Shield Pro.',
                    })}
                    leftIcon={<LockIconSmall className="h-3 w-3" />}
                  >
                    Undo (Pro)
                  </Button>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Plan Actions */}
      <div className="mt-3 flex gap-2">
        {plan.status === 'pending_approval' && (
          canRemediate ? (
            <>
              <Button size="sm" onClick={() => vm.approvePlan(plan.id)} leftIcon={<CheckIcon className="h-4 w-4" />}>Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => vm.rejectPlan(plan.id)} leftIcon={<XMarkIcon className="h-4 w-4" />}>Reject</Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => guard('security.remediate', 'Security Center', () => vm.approvePlan(plan.id), {
                  limitDescription: 'Approving remediation plans is not available in the Free edition.',
                  proBenefit: 'Approve and execute remediation plans with AVS Shield Pro.',
                })}
                leftIcon={<LockIconSmall className="h-4 w-4" />}
              >
                Approve (Pro)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => guard('security.remediate', 'Security Center', () => vm.rejectPlan(plan.id), {
                  limitDescription: 'Managing remediation plans is not available in the Free edition.',
                  proBenefit: 'Full remediation management with AVS Shield Pro.',
                })}
                leftIcon={<LockIconSmall className="h-4 w-4" />}
              >
                Reject (Pro)
              </Button>
            </>
          )
        )}
        {plan.status === 'approved' && (
          canRemediate ? (
            <Button size="sm" onClick={() => vm.executePlan(plan.id)} leftIcon={<WrenchScrewdriverIcon className="h-4 w-4" />}>Execute</Button>
          ) : (
            <Button
              size="sm"
              onClick={() => guard('security.remediate', 'Security Center', () => vm.executePlan(plan.id), {
                limitDescription: 'Executing remediation plans is not available in the Free edition.',
                proBenefit: 'Execute remediation plans to remove threats with AVS Shield Pro.',
              })}
              leftIcon={<LockIconSmall className="h-4 w-4" />}
            >
              Execute (Pro)
            </Button>
          )
        )}
        <Button size="sm" variant="ghost" onClick={() => vm.generateRemediationReport(plan.id)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>Report</Button>
      </div>
      {dialogElement}
    </div>
  );
}

// ─── Reports Tab ────────────────────────────────────────────────────

function ReportsTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;

  return (
    <div className="space-y-6">
      <Card title="Security Score Trend" variant="glass">
        {s.scoreTrend.length === 0 ? (
          <ModuleEmptyState icon={ChartBarIcon} title="No trend data" message="Run multiple scans to see score trends." />
        ) : (
          <div className="flex items-end gap-2 h-32">
            {s.scoreTrend.map((point, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-[var(--avs-radius-sm)] transition-all"
                  style={{
                    height: `${point.securityScore}%`,
                    background: point.securityScore >= 80 ? 'var(--avs-success)' : point.securityScore >= 60 ? 'var(--avs-warning)' : 'var(--avs-danger)',
                    opacity: 0.3 + (i / s.scoreTrend.length) * 0.7,
                  }}
                />
                <span className="text-caption text-[var(--avs-text-muted)]">{point.threatCount}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Scan History" variant="glass">
        {s.scanHistory.length === 0 ? (
          <ModuleEmptyState icon={ClockIcon} title="No scan history" />
        ) : (
          <div className="space-y-1">
            {s.scanHistory.slice().reverse().map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${entry.status === 'completed' ? 'bg-[var(--avs-success)]' : 'bg-[var(--avs-danger)]'}`} />
                  <span className="text-small font-medium text-[var(--avs-text-primary)] capitalize">{entry.scanType}</span>
                  <span className="text-caption text-[var(--avs-text-muted)]">{formatTimeAgo(entry.timestamp)}</span>
                </div>
                <div className="flex items-center gap-4 text-caption">
                  <span className="text-[var(--avs-text-secondary)]">{formatDuration(entry.duration)}</span>
                  <span className="text-[var(--avs-text-secondary)]">{entry.itemsScanned} items</span>
                  <span className={entry.threatsDetected > 0 ? 'text-[var(--avs-danger)] font-medium' : 'text-[var(--avs-success)]'}>{entry.threatsDetected} threats</span>
                  <span className="font-bold text-[var(--avs-text-primary)]">{entry.securityScore}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Protection Summary" variant="glass">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Total Scans" value={s.scanHistory.length.toString()} icon={ArrowPathIcon} />
          <StatBox label="Threats Detected" value={s.scanHistory.reduce((sum, e) => sum + e.threatsDetected, 0).toString()} icon={ExclamationTriangleIcon} />
          <StatBox label="Avg Score" value={s.scanHistory.length > 0 ? Math.round(s.scanHistory.reduce((sum, e) => sum + e.securityScore, 0) / s.scanHistory.length).toString() : '—'} icon={ShieldCheckIcon} />
          <StatBox label="Avg Duration" value={s.scanHistory.length > 0 ? formatDuration(Math.round(s.scanHistory.reduce((sum, e) => sum + e.duration, 0) / s.scanHistory.length)) : '—'} icon={ClockIcon} />
        </div>
      </Card>
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────────────

function SettingsTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;

  return (
    <div className="space-y-6">
      <Card title="Protection Status" variant="glass">
        <div className="space-y-3">
          <StatusRow label="Real-Time Protection" value={s.snapshot?.protectionStatus.realTimeProtection ? 'Active' : 'Inactive'} ok={s.snapshot?.protectionStatus.realTimeProtection ?? false} />
          <StatusRow label="Definitions" value={s.snapshot?.protectionStatus.definitionsActive ? 'Up to Date' : 'Unknown'} ok={s.snapshot?.protectionStatus.definitionsActive ?? false} />
          <StatusRow label="Overall Protected" value={s.snapshot?.protectionStatus.overallProtected ? 'Yes' : 'No'} ok={s.snapshot?.protectionStatus.overallProtected ?? false} />
          <StatusRow label="Definitions Version" value={s.snapshot?.definitionsVersion ?? '1.0.0'} ok={true} />
          <StatusRow label="Last Updated" value={s.snapshot?.lastUpdate ? formatTimeAgo(s.snapshot.lastUpdate) : 'Never'} ok={!!s.snapshot?.lastUpdate} />
        </div>
      </Card>

      <Card title="About" variant="glass">
        <div className="space-y-1 text-small text-[var(--avs-text-secondary)]">
          <p>AVS Shield v2.0 — AI Smart Security</p>
          <p>Powered by AVS Shield AI Engine</p>
        </div>
      </Card>
    </div>
  );
}
