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
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleLoadingState, ModuleEmptyState } from '../../components/ModuleStates';
import { ProStatusBanner, ProStatusPill, ProFeatureIndicator, ProOnlySection } from '../licensing/ProStatusBadge';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { canUse } from '../licensing/FeatureGate';
import { LockClosedIcon as LockIconSmall } from '@heroicons/react/24/solid';
import { LiveScanProgress } from '../shared/components/LiveScanProgress';
import {
  SecurityCenterViewModel,
  type SecurityCenterTab,
  type ScanMode,
} from './SecurityCenterViewModel';
import type { Threat, ThreatCategory, ThreatSeverity, SecurityProviderInfo } from '../security-center/types';
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
} from '@heroicons/react/24/outline';

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
      if (navState.mode) {
        vm.setScanMode(navState.mode);
      }
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
            <p className="mt-3 text-sm font-medium text-[var(--avs-text-primary)]">Failed to initialize</p>
            <p className="mt-1 text-xs text-[var(--avs-text-muted)]">{state.bootstrapError}</p>
            <Button className="mt-4" size="sm" onClick={() => vm.bootstrap()} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              Retry
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 py-6">
      <ProStatusBanner compact />
      <PageHeader
        title="AI Security Center"
        description="Unified AI-powered security protection, investigation, and remediation."
        actions={
          <div className="flex items-center gap-3">
            <ProStatusPill />
            <div className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-1.5">
              <div className={`h-2 w-2 rounded-full ${state.securityScore >= 80 ? 'bg-[var(--avs-success)]' : state.securityScore >= 60 ? 'bg-[var(--avs-warning)]' : 'bg-[var(--avs-danger)]'}`} />
              <span className="text-sm font-semibold text-[var(--avs-text-primary)]">{state.securityScore}</span>
              <span className="text-xs text-[var(--avs-text-muted)]">Security Score</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => vm.refresh()}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* AI Smart Security — Deep System Scan */}
      <Card variant="glass" className="mb-6">
        <div className="flex flex-col items-center gap-4 py-6 px-4 text-center">
          <div className="rounded-full bg-brand-primary/10 p-4">
            <ShieldCheckIcon className="h-10 w-10 text-brand-primary" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-primary">AI Smart Security</h2>
            <p className="mt-2 max-w-2xl text-sm text-text-secondary">
              Protect your PC from <span className="font-medium text-text-primary">viruses, ransomware, spyware, malware, PUPs, trojans, adware, keyloggers, rootkits, backdoors, crypto miners, browser hijackers</span>, and more. AI Smart Security runs a deep system scan to detect, investigate, and safely remove threats with evidence-based remediation.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => { vm.setScanMode('full'); vm.startScan('full'); vm.setActiveTab('scan'); }}
            disabled={state.isScanning}
            loading={state.isScanning}
            leftIcon={state.isScanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
            data-testid="ai-smart-security-scan-btn"
          >
            {state.isScanning ? 'Scanning…' : 'AI Smart Security'}
          </Button>
        </div>
      </Card>

      {/* Tab Bar */}
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-[var(--avs-radius-lg)] bg-[var(--avs-surface-muted)] p-1">
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
              className={`flex items-center gap-2 rounded-[var(--avs-radius-md)] px-4 py-2 text-sm font-medium transition-all duration-[var(--avs-duration-fast)] ${
                isActive
                  ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-[var(--avs-shadow-sm)]'
                  : 'text-[var(--avs-text-secondary)] hover:text-[var(--avs-text-primary)]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {badge !== null && (
                <span className="ml-1 rounded-full bg-[var(--avs-danger)] px-1.5 py-0.5 text-xs font-bold text-white">
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

  const scoreCards = [
    { label: 'Security Score', value: s.securityScore, icon: ShieldCheckIcon, tone: s.securityScore >= 80 ? 'success' : s.securityScore >= 60 ? 'warning' : 'danger' },
    { label: 'Active Threats', value: s.activeThreats.length, icon: ExclamationTriangleIcon, tone: s.activeThreats.length === 0 ? 'success' : 'danger' },
    { label: 'Providers Active', value: `${s.providers.filter(p => p.status === 'active').length}/${s.providers.length}`, icon: CpuChipIcon, tone: 'info' },
    { label: 'Investigations', value: s.activeInvestigations.length, icon: BeakerIcon, tone: s.activeInvestigations.length === 0 ? 'success' : 'warning' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Score Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {scoreCards.map((card) => {
          const Icon = card.icon;
          const toneColor = card.tone === 'success' ? 'var(--avs-success)' : card.tone === 'warning' ? 'var(--avs-warning)' : card.tone === 'danger' ? 'var(--avs-danger)' : 'var(--avs-info)';
          return (
            <Card key={card.label} variant="glass" className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[var(--avs-text-muted)]">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--avs-text-primary)]">{card.value}</p>
                </div>
                <div className="rounded-[var(--avs-radius-md)] p-2.5" style={{ background: `${toneColor}15` }}>
                  <Icon className="h-6 w-6" style={{ color: toneColor }} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Threat Protection Description */}
      <Card variant="glass">
        <div className="flex items-start gap-4">
          <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-brand-primary)]/10 p-3 shrink-0">
            <ShieldCheckIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--avs-text-primary)]">What AVS Shield Protects Against</h3>
            <p className="mt-1 text-sm text-[var(--avs-text-secondary)]">
              AVS Shield scans your system for a wide range of threats including{' '}
              <span className="font-medium text-[var(--avs-text-primary)]">trojans, worms, PUPs (Potentially Unwanted Programs), malware, spyware, adware, ransomware, keyloggers, rootkits, backdoors, crypto miners, browser hijackers, and suspicious startup entries</span>.
              Detected threats are automatically quarantined and can be safely removed to keep your PC clean and secure.
            </p>
          </div>
        </div>
      </Card>

      {/* Protection Status & Capabilities */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Protection Status" variant="glass">
          <div className="space-y-3">
            <StatusRow label="Real-Time Protection" value={snapshot?.protectionStatus.realTimeProtection ? 'Active' : 'Standby'} ok={snapshot?.protectionStatus.realTimeProtection ?? false} />
            <StatusRow label="Definitions" value={snapshot?.protectionStatus.definitionsActive ? 'Up to Date' : 'Unknown'} ok={snapshot?.protectionStatus.definitionsActive ?? false} />
            <StatusRow label="Overall Protected" value={snapshot?.protectionStatus.overallProtected ? 'Yes' : 'No'} ok={snapshot?.protectionStatus.overallProtected ?? false} />
            <StatusRow label="Definitions Version" value={snapshot?.definitionsVersion ?? '1.0.0'} ok={true} />
            <StatusRow label="Last Scan" value={snapshot?.lastScan ? formatTimeAgo(snapshot.lastScan) : 'Never'} ok={!!snapshot?.lastScan} />

            {/* Pro-only security features */}
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

        <Card title="Security Capabilities" variant="glass">
          <div className="space-y-2">
            {s.capabilities.map((cap) => (
              <div key={cap.name} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-[var(--avs-text-primary)]">{cap.description}</p>
                  <p className="text-xs text-[var(--avs-text-muted)]">{cap.name}</p>
                </div>
                <Badge tone={cap.enabled ? 'success' : 'neutral'}>
                  {cap.enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
            ))}
            {s.capabilities.length === 0 && (
              <p className="py-4 text-center text-sm text-[var(--avs-text-muted)]">No capabilities data</p>
            )}
          </div>
        </Card>
      </div>

      {/* Threat Categories Grid */}
      <Card title="Threat Categories" variant="glass">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {THREAT_CATEGORIES.map((cat) => {
            const count = s.threats.filter(t => t.category === cat.key).length;
            const activeCount = s.threats.filter(t => t.category === cat.key && t.status === 'active').length;
            const Icon = cat.icon;
            return (
              <div key={cat.key} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-[var(--avs-text-secondary)]" />
                  <span className="text-sm font-medium text-[var(--avs-text-primary)]">{cat.label}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-[var(--avs-text-primary)]">{count}</span>
                  {activeCount > 0 && <span className="text-xs text-[var(--avs-danger)]">{activeCount} active</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent Scans */}
      <Card title="Recent Scans" variant="glass">
        {s.scanHistory.length === 0 ? (
          <ModuleEmptyState icon={ClockIcon} title="No scans yet" message="Run your first scan to see security history." />
        ) : (
          <div className="space-y-2">
            {s.scanHistory.slice(-5).reverse().map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${entry.status === 'completed' ? 'bg-[var(--avs-success)]' : 'bg-[var(--avs-danger)]'}`} />
                  <div>
                    <p className="text-sm font-medium text-[var(--avs-text-primary)] capitalize">{entry.scanType} Scan</p>
                    <p className="text-xs text-[var(--avs-text-muted)]">{formatTimeAgo(entry.timestamp)} · {formatDuration(entry.duration)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[var(--avs-text-secondary)]">{entry.itemsScanned} items</span>
                  <span className={`text-sm font-semibold ${entry.threatsDetected > 0 ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-success)]'}`}>
                    {entry.threatsDetected} threats
                  </span>
                  <span className="text-sm font-bold text-[var(--avs-text-primary)]">{entry.securityScore}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--avs-text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${ok ? 'bg-[var(--avs-success)]' : 'bg-[var(--avs-warning)]'}`} />
        <span className="text-sm font-medium text-[var(--avs-text-primary)]">{value}</span>
      </div>
    </div>
  );
}

// ─── Scan Tab ───────────────────────────────────────────────────────

function ScanTab({ vm }: { vm: SecurityCenterViewModel }) {
  const s = vm.state;
  const progress = s.scanProgress;

  return (
    <div className="flex gap-6">
      {/* Left Sidebar — Scan Types + Scan Now Button */}
      <div className="w-64 shrink-0 space-y-4">
        <Card variant="glass">
          <div className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">Scan Type</p>
            {SIDEBAR_SCAN_MODES.map((mode) => {
              const Icon = mode.icon;
              const isSelected = s.scanMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => vm.setScanMode(mode.id)}
                  disabled={s.isScanning}
                  className={`w-full rounded-[var(--avs-radius-md)] border p-3 text-left transition-all duration-[var(--avs-duration-fast)] ${
                    isSelected
                      ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]/10'
                      : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)] hover:border-[var(--avs-border-hover)]'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${isSelected ? 'text-[var(--avs-brand-primary)]' : 'text-[var(--avs-text-secondary)]'}`} />
                    <span className="text-sm font-semibold text-[var(--avs-text-primary)]">{mode.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--avs-text-muted)]">{mode.description}</p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Scan Now Button */}
        <Button
          size="lg"
          onClick={() => vm.startScan()}
          disabled={s.isScanning}
          loading={s.isScanning}
          leftIcon={<MagnifyingGlassIcon className="h-5 w-5" />}
          className="w-full"
        >
          {s.isScanning ? 'Scanning…' : 'Scan Now'}
        </Button>

        {/* Scan Progress (in sidebar when scanning) */}
        {progress && (
          <Card title="Scan Progress" variant="glass">
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[var(--avs-text-primary)] truncate" title={progress.currentPhase}>
                    {progress.currentPhase}
                  </span>
                  <span className="text-xs text-[var(--avs-text-muted)] shrink-0 ml-2">{formatDuration(progress.elapsedMs)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--avs-surface-muted)]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: progress.status === 'completed' ? '100%' : `${Math.min(95, (progress.filesScanned / Math.max(1, progress.filesTotal ?? progress.providersTotal)) * 100)}%`,
                      background: 'var(--avs-gradient-brand)',
                    }}
                  />
                </div>
              </div>
              {progress.currentFilePath && (
                <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-2 py-1.5">
                  <div className="text-xs text-text-muted mb-0.5">Current file:</div>
                  <div className="text-xs font-mono text-text-secondary truncate" title={progress.currentFilePath}>
                    {progress.currentFilePath}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <StatBox label="Files" value={progress.filesScanned.toLocaleString()} icon={CircleStackIcon} />
                <StatBox label="Threats" value={progress.threatsFound.toString()} icon={ExclamationTriangleIcon} />
              </div>
              {progress.aiObservations.length > 0 && (
                <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2">
                  <div className="space-y-1">
                    {progress.aiObservations.slice(0, 3).map((obs, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <ChevronRightIcon className="mt-0.5 h-3 w-3 shrink-0 text-[var(--avs-brand-primary)]" />
                        <span className="text-xs text-[var(--avs-text-secondary)]">{obs}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* Right / Main Section — Protection Components */}
      <div className="flex-1 space-y-6">
        {/* Live scan progress — prominent display like SUPERAntiSpyware / CCleaner */}
        {s.isScanning && (
          <LiveScanProgress
            isRunning={s.isScanning}
            scanLabel="Security"
            currentItem={progress?.currentFilePath ?? progress?.currentPhase ?? null}
            progress={progress?.status === 'completed' ? 100 : progress ? Math.min(95, Math.round((progress.filesScanned / Math.max(1, progress.filesTotal ?? progress.providersTotal)) * 100)) : undefined}
            itemsScanned={progress?.filesScanned ?? progress?.itemsScanned}
            itemsFound={progress?.threatsFound}
            elapsedMs={progress?.elapsedMs}
            phases={[
              { id: 'collect', label: 'Collecting system data from backend…' },
              { id: 'deepscan', label: 'Deep scanning files and folders…' },
              { id: 'analyze', label: 'Analyzing collected data with security providers…' },
              { id: 'detect', label: 'Running threat detection providers…' },
              { id: 'score', label: 'Computing security scores and recommendations…' },
            ]}
          />
        )}

        {/* Header */}
        <div>
          <h3 className="text-sm font-semibold text-[var(--avs-text-primary)]">Protection Components</h3>
          <p className="mt-0.5 text-xs text-[var(--avs-text-muted)]">
            These security engines will be used to scan your system for threats.
          </p>
        </div>

        {/* Protection Provider Cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {s.providers.map((provider) => (
            <ProtectionComponentCard key={provider.id} provider={provider} />
          ))}
          {s.providers.length === 0 && (
            <Card variant="glass" className="col-span-full">
              <ModuleEmptyState
                icon={ShieldCheckIcon}
                title="No providers loaded"
                message="Security providers will appear here once initialized."
              />
            </Card>
          )}
        </div>

        {/* Capability Cards */}
        {s.capabilities.length > 0 && (
          <Card title="Detection Capabilities" variant="glass">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {s.capabilities.map((cap) => (
                <div
                  key={cap.name}
                  className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${cap.enabled ? 'bg-[var(--avs-success)]' : 'bg-[var(--avs-text-muted)]'}`} />
                    <div>
                      <p className="text-sm font-medium text-[var(--avs-text-primary)]">{cap.description}</p>
                      <p className="text-xs text-[var(--avs-text-muted)]">{cap.name}</p>
                    </div>
                  </div>
                  <Badge tone={cap.enabled ? 'success' : 'neutral'}>
                    {cap.enabled ? 'Active' : 'Disabled'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Last Scan Result */}
        {s.lastScanResult && (
          <Card title="Last Scan Result" variant="glass">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatBox label="Scan Type" value={s.lastScanResult.scanType} icon={MagnifyingGlassIcon} />
                <StatBox label="Duration" value={formatDuration(s.lastScanResult.duration)} icon={ClockIcon} />
                <StatBox label="Threats" value={s.lastScanResult.threats.length.toString()} icon={ExclamationTriangleIcon} />
                <StatBox label="Score" value={s.lastScanResult.securityScore.toString()} icon={ShieldCheckIcon} />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-[var(--avs-text-secondary)]">Provider Results</p>
                <div className="space-y-1">
                  {s.lastScanResult.providerResults.map((pr) => (
                    <div key={pr.providerId} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full ${pr.success ? 'bg-[var(--avs-success)]' : 'bg-[var(--avs-danger)]'}`} />
                        <span className="text-xs font-medium text-[var(--avs-text-primary)]">{pr.providerId}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--avs-text-muted)]">
                        <span>{pr.itemsScanned} items</span>
                        <span className={pr.threats.length > 0 ? 'text-[var(--avs-danger)] font-medium' : ''}>{pr.threats.length} threats</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProtectionComponentCard({ provider }: { provider: SecurityProviderInfo }) {
  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    active: { color: 'text-[var(--avs-success)]', bg: 'bg-[var(--avs-success)]/10', label: 'Active' },
    inactive: { color: 'text-[var(--avs-text-muted)]', bg: 'bg-[var(--avs-surface-muted)]', label: 'Inactive' },
    error: { color: 'text-[var(--avs-danger)]', bg: 'bg-[var(--avs-danger)]/10', label: 'Error' },
    disabled: { color: 'text-[var(--avs-text-muted)]', bg: 'bg-[var(--avs-surface-muted)]', label: 'Disabled' },
  };
  const cfg = statusConfig[provider.status] ?? statusConfig.inactive ?? { color: 'text-[var(--avs-text-muted)]', bg: 'bg-[var(--avs-surface-muted)]', label: 'Unknown' };
  const providerIcons: Record<string, typeof ShieldCheckIcon> = {
    behavior: EyeIcon,
    signature: ShieldCheckIcon,
    heuristic: CpuChipIcon,
    network: WifiIcon,
    cloud: GlobeAltIcon,
    memory: CpuChipIcon,
    startup: ArrowPathIcon,
    browser: GlobeAltIcon,
    registry: ComputerDesktopIcon,
    file: CircleStackIcon,
  };
  const Icon = providerIcons[provider.type] ?? ShieldCheckIcon;

  return (
    <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-4 transition-colors hover:border-[var(--avs-border-hover)]">
      <div className="flex items-start gap-3">
        <div className={`rounded-[var(--avs-radius-md)] p-2.5 ${cfg.bg}`}>
          <Icon className={`h-5 w-5 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-[var(--avs-text-primary)]">{provider.name}</h4>
            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--avs-text-secondary)]">{provider.description}</p>
          {provider.capabilities.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {provider.capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded-full bg-[var(--avs-surface)] px-2 py-0.5 text-xs text-[var(--avs-text-muted)]"
                >
                  {cap}
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-[var(--avs-text-muted)]">
            <span>v{provider.version}</span>
            <span className="capitalize">{provider.type}</span>
            {provider.lastRun && (
              <span>Last run: {formatTimeAgo(provider.lastRun)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ShieldCheckIcon }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--avs-text-muted)]" />
        <span className="text-xs text-[var(--avs-text-muted)]">{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold capitalize text-[var(--avs-text-primary)]">{value}</p>
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
            <span className="text-xs font-semibold text-[var(--avs-text-secondary)]">Category:</span>
            <select
              value={s.threatFilter.category}
              onChange={(e) => vm.setThreatFilter({ category: e.target.value as ThreatCategory | 'all' })}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-sm text-[var(--avs-text-primary)]"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : CATEGORY_LABELS[c] ?? c}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--avs-text-secondary)]">Severity:</span>
            <select
              value={s.threatFilter.severity}
              onChange={(e) => vm.setThreatFilter({ severity: e.target.value as ThreatSeverity | 'all' })}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-sm text-[var(--avs-text-primary)]"
            >
              {severities.map(sv => <option key={sv} value={sv}>{sv === 'all' ? 'All Severities' : sv.charAt(0).toUpperCase() + sv.slice(1)}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[var(--avs-text-secondary)]">Status:</span>
            <select
              value={s.threatFilter.status}
              onChange={(e) => vm.setThreatFilter({ status: e.target.value as Threat['status'] | 'all' })}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2 py-1 text-sm text-[var(--avs-text-primary)]"
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
            className="ml-auto rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-1 text-sm text-[var(--avs-text-primary)] placeholder:text-[var(--avs-text-muted)]"
          />
        </div>
      </Card>

      {/* Threats List */}
      {threats.length === 0 ? (
        <ModuleEmptyState
          icon={ShieldCheckIcon}
          title="No threats found"
          message={s.threats.length === 0 ? 'Run a scan to detect threats.' : 'No threats match the current filters.'}
          action={s.threats.length === 0 ? <Button size="sm" onClick={() => { vm.setActiveTab('scan'); vm.startScan('quick'); }}>Run Quick Scan</Button> : undefined}
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
            <p className="text-sm font-semibold text-[var(--avs-text-primary)]">{threat.name}</p>
            <p className="text-xs text-[var(--avs-text-muted)]">
              {CATEGORY_LABELS[threat.category] ?? threat.category} · {threat.detectionSource} · {formatTimeAgo(threat.detectionTime)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={threat.status === 'active' ? 'danger' : threat.status === 'resolved' ? 'success' : 'neutral'}>
            {threat.status}
          </Badge>
          <span className={`text-xs font-bold ${SEVERITY_COLORS[threat.severity]}`}>
            {(threat.confidence * 100).toFixed(0)}%
          </span>
          <ChevronRightIcon className={`h-4 w-4 text-[var(--avs-text-muted)] transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[var(--avs-border)] pt-3">
          {/* Explanation */}
          <div>
            <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">AI Explanation</p>
            <p className="mt-1 text-sm text-[var(--avs-text-primary)]">{threat.explanation}</p>
          </div>

          {/* Recommendation */}
          <div>
            <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">Recommendation</p>
            <p className="mt-1 text-sm text-[var(--avs-text-primary)]">{threat.recommendation}</p>
          </div>

          {/* Evidence */}
          {threat.evidence.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">Evidence ({threat.evidence.length})</p>
              <div className="mt-1 space-y-1">
                {threat.evidence.map((ev, i) => (
                  <div key={i} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-2 py-1 text-xs text-[var(--avs-text-secondary)]">
                    <span className="font-medium text-[var(--avs-text-primary)]">{ev.type}:</span> {ev.description}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Affected Assets */}
          {threat.affectedAssets.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">Affected Assets ({threat.affectedAssets.length})</p>
              <div className="mt-1 space-y-1">
                {threat.affectedAssets.map((asset, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[var(--avs-text-secondary)]">
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
              <p className="text-xs font-semibold text-[var(--avs-danger)]">MITRE ATT&CK</p>
              <p className="mt-0.5 text-xs text-[var(--avs-text-secondary)]">
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
        action={<Button size="sm" onClick={() => { vm.setActiveTab('scan'); vm.startScan('full'); }}>Run Full Scan</Button>}
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
              <p className="text-sm font-semibold text-[var(--avs-text-primary)]">{inv.summary.title}</p>
              <p className="mt-0.5 text-xs text-[var(--avs-text-muted)]">{inv.summary.oneLiner}</p>
              <div className="mt-2 flex items-center gap-2">
                <Badge tone={inv.status === 'open' ? 'warning' : inv.status === 'resolved' ? 'success' : 'neutral'}>
                  {inv.status}
                </Badge>
                <span className="text-xs text-[var(--avs-text-muted)]">{inv.threatIds.length} threats</span>
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
            <p className="mt-3 text-sm text-[var(--avs-text-muted)]">Select an investigation to view details</p>
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
            <p className="text-sm font-semibold text-[var(--avs-text-primary)]">{inv.summary.title}</p>
            <p className="mt-1 text-sm text-[var(--avs-text-secondary)]">{inv.summary.oneLiner}</p>
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
            <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">What Happened</p>
            <p className="mt-1 text-sm text-[var(--avs-text-primary)]">{inv.explanation.whatHappened}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">Why Detected</p>
            <p className="mt-1 text-sm text-[var(--avs-text-primary)]">{inv.explanation.whyDetected}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">User-Friendly Explanation</p>
            <p className="mt-1 text-sm text-[var(--avs-text-primary)]">{inv.explanation.userFriendlyExplanation}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-[var(--avs-text-secondary)]">Confidence Reasoning</p>
            <p className="mt-1 text-sm text-[var(--avs-text-primary)]">{inv.confidence.reasoning}</p>
          </div>
          {inv.explanation.possibleFalsePositiveFactors.length > 0 && (
            <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-warning)]/10 border border-[var(--avs-warning)]/20 p-2">
              <p className="text-xs font-semibold text-[var(--avs-warning)]">Possible False Positive Factors</p>
              <ul className="mt-1 space-y-0.5">
                {inv.explanation.possibleFalsePositiveFactors.map((f, i) => (
                  <li key={i} className="text-xs text-[var(--avs-text-secondary)]">• {f}</li>
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
                  <p className="text-sm font-medium text-[var(--avs-text-primary)]">{event.description}</p>
                  <p className="text-xs text-[var(--avs-text-muted)]">{event.type} · {formatTimeAgo(event.timestamp)}</p>
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
            <div className="flex items-center gap-3 text-xs">
              <Badge tone="neutral">Quality: {inv.evidence.evidenceQuality}</Badge>
              {inv.evidence.strongestEvidence && (
                <span className="text-[var(--avs-text-muted)]">Strongest: {inv.evidence.strongestEvidence.type}</span>
              )}
            </div>
            {inv.evidence.items.map((item, i) => (
              <div key={i} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--avs-text-primary)]">{item.type}</span>
                  <span className="text-xs text-[var(--avs-text-muted)]">{item.source}</span>
                </div>
                <p className="mt-1 text-xs text-[var(--avs-text-secondary)]">{item.description}</p>
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
                  <span className="rounded bg-[var(--avs-surface)] px-1.5 py-0.5 text-xs font-medium text-[var(--avs-text-primary)]">{comp.type}</span>
                  <span className="ml-2 text-sm text-[var(--avs-text-primary)]">{comp.name}</span>
                </div>
                <span className="text-xs text-[var(--avs-text-muted)]">{comp.status}</span>
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
                <p className="text-sm font-semibold text-[var(--avs-danger)]">{m.tactic}</p>
                <p className="text-sm text-[var(--avs-text-primary)]">{m.technique}{m.subtechnique && ` → ${m.subtechnique}`}</p>
                {m.reference && <p className="mt-1 text-xs text-[var(--avs-text-muted)]">{m.reference}</p>}
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
                <p className="text-xs font-semibold text-[var(--avs-text-primary)]">{cluster.label}</p>
                <p className="text-xs text-[var(--avs-text-muted)]">{cluster.description}</p>
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
                  <p className="text-sm font-semibold text-[var(--avs-text-primary)]">{action.action}</p>
                  <Badge tone={action.priority === 'immediate' ? 'danger' : action.priority === 'high' ? 'warning' : 'neutral'}>
                    {action.priority}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--avs-text-secondary)]">{action.reason}</p>
                <p className="mt-1 text-xs text-[var(--avs-text-muted)]">Difficulty: {action.estimatedDifficulty}</p>
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
              <p className="text-sm font-semibold text-[var(--avs-text-primary)]">Quarantine & Remediation are Pro features</p>
              <p className="text-xs text-[var(--avs-text-secondary)]">
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
          <p className="mt-2 text-2xl font-bold text-[var(--avs-text-primary)]">{qs?.activeQuarantine ?? 0}</p>
          <p className="text-xs text-[var(--avs-text-muted)]">Quarantined Items</p>
        </Card>
        <Card variant="glass" className="p-4">
          <ArrowUturnLeftIcon className="h-6 w-6 text-[var(--avs-info)]" />
          <p className="mt-2 text-2xl font-bold text-[var(--avs-text-primary)]">{qs?.restored ?? 0}</p>
          <p className="text-xs text-[var(--avs-text-muted)]">Restored</p>
        </Card>
        <Card variant="glass" className="p-4">
          <TrashIcon className="h-6 w-6 text-[var(--avs-danger)]" />
          <p className="mt-2 text-2xl font-bold text-[var(--avs-text-primary)]">{qs?.deleted ?? 0}</p>
          <p className="text-xs text-[var(--avs-text-muted)]">Deleted</p>
        </Card>
        <Card variant="glass" className="p-4">
          <WrenchScrewdriverIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
          <p className="mt-2 text-2xl font-bold text-[var(--avs-text-primary)]">{s.plans.length}</p>
          <p className="text-xs text-[var(--avs-text-muted)]">Remediation Plans</p>
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
          <p className="text-sm font-semibold text-[var(--avs-text-primary)]">{plan.summary}</p>
          <p className="text-xs text-[var(--avs-text-muted)]">{plan.totalActions} actions · {formatTimeAgo(plan.createdAt)}</p>
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
              <span className="text-xs font-medium text-[var(--avs-text-primary)]">{action.type}</span>
              <span className="text-xs text-[var(--avs-text-muted)]">{action.target.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--avs-text-muted)]">{action.riskLevel}</span>
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
                <span className="text-xs text-[var(--avs-text-muted)]">{point.threatCount}</span>
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
                  <span className="text-sm font-medium text-[var(--avs-text-primary)] capitalize">{entry.scanType}</span>
                  <span className="text-xs text-[var(--avs-text-muted)]">{formatTimeAgo(entry.timestamp)}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
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

      <Card title="Provider Status Report" variant="glass">
        <div className="space-y-1">
          {s.providers.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${p.status === 'active' ? 'bg-[var(--avs-success)]' : p.status === 'error' ? 'bg-[var(--avs-danger)]' : 'bg-[var(--avs-text-muted)]'}`} />
                <span className="text-sm font-medium text-[var(--avs-text-primary)]">{p.name}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--avs-text-muted)]">
                <span>{p.type}</span>
                <span>v{p.version}</span>
                {p.lastRun && <span>{formatTimeAgo(p.lastRun)}</span>}
              </div>
            </div>
          ))}
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
      <Card title="Security Configuration" variant="glass">
        <div className="space-y-3">
          <ToggleRow label="Behavior Analysis" description="Monitor process behavior patterns" enabled={s.capabilities.find(c => c.name === 'behavior_analysis')?.enabled ?? false} />
          <ToggleRow label="Signature Detection" description="Signature-based threat detection" enabled={s.capabilities.find(c => c.name === 'signature_detection')?.enabled ?? false} />
          <ToggleRow label="Persistence Detection" description="Detect persistence mechanisms" enabled={s.capabilities.find(c => c.name === 'persistence_detection')?.enabled ?? false} />
          <ToggleRow label="Browser Protection" description="Browser extension and settings monitoring" enabled={s.capabilities.find(c => c.name === 'browser_protection')?.enabled ?? false} />
          <ToggleRow label="Reputation Analysis" description="File and publisher reputation checks" enabled={s.capabilities.find(c => c.name === 'reputation_analysis')?.enabled ?? false} />
          <ToggleRow label="Threat Intelligence" description="Correlate with threat intelligence feeds" enabled={s.capabilities.find(c => c.name === 'threat_intelligence')?.enabled ?? false} />
        </div>
      </Card>

      <Card title="Definitions" variant="glass">
        <div className="space-y-2">
          <StatusRow label="Version" value={s.snapshot?.definitionsVersion ?? '1.0.0'} ok={true} />
          <StatusRow label="Last Updated" value={s.snapshot?.lastUpdate ? formatTimeAgo(s.snapshot.lastUpdate) : 'Never'} ok={!!s.snapshot?.lastUpdate} />
          <StatusRow label="Status" value={s.snapshot?.protectionStatus.definitionsActive ? 'Active' : 'Inactive'} ok={s.snapshot?.protectionStatus.definitionsActive ?? false} />
        </div>
      </Card>

      <Card title="About" variant="glass">
        <div className="space-y-1 text-sm text-[var(--avs-text-secondary)]">
          <p>AI Security Center v2.0</p>
          <p>{s.providers.length} detection providers registered</p>
          <p>{s.capabilities.length} security capabilities</p>
          <p>Powered by AVS Shield AI Engine</p>
        </div>
      </Card>
    </div>
  );
}

function ToggleRow({ label, description, enabled }: { label: string; description: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
      <div>
        <p className="text-sm font-medium text-[var(--avs-text-primary)]">{label}</p>
        <p className="text-xs text-[var(--avs-text-muted)]">{description}</p>
      </div>
      <div className={`relative h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-border)]'}`}>
        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </div>
    </div>
  );
}
