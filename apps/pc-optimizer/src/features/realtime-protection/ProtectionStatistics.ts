/**
 * ProtectionStatistics — aggregates real-time protection statistics.
 */
import type {
  ProtectionStatistics,
  SystemEvent,
  SystemEventType,
  EventCategory,
  EventSeverity,
} from './types';

export class ProtectionStatisticsCollector {
  private totalEvents = 0;
  private eventsByType = new Map<SystemEventType, number>();
  private eventsByCategory = new Map<EventCategory, number>();
  private eventsBySeverity = new Map<EventSeverity, number>();
  private eventsProcessed = 0;
  private eventsFiltered = 0;
  private eventsDropped = 0;
  private threatsDetected = 0;
  private threatsBlocked = 0;
  private investigationsTriggered = 0;
  private remediationsTriggered = 0;
  private notificationsSent = 0;
  private processingTimes: number[] = [];
  private maxProcessingTime = 0;
  private sessionStartTime: number | null = null;

  startSession(): void {
    this.sessionStartTime = Date.now();
  }

  stopSession(): void {
    this.sessionStartTime = null;
  }

  recordEvent(event: SystemEvent): void {
    this.totalEvents++;
    this.incrementMap(this.eventsByType, event.type);
    this.incrementMap(this.eventsByCategory, event.category);
    this.incrementMap(this.eventsBySeverity, event.severity);
  }

  recordProcessed(processingTime: number): void {
    this.eventsProcessed++;
    this.processingTimes.push(processingTime);
    if (this.processingTimes.length > 1000) {
      this.processingTimes = this.processingTimes.slice(-1000);
    }
    if (processingTime > this.maxProcessingTime) {
      this.maxProcessingTime = processingTime;
    }
  }

  recordFiltered(): void {
    this.eventsFiltered++;
  }

  recordDropped(): void {
    this.eventsDropped++;
  }

  recordThreatDetected(): void {
    this.threatsDetected++;
  }

  recordThreatBlocked(): void {
    this.threatsBlocked++;
  }

  recordInvestigation(): void {
    this.investigationsTriggered++;
  }

  recordRemediation(): void {
    this.remediationsTriggered++;
  }

  recordNotification(): void {
    this.notificationsSent++;
  }

  getStatistics(activeMonitors: number, totalMonitors: number, queueBacklog: number): ProtectionStatistics {
    const uptime = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
    const avgProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((sum, t) => sum + t, 0) / this.processingTimes.length
      : 0;

    return {
      totalEvents: this.totalEvents,
      eventsByType: this.mapToObject(this.eventsByType) as Record<SystemEventType, number>,
      eventsByCategory: this.mapToObject(this.eventsByCategory) as Record<EventCategory, number>,
      eventsBySeverity: this.mapToObject(this.eventsBySeverity) as Record<EventSeverity, number>,
      eventsProcessed: this.eventsProcessed,
      eventsFiltered: this.eventsFiltered,
      eventsDropped: this.eventsDropped,
      threatsDetected: this.threatsDetected,
      threatsBlocked: this.threatsBlocked,
      investigationsTriggered: this.investigationsTriggered,
      remediationsTriggered: this.remediationsTriggered,
      notificationsSent: this.notificationsSent,
      averageProcessingTime: avgProcessingTime,
      maxProcessingTime: this.maxProcessingTime,
      queueBacklog,
      activeMonitors,
      totalMonitors,
      sessionStartTime: this.sessionStartTime,
      uptime,
    };
  }

  reset(): void {
    this.totalEvents = 0;
    this.eventsByType.clear();
    this.eventsByCategory.clear();
    this.eventsBySeverity.clear();
    this.eventsProcessed = 0;
    this.eventsFiltered = 0;
    this.eventsDropped = 0;
    this.threatsDetected = 0;
    this.threatsBlocked = 0;
    this.investigationsTriggered = 0;
    this.remediationsTriggered = 0;
    this.notificationsSent = 0;
    this.processingTimes = [];
    this.maxProcessingTime = 0;
  }

  private incrementMap<K>(map: Map<K, number>, key: K): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  private mapToStringKeyed(map: Map<unknown, number>): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [key, value] of map) {
      obj[String(key)] = value;
    }
    return obj;
  }

  private mapToObject(map: Map<unknown, number>): Record<string, number> {
    return this.mapToStringKeyed(map);
  }
}
