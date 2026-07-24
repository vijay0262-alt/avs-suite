/**
 * Production Readiness Framework — centralized exports.
 *
 * Part 1: Centralized Error Handling
 * Part 2: Module Isolation
 * Part 3: Structured Logging
 * Part 4: Diagnostics Service
 * Part 5: Startup Validation
 * Part 6: Performance Monitoring
 * Part 7: Background Task Management
 * Part 8: Resource Management
 * Part 9: Configuration Management
 * Part 10: Retry & Recovery
 * Part 11: User-Friendly Error Messages
 * Part 12: Health Checks
 * Part 13: Safe Shutdown
 * Part 14: Future Telemetry Readiness
 */

// Part 1 — Centralized Error Handling
export type { ErrorCategory, ErrorSeverityConfig, AppError } from './ErrorHandler';
export { ERROR_SEVERITY_CONFIG, errorHandler } from './ErrorHandler';

// Part 2 — Module Isolation
export { moduleIsolationService } from './ModuleIsolation';

// Part 3 — Structured Logging
export type { LogLevel, LogEntry, LoggerConfig } from './Logger';
export { LOG_LEVEL_PRIORITY, LOG_LEVEL_LABELS, logger, createModuleLogger } from './Logger';

// Part 4 — Diagnostics Service
export type { ModuleDiagnosticsInfo, DiagnosticsReport, MemoryInfo, CpuInfo } from './DiagnosticsReport';
export { diagnosticsReportService } from './DiagnosticsReport';

// Part 5 — Startup Validation
export type { ValidationStatus, ValidationResult, StartupValidationReport } from './StartupValidator';
export { startupValidator } from './StartupValidator';

// Part 6 — Performance Monitoring
export type { MetricType, PerformanceMetric, MetricSummary } from './PerformanceMonitor';
export { performanceMonitor } from './PerformanceMonitor';

// Part 7 — Background Task Management
export type { TaskStatus, BackgroundTask, TaskProgress, TaskContext } from './BackgroundTaskManager';
export { backgroundTaskManager } from './BackgroundTaskManager';

// Part 8 — Resource Management
export type { ResourceType, TrackedResource } from './ResourceManager';
export { resourceManager, DisposableScope } from './ResourceManager';

// Part 9 — Configuration Management
export type { ApplicationConfig, HealthEngineConfig, LoggingConfig, TimeoutConfig, RetryConfig, BackgroundTaskConfig, UIPreferencesConfig } from './AppConfig';
export { configManager } from './AppConfig';

// Part 10 — Retry & Recovery
export type { RetryOptions, RetryResult } from './RetryService';
export { withRetry, retryModuleInit, retryLicenseValidation, retryFileAccess, calculateRetryDelay } from './RetryService';

// Part 11 — User-Friendly Error Messages
export { userMessageService } from './UserMessages';

// Part 12 — Health Checks
export type { HealthCheckStatus, HealthCheckResult, HealthCheckReport } from './HealthChecks';
export { healthCheckService } from './HealthChecks';

// Part 13 — Safe Shutdown
export type { ShutdownStep, ShutdownResult, ShutdownReport } from './SafeShutdown';
export { safeShutdownService } from './SafeShutdown';

// Part 14 — Future Telemetry Readiness
export type { TelemetryConsentStatus, TelemetryConsent, TelemetryEvent, TelemetryConfig, ITelemetryProvider } from './Telemetry';
export { telemetryProvider } from './Telemetry';
