/**
 * ProtectionDashboardProvider — builds dashboard data for the protection UI.
 */
import type {
  ProtectionDashboardData,
  ProtectionDashboardSummary,
  ProtectionDashboardEvent,
  ProtectionNotification,
  ProtectionHealthReport,
  ProtectionStatistics,
  ProtectionState,
  ProtectionMode,
  MonitorInfo,
  SystemEvent,
} from './types';

export class ProtectionDashboardProvider {
  build(
    state: ProtectionState,
    mode: ProtectionMode,
    monitors: MonitorInfo[],
    recentEvents: SystemEvent[],
    notifications: ProtectionNotification[],
    health: ProtectionHealthReport,
    statistics: ProtectionStatistics,
    cpuUsage: number,
    memoryUsage: number,
    uptime: number,
    pendingApprovals: number,
  ): ProtectionDashboardData {
    const activeMonitors = monitors.filter((m) => m.status === 'active');
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const eventsToday = recentEvents.filter((e) => e.timestamp >= todayStart).length;

    const summary: ProtectionDashboardSummary = {
      protectionStatus: state,
      mode,
      activeMonitors: activeMonitors.length,
      totalMonitors: monitors.length,
      eventsToday,
      threatsBlocked: statistics.threatsBlocked,
      threatsInvestigated: statistics.investigationsTriggered,
      pendingApprovals,
      lastEvent: recentEvents.length > 0 ? recentEvents[0]!.timestamp : null,
      engineHealth: health.status,
      cpuUsage,
      memoryUsage,
      uptime,
    };

    const dashboardEvents: ProtectionDashboardEvent[] = recentEvents
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50)
      .map((e) => ({
        id: e.id,
        type: e.type,
        category: e.category,
        severity: e.severity,
        status: e.status,
        target: e.target.name,
        timestamp: e.timestamp,
        threatDetected: e.status === 'threat',
      }));

    const recentNotifications = notifications
      .filter((n) => !n.dismissed)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    return {
      summary,
      activeMonitors,
      recentEvents: dashboardEvents,
      recentNotifications,
      health,
      statistics,
      lastUpdated: Date.now(),
    };
  }
}
