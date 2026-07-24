# Production Readiness Framework

## Overview

The Production Readiness Framework provides enterprise-grade stability, diagnostics, and resilience for AVS PC Optimizer. It consists of 14 parts covering error handling, module isolation, logging, diagnostics, startup validation, performance monitoring, background tasks, resource management, configuration, retry logic, user messages, health checks, safe shutdown, and telemetry readiness.

## Architecture

All production readiness services live in `src/features/production/` and are exported from `index.ts`.

```
src/features/production/
├── index.ts                  — Centralized exports
├── ErrorHandler.ts           — Part 1: Centralized error handling
├── ModuleIsolation.ts        — Part 2: Module isolation with circuit breaker
├── Logger.ts                 — Part 3: Structured logging
├── DiagnosticsReport.ts      — Part 4: Diagnostics service
├── StartupValidator.ts       — Part 5: Startup validation
├── PerformanceMonitor.ts     — Part 6: Performance monitoring
├── BackgroundTaskManager.ts  — Part 7: Background task management
├── ResourceManager.ts        — Part 8: Resource management
├── AppConfig.ts              — Part 9: Configuration management
├── RetryService.ts           — Part 10: Retry & recovery
├── UserMessages.ts           — Part 11: User-friendly error messages
├── HealthChecks.ts           — Part 12: Health checks
├── SafeShutdown.ts           — Part 13: Safe shutdown
├── Telemetry.ts              — Part 14: Future telemetry readiness
└── __tests__/
    ├── ProductionReadiness.test.ts   — Tests for Parts 1-4
    └── ProductionReadiness2.test.ts  — Tests for Parts 5-10
```

---

## Module Lifecycle

Modules follow a standard lifecycle with 11 states:

```
not_installed → ready → scanning → completed
                      → cleaning → completed
                      → optimizing → completed
                      → warning
                      → error
                      → disabled
                      → locked
                      → updating
```

**States** (defined in `MODULE_LIFECYCLE_CONFIG`):
- `not_installed` — Module not yet loaded
- `ready` — Module ready for operations
- `scanning` — Scan in progress
- `cleaning` — Clean in progress
- `optimizing` — Optimization in progress
- `completed` — Operation completed successfully
- `warning` — Operation completed with warnings
- `error` — Module encountered an error
- `disabled` — Module disabled by user or system
- `locked` — Module locked by FeatureGate (license restriction)
- `updating` — Module is being updated

**Lifecycle transitions** are managed by `ModuleRegistry.setStatus()` which notifies subscribers.

**Initialization**: `registerAllModules()` → `initializeAllModules()` → modules transition to `ready`.

**Disposal**: `disposeAllModules()` → modules cleaned up → `safeShutdownService.shutdown()` for full cleanup.

---

## Event Flow

Events flow through the `ModuleEventBus` (singleton):

```
Module → emitModuleEvent() → ModuleEventBus → Subscribers (Dashboard, Health Engine, etc.)
```

**9 event types** (defined in `ModuleEventType`):
- `scan_started`, `scan_completed`
- `cleaning_started`, `cleaning_completed`
- `optimization_started`, `optimization_completed`
- `status_changed`
- `error_occurred`
- `recommendation_updated`

**Event structure**: `{ type, moduleId, moduleName, timestamp, data }`

**Subscribers**:
- Dashboard refresh manager (triggers UI updates)
- Health Score Service (triggers health recompute)
- Recommendation Aggregator (refreshes recommendations)
- Module History Service (records history entries)

**Event publishing** is handled by `BaseModuleAdapter` which automatically emits events during scan/clean/optimize operations. Custom modules should use `emitModuleEvent()` to publish events.

---

## Health Engine Integration

The Health Engine (`HealthScoreService`) aggregates health contributions from all registered modules:

```
Overall Score = 100 - sum(all module currentPenalties)
```

**Flow**:
1. `registerAllModules()` registers module weights with `healthScoreService.registerModuleWeight()`
2. Each module implements `getHealthContribution()` returning `{ moduleId, currentPenalty, maxPenalty, ... }`
3. `healthScoreService.computeHealth()` aggregates all contributions
4. Optimization events trigger automatic health recompute via `optimizationEventBus`
5. Locked modules (FeatureGate) are skipped to keep scores fair

**Health weights** are centralized in `ModuleConfig.ts` (`DEFAULT_HEALTH_WEIGHTS`).

**Future modules** automatically participate in health scoring by registering a health provider — no Health Engine code changes needed.

---

## Logging System

Structured logging is provided by `logger` (Part 3):

**Log levels** (in priority order):
- `debug` — Verbose debugging (filtered by default, enable with `logger.enableVerbose()`)
- `info` — General information
- `warning` — Non-critical issues
- `error` — Errors that need attention

**Log entry structure**: `{ id, timestamp, level, module, action, message, durationMs, result, errorDetails, data }`

**Usage**:
```typescript
import { logger, createModuleLogger } from '../production';

// Direct logging
logger.info('JunkCleaner', 'scan', 'Scan completed', { durationMs: 500, result: 'success' });

// Module-scoped logger
const modLogger = createModuleLogger('JunkCleaner');
modLogger.info('scan', 'Scan started');

// Automatic timing
await logger.logOperation('JunkCleaner', 'scan', async () => { /* ... */ });
```

**Configuration**: `configManager.getLoggingConfig()` controls min level, max entries, console output, stack traces.

**Export**: `logger.exportLogs()` returns JSON for support diagnostics.

---

## Diagnostics Service

The diagnostics service (`diagnosticsReportService`, Part 4) aggregates information from all subsystems:

**Report includes**:
- Application version, build, channel, architecture
- License edition and status
- OS platform, memory usage, CPU info
- Module status (loaded, lazy, errors, locked, per-module details)
- Health score and module count
- Optimization history (last optimization, total count)
- Event queue status
- Error summary (total, critical, recent)
- Log summary (entries, errors, warnings, min level)

**Usage**:
```typescript
import { diagnosticsReportService } from '../production';

const report = await diagnosticsReportService.generateReport();
const json = await diagnosticsReportService.exportReport();
const summary = await diagnosticsReportService.getSummary();
```

**Health checks** (Part 12) provide per-service status:
```typescript
import { healthCheckService } from '../production';
const report = await healthCheckService.runAll();
// report.checks: [{ service, status, message, details }]
```

---

## Error Handling Framework

Centralized error handling (Part 1) with module isolation (Part 2):

**5 error categories**:
- `warning` — Non-critical, operation continues
- `recoverable` — Failed but can be retried
- `critical` — Module should stop
- `user_action_required` — User must act (e.g., activate license)
- `internal_error` — Unexpected error

**Error flow**:
```
Module error → errorHandler.report() → console + listeners + error store
             → moduleIsolationService.executeModule() → circuit breaker → registry status
```

**Module isolation** (Part 2):
- `moduleIsolationService.executeModule()` wraps operations with error catching
- Circuit breaker opens after 3 consecutive failures (30s reset)
- One module failure never affects other modules

**User-friendly messages** (Part 11):
- `userMessageService.getMessage(error)` returns non-technical message
- Technical details stay in logs and diagnostics only

**Retry & recovery** (Part 10):
- `withRetry()` — exponential backoff with jitter
- `retryModuleInit()`, `retryLicenseValidation()`, `retryFileAccess()` — specialized retry functions
- Never loops infinitely — bounded by `maxAttempts`

---

## Startup Sequence

1. **Application starts** (`main.tsx`)
   - `initI18n()` — initialize i18n
   - `dashboardRefreshManager.init()` — start dashboard refresh

2. **Router loads** (`router/index.tsx`)
   - `LicenseBootstrap` mounts → initializes licensing SDK
   - `FeatureGate` initialized with license state
   - `EditionManagerProvider` wraps app

3. **Module registration** (`registerAllModules()`)
   - Health providers registered
   - Module weights registered with Health Score Service
   - Existing modules registered eagerly
   - Future modules registered lazily (factory deferred)

4. **Startup validation** (`startupValidator.validate()`)
   - Validates: Configuration, ModuleRegistry, HealthEngine, Licensing, EventSubscriptions, RequiredServices
   - Non-critical failures don't block startup
   - Results logged and available via report

5. **Dashboard renders** — driven by `moduleRegistry.getRegistryEntries()`

---

## Shutdown Sequence

The safe shutdown service (`safeShutdownService`, Part 13) executes an ordered cleanup:

1. **Stop background tasks** — `backgroundTaskManager.cancelAll()`
2. **Flush pending logs** — ensure all log entries are recorded
3. **Save required state** — optimization history, module history
4. **Dispose services** — `moduleRegistry.disposeAll()`
5. **Release resources** — `resourceManager.shutdown()` (workers → timers → file handles → listeners → temp resources)
6. **Clear isolation state** — reset circuit breakers
7. **Final log flush** — log shutdown completion

**Each step is isolated** — one failure doesn't prevent subsequent cleanup. Critical steps (flush logs, save state) report as critical errors if they fail.

**Usage**:
```typescript
import { safeShutdownService } from '../production';

// On application close
const report = await safeShutdownService.shutdown();
// report.allSucceeded — whether all steps completed
```

**Resource management** (Part 8) ensures no leaks:
- `DisposableScope` — manage multiple resources with automatic cleanup
- `resourceManager.shutdown()` — releases all tracked resources in order
- `getPotentialLeaks()` — find resources held too long

---

## Configuration

All configurable values are centralized in `configManager` (Part 9):

```typescript
import { configManager } from '../production';

// Get config
const timeouts = configManager.getTimeoutConfig();
const retryConfig = configManager.getRetryConfig();

// Update config
configManager.update({ timeouts: { scan: 120_000 } });

// Subscribe to changes
configManager.subscribe(() => { /* re-read config */ });
```

**Config sections**: healthEngine, logging, timeouts, retry, backgroundTasks, uiPreferences, moduleWeights, moduleSettings.

**Future adjustments** require configuration changes, not code changes.

---

## Telemetry Readiness

The architecture is prepared for optional future telemetry (Part 14):

- `ITelemetryProvider` interface defines the contract
- `NoOpTelemetryProvider` is the default (does nothing)
- **Telemetry is opt-in only** — requires explicit user consent
- **No PII** — all data is anonymous and aggregated
- **Users can preview** what would be sent before consenting
- **Users can revoke** consent at any time

**No telemetry is collected** — this is interface-only design for future use.

---

## Testing

Tests are in `__tests__/`:
- `ProductionReadiness.test.ts` — Parts 1-4 (59 tests)
- `ProductionReadiness2.test.ts` — Parts 5-10 (70 tests)
- `ProductionReadiness3.test.ts` — Parts 11-14 (tests for user messages, health checks, safe shutdown, telemetry)

**Run all tests**:
```bash
npx vitest run
```

**Verify everything**:
```bash
npx tsc -b --noEmit && npx eslint "{apps,packages}/**/*.{ts,tsx}" --max-warnings=0 && npx vitest run
```
