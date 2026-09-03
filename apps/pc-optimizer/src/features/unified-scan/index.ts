/**
 * Unified Scanning Framework — barrel export.
 *
 * Every module in AVS AI Shield imports from here to get a consistent
 * scanning experience.
 */

// Types
export type {
  UnifiedScanStep,
  UnifiedScanPhaseStatus,
  UnifiedScanPhase,
  UnifiedScanCounterDef,
  UnifiedScanCounterValue,
  UnifiedScanTreeNode,
  UnifiedResultCard,
  UnifiedAISummary,
  UnifiedScanReport,
  UnifiedScanAction,
  UnifiedScanLiveStatus,
  UnifiedScanModuleConfig,
  UnifiedScanState,
} from './unifiedScanTypes';
export {
  formatDuration,
  formatETA,
  formatCounterValue,
  SCAN_ICON_MAP,
} from './unifiedScanTypes';

// Hook
export { useUnifiedScan } from './useUnifiedScan';
export type { UseUnifiedScanReturn, UseUnifiedScanOptions, UnifiedScanCallbacks } from './useUnifiedScan';

// Animated counter hook
export { useAnimatedCounter, useElapsedTimer } from './useAnimatedCounter';

// Components
export { ScanHeader } from './components/ScanHeader';
export { ScanProgress } from './components/ScanProgress';
export { ScanCounters } from './components/ScanCounters';
export { ScanTree } from './components/ScanTree';
export { ScanAnimation } from './components/ScanAnimation';
export { ScanFooter } from './components/ScanFooter';
export { ScanSummary } from './components/ScanSummary';
export { ResultCards } from './components/ResultCards';
export { UnifiedScanView } from './components/UnifiedScanView';
export { UnifiedScanProgressCard } from './components/UnifiedScanProgressCard';

// Module Configurations
export {
  OPTIMIZE_SCAN_CONFIG,
  SECURITY_SCAN_CONFIG,
  JUNK_SCAN_CONFIG,
  REGISTRY_SCAN_CONFIG,
  PRIVACY_SCAN_CONFIG,
  DUPLICATE_SCAN_CONFIG,
  HARDWARE_SCAN_CONFIG,
  PERFORMANCE_SCAN_CONFIG,
  STARTUP_SCAN_CONFIG,
  DISK_SCAN_CONFIG,
  BROWSER_SCAN_CONFIG,
  UPDATER_SCAN_CONFIG,
  UNINSTALLER_SCAN_CONFIG,
  MODULE_SCAN_CONFIGS,
} from './moduleConfigs';
