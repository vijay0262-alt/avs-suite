/**
 * Health Notification Service (Part 10).
 *
 * Triggers notifications when meaningful changes occur in system health.
 * Only fires when there is a real, significant change — not on every
 * metrics tick.
 *
 * Example notifications:
 *   - "Your PC Health has dropped to 82%. Run Smart Optimization now."
 *   - "More than 1 GB of junk has accumulated."
 *   - "5 new startup applications detected."
 *
 * Thresholds are configurable via HealthEngineConfig (Part 12).
 */

import { getHealthEngineConfig, type NotificationThresholds } from './HealthEngineConfig';

export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface HealthNotification {
  id: string;
  timestamp: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /** Optional action label for the UI (e.g. "Optimize Now"). */
  actionLabel?: string;
  /** Optional navigation path for the action. */
  actionPath?: string;
}

export interface NotificationListener {
  (notification: HealthNotification): void;
}

interface LastKnownState {
  healthScore: number;
  junkBytes: number;
  startupApps: number;
}

export class HealthNotificationService {
  private listeners = new Set<NotificationListener>();
  private lastState: LastKnownState | null = null;
  private lastNotificationTime: Map<string, number> = new Map();
  private notifications: HealthNotification[] = [];
  private maxNotifications = 100;

  /**
   * Check for meaningful changes and fire notifications if thresholds are met.
   * Called after each health score computation.
   */
  checkForChanges(
    healthScore: number,
    junkBytes: number,
    startupApps: number,
  ): HealthNotification[] {
    const config = getHealthEngineConfig().notifications;
    const fired: HealthNotification[] = [];

    if (this.lastState) {
      // Score drop notification
      const scoreDrop = this.lastState.healthScore - healthScore;
      if (scoreDrop >= config.scoreDropThreshold && healthScore < 100) {
        const notif = this.createNotification(
          'score-drop',
          healthScore < 60 ? 'critical' : 'warning',
          'PC Health Changed',
          `Your PC Health has dropped to ${healthScore}%. Run Smart Optimization now.`,
          'Optimize Now',
          '/dashboard',
          config,
        );
        if (notif) fired.push(notif);
      }

      // Junk accumulation notification
      const junkIncrease = junkBytes - this.lastState.junkBytes;
      if (junkIncrease >= config.junkAccumulationThreshold) {
        const notif = this.createNotification(
          'junk-accumulation',
          'warning',
          'Junk Files Accumulating',
          `More than ${this.formatBytes(config.junkAccumulationThreshold)} of junk has accumulated.`,
          'Clean Now',
          '/junk-cleaner',
          config,
        );
        if (notif) fired.push(notif);
      }

      // New startup apps notification
      const newStartupApps = startupApps - this.lastState.startupApps;
      if (newStartupApps >= config.newStartupAppsThreshold) {
        const notif = this.createNotification(
          'new-startup-apps',
          'warning',
          'New Startup Applications',
          `${newStartupApps} new startup application${newStartupApps > 1 ? 's' : ''} detected.`,
          'Review Startup',
          '/startup-manager',
          config,
        );
        if (notif) fired.push(notif);
      }
    }

    this.lastState = { healthScore, junkBytes, startupApps };
    return fired;
  }

  private createNotification(
    key: string,
    severity: NotificationSeverity,
    title: string,
    message: string,
    actionLabel: string,
    actionPath: string,
    config: NotificationThresholds,
  ): HealthNotification | null {
    const now = Date.now();
    const lastTime = this.lastNotificationTime.get(key) ?? 0;
    if (now - lastTime < config.notificationCooldownMs) return null;

    const notification: HealthNotification = {
      id: `notif-${now}-${key}`,
      timestamp: new Date().toISOString(),
      severity,
      title,
      message,
      actionLabel,
      actionPath,
    };

    this.lastNotificationTime.set(key, now);
    this.notifications.unshift(notification);
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }
    this.listeners.forEach((l) => l(notification));
    return notification;
  }

  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getNotifications(): HealthNotification[] {
    return [...this.notifications];
  }

  getUnreadNotifications(): HealthNotification[] {
    return [...this.notifications];
  }

  clearNotifications(): void {
    this.notifications = [];
  }

  /** Reset internal state (for testing). */
  reset(): void {
    this.lastState = null;
    this.lastNotificationTime.clear();
    this.notifications = [];
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
    return `${bytes} bytes`;
  }
}

export const healthNotificationService = new HealthNotificationService();
