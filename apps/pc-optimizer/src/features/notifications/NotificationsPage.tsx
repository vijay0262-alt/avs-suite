/**
 * NotificationsPage — notification preferences and history.
 *
 * Allows users to:
 *   - Toggle notification categories (security, health, performance, maintenance)
 *   - View recent notifications
 *   - Configure notification frequency
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState } from '../../components/ModuleStates';
import {
  BellIcon,
  ShieldExclamationIcon,
  HeartIcon,
  BoltIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface NotificationItem {
  id: string;
  category: 'security' | 'health' | 'performance' | 'maintenance';
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string;
  read: boolean;
}

interface NotificationPrefs {
  security: boolean;
  health: boolean;
  performance: boolean;
  maintenance: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  frequency: 'instant' | 'hourly' | 'daily';
}

interface NotificationState {
  prefs: NotificationPrefs;
  notifications: NotificationItem[];
  loading: boolean;
  error: string | null;
}

class NotificationViewModel extends ViewModel<NotificationState> {
  constructor() {
    super({
      prefs: {
        security: true,
        health: true,
        performance: true,
        maintenance: true,
        soundEnabled: true,
        desktopNotifications: true,
        frequency: 'instant',
      },
      notifications: [],
      loading: false,
      error: null,
    });
  }

  async bootstrap() {
    this.setState({ loading: true });
    try {
      if (typeof window !== 'undefined' && window.avs) {
        const prefs = await window.avs.rpc.call('notifications.getPreferences') as NotificationPrefs;
        const notifs = await window.avs.rpc.call('notifications.getRecent') as NotificationItem[];
        this.setState({ prefs, notifications: notifs, loading: false });
      } else {
        this.setState({ loading: false });
      }
    } catch {
      this.setState({ loading: false });
    }
  }

  async updatePrefs(updates: Partial<NotificationPrefs>) {
    const newPrefs = { ...this.state.prefs, ...updates };
    this.setState({ prefs: newPrefs });
    try {
      if (typeof window !== 'undefined' && window.avs) {
        await window.avs.rpc.call('notifications.updatePreferences', newPrefs);
      }
    } catch {
      // Best-effort
    }
  }

  async markAsRead(id: string) {
    this.setState({
      notifications: this.state.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
    });
  }

  async markAllRead() {
    this.setState({
      notifications: this.state.notifications.map((n) => ({ ...n, read: true })),
    });
  }

  override dispose() {
    super.dispose();
  }
}

const CATEGORY_ICONS: Record<string, typeof BellIcon> = {
  security: ShieldExclamationIcon,
  health: HeartIcon,
  performance: BoltIcon,
  maintenance: WrenchScrewdriverIcon,
};

const SEVERITY_ICONS: Record<string, typeof InformationCircleIcon> = {
  info: InformationCircleIcon,
  warning: ExclamationTriangleIcon,
  critical: ShieldExclamationIcon,
};

export default function NotificationsPage() {
  const vm = useMemo(() => new NotificationViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const prefs = state.prefs;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Manage your notification preferences and view recent alerts"
        actions={
          <Button size="sm" variant="secondary" onClick={() => vm.markAllRead()}>
            Mark All Read
          </Button>
        }
      />

      {/* Preferences */}
      <Card title="Notification Preferences" variant="glass">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(CATEGORY_ICONS) as Array<keyof typeof CATEGORY_ICONS>).map((cat) => {
              const Icon = CATEGORY_ICONS[cat]!;
              return (
                <div key={cat} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-[var(--avs-text-secondary)]" />
                    <span className="text-sm font-medium capitalize text-[var(--avs-text-primary)]">{cat} Alerts</span>
                  </div>
                  <button
                    onClick={() => vm.updatePrefs({ [cat]: !prefs[cat as keyof NotificationPrefs] } as Partial<NotificationPrefs>)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${prefs[cat as keyof NotificationPrefs] ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-surface-muted)]'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${prefs[cat as keyof NotificationPrefs] ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
            <div className="flex items-center gap-2">
              <BellIcon className="h-5 w-5 text-[var(--avs-text-secondary)]" />
              <span className="text-sm font-medium text-[var(--avs-text-primary)]">Sound Notifications</span>
            </div>
            <button
              onClick={() => vm.updatePrefs({ soundEnabled: !prefs.soundEnabled })}
              className={`relative h-6 w-11 rounded-full transition-colors ${prefs.soundEnabled ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-surface-muted)]'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${prefs.soundEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
            <div className="flex items-center gap-2">
              <InformationCircleIcon className="h-5 w-5 text-[var(--avs-text-secondary)]" />
              <span className="text-sm font-medium text-[var(--avs-text-primary)]">Desktop Notifications</span>
            </div>
            <button
              onClick={() => vm.updatePrefs({ desktopNotifications: !prefs.desktopNotifications })}
              className={`relative h-6 w-11 rounded-full transition-colors ${prefs.desktopNotifications ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-surface-muted)]'}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${prefs.desktopNotifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
            <span className="text-sm font-medium text-[var(--avs-text-primary)]">Notification Frequency</span>
            <select
              value={prefs.frequency}
              onChange={(e) => vm.updatePrefs({ frequency: e.target.value as NotificationPrefs['frequency'] })}
              className="rounded-[var(--avs-radius-sm)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-1.5 text-sm text-[var(--avs-text-primary)]"
            >
              <option value="instant">Instant</option>
              <option value="hourly">Hourly Digest</option>
              <option value="daily">Daily Digest</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Recent Notifications */}
      <Card title="Recent Notifications" variant="glass">
        {state.notifications.length > 0 ? (
          <div className="space-y-2">
            {state.notifications.map((notif) => {
              const Icon = SEVERITY_ICONS[notif.severity] ?? InformationCircleIcon;
              return (
                <div
                  key={notif.id}
                  className={`flex items-center gap-3 rounded-[var(--avs-radius-md)] px-4 py-3 ${notif.read ? 'bg-[var(--avs-surface-muted)] opacity-60' : 'bg-[var(--avs-surface-muted)] border-l-2 border-[var(--avs-brand-primary)]'}`}
                >
                  <Icon className={`h-5 w-5 ${notif.severity === 'critical' ? 'text-[var(--avs-danger)]' : notif.severity === 'warning' ? 'text-[var(--avs-warning)]' : 'text-[var(--avs-info)]'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--avs-text-primary)]">{notif.title}</p>
                    <p className="text-xs text-[var(--avs-text-secondary)]">{notif.message}</p>
                    <p className="text-xs text-[var(--avs-text-muted)] mt-0.5">{new Date(notif.timestamp).toLocaleString()}</p>
                  </div>
                  <Badge tone="neutral">{notif.category}</Badge>
                  {!notif.read && (
                    <button onClick={() => vm.markAsRead(notif.id)} className="text-xs text-[var(--avs-brand-primary)] hover:underline">
                      Mark read
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <ModuleEmptyState icon={BellIcon} title="No notifications" message="You're all caught up! New notifications will appear here." />
        )}
      </Card>
    </div>
  );
}
