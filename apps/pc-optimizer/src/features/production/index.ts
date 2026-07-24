/**
 * Production Readiness Framework — centralized exports.
 *
 * Part 1: Centralized Error Handling
 * Part 2: Module Isolation
 * Part 3: Structured Logging
 * Part 4: Diagnostics Service
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
