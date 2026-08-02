/**
 * ProtectionStatusPanel — live monitoring, active monitors, and protection controls.
 */
import { Card, Badge, Button, ProgressBar } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  PlayIcon,
  PauseIcon,
} from '@heroicons/react/24/outline';
import type {
  SecurityOverview,
  LiveMonitoringCounts,
} from './SecurityDashboardViewModel';
import type { MonitorInfo, ProtectionMode } from '../realtime-protection';

interface ProtectionStatusPanelProps {
  overview: SecurityOverview | null;
  monitors: MonitorInfo[];
  liveCounts: LiveMonitoringCounts;
  onPause: () => void;
  onResume: () => void;
  onEnableMonitor: (type: MonitorInfo['type']) => void;
  onDisableMonitor: (type: MonitorInfo['type']) => void;
  onSetMode: (mode: ProtectionMode) => void;
}

const MODES: ProtectionMode[] = ['disabled', 'passive', 'interactive', 'maximum', 'enterprise'];

function monitorStatusTone(status: MonitorInfo['status']): BadgeTone {
  switch (status) {
    case 'active': return 'success';
    case 'paused': return 'warning';
    case 'error': return 'danger';
    default: return 'neutral';
  }
}

const MONITOR_ICONS: Record<string, string> = {
  file_system: '📁',
  process: '⚙️',
  service: '🔧',
  scheduled_task: '📅',
  startup: '🚀',
  registry: '📋',
  browser: '🌐',
  download: '⬇️',
  usb: '🔌',
  network: '📡',
};

export function ProtectionStatusPanel({
  overview,
  monitors,
  liveCounts,
  onPause,
  onResume,
  onEnableMonitor,
  onDisableMonitor,
  onSetMode,
}: ProtectionStatusPanelProps) {
  const isRunning = overview?.protectionStatus === 'running';

  return (
    <div className="space-y-6" data-testid="protection-status-panel">
      {/* Protection controls */}
      <Card title="Protection Controls" data-testid="protection-controls">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isRunning ? (
                <ShieldCheckIcon className="h-6 w-6 text-semantic-success" aria-hidden />
              ) : (
                <ShieldExclamationIcon className="h-6 w-6 text-semantic-warning" aria-hidden />
              )}
              <span className="text-sm font-medium text-text-primary">
                Protection is {overview?.protectionStatus ?? 'unknown'}
              </span>
            </div>
            <div className="flex gap-2">
              {isRunning ? (
                <Button variant="secondary" size="sm" onClick={onPause} leftIcon={<PauseIcon className="h-4 w-4" />} data-testid="btn-pause-protection">
                  Pause
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={onResume} leftIcon={<PlayIcon className="h-4 w-4" />} data-testid="btn-resume-protection">
                  Resume
                </Button>
              )}
            </div>
          </div>

          {/* Mode selector */}
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2 block">
              Protection Mode
            </label>
            <div className="flex flex-wrap gap-2">
              {MODES.map((mode) => (
                <button
                  key={mode}
                  onClick={() => onSetMode(mode)}
                  className={
                    overview?.protectionMode === mode
                      ? 'rounded-[var(--avs-radius-md)] border border-brand-primary bg-brand-primary/10 px-3 py-1.5 text-sm font-medium text-brand-primary capitalize'
                      : 'rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-1.5 text-sm text-text-secondary hover:border-[var(--avs-border-hover)] capitalize'
                  }
                  data-testid={`mode-btn-${mode}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Live monitoring counts */}
      <Card title="Live Monitoring" data-testid="protection-live-monitoring">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <LiveMetric label="Processes Monitored" value={liveCounts.processesMonitored} />
          <LiveMetric label="Files Monitored" value={liveCounts.filesMonitored} />
          <LiveMetric label="Registry Events" value={liveCounts.registryEvents} />
          <LiveMetric label="Browser Events" value={liveCounts.browserEvents} />
          <LiveMetric label="Startup Events" value={liveCounts.startupEvents} />
          <LiveMetric label="USB Events" value={liveCounts.usbEvents} />
          <LiveMetric label="Network Events" value={liveCounts.networkEvents} />
          <LiveMetric label="Investigated Today" value={liveCounts.threatsInvestigatedToday} />
          <LiveMetric label="Threats Blocked" value={liveCounts.threatsBlocked} />
          <LiveMetric label="Threats Quarantined" value={liveCounts.threatsQuarantined} />
          <LiveMetric label="False Positives" value={liveCounts.falsePositives} />
          <LiveMetric label="Events Today" value={overview?.eventsToday ?? 0} />
        </div>
      </Card>

      {/* Active monitors */}
      <Card title="Active Monitors" data-testid="protection-monitors">
        <div className="space-y-2">
          {monitors.map((monitor) => (
            <div
              key={monitor.type}
              className="flex items-center justify-between rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-3 hover:border-[var(--avs-border-hover)] transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
              data-testid={`monitor-${monitor.type}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg" aria-hidden>{MONITOR_ICONS[monitor.type] ?? '📊'}</span>
                <div>
                  <div className="text-sm font-medium text-text-primary capitalize">
                    {monitor.type.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-text-muted">
                    Events: {monitor.eventsProcessed}
                    {monitor.lastError && ` • Error: ${monitor.lastError}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={monitorStatusTone(monitor.status)}>{monitor.status}</Badge>
                {monitor.enabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDisableMonitor(monitor.type)}
                    data-testid={`disable-monitor-${monitor.type}`}
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEnableMonitor(monitor.type)}
                    data-testid={`enable-monitor-${monitor.type}`}
                  >
                    Enable
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Resource usage */}
      {overview && (
        <Card title="Resource Usage" data-testid="protection-resource-usage">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">CPU Usage (target &lt;1%)</span>
                <span className="text-xs font-medium text-text-primary">{overview.cpuUsage.toFixed(2)}%</span>
              </div>
              <ProgressBar
                value={overview.cpuUsage}
                tone={overview.cpuUsage <= 1 ? 'success' : overview.cpuUsage <= 5 ? 'warning' : 'danger'}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-text-secondary">Memory Usage (target &lt;150MB)</span>
                <span className="text-xs font-medium text-text-primary">{overview.memoryUsage.toFixed(0)}MB</span>
              </div>
              <ProgressBar
                value={(overview.memoryUsage / 150) * 100}
                tone={overview.memoryUsage <= 150 ? 'success' : 'warning'}
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function LiveMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center text-center" data-testid={`live-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-xl font-semibold text-text-primary">{value.toLocaleString()}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  );
}
