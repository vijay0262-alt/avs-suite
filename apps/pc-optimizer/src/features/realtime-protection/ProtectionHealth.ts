/**
 * ProtectionHealth — evaluates real-time protection engine health.
 *
 * Monitors:
 *   - Provider failures
 *   - Queue backlog
 *   - Dropped events
 *   - Latency
 *   - Memory usage
 *   - CPU usage
 *   - Restart recovery
 */
import type { ProtectionHealthReport, HealthStatus, HealthIssue, ProtectionStatistics, ProtectionTelemetry, MonitorInfo } from './types';

export class ProtectionHealthChecker {
  check(
    statistics: ProtectionStatistics,
    telemetry: ProtectionTelemetry,
    monitors: MonitorInfo[],
    isRunning: boolean,
  ): ProtectionHealthReport {
    const issues: HealthIssue[] = [];

    if (!isRunning) {
      issues.push({
        component: 'engine',
        severity: 'critical',
        description: 'Protection engine is not running',
        recommendation: 'Restart the protection engine immediately.',
      });
    }

    // Check provider failures
    if (telemetry.providerFailures > 0) {
      issues.push({
        component: 'providers',
        severity: telemetry.providerFailures > 5 ? 'high' : 'medium',
        description: `${telemetry.providerFailures} provider failure(s) detected`,
        recommendation: 'Check provider configuration and restart failed providers.',
      });
    }

    // Check queue backlog
    if (telemetry.queueDepth > 100) {
      issues.push({
        component: 'queue',
        severity: telemetry.queueDepth > 500 ? 'high' : 'medium',
        description: `Queue backlog: ${telemetry.queueDepth} items`,
        recommendation: 'Increase max concurrent actions or investigate processing bottleneck.',
      });
    }

    // Check dropped events
    if (telemetry.droppedEvents > 0) {
      issues.push({
        component: 'events',
        severity: telemetry.droppedEvents > 50 ? 'high' : 'medium',
        description: `${telemetry.droppedEvents} event(s) dropped`,
        recommendation: 'Increase queue size or reduce event volume.',
      });
    }

    // Check latency
    if (telemetry.averageLatencyMs > 5000) {
      issues.push({
        component: 'latency',
        severity: telemetry.averageLatencyMs > 10000 ? 'high' : 'medium',
        description: `Average latency: ${telemetry.averageLatencyMs.toFixed(0)}ms`,
        recommendation: 'Investigate processing bottlenecks or reduce event batch size.',
      });
    }

    // Check memory usage
    if (telemetry.memoryUsage > 150) {
      issues.push({
        component: 'memory',
        severity: telemetry.memoryUsage > 250 ? 'high' : 'medium',
        description: `Memory usage: ${telemetry.memoryUsage.toFixed(0)}MB (target: <150MB)`,
        recommendation: 'Reduce history retention or restart the engine to free memory.',
      });
    }

    // Check CPU usage
    if (telemetry.cpuUsage > 1.0) {
      issues.push({
        component: 'cpu',
        severity: telemetry.cpuUsage > 5 ? 'high' : 'medium',
        description: `CPU usage: ${telemetry.cpuUsage.toFixed(2)}% (target: <1%)`,
        recommendation: 'Reduce monitoring frequency or disable non-critical monitors.',
      });
    }

    // Check monitor health
    const failedMonitors = monitors.filter((m) => m.status === 'error');
    for (const monitor of failedMonitors) {
      issues.push({
        component: `monitor:${monitor.type}`,
        severity: 'medium',
        description: `Monitor "${monitor.type}" is in error state`,
        recommendation: 'Restart the monitor or check system permissions.',
      });
    }

    const status = this.computeStatus(issues);
    const recommendations = issues.map((i) => i.recommendation);

    return {
      status,
      issues,
      recommendations,
      timestamp: Date.now(),
    };
  }

  private computeStatus(issues: HealthIssue[]): HealthStatus {
    const hasCritical = issues.some((i) => i.severity === 'critical');
    const hasHigh = issues.some((i) => i.severity === 'high');
    if (hasCritical) return 'critical';
    if (hasHigh) return 'degraded';
    if (issues.length > 0) return 'degraded';
    return 'healthy';
  }
}
