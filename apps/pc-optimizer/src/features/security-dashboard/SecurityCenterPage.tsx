/**
 * SecurityCenterPage — V1.0 AI Security Center.
 *
 * Uses ONE canonical security architecture:
 *   ScanView(module="security") → scan_core.scan.full → ScanOrchestrator
 *   → Defender discovery → detection rules → SafetyGate → quarantine → verify
 *
 * The security score comes from the real backend scan_core.security.score RPC,
 * which is computed from authoritative Windows Defender telemetry.
 *
 * NEVER fabricates scores, threats, categories, or progress.
 * Suspicious heuristic findings are NEVER presented as confirmed malware.
 * Only Defender-confirmed threats are auto-quarantined.
 */
import { useCallback, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { ScanView, useSecurityScore } from '../scan';
import type { SecurityScoreResponse, DefenderStatusResponse } from '../scan';
import { Modal } from '../dashboard/components/Modal';
import {
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';

// ─── Page ───────────────────────────────────────────────────────────

export function SecurityCenterPage() {
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const { score, defender, loading, error, refresh } = useSecurityScore();

  // Refresh score when modal closes (scan may have changed security state)
  const handleModalClose = useCallback(() => {
    setScanModalOpen(false);
    void refresh();
  }, [refresh]);

  return (
    <div data-testid="page-security-center" className="space-y-6 p-6">
      <PageHeader
        title="AI Security Center"
        description="Real Windows Defender-backed security scan and remediation"
      />

      {/* ── Security Score + Scan Now ────────────────────────────── */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              scoreLabelColor(score)
            }`}>
              <ShieldCheckIcon className="h-8 w-8" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-caption font-semibold uppercase tracking-[var(--avs-tracking-widest)] text-[var(--avs-text-muted)]">
                Security Score
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-statistic text-text-primary" data-testid="security-score-value">
                  {loading ? '—' : (score?.score ?? '—')}
                </span>
                <span className="text-small font-medium text-text-secondary" data-testid="security-score-label">
                  {loading ? 'Loading…' : (score?.label ?? 'Unknown')}
                </span>
              </div>
              <p className="mt-1 text-caption text-text-muted truncate" data-testid="security-score-reason">
                {error ? error : (score?.reason ?? 'Fetching security status…')}
              </p>
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

      {/* ── Defender Status ──────────────────────────────────────── */}
      <DefenderStatusCard defender={defender} loading={loading} />

      {/* ── Security Summary ─────────────────────────────────────── */}
      <SecuritySummaryCard score={score} defender={defender} />

      {/* ── Quarantine Info ──────────────────────────────────────── */}
      <QuarantineInfoCard />

      {/* ── Scan Modal ───────────────────────────────────────────── */}
      <Modal
        open={scanModalOpen}
        onClose={handleModalClose}
        title="AI Security Scan"
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

// ─── Defender Status Card ───────────────────────────────────────────

function DefenderStatusCard({
  defender,
  loading,
}: {
  defender: DefenderStatusResponse | null;
  loading: boolean;
}) {
  if (loading && !defender) {
    return (
      <Card title="Windows Defender" variant="glass">
        <p className="text-small text-text-muted" data-testid="defender-status-loading">
          Checking Defender status…
        </p>
      </Card>
    );
  }

  if (!defender || !defender.ok) {
    return (
      <Card title="Windows Defender" variant="glass">
        <div className="flex items-center gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-warning)]" />
          <p className="text-small text-text-secondary" data-testid="defender-status-unavailable">
            {defender?.error ?? 'Windows Defender status unavailable'}
          </p>
        </div>
      </Card>
    );
  }

  const isAvailable = defender.is_available;
  const statusColor = isAvailable
    ? 'text-[var(--avs-success)]'
    : 'text-[var(--avs-warning)]';
  const statusIcon = isAvailable ? ShieldCheckIcon : ExclamationTriangleIcon;
  const StatusIcon = statusIcon;

  return (
    <Card title="Windows Defender" variant="glass">
      <div className="space-y-3" data-testid="defender-status-card">
        <div className="flex items-center gap-3">
          <StatusIcon className={`h-5 w-5 ${statusColor}`} />
          <div>
            <p className={`text-small font-semibold ${statusColor}`} data-testid="defender-status-label">
              {isAvailable ? 'Active' : 'Inactive'}
            </p>
            <p className="text-caption text-text-muted" data-testid="defender-status-reason">
              {defender.reason}
            </p>
          </div>
        </div>

        {defender.protection_state && (
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
        )}
      </div>
    </Card>
  );
}

function DefenderField({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-3 py-2">
      <p className="text-caption text-[var(--avs-text-muted)]">{label}</p>
      <p className={`text-small font-medium ${ok ? 'text-[var(--avs-success)]' : 'text-[var(--avs-warning)]'}`}>
        {value}
      </p>
    </div>
  );
}

// ─── Security Summary Card ──────────────────────────────────────────

function SecuritySummaryCard({
  score,
  defender,
}: {
  score: SecurityScoreResponse | null;
  defender: DefenderStatusResponse | null;
}) {
  const confirmedThreats = defender?.total_threat_count ?? 0;
  const activeThreats = defender?.active_threat_count ?? 0;
  const securedThreats = confirmedThreats - activeThreats;
  const remainingThreats = activeThreats;

  return (
    <Card title="Security Summary" variant="glass">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="security-summary">
        <SummaryStat
          label="Confirmed Threats"
          value={confirmedThreats}
          icon={ExclamationTriangleIcon}
          color={confirmedThreats > 0 ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-text-primary)]'}
          testId="confirmed-threats-count"
        />
        <SummaryStat
          label="Threats Secured"
          value={securedThreats}
          icon={ShieldCheckIcon}
          color="text-[var(--avs-success)]"
          testId="threats-secured-count"
        />
        <SummaryStat
          label="Threats Remaining"
          value={remainingThreats}
          icon={ExclamationTriangleIcon}
          color={remainingThreats > 0 ? 'text-[var(--avs-danger)]' : 'text-[var(--avs-text-primary)]'}
          testId="threats-remaining-count"
        />
        <SummaryStat
          label="Defender Available"
          value={defender?.is_available ? 'Yes' : 'No'}
          icon={ShieldCheckIcon}
          color={defender?.is_available ? 'text-[var(--avs-success)]' : 'text-[var(--avs-warning)]'}
          testId="defender-available"
        />
      </div>

      {score && !score.available && (
        <div className="mt-3 rounded-[var(--avs-radius-sm)] bg-[var(--avs-warning)]/10 px-3 py-2">
          <p className="text-caption text-[var(--avs-warning)]" data-testid="defender-unavailable-notice">
            {score.reason}
          </p>
        </div>
      )}
    </Card>
  );
}

function SummaryStat({
  label,
  value,
  icon: Icon,
  color,
  testId,
}: {
  label: string;
  value: number | string;
  icon: typeof ShieldCheckIcon;
  color: string;
  testId: string;
}) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-caption text-[var(--avs-text-muted)]">{label}</span>
      </div>
      <p className={`mt-1 text-statistic-sm font-bold ${color}`} data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

// ─── Quarantine Info Card ───────────────────────────────────────────

function QuarantineInfoCard() {
  return (
    <Card title="Quarantine" variant="glass">
      <div className="space-y-2">
        <p className="text-small text-text-secondary">
          Confirmed threats detected by Windows Defender are automatically quarantined
          using the secure quarantine system. Quarantined files are safely isolated
          and can be restored if needed.
        </p>
        <div className="flex items-center gap-2 text-caption text-text-muted">
          <ShieldCheckIcon className="h-4 w-4 text-[var(--avs-success)]" />
          <span>Atomic move · SHA-256 hash verification · Manifest persistence</span>
        </div>
      </div>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function scoreLabelColor(score: SecurityScoreResponse | null): string {
  if (!score) return 'bg-[var(--avs-surface-muted)]';
  if (score.label === 'Secure') return 'bg-semantic-success/10';
  if (score.label === 'Protected') return 'bg-semantic-success/10';
  if (score.label === 'At Risk') return 'bg-semantic-warning/10';
  if (score.label === 'Unprotected') return 'bg-semantic-danger/10';
  return 'bg-semantic-warning/10'; // Unknown
}

export default SecurityCenterPage;
