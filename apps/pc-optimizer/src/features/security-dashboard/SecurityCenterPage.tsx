/**
 * SecurityCenterPage — V1.0 AI Smart Security.
 *
 * PURPOSE: "Does my PC have security threats?"
 *
 * This is an active threat scanner — distinctly different from AI Protection
 * Center (which answers "Is my PC protected?").
 *
 * Uses ONE canonical security architecture:
 *   ScanView(module="security") → scan_core.scan.full → ScanOrchestrator
 *   → Defender discovery → detection rules → SafetyGate → quarantine → verify
 *
 * NEVER fabricates scores, threats, categories, or progress.
 * Suspicious heuristic findings are NEVER presented as confirmed malware.
 * Only Defender-confirmed threats are auto-quarantined.
 */
import { useCallback, useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from '@avs/ui';
import { ScanView, useSecurityScore } from '../scan';
import { Modal } from '../dashboard/components/Modal';
import { ProStatusBanner, ProStatusPill } from '../licensing/ProStatusBadge';
import { dashboardService } from '../dashboard/dashboard.service';
import type { DashboardMetrics } from '../dashboard/dashboard.types';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  BoltIcon,
  ArrowPathIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

// ── Status badge types ──────────────────────────────────────────

type ScanStatus = 'ready' | 'scanning' | 'threats_found' | 'protected';

const STATUS_CONFIG: Record<
  ScanStatus,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'muted'; icon: typeof ShieldCheckIcon }
> = {
  ready: { label: 'Ready', tone: 'muted', icon: ShieldCheckIcon },
  scanning: { label: 'Scanning', tone: 'warning', icon: ArrowPathIcon },
  threats_found: { label: 'Threats Found', tone: 'danger', icon: ExclamationTriangleIcon },
  protected: { label: 'Protected', tone: 'success', icon: ShieldCheckIcon },
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

// ── Page ────────────────────────────────────────────────────────

export function SecurityCenterPage() {
  const navigate = useNavigate();
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const { score, defender, loading, error, refresh } = useSecurityScore();
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);

  // Fetch dashboard metrics to check for third-party AV (e.g. Trend Micro)
  useEffect(() => {
    void dashboardService.getMetrics().then(setDashboardMetrics).catch(() => {});
  }, []);

  const thirdPartyAV = dashboardMetrics?.security?.defender?.thirdPartyAV ?? null;

  const handleModalClose = useCallback(() => {
    setScanModalOpen(false);
    void refresh();
  }, [refresh]);

  // Derive page status badge from real Defender telemetry + scan modal state
  // When a third-party AV is active, Defender being off is EXPECTED —
  // the PC is still protected.
  const pageStatus: ScanStatus = useMemo(() => {
    if (scanModalOpen) return 'scanning';
    if (loading && !defender) return 'ready';
    if (!defender || !defender.ok) {
      // If third-party AV is active, show as protected
      if (thirdPartyAV) return 'protected';
      return 'ready';
    }
    const activeThreats = defender.active_threat_count ?? 0;
    if (activeThreats > 0) return 'threats_found';
    if (defender.is_available) return 'protected';
    // Defender not available but third-party AV is active
    if (thirdPartyAV) return 'protected';
    return 'ready';
  }, [defender, loading, scanModalOpen, thirdPartyAV]);

  const statusConfig = STATUS_CONFIG[pageStatus];
  const statusTone = toneClasses(statusConfig.tone);

  // Real threat counts from Defender
  const confirmedThreats = defender?.total_threat_count ?? 0;
  const activeThreats = defender?.active_threat_count ?? 0;
  const threatsSecured = confirmedThreats - activeThreats;
  const threatsRemaining = activeThreats;

  return (
    <div
      className="space-y-5"
      role="main"
      aria-label="AI Smart Security"
      data-testid="page-security-center"
    >
      <ProStatusBanner compact />

      {/* ── 1. HEADER ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="h-1 w-8 rounded-full shadow-glow" style={{ background: 'var(--avs-gradient-brand)' }} />
            <h1 className="text-page-title text-text-primary">AI Smart Security</h1>
          </div>
          <p className="mt-2 max-w-2xl text-small text-text-secondary leading-relaxed">
            Scan your PC for security threats and suspicious activity.
          </p>
          {/* Status badge */}
          <div
            className={`mt-3 inline-flex items-center gap-2 rounded-full ${statusTone.bg} ${statusTone.border} border px-3 py-1.5 text-small font-semibold ${statusTone.text}`}
            data-testid="security-status-badge"
          >
            <statusConfig.icon className={`h-4 w-4 ${pageStatus === 'scanning' ? 'animate-spin' : ''}`} />
            {statusConfig.label}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ProStatusPill />
        </div>
      </div>

      {/* ── 2. SECURITY SCAN CARD ─────────────────────────────── */}
      <Card variant="glass" className="p-6" data-testid="security-scan-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div
            className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              pageStatus === 'protected'
                ? 'bg-semantic-success/10'
                : pageStatus === 'threats_found'
                  ? 'bg-semantic-danger/10'
                  : 'bg-brand-primary/10'
            }`}
          >
            <ShieldExclamationIcon
              className={`h-8 w-8 ${
                pageStatus === 'protected'
                  ? 'text-semantic-success'
                  : pageStatus === 'threats_found'
                    ? 'text-semantic-danger'
                    : 'text-brand-primary'
              }`}
            />
            </div>
            <div className="min-w-0">
              <div className="text-section-title font-bold text-text-primary">
                Security Scan
              </div>
              <p className="mt-1 text-small text-text-secondary">
                Check your PC for threats.
              </p>
              {error && (
                <p className="mt-1 text-caption text-semantic-danger" data-testid="security-score-error">
                  {error}
                </p>
              )}
              {!error && score && !score.available && (
                <p className="mt-1 text-caption text-semantic-warning" data-testid="defender-unavailable-notice">
                  {score.reason}
                </p>
              )}
            </div>
          </div>
          <Button
            onClick={() => setScanModalOpen(true)}
            size="lg"
            leftIcon={<BoltIcon className="h-5 w-5" />}
            data-testid="security-scan-cta"
          >
            Scan Now
          </Button>
        </div>
      </Card>

      {/* ── 3. LIVE SECURITY COUNTERS ─────────────────────────── */}
      <div>
        <h2 className="mb-3 text-section-title font-semibold text-text-primary">
          Security Status
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <ThreatCounter
            label="Confirmed Threats"
            value={confirmedThreats}
            icon={ExclamationTriangleIcon}
            tone={confirmedThreats > 0 ? 'danger' : 'muted'}
            testId="security-confirmed-threats"
          />
          <ThreatCounter
            label="Threats Secured"
            value={threatsSecured}
            icon={ShieldCheckIcon}
            tone={threatsSecured > 0 ? 'success' : 'muted'}
            testId="security-threats-secured"
          />
          <ThreatCounter
            label="Threats Remaining"
            value={threatsRemaining}
            icon={ExclamationTriangleIcon}
            tone={threatsRemaining > 0 ? 'danger' : 'muted'}
            testId="security-threats-remaining"
          />
          <ThreatCounter
            label="Defender Available"
            value={defender?.is_available ? 'Yes' : 'No'}
            icon={ShieldCheckIcon}
            tone={defender?.is_available ? 'success' : 'warning'}
            testId="security-defender-available"
          />
        </div>
      </div>

      {/* ── 4. DEFENDER STATUS (compact) ──────────────────────── */}
      {/* When a third-party AV is active, Defender is correctly disabled
          by Windows. Show the third-party AV info instead of showing
          all Defender fields as "Off" (which would falsely suggest the
          PC is unprotected). */}
      {thirdPartyAV && (!defender || !defender.is_available) ? (
        <Card variant="glass" className="p-5" data-testid="defender-status-card">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheckIcon className="h-5 w-5 text-semantic-success" />
            <h3 className="text-small font-semibold text-text-primary">Antivirus Protection</h3>
            <span className="text-caption font-medium text-semantic-success" data-testid="defender-status-label">
              {thirdPartyAV} Active
            </span>
          </div>
          <p className="text-small text-text-secondary">
            {thirdPartyAV} is protecting your PC. Windows Defender is correctly disabled
            because a third-party antivirus is active. Your PC is protected.
          </p>
        </Card>
      ) : defender && defender.ok && defender.protection_state ? (
        <Card variant="glass" className="p-5" data-testid="defender-status-card">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheckIcon
              className={`h-5 w-5 ${defender.is_available ? 'text-semantic-success' : 'text-semantic-warning'}`}
            />
            <h3 className="text-small font-semibold text-text-primary">Windows Defender</h3>
            <span
              className={`text-caption font-medium ${defender.is_available ? 'text-semantic-success' : 'text-semantic-warning'}`}
              data-testid="defender-status-label"
            >
              {defender.is_available ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <DefenderField
              label="Real-Time Protection"
              value={defender.protection_state.real_time_protection_enabled ? 'On' : 'Off'}
              ok={defender.protection_state.real_time_protection_enabled}
            />
            <DefenderField
              label="Antivirus"
              value={defender.protection_state.antivirus_enabled ? 'On' : 'Off'}
              ok={defender.protection_state.antivirus_enabled}
            />
            <DefenderField
              label="Antispyware"
              value={defender.protection_state.antispyware_enabled ? 'On' : 'Off'}
              ok={defender.protection_state.antispyware_enabled}
            />
            <DefenderField
              label="Behavior Monitor"
              value={defender.protection_state.behavior_monitor_enabled ? 'On' : 'Off'}
              ok={defender.protection_state.behavior_monitor_enabled}
            />
            <DefenderField
              label="Signatures"
              value={defender.protection_state.signatures_out_of_date ? 'Out of date' : 'Up to date'}
              ok={!defender.protection_state.signatures_out_of_date}
            />
            <DefenderField
              label="Tamper Protection"
              value={defender.protection_state.is_tamper_protected ? 'On' : 'Off'}
              ok={defender.protection_state.is_tamper_protected}
            />
          </div>
        </Card>
      ) : null}

      {/* ── 5. PROTECTION CENTER NAVIGATION ───────────────────── */}
      <Card variant="glass" className="p-5" data-testid="security-protection-center-link">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-3 bg-brand-primary/10">
              <ShieldCheckIcon className="h-6 w-6 text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-small font-semibold text-text-primary">
                Check your protection
              </div>
              <p className="mt-1 text-caption text-text-secondary leading-relaxed">
                Review antivirus, firewall and Windows security settings.
              </p>
            </div>
          </div>
          <Button
            size="md"
            variant="secondary"
            onClick={() => navigate('/protection-center')}
            rightIcon={<ArrowRightIcon className="h-4 w-4" />}
            data-testid="security-open-protection-center"
          >
            Open AI Protection Center
          </Button>
        </div>
      </Card>

      {/* ── 6. SCAN MODAL ─────────────────────────────────────── */}
      <Modal
        open={scanModalOpen}
        onClose={handleModalClose}
        title="AI Smart Security Scan"
        size="xl"
        testId="security-scan-modal"
      >
        <ScanView
          module="security"
          mode="full"
          autoStart={true}
          buttonLabel="Scan Now"
          onClose={handleModalClose}
        />
      </Modal>
    </div>
  );
}

// ── Threat Counter Card ─────────────────────────────────────────

function ThreatCounter({
  label,
  value,
  icon: Icon,
  tone,
  testId,
}: {
  label: string;
  value: number | string;
  icon: typeof ShieldCheckIcon;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  testId: string;
}) {
  const tc = toneClasses(tone);
  return (
    <Card variant="glass" className="p-4" data-testid={testId}>
      <div className="flex items-start gap-3">
        <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2 ${tc.bg}`}>
          <Icon className={`h-5 w-5 ${tc.text}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-caption text-text-muted truncate">{label}</div>
          <div className={`mt-0.5 text-2xl font-bold tabular-nums ${tc.text}`}>
            {value}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Defender Field ──────────────────────────────────────────────

function DefenderField({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-[var(--avs-radius-sm)] bg-surface-muted px-3 py-2">
      <p className="text-caption text-text-muted">{label}</p>
      <p className={`text-small font-medium ${ok ? 'text-semantic-success' : 'text-semantic-warning'}`}>
        {value}
      </p>
    </div>
  );
}

export default SecurityCenterPage;
