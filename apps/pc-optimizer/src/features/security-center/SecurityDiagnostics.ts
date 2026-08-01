/**
 * SecurityDiagnostics — runs diagnostic checks on the security engine.
 *
 * Verifies provider registration, configuration, snapshot generation,
 * and event system health.
 */
import type { SecurityDiagnosticsReport, SecurityDiagnosticResult } from './types';
import type { SecurityEngine } from './SecurityEngine';

export class SecurityDiagnostics {
  run(engine: SecurityEngine): SecurityDiagnosticsReport {
    const results: SecurityDiagnosticResult[] = [];
    const now = Date.now();

    // Check engine enabled
    const config = engine.getConfiguration();
    results.push({
      component: 'engine',
      status: config.enabled ? 'pass' : 'fail',
      message: config.enabled ? 'Engine is enabled' : 'Engine is disabled',
      details: { enabled: config.enabled },
      timestamp: now,
    });

    // Check provider registration
    const registry = engine.getRegistry();
    const providerCount = registry.count();
    results.push({
      component: 'providers',
      status: providerCount > 0 ? 'pass' : 'fail',
      message: providerCount > 0 ? `${providerCount} providers registered` : 'No providers registered',
      details: { count: providerCount, providers: registry.getAllProviderInfo().map((p) => ({ id: p.id, type: p.type, status: p.status })) },
      timestamp: now,
    });

    // Check provider health
    const providers = registry.getAllProviders();
    const errorProviders = providers.filter((p) => p.getInfo().status === 'error');
    results.push({
      component: 'provider_health',
      status: errorProviders.length === 0 ? 'pass' : 'warn',
      message: errorProviders.length === 0 ? 'All providers healthy' : `${errorProviders.length} provider(s) in error state`,
      details: { errorCount: errorProviders.length, errorProviders: errorProviders.map((p) => p.getId()) },
      timestamp: now,
    });

    // Check snapshot
    const snapshot = engine.getSnapshot();
    results.push({
      component: 'snapshot',
      status: snapshot ? 'pass' : 'warn',
      message: snapshot ? 'Snapshot available' : 'No snapshot available — run a scan',
      details: { hasSnapshot: !!snapshot, snapshotId: snapshot?.id },
      timestamp: now,
    });

    // Check history
    const history = engine.getHistory();
    const historyCount = history.getEntryCount();
    results.push({
      component: 'history',
      status: historyCount > 0 ? 'pass' : 'warn',
      message: historyCount > 0 ? `${historyCount} history entries` : 'No scan history',
      details: { entryCount: historyCount },
      timestamp: now,
    });

    // Check definitions
    results.push({
      component: 'definitions',
      status: 'pass',
      message: `Definitions version: ${engine.getDefinitionsVersion()}`,
      details: { version: engine.getDefinitionsVersion() },
      timestamp: now,
    });

    // Check capabilities
    const capabilities = engine.getCapabilities();
    const enabledCount = capabilities.filter((c) => c.enabled).length;
    results.push({
      component: 'capabilities',
      status: enabledCount > 0 ? 'pass' : 'fail',
      message: `${enabledCount}/${capabilities.length} capabilities enabled`,
      details: { enabled: enabledCount, total: capabilities.length },
      timestamp: now,
    });

    const hasFail = results.some((r) => r.status === 'fail');
    const hasWarn = results.some((r) => r.status === 'warn');
    const overallStatus = hasFail ? 'fail' : hasWarn ? 'warn' : 'pass';

    return { results, overallStatus, timestamp: now };
  }
}
