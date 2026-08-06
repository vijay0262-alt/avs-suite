/**
 * OverviewPanel — dashboard overview with security score, protection status,
 * live monitoring counts, and key metrics.
 */
import { Card, Badge, ProgressBar } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import {
  ShieldCheckIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CpuChipIcon,
  CircleStackIcon,
} from '@heroicons/react/24/outline';
import type {
  SecurityOverview,
  LiveMonitoringCounts,
  AIInsight,
  ProtectionHealthReport,
  ProtectionStatistics,
  ProtectionTelemetry,
  ProtectionSession,
  HealthIssue,
} from './SecurityDashboardViewModel';

interface OverviewPanelProps {
  overview: SecurityOverview | null;
  liveCounts: LiveMonitoringCounts;
  insights: AIInsight[];
  health: ProtectionHealthReport | null;
  statistics: ProtectionStatistics | null;
  telemetry: ProtectionTelemetry | null;
  session: ProtectionSession | null;
  lastUpdated: number;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function threatLevelTone(level: SecurityOverview['threatLevel']): BadgeTone {
  switch (level) {
    case 'critical': return 'danger';
    case 'high': return 'danger';
    case 'moderate': return 'warning';
    case 'low': return 'brand';
    default: return 'success';
  }
}

function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export function OverviewPanel({
  overview,
  liveCounts,
  health,
  telemetry,
  session,
  lastUpdated,
}: OverviewPanelProps) {
  if (!overview) {
    return (
      <Card data-testid="overview-empty">
        <div className="py-8 text-center text-small text-text-secondary">
          No security data available yet.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6" data-testid="overview-panel">
      {/* Top row: score ring, protection status, AI confidence, threat level */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Security Score Ring */}
        <Card data-testid="overview-score-ring">
          <div className="flex flex-col items-center">
            <span className="text-caption font-medium uppercase tracking-wide text-text-muted mb-2">Security Score</span>
            <ScoreRing score={overview.securityScore} />
            <div className="mt-2">
              <Badge tone={scoreTone(overview.securityScore) === 'success' ? 'success' : scoreTone(overview.securityScore) === 'warning' ? 'warning' : 'danger'}>
                {overview.securityScore >= 80 ? 'Protected' : overview.securityScore >= 60 ? 'At Risk' : 'Critical'}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Protection Status */}
        <Card data-testid="overview-protection-status">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wide text-text-muted">Protection Status</span>
              <ShieldCheckIcon className="h-5 w-5 text-semantic-success" aria-hidden />
            </div>
            <div className="text-statistic font-bold text-text-primary capitalize">{overview.protectionStatus}</div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Mode</span>
                <span className="font-medium text-text-primary capitalize">{overview.protectionMode}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Monitors</span>
                <span className="font-medium text-text-primary">{overview.activeMonitors}/{overview.totalMonitors}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Uptime</span>
                <span className="font-medium text-text-primary">{formatUptime(overview.protectionUptime)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* AI Confidence */}
        <Card data-testid="overview-ai-confidence">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wide text-text-muted">AI Confidence</span>
              <CpuChipIcon className="h-5 w-5 text-brand-primary" aria-hidden />
            </div>
            <div className="text-statistic font-bold text-text-primary">
              {(overview.aiConfidenceScore * 100).toFixed(0)}%
            </div>
            <ProgressBar
              value={overview.aiConfidenceScore * 100}
              tone={overview.aiConfidenceScore >= 0.8 ? 'success' : overview.aiConfidenceScore >= 0.6 ? 'warning' : 'danger'}
            />
            <p className="text-caption text-text-secondary">
              {overview.aiConfidenceScore >= 0.8 ? 'High confidence in detections' : 'Some detections may need review'}
            </p>
          </div>
        </Card>

        {/* Threat Level */}
        <Card data-testid="overview-threat-level">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-caption font-medium uppercase tracking-wide text-text-muted">Threat Level</span>
              <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" aria-hidden />
            </div>
            <div className="text-statistic font-bold text-text-primary capitalize">{overview.threatLevel}</div>
            <Badge tone={threatLevelTone(overview.threatLevel)}>
              {overview.threatLevel === 'none' ? 'No threats' : `${overview.threatLevel} threat level`}
            </Badge>
            <div className="flex items-center justify-between text-caption">
              <span className="text-text-secondary">Definitions</span>
              <span className="font-medium text-text-primary capitalize">{overview.definitionsStatus.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Live monitoring counts */}
      <Card title="Live Monitoring" data-testid="overview-live-monitoring">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <LiveCount label="Processes" value={liveCounts.processesMonitored} icon={<CpuChipIcon className="h-4 w-4" />} />
          <LiveCount label="Files" value={liveCounts.filesMonitored} icon={<CircleStackIcon className="h-4 w-4" />} />
          <LiveCount label="Registry" value={liveCounts.registryEvents} />
          <LiveCount label="Browser" value={liveCounts.browserEvents} />
          <LiveCount label="Startup" value={liveCounts.startupEvents} />
          <LiveCount label="USB" value={liveCounts.usbEvents} />
          <LiveCount label="Network" value={liveCounts.networkEvents} />
          <LiveCount label="Investigated" value={liveCounts.threatsInvestigatedToday} icon={<CheckCircleIcon className="h-4 w-4" />} />
          <LiveCount label="Blocked" value={liveCounts.threatsBlocked} />
          <LiveCount label="Quarantined" value={liveCounts.threatsQuarantined} />
          <LiveCount label="False Positives" value={liveCounts.falsePositives} />
          <LiveCount label="Events Today" value={overview.eventsToday} />
        </div>
      </Card>

      {/* Bottom row: health, resource usage, last events */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Engine Health */}
        <Card title="Engine Health" data-testid="overview-engine-health">
          {health && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-small text-text-secondary">Status</span>
                <Badge tone={health.status === 'healthy' ? 'success' : health.status === 'degraded' ? 'warning' : 'danger'}>
                  {health.status}
                </Badge>
              </div>
              {health.issues.length > 0 ? (
                <div className="space-y-1">
                  {health.issues.slice(0, 3).map((issue: HealthIssue, i: number) => (
                    <div key={i} className="text-caption text-text-secondary">
                      <span className={`font-medium ${issue.severity === 'critical' ? 'text-semantic-danger' : issue.severity === 'high' ? 'text-semantic-warning' : ''}`}>
                        {issue.severity}:
                      </span>{' '}
                      {issue.description}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-caption text-text-secondary">No issues detected. All systems healthy.</p>
              )}
            </div>
          )}
        </Card>

        {/* Resource Usage */}
        <Card title="Resource Usage" data-testid="overview-resource-usage">
          {telemetry && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-caption text-text-secondary">CPU (target &lt;1%)</span>
                  <span className="text-caption font-medium text-text-primary">{telemetry.cpuUsage.toFixed(2)}%</span>
                </div>
                <ProgressBar
                  value={telemetry.cpuUsage}
                  tone={telemetry.cpuUsage <= 1 ? 'success' : telemetry.cpuUsage <= 5 ? 'warning' : 'danger'}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-caption text-text-secondary">Memory (target &lt;150MB)</span>
                  <span className="text-caption font-medium text-text-primary">{telemetry.memoryUsage.toFixed(0)}MB</span>
                </div>
                <ProgressBar
                  value={(telemetry.memoryUsage / 150) * 100}
                  tone={telemetry.memoryUsage <= 150 ? 'success' : 'warning'}
                />
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Events/min</span>
                <span className="font-medium text-text-primary">{telemetry.eventsPerMinute.toFixed(1)}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Queue depth</span>
                <span className="font-medium text-text-primary">{telemetry.queueDepth}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Session Info */}
        <Card title="Session Info" data-testid="overview-session-info">
          {session ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary flex items-center gap-1">
                  <ClockIcon className="h-3 w-3" /> Started
                </span>
                <span className="font-medium text-text-primary">{new Date(session.startedAt).toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Events processed</span>
                <span className="font-medium text-text-primary">{session.eventsProcessed}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Threats detected</span>
                <span className="font-medium text-text-primary">{session.threatsDetected}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Threats blocked</span>
                <span className="font-medium text-text-primary">{session.threatsBlocked}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Notifications sent</span>
                <span className="font-medium text-text-primary">{session.notificationsSent}</span>
              </div>
              <div className="flex items-center justify-between text-caption">
                <span className="text-text-secondary">Last updated</span>
                <span className="font-medium text-text-primary">
                  {lastUpdated > 0 ? new Date(lastUpdated).toLocaleTimeString() : 'N/A'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-caption text-text-secondary">No active session.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'var(--avs-success)' : score >= 60 ? 'var(--avs-warning)' : 'var(--avs-danger)';

  return (
    <svg width="100" height="100" viewBox="0 0 100 100" role="img" aria-label={`Security score: ${score}`}>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--avs-border)" strokeWidth="6" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <text x="50" y="55" textAnchor="middle" className="fill-text-primary text-xl font-bold">
        {score}
      </text>
    </svg>
  );
}

function LiveCount({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center" data-testid={`live-count-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      {icon && <div className="mb-1 text-text-muted">{icon}</div>}
      <div className="text-xl font-semibold text-text-primary">{value.toLocaleString()}</div>
      <div className="text-caption text-text-muted">{label}</div>
    </div>
  );
}
