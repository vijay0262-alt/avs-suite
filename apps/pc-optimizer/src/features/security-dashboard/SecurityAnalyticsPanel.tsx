/**
 * SecurityAnalyticsPanel — charts, risk trends, severity heatmaps,
 * and behavior analytics using lightweight SVG visualizations.
 */
import { useMemo } from 'react';
import { Card, Badge } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import type {
  ProtectionStatistics,
  ProtectionTelemetry,
  ProtectionHistoryEntry,
  AIInsight,
} from './SecurityDashboardViewModel';

interface SecurityAnalyticsPanelProps {
  statistics: ProtectionStatistics | null;
  telemetry: ProtectionTelemetry | null;
  history: ProtectionHistoryEntry[];
  insights: AIInsight[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--avs-danger)',
  high: 'var(--avs-danger)',
  medium: 'var(--avs-warning)',
  low: 'var(--avs-brand-primary)',
  info: 'var(--avs-text-muted)',
};

function severityTone(severity: string): BadgeTone {
  switch (severity) {
    case 'critical': return 'danger';
    case 'high': return 'danger';
    case 'medium': return 'warning';
    case 'low': return 'brand';
    default: return 'neutral';
  }
}

export function SecurityAnalyticsPanel({
  statistics,
  telemetry,
  history,
  insights,
}: SecurityAnalyticsPanelProps) {
  // Build event distribution by category
  const categoryData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of history) {
      counts.set(entry.eventCategory, (counts.get(entry.eventCategory) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [history]);

  // Build severity heatmap data
  const severityData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of history) {
      counts.set(entry.severity, (counts.get(entry.severity) ?? 0) + 1);
    }
    return counts;
  }, [history]);

  // Build risk trend (simulated from history timestamps)
  const riskTrend = useMemo(() => {
    if (history.length === 0) return [];
    const points = history.slice(-30).map((entry, i) => ({
      x: i,
      y: entry.threatDetected ? 100 : Math.max(0, 50 - i * 2),
      threat: entry.threatDetected,
    }));
    return points;
  }, [history]);

  return (
    <div className="space-y-4" data-testid="security-analytics-panel">
      {/* Key metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="analytics-total-events">
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{statistics?.totalEvents ?? 0}</div>
            <div className="text-xs text-text-muted">Total Events</div>
          </div>
        </Card>
        <Card data-testid="analytics-processed">
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{statistics?.eventsProcessed ?? 0}</div>
            <div className="text-xs text-text-muted">Processed</div>
          </div>
        </Card>
        <Card data-testid="analytics-avg-time">
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{statistics?.averageProcessingTime.toFixed(0) ?? 0}ms</div>
            <div className="text-xs text-text-muted">Avg Processing</div>
          </div>
        </Card>
        <Card data-testid="analytics-events-min">
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{telemetry?.eventsPerMinute.toFixed(1) ?? 0}</div>
            <div className="text-xs text-text-muted">Events / Min</div>
          </div>
        </Card>
      </div>

      {/* Risk Trend Chart */}
      <Card title="Risk Trend" data-testid="analytics-risk-trend">
        <RiskTrendChart points={riskTrend} />
      </Card>

      {/* Event Distribution by Category */}
      <Card title="Event Distribution by Category" data-testid="analytics-event-distribution">
        {categoryData.length > 0 ? (
          <div className="space-y-2">
            {categoryData.map(([category, count]) => {
              const maxCount = categoryData[0]?.[1] ?? 1;
              const percentage = (count / maxCount) * 100;
              return (
                <div key={category} className="space-y-1" data-testid={`category-bar-${category}`}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary capitalize">{category.replace(/_/g, ' ')}</span>
                    <span className="font-medium text-text-primary">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-brand-primary transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-secondary py-4 text-center">No event data yet.</p>
        )}
      </Card>

      {/* Severity Heatmap */}
      <Card title="Severity Heatmap" data-testid="analytics-severity-heatmap">
        <div className="grid grid-cols-5 gap-2">
          {['critical', 'high', 'medium', 'low', 'info'].map((sev) => {
            const count = severityData.get(sev) ?? 0;
            const max = Math.max(...severityData.values(), 1);
            const intensity = count / max;
            return (
              <div
                key={sev}
                className="rounded-md p-3 text-center"
                style={{
                  backgroundColor: count > 0 ? `color-mix(in srgb, ${SEVERITY_COLORS[sev]} ${intensity * 100}%, transparent)` : 'var(--avs-surface-muted)',
                }}
                data-testid={`severity-heat-${sev}`}
              >
                <div className="text-lg font-bold text-text-primary">{count}</div>
                <div className="text-xs capitalize text-text-muted">{sev}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Behavior Trends */}
      <Card title="Behavior Trends" data-testid="analytics-behavior-trends">
        <div className="space-y-2">
          {statistics && (
            <>
              <TrendRow label="Events Processed" value={statistics.eventsProcessed} total={statistics.totalEvents} />
              <TrendRow label="Events Filtered" value={statistics.eventsFiltered} total={statistics.totalEvents} />
              <TrendRow label="Events Dropped" value={statistics.eventsDropped} total={statistics.totalEvents} />
              <TrendRow label="Threats Detected" value={statistics.threatsDetected} total={statistics.totalEvents} />
              <TrendRow label="Investigations" value={statistics.investigationsTriggered} total={statistics.totalEvents} />
            </>
          )}
        </div>
      </Card>

      {/* Most Active Applications / Repeated Events */}
      <Card title="Most Active Event Sources" data-testid="analytics-active-sources">
        <div className="space-y-1">
          {history.slice(-10).reverse().map((entry) => (
            <div key={entry.id} className="flex items-center justify-between text-xs py-1">
              <span className="text-text-secondary truncate">{entry.target}</span>
              <Badge tone={severityTone(entry.severity)}>{entry.severity}</Badge>
            </div>
          ))}
          {history.length === 0 && (
            <p className="text-sm text-text-secondary py-4 text-center">No activity yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function RiskTrendChart({ points }: { points: { x: number; y: number; threat: boolean }[] }) {
  const WIDTH = 600;
  const HEIGHT = 150;
  const PADDING = { top: 10, right: 10, bottom: 20, left: 35 };

  if (points.length === 0) {
    return <p className="text-sm text-text-secondary py-4 text-center">No trend data yet.</p>;
  }

  const plotW = WIDTH - PADDING.left - PADDING.right;
  const plotH = HEIGHT - PADDING.top - PADDING.bottom;
  const maxIdx = points.length - 1;

  const xScale = (i: number) => PADDING.left + (maxIdx > 0 ? (i / maxIdx) * plotW : 0);
  const yScale = (v: number) => PADDING.top + (1 - v / 100) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.x).toFixed(1)} ${yScale(p.y).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xScale(maxIdx).toFixed(1)} ${HEIGHT - PADDING.bottom} L ${xScale(0).toFixed(1)} ${HEIGHT - PADDING.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" role="img" aria-label="Risk trend chart">
      {/* Grid */}
      <line x1={PADDING.left} y1={PADDING.top} x2={WIDTH - PADDING.right} y2={PADDING.top} stroke="var(--avs-border)" strokeWidth="0.5" />
      <line x1={PADDING.left} y1={HEIGHT - PADDING.bottom} x2={WIDTH - PADDING.right} y2={HEIGHT - PADDING.bottom} stroke="var(--avs-border)" strokeWidth="0.5" />
      <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={HEIGHT - PADDING.bottom} stroke="var(--avs-border)" strokeWidth="0.5" />

      {/* Y labels */}
      <text x={PADDING.left - 5} y={PADDING.top + 4} textAnchor="end" className="fill-text-muted text-[10px]">100</text>
      <text x={PADDING.left - 5} y={HEIGHT / 2} textAnchor="end" className="fill-text-muted text-[10px]">50</text>
      <text x={PADDING.left - 5} y={HEIGHT - PADDING.bottom} textAnchor="end" className="fill-text-muted text-[10px]">0</text>

      {/* Area */}
      <path d={areaPath} fill="color-mix(in srgb, var(--avs-brand-primary) 10%, transparent)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="var(--avs-brand-primary)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Threat markers */}
      {points.filter((p) => p.threat).map((p) => (
        <circle key={p.x} cx={xScale(p.x)} cy={yScale(p.y)} r="3" fill="var(--avs-danger)" />
      ))}
    </svg>
  );
}

function TrendRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percentage = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1" data-testid={`trend-row-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-secondary">{label}</span>
        <span className="font-medium text-text-primary">{value} ({percentage.toFixed(1)}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
        <div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}
