/**
 * Duplicate Detection Engine — Barrel Export
 *
 * Production-grade duplicate detection engine built on the
 * Storage Intelligence Platform.
 *
 * Components:
 *   • HashEngine — quick hash, full SHA-256, streaming, caching
 *   • DuplicateScanner — candidate selection, pipeline, progress, cancellation
 *   • DuplicateIndex — in-memory store with querying and filtering
 *   • SimilarityEngine — exact, same filename, near-duplicate analysis
 *   • DuplicateAnalyzer — duplicate score, issues, insights, recoverable space
 *   • DuplicateRecommendationEngine — 6 recommendation types
 *   • DuplicateExecutionTask — MaintenanceTask for safe duplicate removal
 *   • DuplicateHistory — scan, cleanup, rollback, health change history
 *   • DuplicateHealthIntegration — AI Health Engine data provider
 *
 * Scan Pipeline:
 *   Storage Scanner → Candidate Selection → Quick Hash →
 *   Full Hash Verification → Duplicate Groups → Similarity Analysis →
 *   Recommendations
 *
 * This module does NOT modify:
 *   • Authentication, licensing, subscriptions, payment
 *   • Configuration synchronization
 *   • AI Health Engine architecture
 *   • Execution Engine architecture
 *   • Optimization Planner
 *   • Dashboard architecture
 *   • Storage Intelligence architecture
 *   • Browser Health
 *   • Windows Health
 */

// Types
export type {
  HashAlgorithm,
  HashType,
  HashResult,
  HashCacheEntry,
  CandidateFilter,
  DuplicateFile,
  DuplicateReason,
  DuplicateConfidence,
  DuplicateGroup,
  SimilarityType,
  SimilarityResult,
  DuplicateScanResult,
  ScanProgress,
  DuplicateAnalysisResult,
  DuplicateHealthIssue,
  DuplicateRecommendationType,
  RiskLevel,
  RecommendationPriority,
  DuplicateRecommendation,
  DeletionMode,
  DuplicateExecutionConfig,
  DuplicateActionRecord,
  DuplicateHistoryEntryType,
  DuplicateHistoryEntry,
  DuplicateHealthContribution,
  DuplicateDashboardCard,
  DuplicateEventType,
  DuplicateEventPayloads,
  DuplicateEventListener,
} from './types';
export {
  DEFAULT_CANDIDATE_FILTER,
  PROTECTED_PATH_PATTERNS,
  isProtectedPath,
  isSystemFile,
  isHiddenFile,
  isZeroByteFile,
  formatBytes as formatDuplicateBytes,
  generateGroupId,
  generateDuplicateFileId,
  generateRecId,
  QUICK_HASH_SIZE,
  STREAMING_THRESHOLD,
  LARGE_GROUP_THRESHOLD,
  MANY_DUPLICATES_THRESHOLD,
  LARGE_WASTED_SPACE_THRESHOLD,
  CACHE_TTL_MS,
  MAX_PARALLEL_HASHES,
} from './types';

// Events
export { DuplicateEventEmitter, duplicateEvents } from './duplicateEvents';

// Hash Engine
export { HashEngine, hashEngine } from './hashEngine';

// Scanner
export { DuplicateScanner, duplicateScanner } from './duplicateScanner';

// Index
export { DuplicateIndex, duplicateIndex } from './duplicateIndex';

// Similarity Engine
export { SimilarityEngine, similarityEngine } from './similarityEngine';

// Analyzer
export { DuplicateAnalyzer, duplicateAnalyzer } from './duplicateAnalyzer';

// Recommendation Engine
export { DuplicateRecommendationEngine, duplicateRecommendationEngine } from './duplicateRecommendationEngine';

// Execution Task
export { DuplicateExecutionTask, DUPLICATE_TASK_ID } from './duplicateExecutionTask';

// History
export { DuplicateHistory, duplicateHistory } from './duplicateHistory';

// Health Integration
export { DuplicateHealthIntegration, duplicateHealthIntegration } from './duplicateHealthIntegration';
