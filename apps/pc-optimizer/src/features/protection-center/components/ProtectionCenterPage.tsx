/**
 * ProtectionCenterPage.tsx — V1.0 REDESIGN
 *
 * "SECURITY PROTECTION HEALTH" — answers one question:
 *   "Is my PC protected?"
 *
 * This is NOT a scanner. It is a clean, calm security-posture page:
 *   1. Page header + overall status
 *   2. Main protection score (real backend telemetry)
 *   3. Compact protection status grid (8 cards)
 *   4. Security provider card
 *   5. Recommendations (real issues only)
 *   6. Primary action: Check Protection (lightweight refresh)
 *   7. Smart Security navigation link
 *
 * No junk scanning, no filesystem scan, no fake data.
 * All values come from dashboardService.getMetrics() real backend telemetry.
 */
import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, LoadingState, EmptyState } from '@avs/ui';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  EyeIcon,
  FireIcon,
  GlobeAltIcon,
  LockClosedIcon,
  KeyIcon,
  CpuChipIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  BoltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { dashboardService } from '../../dashboard/dashboard.service';
import type { DashboardMetrics, HealthScore } from '../../dashboard/dashboard.types';
import { ProStatusBanner, ProStatusPill } from '../../licensing/ProStatusBadge';
import { PageHeader } from '../../../components/PageHeader';
import { HelpButton } from '../../../components/HelpButton';
import { ModuleSuccessBanner, ModuleErrorBanner } from '../../../components/ModuleStates';

// ── ViewModel ──────────────────────────────────────────────────

interface ProtectionPostureState {
  loading: boolean;
  error: string | null;
  metrics: DashboardMetrics | null;
  healthScore: HealthScore | null;
  lastRefresh: number | null;
  fixMessage: string | null;
  fixSuccess: boolean;
}

class ProtectionPostureViewModel extends ViewModel<ProtectionPostureState> {
  constructor() {
    super({
      loading: true,
      error: null,
      metrics: null,
      healthScore: null,
      lastRefresh: null,
      fixMessage: null,
      fixSuccess: false,
    });
  }

  async refresh(forceRefresh = false): Promise<void> {
    this.setState({ loading: true, error: null });
    try {
      // Only invalidate caches on explicit "Check Protection" click,
      // not on initial page load. This makes the page load fast using
      // cached data from the Dashboard.
      if (forceRefresh) {
        await dashboardService.refreshCache();
      }
      const [metrics, healthScore] = await Promise.all([
        dashboardService.getMetrics(),
        dashboardService.getHealthScore(),
      ]);
      this.setState({
        loading: false,
        metrics,
        healthScore,
        lastRefresh: Date.now(),
      });
    } catch (err) {
      this.setState({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load protection status',
      });
    }
  }

  async fixIssue(action: 'enableDefender' | 'enableFirewall' | 'enableSmartScreen'): Promise<void> {
    this.setState({ fixMessage: null, fixSuccess: false });
    try {
      const rpcCall =
        action === 'enableSmartScreen'
          ? dashboardService.enableSmartScreen()
          : action === 'enableDefender'
            ? dashboardService.enableDefender()
            : dashboardService.enableFirewall();
      const result = await rpcCall as { enabled?: boolean; message?: string };
      const message = result?.message ?? (result?.enabled ? 'Fix applied successfully' : 'Fix failed');
      this.setState({
        fixMessage: message,
        fixSuccess: result?.enabled === true,
      });
      await this.refresh(true);  // Force refresh after a fix to show updated state
    } catch (err) {
      this.setState({
        fixMessage: err instanceof Error ? err.message : 'Fix failed',
        fixSuccess: false,
      });
    }
  }

  clearFixMessage(): void {
    this.setState({ fixMessage: null, fixSuccess: false });
  }
}

// ── Types for protection items ─────────────────────────────────

type ProtectionStatus = 'protected' | 'enabled' | 'needs_attention' | 'disabled' | 'unknown';

interface ProtectionItem {
  id: string;
  name: string;
  status: ProtectionStatus;
  icon: typeof ShieldCheckIcon;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  fixAction?: 'enableDefender' | 'enableFirewall' | 'enableSmartScreen';
}

// ── Derivation helpers ─────────────────────────────────────────

function deriveProtectionItems(metrics: DashboardMetrics | null): ProtectionItem[] {
  const sec = metrics?.security;
  const win = metrics?.windows;
  const items: ProtectionItem[] = [];

  // 1. Antivirus
  const defenderOn = sec?.defender.enabled ?? false;
  const thirdPartyAV = sec?.defender.thirdPartyAV ?? null;
  const avsActive = !!metrics?.avsAvActive;
  const avActive = avsActive || defenderOn || !!thirdPartyAV;
  items.push({
    id: 'antivirus',
    name: 'Antivirus',
    status: avActive ? 'protected' : sec ? 'disabled' : 'unknown',
    icon: ShieldCheckIcon,
  });

  // 2. Real-Time Protection
  const rtp = sec?.realTimeProtection ?? false;
  const hasThirdParty = !!thirdPartyAV;
  items.push({
    id: 'realtime-protection',
    name: 'Real-Time Protection',
    status: rtp || hasThirdParty || avsActive ? 'enabled' : sec ? 'disabled' : 'unknown',
    icon: EyeIcon,
  });

  // 3. Firewall
  const firewallOn = sec?.firewall.enabled ?? false;
  items.push({
    id: 'firewall',
    name: 'Firewall',
    status: firewallOn ? 'enabled' : sec ? 'disabled' : 'unknown',
    icon: FireIcon,
  });

  // 4. SmartScreen
  const smartScreen = sec?.smartScreen ?? null;
  items.push({
    id: 'smartscreen',
    name: 'SmartScreen',
    status: smartScreen === true ? 'enabled' : smartScreen === false ? 'needs_attention' : 'unknown',
    icon: GlobeAltIcon,
  });

  // 5. Ransomware Protection (Controlled Folder Access)
  // Backend does not currently provide this telemetry.
  items.push({
    id: 'ransomware-protection',
    name: 'Ransomware Protection',
    status: 'unknown',
    icon: LockClosedIcon,
  });

  // 6. Secure Boot
  const secureBoot = win?.secureBoot ?? null;
  items.push({
    id: 'secure-boot',
    name: 'Secure Boot',
    status: secureBoot === true ? 'enabled' : secureBoot === false ? 'disabled' : 'unknown',
    icon: KeyIcon,
  });

  // 7. Memory Integrity (Core Isolation)
  // Backend does not currently provide this telemetry.
  items.push({
    id: 'memory-integrity',
    name: 'Memory Integrity',
    status: 'unknown',
    icon: CpuChipIcon,
  });

  // 8. Security Updates
  const updates = sec?.updates;
  const pendingUpdates = updates?.pendingUpdates ?? null;
  const updatesServiceOn = updates?.serviceEnabled ?? null;
  items.push({
    id: 'security-updates',
    name: 'Security Updates',
    status:
      updates == null
        ? 'unknown'
        : pendingUpdates != null && pendingUpdates === 0 && updatesServiceOn !== false
          ? 'enabled'
          : pendingUpdates != null && pendingUpdates > 0
            ? 'needs_attention'
            : 'unknown',
    icon: BoltIcon,
  });

  return items;
}

function deriveProvider(metrics: DashboardMetrics | null): {
  name: string;
  active: boolean;
} | null {
  const sec = metrics?.security;
  if (!sec) return null;

  // Check AVS AI Shield first — it's our product, show it as primary
  if (metrics?.avsAvActive) {
    return { name: 'AVS AI Shield Antivirus', active: true };
  }

  const thirdPartyAV = sec.defender.thirdPartyAV ?? sec.firewall.thirdPartyAV ?? null;
  if (thirdPartyAV) {
    return { name: thirdPartyAV, active: true };
  }

  const activeProducts = sec.defender.activeProducts;
  if (activeProducts && activeProducts.length > 0) {
    return { name: activeProducts[0]!, active: true };
  }

  if (sec.defender.enabled) {
    return { name: 'Microsoft Defender', active: true };
  }

  // No active provider — do not fabricate one.
  return null;
}

function deriveRecommendations(metrics: DashboardMetrics | null): Recommendation[] {
  const sec = metrics?.security;
  if (!sec) return [];

  const recs: Recommendation[] = [];

  // Real-Time Protection disabled (and no third-party AV or AVS covering it)
  const hasThirdParty = !!(sec.defender.thirdPartyAV ?? sec.firewall.thirdPartyAV);
  const avsActive = !!metrics?.avsAvActive;
  if (!sec.realTimeProtection && !hasThirdParty && !avsActive && sec.defender.enabled === false) {
    recs.push({
      id: 'enable-rtp',
      title: 'Real-Time Protection is off',
      description: 'Enable Microsoft Defender real-time protection to block threats as they appear.',
      fixAction: 'enableDefender',
    });
  }

  // Firewall disabled
  if (!sec.firewall.enabled) {
    recs.push({
      id: 'enable-firewall',
      title: 'Firewall is off',
      description: 'Enable the Windows Firewall to block unauthorized network access.',
      fixAction: 'enableFirewall',
    });
  }

  // SmartScreen disabled
  if (sec.smartScreen === false) {
    recs.push({
      id: 'enable-smartscreen',
      title: 'SmartScreen is off',
      description: 'Enable SmartScreen to warn about malicious websites and downloads.',
      fixAction: 'enableSmartScreen',
    });
  }

  // Pending security updates
  const pending = sec.updates.pendingUpdates;
  if (pending != null && pending > 0) {
    recs.push({
      id: 'pending-updates',
      title: `${pending} pending security update${pending === 1 ? '' : 's'}`,
      description: 'Install pending Windows security updates to stay protected against known vulnerabilities.',
    });
  }

  return recs;
}

type OverallStatus = 'protected' | 'at_risk' | 'action_required' | 'unknown';

function deriveOverallStatus(
  items: ProtectionItem[],
  metrics: DashboardMetrics | null,
): OverallStatus {
  if (!metrics) return 'unknown';

  const avsActive = !!metrics.avsAvActive;

  const hasDisabled = items.some(
    (i) => i.status === 'disabled' || i.status === 'needs_attention',
  );
  // If AVS is active, don't flag "action_required" just because Defender is off
  if (hasDisabled && !avsActive) return 'action_required';

  const avActive = avsActive || metrics.security.defender.enabled || !!metrics.security.defender.thirdPartyAV;
  const firewallOn = metrics.security.firewall.enabled;
  const rtpOn = avsActive || metrics.security.realTimeProtection || !!metrics.security.defender.thirdPartyAV;

  if (avActive && (firewallOn || avsActive) && rtpOn) return 'protected';

  // Some telemetry present but not all critical checks pass
  return 'at_risk';
}

function deriveProtectionScore(healthScore: HealthScore | null): number | null {
  if (!healthScore) return null;
  const score = healthScore.categoryScores?.security;
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return score;
}

// ── Status display config ──────────────────────────────────────

const STATUS_CONFIG: Record<
  ProtectionStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }
> = {
  protected: { label: 'Protected', tone: 'success' },
  enabled: { label: 'Enabled', tone: 'success' },
  needs_attention: { label: 'Needs Attention', tone: 'warning' },
  disabled: { label: 'Disabled', tone: 'danger' },
  unknown: { label: 'Unknown', tone: 'muted' },
};

const OVERALL_CONFIG: Record<
  OverallStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; icon: typeof ShieldCheckIcon }
> = {
  protected: { label: 'Protected', tone: 'success', icon: ShieldCheckIcon },
  at_risk: { label: 'At Risk', tone: 'warning', icon: ShieldExclamationIcon },
  action_required: { label: 'Action Required', tone: 'danger', icon: ExclamationTriangleIcon },
  unknown: { label: 'Unknown', tone: 'muted', icon: ShieldExclamationIcon },
};

function toneClasses(tone: 'success' | 'warning' | 'danger' | 'muted'): {
  text: string;
  bg: string;
  border: string;
} {
  switch (tone) {
    case 'success':
      return { text: 'text-semantic-success', bg: 'bg-semantic-success/10', border: 'border-semantic-success/20' };
    case 'warning':
      return { text: 'text-semantic-warning', bg: 'bg-semantic-warning/10', border: 'border-semantic-warning/20' };
    case 'danger':
      return { text: 'text-semantic-danger', bg: 'bg-semantic-danger/10', border: 'border-semantic-danger/20' };
    default:
      return { text: 'text-text-muted', bg: 'bg-surface-muted', border: 'border-surface-muted' };
  }
}

// ── Component ──────────────────────────────────────────────────

export function ProtectionCenterPage() {
  const navigate = useNavigate();
  const vmRef = useRef<ProtectionPostureViewModel | null>(null);

  if (!vmRef.current) {
    vmRef.current = new ProtectionPostureViewModel();
  }
  const vm = vmRef.current;
  const state = useViewModel(vm);

  useEffect(() => {
    // Initial load: use cached data (fast). Don't force a backend refresh.
    void vm.refresh(false);
    return () => {
      vm.dispose();
    };
  }, [vm]);

  const protectionItems = useMemo(
    () => deriveProtectionItems(state.metrics),
    [state.metrics],
  );

  const provider = useMemo(() => deriveProvider(state.metrics), [state.metrics]);

  const recommendations = useMemo(
    () => deriveRecommendations(state.metrics),
    [state.metrics],
  );

  const overallStatus = useMemo(
    () => deriveOverallStatus(protectionItems, state.metrics),
    [protectionItems, state.metrics],
  );

  const protectionScore = useMemo(
    () => deriveProtectionScore(state.healthScore),
    [state.healthScore],
  );

  const overallConfig = OVERALL_CONFIG[overallStatus];
  const overallTone = toneClasses(overallConfig.tone);

  const handleCheckProtection = useCallback(() => {
    // Explicit "Check Protection" click: force a fresh backend query.
    void vm.refresh(true);
  }, [vm]);

  const handleFix = useCallback(
    (action: 'enableDefender' | 'enableFirewall' | 'enableSmartScreen') => {
      void vm.fixIssue(action);
    },
    [vm],
  );

  const handleDismissFixMessage = useCallback(() => {
    vm.clearFixMessage();
  }, [vm]);

  if (state.loading && !state.metrics) {
    return (
      <LoadingState
        message="Loading AI Protection Center…"
        data-testid="protection-center-loading"
      />
    );
  }

  if (state.error && !state.metrics) {
    return (
      <EmptyState
        icon={<ShieldCheckIcon className="h-10 w-10" />}
        title="Unable to load Protection Center"
        description="Please check your connection and try again."
        action={{ label: 'Retry', onClick: () => vm.refresh() }}
        data-testid="protection-center-error"
      />
    );
  }

  return (
    <div
      className="space-y-5"
      role="main"
      aria-label="AI Protection Center"
      data-testid="page-protection-center"
    >
      <ProStatusBanner compact />

      {/* ── 1. HEADER ─────────────────────────────────────────── */}
      <PageHeader
        title="AI Protection Center"
        description="See your PC's security protection at a glance."
        actions={
          <>
            <ProStatusPill />
            <Button
              onClick={handleCheckProtection}
              disabled={state.loading}
              size="md"
              leftIcon={
                state.loading ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheckIcon className="h-4 w-4" />
                )
              }
              data-testid="protection-check-protection"
            >
              Check Protection
            </Button>
            <HelpButton text="The Protection Center shows your PC's overall security posture based on real telemetry from Windows Defender, firewall, and other security features." />
          </>
        }
        testId="page-protection-center-header"
      />

      {/* Overall status badge */}
      <div
        className={`inline-flex items-center gap-2 rounded-full ${overallTone.bg} ${overallTone.border} border px-3 py-1.5 text-small font-semibold ${overallTone.text}`}
        data-testid="protection-overall-status"
      >
        <overallConfig.icon className="h-4 w-4" />
        {overallConfig.label}
      </div>

      {/* ── Fix result banner ─────────────────────────────────── */}
      {state.fixMessage && state.fixSuccess && (
        <ModuleSuccessBanner
          title="Protection issue resolved successfully."
          onDismiss={handleDismissFixMessage}
          testId="protection-fix-message"
        />
      )}
      {state.fixMessage && !state.fixSuccess && (
        <ModuleErrorBanner
          message="Unable to fix the protection issue. Please try again."
          onDismiss={handleDismissFixMessage}
          testId="protection-fix-message"
        />
      )}

      {/* ── 2. MAIN PROTECTION SCORE ──────────────────────────── */}
      <Card variant="glass" className="p-6" data-testid="protection-score-card">
        <div className="flex items-center gap-6">
          <div
            className={`relative inline-flex items-center justify-center h-24 w-24 rounded-full ${
              protectionScore == null
                ? 'bg-surface-muted'
                : protectionScore >= 80
                  ? 'bg-semantic-success/10'
                  : protectionScore >= 60
                    ? 'bg-semantic-warning/10'
                    : 'bg-semantic-danger/10'
            }`}
          >
            <ShieldCheckIcon
              className={`h-10 w-10 ${
                protectionScore == null
                  ? 'text-text-muted'
                  : protectionScore >= 80
                    ? 'text-semantic-success'
                    : protectionScore >= 60
                      ? 'text-semantic-warning'
                      : 'text-semantic-danger'
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-caption text-text-muted uppercase tracking-wide">
              Security Protection Score
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-text-primary tabular-nums">
                {protectionScore == null ? 'Unknown' : protectionScore}
              </span>
              {protectionScore != null && (
                <span className="text-base text-text-muted">/ 100</span>
              )}
            </div>
            <div
              className={`mt-1 text-small font-medium ${
                protectionScore == null
                  ? 'text-text-muted'
                  : protectionScore >= 80
                    ? 'text-semantic-success'
                    : protectionScore >= 60
                      ? 'text-semantic-warning'
                      : 'text-semantic-danger'
              }`}
            >
              {protectionScore == null
                ? 'No protection telemetry available'
                : protectionScore >= 80
                  ? 'Well protected'
                  : protectionScore >= 60
                    ? 'Some protection gaps'
                    : 'Needs attention'}
            </div>
          </div>
        </div>
      </Card>

      {/* ── 3. PROTECTION STATUS GRID ─────────────────────────── */}
      <div>
        <h2 className="mb-3 text-section-title font-semibold text-text-primary">
          Protection Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {protectionItems.map((item) => {
            const cfg = STATUS_CONFIG[item.status];
            const tone = toneClasses(cfg.tone);
            return (
              <Card
                key={item.id}
                variant="glass"
                className="p-4"
                data-testid={`protection-card-${item.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2 ${tone.bg}`}>
                    <item.icon className={`h-5 w-5 ${tone.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-small font-semibold text-text-primary truncate">
                      {item.name}
                    </div>
                    <div className={`mt-0.5 text-caption font-medium ${tone.text}`}>
                      {cfg.label}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── 4. SECURITY PROVIDER ──────────────────────────────── */}
      <Card variant="glass" className="p-5" data-testid="protection-provider-card">
        <div className="flex items-center gap-4">
          <div
            className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              provider?.active ? 'bg-semantic-success/10' : 'bg-surface-muted'
            }`}
          >
            <ShieldCheckIcon
              className={`h-6 w-6 ${
                provider?.active ? 'text-semantic-success' : 'text-text-muted'
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-caption text-text-muted uppercase tracking-wide">
              Active Security Provider
            </div>
            <div className="mt-1 text-section-title font-bold text-text-primary">
              {provider ? provider.name : 'No active provider'}
            </div>
            <div
              className={`mt-0.5 text-small font-medium ${
                provider?.active ? 'text-semantic-success' : 'text-text-muted'
              }`}
            >
              {provider?.active ? 'Active' : 'Unknown'}
            </div>
          </div>
        </div>
      </Card>

      {/* ── 5. RECOMMENDATIONS ────────────────────────────────── */}
      <div>
        <h2 className="mb-3 text-section-title font-semibold text-text-primary">
          Recommended Actions
        </h2>
        {recommendations.length === 0 ? (
          <Card variant="glass" className="p-5" data-testid="protection-no-recommendations">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="h-6 w-6 text-semantic-success shrink-0" />
              <p className="text-small text-text-secondary">
                Your protection settings look good.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec) => (
              <Card
                key={rec.id}
                variant="glass"
                className="p-4"
                data-testid={`protection-recommendation-${rec.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-small font-semibold text-text-primary">
                        {rec.title}
                      </div>
                      <p className="mt-1 text-caption text-text-secondary leading-relaxed">
                        {rec.description}
                      </p>
                    </div>
                  </div>
                  {rec.fixAction && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleFix(rec.fixAction!)}
                      data-testid={`protection-fix-${rec.id}`}
                    >
                      Fix
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── 6. SMART SECURITY NAVIGATION ──────────────────────── */}
      <Card variant="glass" className="p-5" data-testid="protection-smart-security-link">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-3 bg-brand-primary/10">
              <ShieldExclamationIcon className="h-6 w-6 text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-small font-semibold text-text-primary">
                Looking for threats?
              </div>
              <p className="mt-1 text-caption text-text-secondary leading-relaxed">
                Run a security scan to check for confirmed threats and suspicious items.
              </p>
            </div>
          </div>
          <Button
            size="md"
            variant="primary"
            onClick={() => navigate('/ai-smart-security')}
            rightIcon={<ArrowRightIcon className="h-4 w-4" />}
            data-testid="protection-open-smart-security"
          >
            Open AI Smart Security
          </Button>
        </div>
      </Card>

      {state.loading && state.metrics && (
        <div className="flex items-center gap-1.5 text-caption text-text-muted">
          <ArrowPathIcon className="h-3 w-3 animate-spin" />
          <span>Refreshing…</span>
        </div>
      )}
    </div>
  );
}

export default ProtectionCenterPage;
