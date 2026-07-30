/**
 * Product Completion Program — Quality Module Type Definitions
 *
 * PCP PHASE 1 PART 1
 *
 * Foundation Audit & Stabilization
 *
 * Provides the type system for auditing every existing module in AVS Shield,
 * scoring production readiness, tracking regressions, and generating
 * structured audit reports.
 *
 * Architecture:
 *   Module Registry → Health Analyzer → Dependency Analyzer →
 *   Performance Baseline → Quality Audit Engine → Audit Report →
 *   Quality Manager → Public API
 *
 * Core principles:
 *   - Every module is audited, no exceptions.
 *   - Findings are categorized by severity with root cause and fix.
 *   - Performance baselines are measurable and reproducible.
 *   - No new functionality is introduced; audit only.
 *   - Reports are structured, machine-readable, and human-friendly.
 */

// ── Severity ─────────────────────────────────────────────────

export type Severity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'enhancement'
  | 'technical_debt';

export function getSeverityLabel(severity: Severity): string {
  const labels: Record<Severity, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    enhancement: 'Enhancement',
    technical_debt: 'Technical Debt',
  };
  return labels[severity] ?? 'Unknown';
}

export function getSeverityWeight(severity: Severity): number {
  const weights: Record<Severity, number> = {
    critical: 100,
    high: 50,
    medium: 25,
    low: 10,
    enhancement: 5,
    technical_debt: 3,
  };
  return weights[severity] ?? 0;
}

// ── Module Categories ────────────────────────────────────────

export type ModuleCategory =
  | 'frontend'
  | 'backend'
  | 'electron'
  | 'python_service'
  | 'ai_module'
  | 'dashboard'
  | 'execution_pipeline'
  | 'recovery'
  | 'licensing'
  | 'installer'
  | 'updater'
  | 'ipc'
  | 'caching'
  | 'database'
  | 'configuration'
  | 'logging'
  | 'settings'
  | 'telemetry'
  | 'notifications'
  | 'search'
  | 'hardware_detection'
  | 'registry'
  | 'provider'
  | 'api'
  | 'service'
  | 'package'
  | 'optimizer'
  | 'utility'
  | 'future_category';

export function getModuleCategoryLabel(category: ModuleCategory): string {
  const labels: Record<ModuleCategory, string> = {
    frontend: 'Frontend',
    backend: 'Backend',
    electron: 'Electron',
    python_service: 'Python Service',
    ai_module: 'AI Module',
    dashboard: 'Dashboard',
    execution_pipeline: 'Execution Pipeline',
    recovery: 'Recovery',
    licensing: 'Licensing',
    installer: 'Installer',
    updater: 'Updater',
    ipc: 'IPC',
    caching: 'Caching',
    database: 'Database',
    configuration: 'Configuration',
    logging: 'Logging',
    settings: 'Settings',
    telemetry: 'Telemetry',
    notifications: 'Notifications',
    search: 'Search',
    hardware_detection: 'Hardware Detection',
    registry: 'Registry',
    provider: 'Provider',
    api: 'API',
    service: 'Service',
    package: 'Package',
    optimizer: 'Optimizer',
    utility: 'Utility',
    future_category: 'Future Category',
  };
  return labels[category] ?? 'Unknown';
}

// ── Module Descriptor ────────────────────────────────────────

export interface ModuleDescriptor {
  id: string;
  name: string;
  category: ModuleCategory;
  path: string;
  description: string;
  dependencies: string[];
  dependents: string[];
  hasTests: boolean;
  hasDocumentation: boolean;
  isExternal: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Audit Check Categories ───────────────────────────────────

export type AuditCheckCategory =
  | 'functional_completeness'
  | 'missing_implementations'
  | 'broken_features'
  | 'runtime_exceptions'
  | 'memory_leaks'
  | 'blocking_operations'
  | 'race_conditions'
  | 'deadlocks'
  | 'slow_operations'
  | 'thread_safety'
  | 'error_handling'
  | 'retry_logic'
  | 'logging_quality'
  | 'test_coverage'
  | 'dependency_health'
  | 'ui_responsiveness'
  | 'accessibility'
  | 'security'
  | 'performance'
  | 'code_duplication'
  | 'unused_code'
  | 'technical_debt'
  | 'maintainability'
  | 'extensibility'
  | 'documentation'
  | 'future_risks';

export function getAuditCheckLabel(category: AuditCheckCategory): string {
  const labels: Record<AuditCheckCategory, string> = {
    functional_completeness: 'Functional Completeness',
    missing_implementations: 'Missing Implementations',
    broken_features: 'Broken Features',
    runtime_exceptions: 'Runtime Exceptions',
    memory_leaks: 'Memory Leaks',
    blocking_operations: 'Blocking Operations',
    race_conditions: 'Race Conditions',
    deadlocks: 'Deadlocks',
    slow_operations: 'Slow Operations',
    thread_safety: 'Thread Safety',
    error_handling: 'Error Handling',
    retry_logic: 'Retry Logic',
    logging_quality: 'Logging Quality',
    test_coverage: 'Test Coverage',
    dependency_health: 'Dependency Health',
    ui_responsiveness: 'UI Responsiveness',
    accessibility: 'Accessibility',
    security: 'Security',
    performance: 'Performance',
    code_duplication: 'Code Duplication',
    unused_code: 'Unused Code',
    technical_debt: 'Technical Debt',
    maintainability: 'Maintainability',
    extensibility: 'Extensibility',
    documentation: 'Documentation',
    future_risks: 'Future Risks',
  };
  return labels[category] ?? 'Unknown';
}

// ── Audit Finding ────────────────────────────────────────────

export interface AuditFinding {
  id: string;
  moduleId: string;
  moduleName: string;
  category: AuditCheckCategory;
  severity: Severity;
  issue: string;
  description: string;
  rootCause: string;
  recommendedFix: string;
  estimatedEffort: EstimateSize;
  dependencies: string[];
  risk: RiskLevel;
  regressionRisk: RiskLevel;
  detectedAt: string;
  futureMetadata: Record<string, unknown>;
}

export type EstimateSize = 'trivial' | 'small' | 'medium' | 'large' | 'extra_large';

export function getEstimateSizeLabel(size: EstimateSize): string {
  const labels: Record<EstimateSize, string> = {
    trivial: 'Trivial (< 1h)',
    small: 'Small (1-4h)',
    medium: 'Medium (4-16h)',
    large: 'Large (1-3 days)',
    extra_large: 'Extra Large (> 3 days)',
  };
  return labels[size] ?? 'Unknown';
}

export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export function getRiskLevelLabel(risk: RiskLevel): string {
  const labels: Record<RiskLevel, string> = {
    none: 'None',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
  };
  return labels[risk] ?? 'Unknown';
}

// ── Quality Scores ───────────────────────────────────────────

export interface ModuleQualityScore {
  moduleId: string;
  moduleName: string;
  stabilityScore: number;
  performanceScore: number;
  reliabilityScore: number;
  maintainabilityScore: number;
  uxScore: number;
  accessibilityScore: number;
  securityScore: number;
  overallProductionReadinessScore: number;
  calculatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface AggregateQualityScore {
  totalModules: number;
  auditedModules: number;
  averageStability: number;
  averagePerformance: number;
  averageReliability: number;
  averageMaintainability: number;
  averageUX: number;
  averageAccessibility: number;
  averageSecurity: number;
  overallProductionReadiness: number;
  calculatedAt: string;
}

// ── Module Health ────────────────────────────────────────────

export type ModuleHealthStatus =
  | 'healthy'
  | 'warning'
  | 'degraded'
  | 'critical'
  | 'unknown';

export function getModuleHealthStatusLabel(status: ModuleHealthStatus): string {
  const labels: Record<ModuleHealthStatus, string> = {
    healthy: 'Healthy',
    warning: 'Warning',
    degraded: 'Degraded',
    critical: 'Critical',
    unknown: 'Unknown',
  };
  return labels[status] ?? 'Unknown';
}

export interface ModuleHealthReport {
  moduleId: string;
  moduleName: string;
  status: ModuleHealthStatus;
  score: ModuleQualityScore;
  findings: AuditFinding[];
  findingCountBySeverity: Record<Severity, number>;
  totalFindings: number;
  criticalFindings: number;
  highFindings: number;
  hasTests: boolean;
  hasDocumentation: boolean;
  dependencyCount: number;
  analyzedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Dependency Analysis ──────────────────────────────────────

export interface DependencyNode {
  moduleId: string;
  moduleName: string;
  dependencies: string[];
  dependents: string[];
  depth: number;
  isCircular: boolean;
  circularPath: string[] | null;
}

export interface DependencyAnalysisResult {
  nodes: DependencyNode[];
  circularDependencies: DependencyNode[];
  orphanedModules: string[];
  maxDepth: number;
  highlyCoupledModules: string[];
  analyzedAt: string;
}

// ── Performance Baseline ─────────────────────────────────────

export type PerformanceMetricType =
  | 'application_startup'
  | 'dashboard_load'
  | 'navigation'
  | 'memory_usage'
  | 'cpu_usage'
  | 'background_activity'
  | 'scan_initialization'
  | 'ipc_latency'
  | 'python_communication'
  | 'database_access'
  | 'rendering_performance';

export function getPerformanceMetricLabel(type: PerformanceMetricType): string {
  const labels: Record<PerformanceMetricType, string> = {
    application_startup: 'Application Startup',
    dashboard_load: 'Dashboard Load',
    navigation: 'Navigation',
    memory_usage: 'Memory Usage',
    cpu_usage: 'CPU Usage',
    background_activity: 'Background Activity',
    scan_initialization: 'Scan Initialization',
    ipc_latency: 'IPC Latency',
    python_communication: 'Python Communication',
    database_access: 'Database Access',
    rendering_performance: 'Rendering Performance',
  };
  return labels[type] ?? 'Unknown';
}

export interface PerformanceMeasurement {
  id: string;
  metricType: PerformanceMetricType;
  moduleId: string;
  value: number;
  unit: string;
  threshold: number;
  passed: boolean;
  measuredAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface PerformanceBaselineReport {
  measurements: PerformanceMeasurement[];
  passedCount: number;
  failedCount: number;
  totalCount: number;
  passRate: number;
  measuredAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── Quality Metrics ──────────────────────────────────────────

export interface QualityMetricsData {
  crashCount: number;
  unhandledExceptions: number;
  warningCount: number;
  performanceBottlenecks: number;
  codeSmells: number;
  largeComponents: number;
  cyclomaticComplexity: number;
  testCoverage: number;
  regressionCount: number;
  lastUpdated: string;
  futureMetadata: Record<string, unknown>;
}

// ── Regression Tracking ──────────────────────────────────────

export interface RegressionEntry {
  id: string;
  moduleId: string;
  moduleName: string;
  description: string;
  severity: Severity;
  detectedAt: string;
  resolvedAt: string | null;
  status: 'open' | 'investigating' | 'resolved' | 'wont_fix';
  relatedFindingId: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface RegressionSummary {
  totalRegressions: number;
  openRegressions: number;
  investigatingRegressions: number;
  resolvedRegressions: number;
  wontFixRegressions: number;
  regressionsBySeverity: Record<Severity, number>;
  lastUpdated: string;
}

// ── Audit Report ─────────────────────────────────────────────

export interface AuditReportData {
  id: string;
  startedAt: string;
  completedAt: string;
  duration: number;
  totalModules: number;
  auditedModules: number;
  skippedModules: number;
  findings: AuditFinding[];
  moduleScores: ModuleQualityScore[];
  aggregateScore: AggregateQualityScore;
  moduleHealthReports: ModuleHealthReport[];
  dependencyAnalysis: DependencyAnalysisResult;
  performanceBaseline: PerformanceBaselineReport;
  regressionSummary: RegressionSummary;
  qualityMetrics: QualityMetricsData;
  criticalIssues: AuditFinding[];
  highIssues: AuditFinding[];
  summary: AuditReportSummary;
  futureMetadata: Record<string, unknown>;
}

export interface AuditReportSummary {
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  enhancementCount: number;
  technicalDebtCount: number;
  overallReadiness: number;
  readinessLevel: ReadinessLevel;
  topIssues: AuditFinding[];
  recommendedImplementationOrder: string[];
}

export type ReadinessLevel =
  | 'not_ready'
  | 'early_access'
  | 'beta'
  | 'release_candidate'
  | 'production_ready';

export function getReadinessLevelLabel(level: ReadinessLevel): string {
  const labels: Record<ReadinessLevel, string> = {
    not_ready: 'Not Ready',
    early_access: 'Early Access',
    beta: 'Beta',
    release_candidate: 'Release Candidate',
    production_ready: 'Production Ready',
  };
  return labels[level] ?? 'Unknown';
}

export function scoreToReadinessLevel(score: number): ReadinessLevel {
  if (score >= 95) return 'production_ready';
  if (score >= 80) return 'release_candidate';
  if (score >= 60) return 'beta';
  if (score >= 40) return 'early_access';
  return 'not_ready';
}

// ── Events ───────────────────────────────────────────────────

export type QualityEventType =
  | 'audit_started'
  | 'module_analyzed'
  | 'issue_detected'
  | 'performance_measured'
  | 'audit_completed'
  | 'quality_score_updated';

export function getQualityEventTypeLabel(type: QualityEventType): string {
  const labels: Record<QualityEventType, string> = {
    audit_started: 'Audit Started',
    module_analyzed: 'Module Analyzed',
    issue_detected: 'Issue Detected',
    performance_measured: 'Performance Measured',
    audit_completed: 'Audit Completed',
    quality_score_updated: 'Quality Score Updated',
  };
  return labels[type] ?? 'Unknown';
}

export interface QualityEvent {
  type: QualityEventType;
  timestamp: string;
  data: QualityEventData;
}

export type QualityEventData =
  | { auditId: string; totalModules: number }
  | { auditId: string; moduleId: string; moduleName: string; findingCount: number }
  | { auditId: string; finding: AuditFinding }
  | { auditId: string; measurement: PerformanceMeasurement }
  | { auditId: string; report: AuditReportData }
  | { moduleId: string; score: ModuleQualityScore };

export type QualityEventListener = (event: QualityEvent) => void;

// ── Configuration ────────────────────────────────────────────

export interface QualityConfiguration {
  configVersion: string;
  severityThresholds: SeverityThresholds;
  performanceThresholds: PerformanceThresholds;
  qualityThresholds: QualityThresholds;
  featureFlags: QualityFeatureFlags;
  auditExclusions: string[];
  futureMetadata: Record<string, unknown>;
}

export interface SeverityThresholds {
  failOnCritical: boolean;
  failOnHigh: boolean;
  maxCriticalIssues: number;
  maxHighIssues: number;
  maxMediumIssues: number;
  futureMetadata: Record<string, unknown>;
}

export interface PerformanceThresholds {
  applicationStartupMs: number;
  dashboardLoadMs: number;
  navigationMs: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
  scanInitializationMs: number;
  ipcLatencyMs: number;
  pythonCommunicationMs: number;
  databaseAccessMs: number;
  renderingPerformanceMs: number;
  futureMetadata: Record<string, unknown>;
}

export interface QualityThresholds {
  minStabilityScore: number;
  minPerformanceScore: number;
  minReliabilityScore: number;
  minMaintainabilityScore: number;
  minUXScore: number;
  minAccessibilityScore: number;
  minSecurityScore: number;
  minOverallReadinessScore: number;
  minTestCoveragePercent: number;
  maxCyclomaticComplexity: number;
  futureMetadata: Record<string, unknown>;
}

export interface QualityFeatureFlags {
  enableAudit: boolean;
  enablePerformanceBaseline: boolean;
  enableDependencyAnalysis: boolean;
  enableRegressionTracking: boolean;
  enableEvents: boolean;
  enableModuleHealthAnalysis: boolean;
  enableQualityMetrics: boolean;
  futureFlags: Record<string, boolean>;
}

// ── Audit Plugin ─────────────────────────────────────────────

export interface QualityAuditPlugin {
  id: string;
  name: string;
  description: string;
  checkModule: (module: ModuleDescriptor) => AuditFinding[];
  futureMetadata: Record<string, unknown>;
}

// ── Factory Functions ────────────────────────────────────────

export function generateAuditId(): string {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateFindingId(): string {
  return `finding_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateRegressionId(): string {
  return `regression_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateMeasurementId(): string {
  return `measurement_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createDefaultSeverityThresholds(): SeverityThresholds {
  return {
    failOnCritical: true,
    failOnHigh: false,
    maxCriticalIssues: 0,
    maxHighIssues: 10,
    maxMediumIssues: 50,
    futureMetadata: {},
  };
}

export function createDefaultPerformanceThresholds(): PerformanceThresholds {
  return {
    applicationStartupMs: 3000,
    dashboardLoadMs: 500,
    navigationMs: 200,
    memoryUsageMB: 512,
    cpuUsagePercent: 15,
    scanInitializationMs: 1000,
    ipcLatencyMs: 50,
    pythonCommunicationMs: 200,
    databaseAccessMs: 100,
    renderingPerformanceMs: 16,
    futureMetadata: {},
  };
}

export function createDefaultQualityThresholds(): QualityThresholds {
  return {
    minStabilityScore: 70,
    minPerformanceScore: 70,
    minReliabilityScore: 70,
    minMaintainabilityScore: 70,
    minUXScore: 70,
    minAccessibilityScore: 70,
    minSecurityScore: 80,
    minOverallReadinessScore: 75,
    minTestCoveragePercent: 60,
    maxCyclomaticComplexity: 15,
    futureMetadata: {},
  };
}

export function createDefaultQualityFeatureFlags(): QualityFeatureFlags {
  return {
    enableAudit: true,
    enablePerformanceBaseline: true,
    enableDependencyAnalysis: true,
    enableRegressionTracking: true,
    enableEvents: true,
    enableModuleHealthAnalysis: true,
    enableQualityMetrics: true,
    futureFlags: {},
  };
}

export function createDefaultQualityConfiguration(): QualityConfiguration {
  return {
    configVersion: '1.0.0',
    severityThresholds: createDefaultSeverityThresholds(),
    performanceThresholds: createDefaultPerformanceThresholds(),
    qualityThresholds: createDefaultQualityThresholds(),
    featureFlags: createDefaultQualityFeatureFlags(),
    auditExclusions: [],
    futureMetadata: {},
  };
}

// ── Module Registry ──────────────────────────────────────────

export interface ModuleRegistryEntry {
  descriptor: ModuleDescriptor;
  registeredAt: string;
}

export function createModuleDescriptor(
  id: string,
  name: string,
  category: ModuleCategory,
  path: string,
  description: string,
  options?: Partial<ModuleDescriptor>,
): ModuleDescriptor {
  return {
    id,
    name,
    category,
    path,
    description,
    dependencies: options?.dependencies ?? [],
    dependents: options?.dependents ?? [],
    hasTests: options?.hasTests ?? false,
    hasDocumentation: options?.hasDocumentation ?? false,
    isExternal: options?.isExternal ?? false,
    futureMetadata: options?.futureMetadata ?? {},
  };
}
