/**
 * PlanReviewView.tsx — safely hydrates ResultsView from a persisted plan_id.
 *
 * This component is intended for cross-page navigation from the dashboard
 * scan history. It loads the plan details read-only from scan_core and then
 * lets the user proceed through the existing RemediationCoordinator flow.
 */
import { Card, LoadingState, EmptyState } from '@avs/ui';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { usePlanDetails } from './usePlanDetails';
import { ResultsView } from './ResultsView';
import { getScanConfig } from './moduleConfigs';
import type { ScanFinding, ScanStatistics } from './types';

export interface PlanReviewViewProps {
  planId: string;
  module: 'protection' | 'optimize' | 'security';
  onClose: () => void;
}

export function PlanReviewView({ planId, module, onClose }: PlanReviewViewProps) {
  const { loading, error, findings, statistics, isStale } = usePlanDetails(planId);
  const config = getScanConfig(module);

  if (loading) {
    return (
      <Card variant="glass" className="p-8" data-testid="plan-review-loading">
        <LoadingState message="Loading plan details..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card variant="glass" className="p-8" data-testid="plan-review-error">
        <EmptyState
          icon={<ExclamationTriangleIcon className="h-8 w-8" />}
          title="Results no longer available"
          description={error}
          action={{ label: 'Back to Dashboard', onClick: onClose }}
        />
      </Card>
    );
  }

  const safeFindings: ScanFinding[] = findings;
  const safeStatistics: ScanStatistics = statistics;

  return (
    <div data-testid="plan-review-view">
      {isStale && (
        <div
          className="mb-4 rounded-[var(--avs-radius-md)] bg-semantic-warning/10 p-3 text-small text-semantic-warning"
          data-testid="plan-review-stale-warning"
        >
          This plan is from an older scan. Verify the findings before approving any changes.
        </div>
      )}
      <ResultsView
        moduleName={config.moduleName}
        moduleIcon={config.moduleIcon}
        statistics={safeStatistics}
        findings={safeFindings}
        planId={planId}
        onClose={onClose}
      />
    </div>
  );
}
