/**
 * Browser Health & Privacy Platform — Barrel Export
 *
 * Complete browser health and privacy module providing:
 *   • Browser discovery (Chrome, Edge, Firefox, Brave, Opera + pluggable)
 *   • Browser health analysis (performance, privacy, storage, security scores)
 *   • Privacy risk evaluation (tracking cookies, history, extensions, permissions)
 *   • Storage measurement (cache, cookies, history DB, downloads, IndexedDB)
 *   • Safe cleanup execution (cache, temp, downloads, cookies, history)
 *   • AI Health Engine integration (browser + privacy contributions)
 *   • Dashboard integration (browser health card)
 *   • History tracking (cleanup records, rollback)
 *
 * Components:
 *   • BrowserScanner — discovers installed browsers and profiles
 *   • BrowserRepository — in-memory store with querying
 *   • PrivacyAnalyzer — evaluates privacy risks
 *   • BrowserStorageAnalyzer — measures storage usage
 *   • BrowserAnalyzer — comprehensive health analysis
 *   • BrowserRecommendationEngine — cleanup recommendations
 *   • BrowserExecutionTask — MaintenanceTask for safe cleanup
 *   • BrowserHistory — cleanup operation history
 *   • BrowserHealthIntegration — AI Health Engine data provider
 *
 * This module does NOT modify:
 *   • Authentication, licensing, subscriptions, payment
 *   • Configuration synchronization
 *   • AI Health Engine architecture
 *   • Execution Engine architecture
 *   • Optimization Planner
 *   • Dashboard architecture
 *   • Storage Intelligence
 */

// Types
export type {
  BrowserType,
  BrowserInfo,
  BrowserExtension,
  NotificationPermission,
  BrowserProfile,
  BrowserScanResult,
  PrivacyRiskLevel,
  PrivacyIssue,
  PrivacyAnalysis,
  BrowserStorageBreakdown,
  BrowserStorageAnalysis,
  BrowserHealthIssueType,
  BrowserHealthIssue,
  BrowserHealthResult,
  BrowserRecommendationType,
  RiskLevel,
  RecommendationPriority,
  BrowserRecommendation,
  BrowserCleanupOperationType,
  BrowserCleanupOperation,
  BrowserExecutionConfig,
  BrowserCleanupRecord,
  BrowserHistoryEntry,
  BrowserHealthContribution,
  PrivacyHealthContribution,
  BrowserDashboardCard,
  BrowserEventType,
  BrowserEventPayloads,
  BrowserEventListener,
  BrowserDefinition,
} from './types';
export {
  BROWSER_DEFINITIONS,
  getBrowserDefinition,
  generateBrowserId,
  generateProfileId,
  formatBytes,
  daysSince,
  LARGE_CACHE_THRESHOLD,
  EXCESSIVE_COOKIE_THRESHOLD,
  OLD_HISTORY_THRESHOLD_DAYS,
  UNUSED_PROFILE_THRESHOLD_DAYS,
  LARGE_DOWNLOAD_HISTORY_THRESHOLD,
  UNUSED_EXTENSION_THRESHOLD_DAYS,
  OUTDATED_BROWSER_THRESHOLD_DAYS,
  EXCESSIVE_NOTIFICATIONS_THRESHOLD,
  TRACKING_COOKIE_THRESHOLD,
} from './types';

// Events
export { BrowserEventEmitter, browserEvents } from './browserEvents';

// Scanner
export { BrowserScanner, browserScanner } from './browserScanner';

// Repository
export { BrowserRepository, browserRepository } from './browserRepository';

// Privacy Analyzer
export { PrivacyAnalyzer, privacyAnalyzer } from './privacyAnalyzer';

// Storage Analyzer
export { BrowserStorageAnalyzer, browserStorageAnalyzer } from './browserStorageAnalyzer';

// Browser Analyzer
export { BrowserAnalyzer, browserAnalyzer } from './browserAnalyzer';

// Recommendation Engine
export { BrowserRecommendationEngine, browserRecommendationEngine } from './browserRecommendationEngine';

// Execution Task
export { BrowserExecutionTask, BROWSER_TASK_ID } from './browserExecutionTask';

// History
export { BrowserHistory, browserHistory } from './browserHistory';

// Health Integration
export { BrowserHealthIntegration, browserHealthIntegration } from './browserHealthIntegration';
