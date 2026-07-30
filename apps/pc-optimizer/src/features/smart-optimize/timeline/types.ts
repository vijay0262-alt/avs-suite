/**
 * Unified Timeline & Activity Center — Types
 *
 * The central event history for the platform. Records every meaningful
 * platform event in chronological order. Consumes existing events rather
 * than replacing them.
 *
 * Architecture:
 *   Platform Events → Collector → Aggregator → Engine → Store
 *   → Search → Filters → Analytics
 *
 * Core architectural principle:
 *   "Every timeline event must be explainable — what happened, why it
 *    happened, which module generated it, and what evidence supports it."
 */
import type { Evidence } from '../intelligence/types';

// Re-export for convenience
export type { Evidence } from '../intelligence/types';

// ── Timeline Categories ──────────────────────────────────────

export type TimelineCategory =
  | 'optimization'
  | 'simulation'
  | 'recovery'
  | 'automation'
  | 'maintenance'
  | 'recommendation'
  | 'prediction'
  | 'device_profile'
  | 'health'
  | 'settings'
  | 'ai_interaction'
  | 'future_category';

// ── Timeline Event Types ─────────────────────────────────────

export type TimelineEventType =
  // Optimization
  | 'optimization_created'
  | 'optimization_approved'
  | 'optimization_executed'
  | 'optimization_completed'
  | 'optimization_failed'
  // Simulation
  | 'simulation_generated'
  | 'simulation_compared'
  // Recovery
  | 'recovery_created'
  | 'recovery_executed'
  // Automation
  | 'automation_triggered'
  | 'automation_approved'
  // Maintenance
  | 'maintenance_planned'
  | 'maintenance_completed'
  // Recommendations
  | 'recommendation_generated'
  | 'recommendation_accepted'
  // Predictions
  | 'prediction_updated'
  // Device Profile
  | 'device_profile_changed'
  // Health
  | 'health_score_changed'
  // Settings
  | 'settings_changed'
  // Future
  | 'future_event';

// ── Severity ─────────────────────────────────────────────────

export type TimelineSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

// ── Status ───────────────────────────────────────────────────

export type TimelineItemStatus = 'active' | 'resolved' | 'pending' | 'failed' | 'expired' | 'archived';

// ── Timeline Item ────────────────────────────────────────────

export interface TimelineItem {
  id: string;
  timestamp: string;
  category: TimelineCategory;
  eventType: TimelineEventType;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  sourceModule: string;
  relatedOperation: string | null;
  relatedRecommendation: string | null;
  relatedSnapshot: string | null;
  severity: TimelineSeverity;
  status: TimelineItemStatus;
  confidence: number | null;
  tags: string[];
  searchKeywords: string[];
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Timeline Input ───────────────────────────────────────────

export interface TimelineEventInput {
  category: TimelineCategory;
  eventType: TimelineEventType;
  title: string;
  summary: string;
  details?: Record<string, unknown>;
  sourceModule: string;
  relatedOperation?: string | null;
  relatedRecommendation?: string | null;
  relatedSnapshot?: string | null;
  severity?: TimelineSeverity;
  status?: TimelineItemStatus;
  confidence?: number | null;
  tags?: string[];
  searchKeywords?: string[];
  evidence?: Evidence[];
  futureMetadata?: Record<string, unknown>;
}

// ── Filters ──────────────────────────────────────────────────

export interface TimelineFilter {
  categories?: TimelineCategory[];
  modules?: string[];
  eventTypes?: TimelineEventType[];
  dateRange?: {
    start: string;
    end: string;
  };
  severities?: TimelineSeverity[];
  statuses?: TimelineItemStatus[];
  tags?: string[];
  minConfidence?: number;
  maxConfidence?: number;
  relatedOperation?: string;
  relatedRecommendation?: string;
  relatedSnapshot?: string;
  custom?: (item: TimelineItem) => boolean;
}

// ── Search ───────────────────────────────────────────────────

export interface TimelineSearchQuery {
  text?: string;
  title?: string;
  summary?: string;
  tags?: string[];
  eventTypes?: TimelineEventType[];
  modules?: string[];
  operationId?: string;
  recommendationId?: string;
  deviceProfile?: string;
  custom?: (item: TimelineItem) => boolean;
}

export interface TimelineSearchResult {
  items: TimelineItem[];
  totalMatches: number;
  query: TimelineSearchQuery;
  durationMs: number;
}

// ── Grouping ─────────────────────────────────────────────────

export type TimelineGroupingType =
  | 'day'
  | 'week'
  | 'month'
  | 'optimization_session'
  | 'maintenance_session'
  | 'automation_session'
  | 'recovery_session'
  | 'ai_session'
  | 'custom';

export interface TimelineGroup {
  key: string;
  label: string;
  type: TimelineGroupingType;
  items: TimelineItem[];
  count: number;
  startTime: string;
  endTime: string;
  futureMetadata: Record<string, unknown>;
}

export interface TimelineGroupingResult {
  groups: TimelineGroup[];
  totalItems: number;
  ungrouped: TimelineItem[];
}

// ── Retention ────────────────────────────────────────────────

export type RetentionPeriod = '30_days' | '90_days' | '180_days' | '365_days' | 'unlimited' | 'enterprise' | 'future_period';

export interface RetentionRules {
  retentionPeriod: RetentionPeriod;
  maxItems: number;
  autoPrune: boolean;
  pruneIntervalMs: number;
  archiveBeforePrune: boolean;
  priorityThreshold: TimelineSeverity;
}

export interface RetentionPruneResult {
  pruned: number;
  archived: number;
  remaining: number;
  prunedIds: string[];
}

// ── Statistics ───────────────────────────────────────────────

export interface TimelineStatistics {
  totalEvents: number;
  eventsByCategory: Record<TimelineCategory, number>;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<TimelineSeverity, number>;
  eventsByStatus: Record<TimelineItemStatus, number>;
  eventsByModule: Record<string, number>;
  eventsPerDay: Record<string, number>;
  firstEventTimestamp: string | null;
  lastEventTimestamp: string | null;
  averageConfidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── Analytics ────────────────────────────────────────────────

export interface TimelineAnalytics {
  totalEvents: number;
  optimizationCount: number;
  maintenanceCount: number;
  recoveryCount: number;
  automationSuccessRate: number;
  recommendationAcceptanceRate: number;
  healthTrend: HealthTrendPoint[];
  eventsPerDay: Record<string, number>;
  topTags: TagCount[];
  topModules: ModuleCount[];
  timelineActivity: TimelineActivityPoint[];
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface HealthTrendPoint {
  timestamp: string;
  healthScore: number;
  delta: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface ModuleCount {
  module: string;
  count: number;
}

export interface TimelineActivityPoint {
  timestamp: string;
  count: number;
  categories: Record<TimelineCategory, number>;
}

// ── Export ───────────────────────────────────────────────────

export type ExportFormat = 'json' | 'markdown' | 'csv' | 'pdf_ready' | 'future_format';

export interface TimelineExport {
  id: string;
  format: ExportFormat;
  content: string;
  metadata: {
    exportedAt: string;
    itemCount: number;
    formatVersion: string;
    byteSize: number;
    filtersApplied: TimelineFilter | null;
    futureMetadata: Record<string, unknown>;
  };
  futureMetadata: Record<string, unknown>;
}

export interface ExportPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getFormat(): ExportFormat;
  export(items: TimelineItem[], filter: TimelineFilter | null): TimelineExport;
}

// ── Validation ───────────────────────────────────────────────

export interface TimelineValidationResult {
  valid: boolean;
  errors: TimelineValidationError[];
  warnings: TimelineValidationWarning[];
}

export interface TimelineValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface TimelineValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Event Provider Plugin ────────────────────────────────────

export interface TimelineEventProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getCategory(): TimelineCategory;
  collectEvents(since: string | null): TimelineEventInput[];
}

// ── Configuration ────────────────────────────────────────────

export interface TimelineFeatureFlags {
  enableTimeline: boolean;
  enableSearch: boolean;
  enableFilters: boolean;
  enableGrouping: boolean;
  enableAnalytics: boolean;
  enableExport: boolean;
  enableRetention: boolean;
  enableStatistics: boolean;
  enableEvents: boolean;
  enableValidation: boolean;
  enableCaching: boolean;
  futureFlags: Record<string, boolean>;
}

export interface FormattingRules {
  dateFormat: string;
  includeEvidence: boolean;
  includeDetails: boolean;
  maxSummaryLength: number;
  maxTitleLength: number;
  futureRules: Record<string, unknown>;
}

export interface GroupingRules {
  defaultGrouping: TimelineGroupingType;
  maxGroups: number;
  sortBy: 'timestamp' | 'severity' | 'category';
  sortDirection: 'asc' | 'desc';
  futureRules: Record<string, unknown>;
}

export interface FilterRules {
  defaultSeverity: TimelineSeverity | null;
  maxFilterResults: number;
  enableCustomFilters: boolean;
  futureRules: Record<string, unknown>;
}

export interface TimelineConfiguration {
  configVersion: string;
  retentionRules: RetentionRules;
  formattingRules: FormattingRules;
  groupingRules: GroupingRules;
  filterRules: FilterRules;
  featureFlags: TimelineFeatureFlags;
  enableEvents: boolean;
  maxItems: number;
  performanceTargetRecordMs: number;
  performanceTargetSearchMs: number;
  performanceTargetFilterMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Timeline Events ──────────────────────────────────────────

export type TimelineEventType_Emitter =
  | 'timeline_recorded'
  | 'timeline_updated'
  | 'timeline_filtered'
  | 'timeline_exported'
  | 'timeline_pruned'
  | 'analytics_updated';

export interface TimelineEvent {
  type: TimelineEventType_Emitter;
  itemId: string | null;
  timestamp: string;
  data: unknown;
}

export type TimelineEventListener = (event: TimelineEvent) => void;

// ── Query ────────────────────────────────────────────────────

export interface TimelineQuery {
  filter?: TimelineFilter;
  search?: TimelineSearchQuery;
  grouping?: TimelineGroupingType;
  sort?: 'timestamp' | 'severity' | 'category' | 'module';
  sortDirection?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface TimelineQueryResult {
  items: TimelineItem[];
  total: number;
  groups: TimelineGroup[] | null;
  durationMs: number;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateTimelineItemId(): string {
  return `tl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateExportId(): string {
  return `tlexp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function severityToScore(severity: TimelineSeverity): number {
  const scores: Record<TimelineSeverity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };
  return scores[severity] ?? 0;
}

export function scoreToSeverity(score: number): TimelineSeverity {
  if (score <= 0) return 'info';
  if (score <= 1) return 'low';
  if (score <= 2) return 'medium';
  if (score <= 3) return 'high';
  return 'critical';
}

export function getCategoryLabel(category: TimelineCategory): string {
  const labels: Record<TimelineCategory, string> = {
    optimization: 'Optimization',
    simulation: 'Simulation',
    recovery: 'Recovery',
    automation: 'Automation',
    maintenance: 'Maintenance',
    recommendation: 'Recommendation',
    prediction: 'Prediction',
    device_profile: 'Device Profile',
    health: 'Health',
    settings: 'Settings',
    ai_interaction: 'AI Interaction',
    future_category: 'Future',
  };
  return labels[category] ?? 'Unknown';
}

export function getEventTypeLabel(eventType: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
    optimization_created: 'Optimization Created',
    optimization_approved: 'Optimization Approved',
    optimization_executed: 'Optimization Executed',
    optimization_completed: 'Optimization Completed',
    optimization_failed: 'Optimization Failed',
    simulation_generated: 'Simulation Generated',
    simulation_compared: 'Simulation Compared',
    recovery_created: 'Recovery Created',
    recovery_executed: 'Recovery Executed',
    automation_triggered: 'Automation Triggered',
    automation_approved: 'Automation Approved',
    maintenance_planned: 'Maintenance Planned',
    maintenance_completed: 'Maintenance Completed',
    recommendation_generated: 'Recommendation Generated',
    recommendation_accepted: 'Recommendation Accepted',
    prediction_updated: 'Prediction Updated',
    device_profile_changed: 'Device Profile Changed',
    health_score_changed: 'Health Score Changed',
    settings_changed: 'Settings Changed',
    future_event: 'Future Event',
  };
  return labels[eventType] ?? 'Unknown';
}

export function getSeverityLabel(severity: TimelineSeverity): string {
  const labels: Record<TimelineSeverity, string> = {
    info: 'Info',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return labels[severity] ?? 'Unknown';
}

export function getStatusLabel(status: TimelineItemStatus): string {
  const labels: Record<TimelineItemStatus, string> = {
    active: 'Active',
    resolved: 'Resolved',
    pending: 'Pending',
    failed: 'Failed',
    expired: 'Expired',
    archived: 'Archived',
  };
  return labels[status] ?? 'Unknown';
}

export function getRetentionPeriodLabel(period: RetentionPeriod): string {
  const labels: Record<RetentionPeriod, string> = {
    '30_days': '30 Days',
    '90_days': '90 Days',
    '180_days': '180 Days',
    '365_days': '365 Days',
    unlimited: 'Unlimited',
    enterprise: 'Enterprise',
    future_period: 'Future',
  };
  return labels[period] ?? 'Unknown';
}

export function getRetentionPeriodDays(period: RetentionPeriod): number {
  const days: Record<RetentionPeriod, number> = {
    '30_days': 30,
    '90_days': 90,
    '180_days': 180,
    '365_days': 365,
    unlimited: Number.MAX_SAFE_INTEGER,
    enterprise: 365,
    future_period: 0,
  };
  return days[period] ?? 0;
}

export function createDefaultRetentionRules(): RetentionRules {
  return {
    retentionPeriod: '90_days',
    maxItems: 10000,
    autoPrune: true,
    pruneIntervalMs: 3600000,
    archiveBeforePrune: true,
    priorityThreshold: 'medium',
  };
}

export function createDefaultFormattingRules(): FormattingRules {
  return {
    dateFormat: 'ISO8601',
    includeEvidence: true,
    includeDetails: true,
    maxSummaryLength: 500,
    maxTitleLength: 200,
    futureRules: {},
  };
}

export function createDefaultGroupingRules(): GroupingRules {
  return {
    defaultGrouping: 'day',
    maxGroups: 100,
    sortBy: 'timestamp',
    sortDirection: 'desc',
    futureRules: {},
  };
}

export function createDefaultFilterRules(): FilterRules {
  return {
    defaultSeverity: null,
    maxFilterResults: 1000,
    enableCustomFilters: true,
    futureRules: {},
  };
}

export function createDefaultFeatureFlags(): TimelineFeatureFlags {
  return {
    enableTimeline: true,
    enableSearch: true,
    enableFilters: true,
    enableGrouping: true,
    enableAnalytics: true,
    enableExport: true,
    enableRetention: true,
    enableStatistics: true,
    enableEvents: true,
    enableValidation: true,
    enableCaching: true,
    futureFlags: {},
  };
}

export function extractSearchKeywords(input: TimelineEventInput): string[] {
  const keywords = new Set<string>();
  keywords.add(input.title.toLowerCase());
  keywords.add(input.summary.toLowerCase());
  keywords.add(input.sourceModule.toLowerCase());
  keywords.add(input.category);
  keywords.add(input.eventType);
  if (input.tags) {
    for (const tag of input.tags) keywords.add(tag.toLowerCase());
  }
  if (input.relatedOperation) keywords.add(input.relatedOperation.toLowerCase());
  if (input.relatedRecommendation) keywords.add(input.relatedRecommendation.toLowerCase());
  return Array.from(keywords).filter((k) => k.length > 0);
}
