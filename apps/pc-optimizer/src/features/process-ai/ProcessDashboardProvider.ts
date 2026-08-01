/**
 * ProcessDashboardProvider — builds dashboard summary data from analyses.
 *
 * Provides top consumers, startup processes, background processes,
 * and alerts for the Process Intelligence dashboard UI.
 */
import type {
  ProcessAnalysis,
  ProcessDashboardData,
  ProcessDashboardSummary,
  ProcessDashboardEntry,
  ProcessDashboardAlert,
  ProcessSnapshot,
} from './types';

export class ProcessDashboardProvider {
  build(snapshot: ProcessSnapshot, analyses: ProcessAnalysis[]): ProcessDashboardData {
    const summary = this.buildSummary(snapshot, analyses);
    const topConsumers = this.buildTopConsumers(analyses);
    const startupProcesses = this.buildStartupProcesses(analyses);
    const backgroundProcesses = this.buildBackgroundProcesses(analyses);
    const alerts = this.buildAlerts(analyses);

    return {
      summary,
      topConsumers,
      startupProcesses,
      backgroundProcesses,
      alerts,
      lastScanAt: snapshot.timestamp,
    };
  }

  private buildSummary(snapshot: ProcessSnapshot, analyses: ProcessAnalysis[]): ProcessDashboardSummary {
    let highImpactCount = 0;
    let criticalProcessCount = 0;
    let systemProcessCount = 0;
    let userProcessCount = 0;
    let backgroundProcessCount = 0;
    let startupProcessCount = 0;

    for (const analysis of analyses) {
      if (analysis.impact.overall.level === 'high' || analysis.impact.overall.level === 'critical') {
        highImpactCount++;
      }
      if (analysis.health === 'critical') criticalProcessCount++;
      if (analysis.category === 'system' || analysis.category === 'windows') systemProcessCount++;
      else userProcessCount++;
      if (analysis.category === 'background' || analysis.category === 'updater') backgroundProcessCount++;
      if (analysis.impact.startup.isStartupEntry) startupProcessCount++;
    }

    return {
      totalProcesses: snapshot.processCount,
      totalCpuUsagePercent: snapshot.systemTotals.totalCpuUsagePercent,
      totalMemoryMB: snapshot.systemTotals.totalMemoryMB,
      totalDiskActivityMBps: snapshot.systemTotals.totalDiskReadMBps + snapshot.systemTotals.totalDiskWriteMBps,
      totalNetworkMbps: snapshot.systemTotals.totalNetworkDownloadMbps + snapshot.systemTotals.totalNetworkUploadMbps,
      backgroundProcessCount,
      startupProcessCount,
      highImpactCount,
      criticalProcessCount,
      systemProcessCount,
      userProcessCount,
    };
  }

  private buildTopConsumers(analyses: ProcessAnalysis[]): ProcessDashboardEntry[] {
    return analyses
      .filter((a) => a.safetyLevel !== 'critical_system')
      .sort((a, b) => b.impact.overall.score - a.impact.overall.score)
      .slice(0, 10)
      .map((a) => ({
        pid: a.pid,
        name: a.name,
        displayName: a.displayName,
        category: a.category,
        cpuUsagePercent: a.impact.cpu.usagePercent,
        memoryMB: a.impact.memory.usageMB,
        impactLevel: a.impact.overall.level,
        safetyLevel: a.safetyLevel,
      }));
  }

  private buildStartupProcesses(analyses: ProcessAnalysis[]): ProcessDashboardEntry[] {
    return analyses
      .filter((a) => a.impact.startup.isStartupEntry)
      .map((a) => ({
        pid: a.pid,
        name: a.name,
        displayName: a.displayName,
        category: a.category,
        cpuUsagePercent: a.impact.cpu.usagePercent,
        memoryMB: a.impact.memory.usageMB,
        impactLevel: a.impact.startup.level,
        safetyLevel: a.safetyLevel,
      }));
  }

  private buildBackgroundProcesses(analyses: ProcessAnalysis[]): ProcessDashboardEntry[] {
    return analyses
      .filter((a) => a.impact.background.isBackgroundProcess)
      .sort((a, b) => b.impact.memory.usageMB - a.impact.memory.usageMB)
      .slice(0, 15)
      .map((a) => ({
        pid: a.pid,
        name: a.name,
        displayName: a.displayName,
        category: a.category,
        cpuUsagePercent: a.impact.cpu.usagePercent,
        memoryMB: a.impact.memory.usageMB,
        impactLevel: a.impact.overall.level,
        safetyLevel: a.safetyLevel,
      }));
  }

  private buildAlerts(analyses: ProcessAnalysis[]): ProcessDashboardAlert[] {
    const alerts: ProcessDashboardAlert[] = [];
    for (const analysis of analyses) {
      for (const issue of analysis.issues) {
        if (issue.severity === 'medium' || issue.severity === 'high' || issue.severity === 'critical') {
          alerts.push({
            pid: analysis.pid,
            name: analysis.name,
            type: issue.type,
            severity: issue.severity,
            message: issue.title,
          });
        }
      }
    }
    return alerts.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      return order[a.severity] - order[b.severity];
    }).slice(0, 20);
  }
}
