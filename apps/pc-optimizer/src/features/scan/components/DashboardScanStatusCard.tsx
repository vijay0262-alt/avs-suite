/**
 * DashboardScanStatusCard.tsx — read-only dashboard card that displays the
 * latest unified scan/remediation state from `useDashboardScan`.
 *
 * It never starts a scan, executes remediation, or calls target executors.
 * The only user action is navigation to the appropriate module page.
 */
import { useNavigate } from 'react-router-dom';
import { Card, Button } from '@avs/ui';
import {
  ShieldCheckIcon,
  BoltIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { useDashboardScan } from '../useDashboardScan';

const statusTone: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  idle: 'muted',
  preparing: 'warning',
  scanning: 'warning',
  complete: 'success',
  error: 'danger',
  cancelled: 'muted',
};

function StatusLabel({ status }: { status: string }) {
  return (
    <span
      className={`text-caption font-medium ${
        statusTone[status] === 'success'
          ? 'text-semantic-success'
          : statusTone[status] === 'warning'
            ? 'text-semantic-warning'
            : statusTone[status] === 'danger'
              ? 'text-semantic-danger'
              : 'text-text-muted'
      }`}
    >
      {status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}

export function DashboardScanStatusCard() {
  const { snapshot } = useDashboardScan();
  const navigate = useNavigate();

  const primaryAction = (() => {
    const planParam = snapshot.planId ? `?planId=${encodeURIComponent(snapshot.planId)}` : '';
    if (snapshot.canReview) {
      return { label: 'Review Findings', route: `${snapshot.moduleRoute}${planParam}` };
    }
    if (snapshot.canApprove) {
      return { label: 'Approve & Fix', route: `${snapshot.moduleRoute}${planParam}` };
    }
    if (snapshot.canRollback) {
      return { label: 'View Rollback', route: `${snapshot.moduleRoute}${planParam}` };
    }
    if (!snapshot.hasActiveSession) {
      return { label: 'Start a Scan', route: '/ai-smart-optimize' };
    }
    return { label: 'Open', route: snapshot.moduleRoute };
  })();

  const Icon =
    snapshot.module === 'security' || snapshot.module === 'protection'
      ? ShieldCheckIcon
      : snapshot.scanStatus === 'error' || snapshot.remediationStatus === 'failed'
        ? ExclamationTriangleIcon
        : BoltIcon;

  return (
    <Card variant="glass" className="p-5" data-testid="dashboard-unified-scan-card">
      <div className="flex items-center gap-4">
        <div
          className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
            statusTone[snapshot.scanStatus] === 'success'
              ? 'bg-semantic-success/10'
              : statusTone[snapshot.scanStatus] === 'warning'
                ? 'bg-semantic-warning/10'
                : statusTone[snapshot.scanStatus] === 'danger'
                  ? 'bg-semantic-danger/10'
                  : 'bg-surface-muted'
          }`}
        >
          <Icon
            className={`h-6 w-6 ${
              statusTone[snapshot.scanStatus] === 'success'
                ? 'text-semantic-success'
                : statusTone[snapshot.scanStatus] === 'warning'
                  ? 'text-semantic-warning'
                  : statusTone[snapshot.scanStatus] === 'danger'
                    ? 'text-semantic-danger'
                    : 'text-text-muted'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-caption text-text-muted uppercase tracking-wide">
            Latest Unified Scan
          </div>
          <div className="text-section-title font-bold text-text-primary">
            {snapshot.hasActiveSession ? snapshot.moduleName : 'No recent scan'}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-small text-text-secondary">
            <StatusLabel status={snapshot.scanStatus} />
            {snapshot.hasActiveSession && (
              <>
                <span data-testid="dashboard-scan-issues">{snapshot.issuesFound} issues</span>
                {snapshot.actionableCount > 0 && (
                  <span data-testid="dashboard-scan-actionable">
                    {snapshot.actionableCount} actionable
                  </span>
                )}
                {snapshot.error && (
                  <span className="text-semantic-danger" data-testid="dashboard-scan-error">
                    {snapshot.error}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(primaryAction.route)}
          rightIcon={<ArrowRightIcon className="h-4 w-4" />}
          data-testid="dashboard-scan-action"
        >
          {primaryAction.label}
        </Button>
      </div>
    </Card>
  );
}
