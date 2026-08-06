/**
 * AlertsPanel — displays hardware alerts with severity indicators.
 */
import { Card, Badge, Button } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import type { HardwareAlert } from '../types';

const severityTone = (severity: HardwareAlert['severity']): BadgeTone => {
  switch (severity) {
    case 'critical': return 'danger';
    case 'warning': return 'warning';
    default: return 'neutral';
  }
};

const severityIcon = (severity: HardwareAlert['severity']): string => {
  switch (severity) {
    case 'critical': return '🔴';
    case 'warning': return '🟡';
    default: return '🔵';
  }
};

interface AlertsPanelProps {
  alerts: HardwareAlert[];
  onAcknowledge: (id: string) => void;
  onClear: () => void;
}

export function AlertsPanel({ alerts, onAcknowledge, onClear }: AlertsPanelProps) {
  const unacknowledged = alerts.filter((a) => !a.acknowledged);

  return (
    <Card
      title={`Alerts${unacknowledged.length > 0 ? ` (${unacknowledged.length})` : ''}`}
      actions={
        <Button variant="ghost" size="sm" onClick={onClear} data-testid="btn-clear-alerts">
          Clear All
        </Button>
      }
      data-testid="alerts-panel"
    >
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`flex items-start gap-3 rounded-md p-3 transition-opacity ${
              alert.acknowledged ? 'opacity-50' : ''
            } ${
              alert.severity === 'critical'
                ? 'bg-[color-mix(in_srgb,var(--avs-danger)_8%,transparent)]'
                : alert.severity === 'warning'
                ? 'bg-[color-mix(in_srgb,var(--avs-warning)_8%,transparent)]'
                : 'bg-surface-muted'
            }`}
            data-testid={`alert-${alert.id}`}
          >
            <span className="text-base shrink-0" aria-hidden>{severityIcon(alert.severity)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-small font-medium text-text-primary">{alert.title}</span>
                <Badge tone={severityTone(alert.severity)}>{alert.severity}</Badge>
              </div>
              <p className="text-caption text-text-secondary mt-0.5">{alert.message}</p>
              <p className="text-caption text-text-muted mt-0.5">
                {new Date(alert.timestamp).toLocaleTimeString()} · {alert.category}
              </p>
            </div>
            {!alert.acknowledged && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAcknowledge(alert.id)}
                data-testid={`btn-ack-${alert.id}`}
              >
                Dismiss
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
