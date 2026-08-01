/**
 * OverviewSection — dashboard summary with health score, temperature,
 * power, cooling, uptime, provider status, and sensor availability.
 */
import { Card, Badge, ProgressBar } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import type { HardwareOverview, HealthLevel } from '../types';

const healthTone = (level: HealthLevel): BadgeTone => {
  switch (level) {
    case 'good': return 'success';
    case 'fair': return 'brand';
    case 'poor': return 'warning';
    case 'critical': return 'danger';
    default: return 'neutral';
  }
};

const statusTone = (status: string): BadgeTone => {
  switch (status) {
    case 'ok': return 'success';
    case 'warning': return 'warning';
    case 'critical': return 'danger';
    default: return 'neutral';
  }
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function OverviewSection({ overview }: { overview: HardwareOverview }) {
  return (
    <div data-testid="overview-section" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Health Score */}
      <Card data-testid="overview-health">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Health Score</span>
          <Badge tone={healthTone(overview.healthLevel)}>{overview.healthLevel}</Badge>
        </div>
        <div className="text-3xl font-bold text-text-primary">{overview.healthScore}</div>
        <div className="mt-2">
          <ProgressBar
            value={overview.healthScore}
            tone={overview.healthScore >= 90 ? 'success' : overview.healthScore >= 70 ? 'warning' : 'danger'}
          />
        </div>
      </Card>

      {/* Temperature */}
      <Card data-testid="overview-temperature">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium uppercase tracking-wide text-text-muted">System Temperature</span>
          <Badge tone={healthTone(overview.overallTempLevel)}>{overview.overallTempLevel}</Badge>
        </div>
        <div className="text-3xl font-bold text-text-primary">
          {overview.overallTempC !== null ? `${overview.overallTempC.toFixed(0)}°C` : 'N/A'}
        </div>
        <div className="mt-1 text-xs text-text-secondary">
          {overview.overallTempC !== null ? 'Highest component temperature' : 'No temperature sensors available'}
        </div>
      </Card>

      {/* Power & Cooling */}
      <Card data-testid="overview-power-cooling">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Power Status</span>
            <Badge tone={statusTone(overview.powerStatus)}>{overview.powerStatus}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Cooling Status</span>
            <Badge tone={statusTone(overview.coolingStatus)}>{overview.coolingStatus}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">System Uptime</span>
            <span className="text-sm font-medium text-text-primary">
              {overview.systemUptimeSeconds !== null ? formatUptime(overview.systemUptimeSeconds) : 'N/A'}
            </span>
          </div>
        </div>
      </Card>

      {/* Provider & Sensor Status */}
      <Card data-testid="overview-providers">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Last Scan</span>
            <span className="text-sm text-text-primary">
              {new Date(overview.lastScanAt).toLocaleTimeString()}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-text-muted">Sensors</span>
            <span className="text-sm font-medium text-text-primary">
              {overview.sensorAvailability.available}/{overview.sensorAvailability.total} available
            </span>
          </div>
          {overview.providerStatuses.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-text-muted mb-1">Providers</div>
              <div className="flex flex-wrap gap-1">
                {overview.providerStatuses.map((p) => (
                  <Badge
                    key={p.id}
                    tone={p.state === 'healthy' ? 'success' : p.state === 'degraded' ? 'warning' : 'danger'}
                  >
                    {p.id}: {p.state}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
