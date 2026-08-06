import clsx from 'clsx';
import {
  CpuChipIcon,
  CircleStackIcon,
  HeartIcon,
  ShieldCheckIcon,
  BoltIcon,
  EyeIcon,
  Battery50Icon,
  FireIcon,
} from '@heroicons/react/24/outline';
import type { SystemHealthSnapshotData } from '../protectionCenter.types';

function getTone(value: number, warn: number, danger: number): string {
  if (value < warn) return 'text-[var(--avs-success)]';
  if (value < danger) return 'text-[var(--avs-warning)]';
  return 'text-[var(--avs-danger)]';
}

function getBarColor(value: number, warn: number, danger: number): string {
  if (value < warn) return 'bg-[var(--avs-success)]';
  if (value < danger) return 'bg-[var(--avs-warning)]';
  return 'bg-[var(--avs-danger)]';
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface MetricRowProps {
  icon: typeof CpuChipIcon;
  label: string;
  value: string;
  percent: number;
  warnAt: number;
  dangerAt: number;
}

function MetricRow({ icon: Icon, label, value, percent, warnAt, dangerAt }: MetricRowProps) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 shrink-0 text-[var(--avs-text-muted)]" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-caption font-medium text-[var(--avs-text-secondary)]">{label}</span>
          <span className={clsx('text-caption font-bold tabular-nums', getTone(percent, warnAt, dangerAt))}>
            {value}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--avs-surface-muted)] overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-[var(--avs-duration-slow)]', getBarColor(percent, warnAt, dangerAt))}
            style={{ width: `${Math.min(100, percent)}%` }}
            aria-hidden="true"
          />
        </div>
      </div>
    </div>
  );
}

export interface SystemHealthSnapshotProps {
  data: SystemHealthSnapshotData | null;
}

export function SystemHealthSnapshot({ data }: SystemHealthSnapshotProps) {
  if (!data) {
    return (
      <div className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4 text-center">
        <p className="text-small text-[var(--avs-text-muted)]">Loading system health…</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-gradient-surface p-4"
      role="region"
      aria-label="System health snapshot"
    >
      {/* Overall score */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[var(--avs-border)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)]">
          <HeartIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
        </div>
        <div>
          <div className="text-statistic font-bold text-[var(--avs-text-primary)] tabular-nums">
            {data.overallHealthScore}
            <span className="text-small text-[var(--avs-text-muted)] font-normal">/100</span>
          </div>
          <div className="text-caption text-[var(--avs-text-muted)] capitalize">
            {data.overallScoreZone} · Uptime {formatUptime(data.uptimeSeconds)}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-3">
        <MetricRow
          icon={CpuChipIcon}
          label="CPU Usage"
          value={`${Math.round(data.cpuUsage)}%`}
          percent={data.cpuUsage}
          warnAt={70}
          dangerAt={90}
        />
        <MetricRow
          icon={CircleStackIcon}
          label="Memory"
          value={`${Math.round(data.memoryUsage)}%`}
          percent={data.memoryUsage}
          warnAt={75}
          dangerAt={90}
        />
        <MetricRow
          icon={CircleStackIcon}
          label="Storage"
          value={`${Math.round(data.storageUsage)}%`}
          percent={data.storageUsage}
          warnAt={80}
          dangerAt={90}
        />
        {data.cpuTemp !== null && (
          <MetricRow
            icon={FireIcon}
            label="CPU Temp"
            value={`${Math.round(data.cpuTemp)}°C`}
            percent={data.cpuTemp}
            warnAt={70}
            dangerAt={85}
          />
        )}
        <MetricRow
          icon={ShieldCheckIcon}
          label="Security"
          value={`${Math.round(data.securityScore)}`}
          percent={100 - data.securityScore}
          warnAt={30}
          dangerAt={50}
        />
        <MetricRow
          icon={BoltIcon}
          label="Performance"
          value={`${Math.round(data.performanceScore)}`}
          percent={100 - data.performanceScore}
          warnAt={30}
          dangerAt={50}
        />
        <MetricRow
          icon={EyeIcon}
          label="Privacy"
          value={`${Math.round(data.privacyScore)}`}
          percent={100 - data.privacyScore}
          warnAt={30}
          dangerAt={50}
        />
        {data.batteryPercent !== null && (
          <MetricRow
            icon={Battery50Icon}
            label={data.batteryPlugged ? 'Battery (Charging)' : 'Battery'}
            value={`${Math.round(data.batteryPercent)}%`}
            percent={100 - data.batteryPercent}
            warnAt={50}
            dangerAt={80}
          />
        )}
      </div>
    </div>
  );
}
