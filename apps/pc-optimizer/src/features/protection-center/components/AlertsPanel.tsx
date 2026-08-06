import clsx from 'clsx';
import {
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import type { ProtectionAlert, AlertSeverity } from '../protectionCenter.types';

const severityConfig: Record<
  AlertSeverity,
  { icon: typeof ExclamationCircleIcon; bg: string; border: string; iconColor: string; titleColor: string }
> = {
  critical: {
    icon: ExclamationCircleIcon,
    bg: 'bg-[color-mix(in_srgb,var(--avs-danger)_8%,transparent)]',
    border: 'border-[color-mix(in_srgb,var(--avs-danger)_30%,transparent)]',
    iconColor: 'text-[var(--avs-danger)]',
    titleColor: 'text-[var(--avs-danger)]',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bg: 'bg-[color-mix(in_srgb,var(--avs-warning)_8%,transparent)]',
    border: 'border-[color-mix(in_srgb,var(--avs-warning)_30%,transparent)]',
    iconColor: 'text-[var(--avs-warning)]',
    titleColor: 'text-[var(--avs-warning)]',
  },
  info: {
    icon: InformationCircleIcon,
    bg: 'bg-[color-mix(in_srgb,var(--avs-info)_8%,transparent)]',
    border: 'border-[color-mix(in_srgb,var(--avs-info)_30%,transparent)]',
    iconColor: 'text-[var(--avs-info)]',
    titleColor: 'text-[var(--avs-info)]',
  },
};

export interface AlertsPanelProps {
  alerts: ProtectionAlert[];
  onDismiss: (id: string) => void;
  onNavigate: (path: string) => void;
}

export function AlertsPanel({ alerts, onDismiss, onNavigate }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <InformationCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
          <p className="text-small text-[var(--avs-text-secondary)]">No active alerts. Your system is running smoothly.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      role="region"
      aria-label="Active alerts"
    >
      {alerts.map((alert) => {
        const sc = severityConfig[alert.severity];
        const Icon = sc.icon;
        return (
          <div
            key={alert.id}
            className={clsx(
              'relative rounded-[var(--avs-radius-md)] border p-3',
              sc.bg,
              sc.border,
            )}
            role="alert"
            aria-live={alert.severity === 'critical' ? 'assertive' : 'polite'}
          >
            <div className="flex items-start gap-2">
              <Icon className={clsx('h-5 w-5 shrink-0 mt-0.5', sc.iconColor)} />
              <div className="flex-1 min-w-0">
                <h4 className={clsx('text-small font-semibold', sc.titleColor)}>{alert.title}</h4>
                <p className="text-caption text-[var(--avs-text-secondary)] mt-0.5">{alert.message}</p>
                {alert.actionLabel && alert.actionPath && (
                  <button
                    onClick={() => onNavigate(alert.actionPath!)}
                    className="mt-2 inline-flex items-center gap-1 text-caption font-medium text-[var(--avs-brand-primary)] hover:underline"
                  >
                    {alert.actionLabel}
                    <ArrowRightIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
              <button
                onClick={() => onDismiss(alert.id)}
                className="shrink-0 rounded-[var(--avs-radius-sm)] p-1 text-[var(--avs-text-muted)] hover:bg-[var(--avs-surface-muted)] transition-colors"
                aria-label="Dismiss alert"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
