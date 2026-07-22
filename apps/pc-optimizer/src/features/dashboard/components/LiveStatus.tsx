import React from 'react';
import { Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import {
  CpuChipIcon,
  ServerIcon,
  CircleStackIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import type { LiveMetrics } from '../dashboard.types';

export interface LiveStatusProps {
  metrics: LiveMetrics | null;
}

export const LiveStatus = React.memo(function LiveStatus({ metrics }: LiveStatusProps) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {['CPU', 'Memory', 'Disk', 'Network', 'Temperature'].map((label) => (
          <Card key={label}>
            <div className="text-xs text-text-muted mb-1">{label}</div>
            <div className="text-xl font-bold text-text-primary">—</div>
          </Card>
        ))}
      </div>
    );
  }

  const cpu = metrics.cpu;
  const memory = metrics.memory;
  const firstDrive = metrics.storage[0];
  const network = metrics.network;

  const networkDown = network ? formatBytes(network.downloadSpeed) + '/s' : '—';
  const networkUp = network ? formatBytes(network.uploadSpeed) + '/s' : '—';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <Widget
        icon={CpuChipIcon}
        label="CPU"
        value={`${cpu.usage.toFixed(0)}%`}
        color={cpu.usage > 80 ? 'text-semantic-danger' : 'text-text-primary'}
      />
      <Widget
        icon={ServerIcon}
        label="Memory"
        value={`${memory.usage.toFixed(0)}%`}
        color={memory.usage > 80 ? 'text-semantic-danger' : 'text-text-primary'}
      />
      <Widget
        icon={CircleStackIcon}
        label="Disk"
        value={firstDrive ? `${firstDrive.usage.toFixed(0)}%` : '—'}
        color={firstDrive && firstDrive.usage > 90 ? 'text-semantic-danger' : 'text-text-primary'}
      />
      <Widget
        icon={ArrowDownIcon}
        label="Network"
        value={networkDown}
        subValue={networkUp}
        subIcon={ArrowUpIcon}
      />
      <Widget
        icon={SunIcon}
        label="Temperature"
        value={cpu.temperature !== null ? `${cpu.temperature.toFixed(0)}°C` : '—'}
        color={
          cpu.temperature !== null && cpu.temperature > 80
            ? 'text-semantic-danger'
            : 'text-text-primary'
        }
      />
    </div>
  );
});

interface WidgetProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subValue?: string;
  subIcon?: React.ComponentType<{ className?: string }>;
  color?: string;
}

const Widget = React.memo(function Widget({ icon: Icon, label, value, subValue, subIcon: SubIcon, color = 'text-text-primary' }: WidgetProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
        <div className="text-xs text-text-muted">{label}</div>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {subValue && SubIcon && (
        <div className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
          <SubIcon className="h-3 w-3" aria-hidden="true" />
          <span>{subValue}</span>
        </div>
      )}
    </Card>
  );
});
