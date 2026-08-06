/**
 * Unified AI Results Framework — barrel export.
 *
 * Every module in AVS Shield imports from here to get a consistent,
 * premium AI results experience after every scan.
 */

// Types
export type {
  IssuePriority,
  UnifiedIssue,
  UnifiedImpactEstimate,
  UnifiedRecommendation,
  UnifiedResultCardData,
  UnifiedResultCardMetric,
  UnifiedScoreDisplay,
  UnifiedAIVerdict,
  UnifiedScanHistoryEntry,
  UnifiedResultsReport,
  UnifiedResultAction,
  UnifiedSystemInfo,
  ReportExportFormat,
} from './unifiedResultsTypes';

export {
  priorityOrder,
  priorityLabel,
  priorityColor,
  priorityBg,
  riskColor,
  scoreColor,
  scoreStrokeColor,
  formatTimestamp,
  formatDuration,
} from './unifiedResultsTypes';

// Hook
export { useScanHistory } from './useScanHistory';

// Components
export { ResultHeader } from './components/ResultHeader';
export { ScoreGauge, ScoreRow } from './components/ScoreGauge';
export { AIVerdict } from './components/AIVerdict';
export { IssuePriorityGroups } from './components/IssuePriorityGroups';
export { ImpactEstimation } from './components/ImpactEstimation';
export { ResultCardsGrid } from './components/ResultCardsGrid';
export { Recommendations } from './components/Recommendations';
export { ActionPanel } from './components/ActionPanel';
export { ReportExport } from './components/ReportExport';
export { ScanHistory } from './components/ScanHistory';
export { UnifiedResultsView } from './components/UnifiedResultsView';
export { UnifiedCleanerResults } from './UnifiedCleanerResults';
export type { CleanerResultData, UnifiedCleanerResultsProps } from './UnifiedCleanerResults';
