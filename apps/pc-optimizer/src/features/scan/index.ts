/**
 * scan — public barrel for the unified scan UI feature.
 */
export { scanService } from './scan.service';
export type { ScanService } from './scan.service';

export { useScan } from './useScan';
export type { UseScanOptions, UseScanReturn } from './useScan';

export { buildScanReport } from './reportBuilder';

export {
  OPTIMIZE_SCAN_CONFIG,
  SECURITY_SCAN_CONFIG,
  PROTECTION_SCAN_CONFIG,
  getScanConfig,
} from './moduleConfigs';

export { ScanView, type ScanViewProps } from './ScanView';
export { ScanPanel, type ScanPanelProps } from './ScanPanel';
export { DashboardScanStatusCard } from './components/DashboardScanStatusCard';
export { useDashboardScan } from './useDashboardScan';
export type { UseDashboardScanReturn } from './useDashboardScan';
export { toDashboardSnapshot } from './dashboardAdapter';
export type { DashboardScanSnapshot } from './dashboardAdapter';

export { remediationService } from './remediation.service';
export type { RemediationService } from './remediation.service';

export { useResults } from './useResults';
export type { UseResultsOptions, UseResultsReturn, ResultsStep } from './useResults';

export { useSmartOptimizationPlan } from './useSmartOptimizationPlan';
export type { UseSmartOptimizationPlanReturn } from './useSmartOptimizationPlan';

export { useSecurityRemediationPlan } from './useSecurityRemediationPlan';
export type { UseSecurityRemediationPlanReturn } from './useSecurityRemediationPlan';

export { useDashboardOptimizationPlan } from './useDashboardOptimizationPlan';
export type { UseDashboardOptimizationPlanReturn } from './useDashboardOptimizationPlan';

export { useSecurityScore } from './useSecurityScore';
export type { UseSecurityScoreReturn } from './useSecurityScore';
export type { SecurityScoreResponse, DefenderStatusResponse, DefenderThreat, DefenderProtectionState, SecurityScoreInputs } from './scan.service';

export { ResultsView, type ResultsViewProps } from './ResultsView';
export { PlanReviewView, type PlanReviewViewProps } from './PlanReviewView';
export { usePlanDetails } from './usePlanDetails';
export type { UsePlanDetailsReturn } from './usePlanDetails';
export { FindingsList, type FindingsListProps } from './FindingsList';
export { PreviewPanel, type PreviewPanelProps } from './PreviewPanel';
export { ValidationPanel, type ValidationPanelProps } from './ValidationPanel';
export { ExecutionProgressPanel, type ExecutionProgressPanelProps } from './ExecutionProgressPanel';
export { TerminalStatePanel, type TerminalStatePanelProps } from './TerminalStatePanel';
export {
  RollbackConfirmationPanel,
  type RollbackConfirmationPanelProps,
} from './RollbackConfirmationPanel';
export { RollbackResultPanel, type RollbackResultPanelProps } from './RollbackResultPanel';

export type {
  ScanFinding,
  ScanStatistics,
  RemediationPreview,
  RemediationPrepareResponse,
  RemediationValidation,
  RemediationValidateResponse,
  ExecutionStatus,
  RemediationExecution,
  RemediationExecutionStatus,
  RemediationExecuteResponse,
  RemediationStatusResponse,
  RemediationCancelResponse,
  RollbackResult,
  RollbackSummary,
  RemediationRollbackResponse,
  ExecutionStep,
  RollbackStep,
} from './types';
