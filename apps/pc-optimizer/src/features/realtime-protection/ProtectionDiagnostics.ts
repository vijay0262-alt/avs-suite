/**
 * ProtectionDiagnostics — runs diagnostic checks on the protection engine.
 */
import type { ProtectionDiagnosticsReport, ProtectionDiagnosticResult } from './types';

export interface DiagnosticsContext {
  isRunning: boolean;
  mode: string;
  activeMonitors: number;
  totalMonitors: number;
  queueDepth: number;
  processingCount: number;
  overflowCount: number;
  droppedCount: number;
  totalEvents: number;
  totalThreats: number;
  uptime: number;
  restartAttempts: number;
}

export class ProtectionDiagnosticsRunner {
  run(ctx: DiagnosticsContext): ProtectionDiagnosticsReport {
    const results: ProtectionDiagnosticResult[] = [];
    const now = Date.now();

    // Check engine status
    results.push({
      component: 'engine',
      status: ctx.isRunning ? 'pass' : 'fail',
      message: ctx.isRunning ? 'Engine is running' : 'Engine is not running',
      details: { mode: ctx.mode, uptime: ctx.uptime },
      timestamp: now,
    });

    // Check monitors
    results.push({
      component: 'monitors',
      status: ctx.activeMonitors === ctx.totalMonitors ? 'pass' : ctx.activeMonitors > 0 ? 'warn' : 'fail',
      message: `${ctx.activeMonitors}/${ctx.totalMonitors} monitors active`,
      details: { active: ctx.activeMonitors, total: ctx.totalMonitors },
      timestamp: now,
    });

    // Check queue
    results.push({
      component: 'queue',
      status: ctx.queueDepth < 100 ? 'pass' : ctx.queueDepth < 500 ? 'warn' : 'fail',
      message: `Queue depth: ${ctx.queueDepth}, processing: ${ctx.processingCount}`,
      details: { queueDepth: ctx.queueDepth, processingCount: ctx.processingCount, overflowCount: ctx.overflowCount },
      timestamp: now,
    });

    // Check dropped events
    results.push({
      component: 'events',
      status: ctx.droppedCount === 0 ? 'pass' : ctx.droppedCount < 50 ? 'warn' : 'fail',
      message: `${ctx.droppedCount} dropped events, ${ctx.totalEvents} total events`,
      details: { dropped: ctx.droppedCount, total: ctx.totalEvents },
      timestamp: now,
    });

    // Check restart attempts
    results.push({
      component: 'restart_recovery',
      status: ctx.restartAttempts === 0 ? 'pass' : ctx.restartAttempts < 3 ? 'warn' : 'fail',
      message: `${ctx.restartAttempts} restart attempt(s)`,
      details: { restartAttempts: ctx.restartAttempts },
      timestamp: now,
    });

    const hasFail = results.some((r) => r.status === 'fail');
    const hasWarn = results.some((r) => r.status === 'warn');

    return {
      results,
      overallStatus: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
      timestamp: now,
    };
  }
}
