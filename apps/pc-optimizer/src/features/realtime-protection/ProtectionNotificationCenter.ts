/**
 * ProtectionNotificationCenter — manages user notifications.
 *
 * Notifications are generated for:
 *   - Threats detected
 *   - Investigations completed
 *   - Remediation required
 *   - System alerts
 *   - Protection status changes
 *   - Monitor failures
 */
import type { ProtectionNotification, NotificationType, NotificationPriority, NotificationSummary, EventSeverity } from './types';

export class ProtectionNotificationCenter {
  private notifications = new Map<string, ProtectionNotification>();
  private maxNotifications: number;

  constructor(maxNotifications = 200) {
    this.maxNotifications = maxNotifications;
  }

  notify(
    type: NotificationType,
    priority: NotificationPriority,
    title: string,
    message: string,
    options?: {
      eventId?: string;
      threatId?: string;
      investigationId?: string;
      actionRequired?: boolean;
      actionLabel?: string;
    },
  ): ProtectionNotification {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const notification: ProtectionNotification = {
      id,
      type,
      priority,
      title,
      message,
      eventId: options?.eventId ?? null,
      threatId: options?.threatId ?? null,
      investigationId: options?.investigationId ?? null,
      timestamp: Date.now(),
      read: false,
      dismissed: false,
      actionRequired: options?.actionRequired ?? false,
      actionLabel: options?.actionLabel ?? null,
    };

    this.notifications.set(id, notification);
    this.enforceMaxNotifications();
    return notification;
  }

  markRead(id: string): void {
    const notif = this.notifications.get(id);
    if (notif) notif.read = true;
  }

  dismiss(id: string): void {
    const notif = this.notifications.get(id);
    if (notif) notif.dismissed = true;
  }

  markAllRead(): void {
    for (const notif of this.notifications.values()) {
      notif.read = true;
    }
  }

  dismissAll(): void {
    for (const notif of this.notifications.values()) {
      notif.dismissed = true;
    }
  }

  get(id: string): ProtectionNotification | null {
    return this.notifications.get(id) ?? null;
  }

  getAll(): ProtectionNotification[] {
    return [...this.notifications.values()].sort((a, b) => b.timestamp - a.timestamp);
  }

  getUnread(): ProtectionNotification[] {
    return this.getAll().filter((n) => !n.read && !n.dismissed);
  }

  getActionRequired(): ProtectionNotification[] {
    return this.getAll().filter((n) => n.actionRequired && !n.dismissed);
  }

  getByType(type: NotificationType): ProtectionNotification[] {
    return this.getAll().filter((n) => n.type === type);
  }

  getSummary(): NotificationSummary {
    const all = [...this.notifications.values()];
    const unread = all.filter((n) => !n.read && !n.dismissed);
    const critical = all.filter((n) => n.priority === 'critical' && !n.dismissed);
    const actionRequired = all.filter((n) => n.actionRequired && !n.dismissed);

    return {
      total: all.length,
      unread: unread.length,
      critical: critical.length,
      actionRequired: actionRequired.length,
      oldest: all.length > 0 ? Math.min(...all.map((n) => n.timestamp)) : null,
    };
  }

  clear(): void {
    this.notifications.clear();
  }

  clearDismissed(): void {
    for (const [id, notif] of this.notifications) {
      if (notif.dismissed) {
        this.notifications.delete(id);
      }
    }
  }

  shouldNotify(severity: EventSeverity, minSeverity: EventSeverity): boolean {
    const order: EventSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(severity) >= order.indexOf(minSeverity);
  }

  private enforceMaxNotifications(): void {
    if (this.notifications.size > this.maxNotifications) {
      const sorted = [...this.notifications.values()].sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = sorted.slice(0, this.notifications.size - this.maxNotifications);
      for (const notif of toRemove) {
        this.notifications.delete(notif.id);
      }
    }
  }
}
