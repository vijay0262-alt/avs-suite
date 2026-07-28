/**
 * Storage Intelligence Platform — Barrel Export
 *
 * Unified storage analysis engine that serves as the foundation for:
 *   • Large File Analyzer
 *   • Duplicate Finder (placeholder)
 *   • Download Folder Cleanup
 *   • Old Installer Detection
 *   • Empty Folder Cleanup
 *   • Storage Heat Maps
 *   • AI Storage Recommendations
 *
 * Components:
 *   • StorageScanner — discovers files from scan sources
 *   • StorageIndex — in-memory file index with querying
 *   • StorageAnalyzer — comprehensive storage analysis
 *   • StorageStatisticsCalculator — aggregate statistics
 *   • StorageRecommendationEngine — cleanup recommendations
 *   • StorageExecutionTask — MaintenanceTask for safe cleanup
 *   • StorageHealthIntegration — AI Health Engine data provider
 *
 * This module does NOT modify:
 *   • Authentication, licensing, subscriptions, payment
 *   • Configuration synchronization
 *   • AI Health Engine architecture
 *   • Execution Engine architecture
 *   • Optimization Planner
 *   • Dashboard architecture
 */

// Types
export type {
  FileEntry,
  FileCategory,
  FileFlag,
  ScanSourceType,
  ScanSource,
  ScanResult,
  LargeFileEntry,
  FolderSummary,
  EmptyFolder,
  DuplicateGroup,
  StorageAnalysis,
  StorageStatistics,
  RecommendationType,
  RiskLevel,
  RecommendationPriority,
  StorageRecommendation,
  StorageOperationType,
  StorageOperation,
  StorageExecutionConfig,
  StorageActionRecord,
  StorageHealthContribution,
  StorageHealthIssue,
  TreemapNode,
  SunburstSegment,
  FolderHeatMapEntry,
  StorageTimelineEntry,
  StorageEventType,
  StorageEventPayloads,
  StorageEventListener,
} from './types';
export {
  DEFAULT_SCAN_SOURCES,
  LARGE_FILE_THRESHOLD,
  UNUSED_FILE_THRESHOLD_DAYS,
  RECENT_FILE_THRESHOLD_DAYS,
  categorizeByExtension,
  generateFileEntryId,
  formatBytes,
  isInstallerFile,
  isTempOrLogFile,
} from './types';

// Events
export { StorageEventEmitter, storageEvents } from './storageEvents';

// Scanner
export { StorageScanner, storageScanner } from './storageScanner';

// Index
export { StorageIndex, storageIndex } from './storageIndex';

// Statistics
export { StorageStatisticsCalculator, storageStatisticsCalculator } from './storageStatistics';

// Analyzer
export { StorageAnalyzer, storageAnalyzer } from './storageAnalyzer';

// Recommendation Engine
export { StorageRecommendationEngine, storageRecommendationEngine } from './storageRecommendationEngine';

// Execution Task
export { StorageExecutionTask, STORAGE_TASK_ID } from './storageExecutionTask';

// Health Integration
export { StorageHealthIntegration, storageHealthIntegration } from './storageHealthIntegration';
