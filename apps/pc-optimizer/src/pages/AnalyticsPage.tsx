/**
 * AnalyticsPage — performance analytics dashboard with charts and trends.
 *
 * Shows:
 * - Health score trend over time
 * - CPU and memory usage trends
 * - Cleanup history (files deleted, space freed)
 * - Security events count
 * - Optimization impact summary
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import {
  ChartBarIcon,
  ArrowPathIcon,
  CpuChipIcon,
  TrashIcon,
  ShieldCheckIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';

interface AnalyticsSummary {
  totalScans: number;
  totalCleanups: number;
  totalFilesDeleted: number;
  totalSpaceFreed: number;
  totalThreatsDetected: number;
  totalThreatsQuarantined: number;
  avgHealthScore: number;
}

interface TrendPoint {
  timestamp: string;
  value: number;
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [healthTrend, setHealthTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load AI timeline summary for aggregate stats
      const timelineSummary = await rpc.raw<{
        total_events?: number;
        events_by_type?: Record<string, number>;
      }>(RPC_METHODS.AI_TIMELINE_SUMMARY).catch(() => null);

      // Load junk monitor history for cleanup trends
      const junkHistory = await rpc.raw<{
        history: Array<{ timestamp: string; total_bytes: number; total_files: number; mb: number; gb: number }>;
      }>(RPC_METHODS.JUNK_MONITOR_HISTORY).catch(() => ({ history: [] }));

      // Load threat history for security stats
      const threatHistory = await rpc.raw<{
        history: Array<{ id: string; timestamp: string; threat_name: string; action: string; severity: string }>;
      }>(RPC_METHODS.THREAT_HISTORY).catch(() => ({ history: [] }));

      // Load performance monitor graph history for CPU/memory trends
      const perfHistory = await rpc.raw<{
        history?: Array<{ timestamp: string; cpu: number; memory: number }>;
      }>(RPC_METHODS.PERFORMANCE_MONITOR_GRAPH_HISTORY).catch(() => ({ history: [] }));

      // Calculate summary
      const junkHist = junkHistory.history || [];
      const threatHist = threatHistory.history || [];
      const totalFilesDeleted = junkHist.reduce((sum, h) => sum + (h.total_files || 0), 0);
      const totalSpaceFreed = junkHist.reduce((sum, h) => sum + (h.total_bytes || 0), 0);

      setSummary({
        totalScans: timelineSummary?.events_by_type?.scan || timelineSummary?.total_events || 0,
        totalCleanups: junkHist.length,
        totalFilesDeleted,
        totalSpaceFreed,
        totalThreatsDetected: threatHist.length,
        totalThreatsQuarantined: threatHist.filter((t) => t.action === 'quarantined').length,
        avgHealthScore: 0,
      });

      // Build health trend from performance history
      const perfHist = perfHistory?.history || [];
      setHealthTrend(perfHist.map((p: { timestamp: string; cpu: number; memory: number }) => ({
        timestamp: p.timestamp,
        value: p.cpu,
      })));
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatBytes = (bytes: number) => {
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  // Simple sparkline chart
  const Sparkline = ({ data, color }: { data: TrendPoint[]; color: string }) => {
    if (data.length < 2) {
      return <div className="text-caption text-text-muted py-8 text-center">Not enough data for chart</div>;
    }
    const values = data.map((d) => d.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const points = data
      .map((d, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 100 - ((d.value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');

    return (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-32" data-testid="analytics-sparkline">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  };

  return (
    <div data-testid="page-analytics" className="space-y-4">
      <PageHeader
        title="Performance Analytics"
        description="Trends and insights from your PC optimization and security activity."
        actions={
          <div className="flex items-center gap-2">
            <HelpButton text="Analytics aggregates data from cleanup history, threat detections, and performance monitoring to show trends over time." />
            <Button variant="ghost" size="sm" onClick={loadAnalytics} disabled={loading} leftIcon={<ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}>
              {loading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4">
          <p className="text-small text-semantic-danger">{error}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card variant="glass" className="p-4" data-testid="analytics-card-scans">
          <div className="flex items-center gap-2 mb-2">
            <ChartBarIcon className="h-5 w-5 text-brand-primary" />
            <span className="text-caption text-text-secondary">Total Scans</span>
          </div>
          <div className="text-section-title font-bold text-text-primary">{summary?.totalScans ?? '—'}</div>
        </Card>
        <Card variant="glass" className="p-4" data-testid="analytics-card-cleanups">
          <div className="flex items-center gap-2 mb-2">
            <TrashIcon className="h-5 w-5 text-semantic-warning" />
            <span className="text-caption text-text-secondary">Cleanups Run</span>
          </div>
          <div className="text-section-title font-bold text-text-primary">{summary?.totalCleanups ?? '—'}</div>
        </Card>
        <Card variant="glass" className="p-4" data-testid="analytics-card-files">
          <div className="flex items-center gap-2 mb-2">
            <BoltIcon className="h-5 w-5 text-semantic-success" />
            <span className="text-caption text-text-secondary">Files Deleted</span>
          </div>
          <div className="text-section-title font-bold text-text-primary">{summary?.totalFilesDeleted.toLocaleString() ?? '—'}</div>
        </Card>
        <Card variant="glass" className="p-4" data-testid="analytics-card-space">
          <div className="flex items-center gap-2 mb-2">
            <CpuChipIcon className="h-5 w-5 text-brand-secondary" />
            <span className="text-caption text-text-secondary">Space Freed</span>
          </div>
          <div className="text-section-title font-bold text-text-primary">
            {summary ? formatBytes(summary.totalSpaceFreed) : '—'}
          </div>
        </Card>
      </div>

      {/* Security summary */}
      <Card variant="glass" className="p-4" data-testid="analytics-security-card">
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheckIcon className="h-6 w-6 text-semantic-danger" />
          <div>
            <div className="text-small font-semibold text-text-primary">Security Summary</div>
            <div className="text-caption text-text-secondary">Threat detection and quarantine statistics</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-[var(--avs-radius-md)] bg-surface-muted">
            <div className="text-section-title font-bold text-text-primary">{summary?.totalThreatsDetected ?? '—'}</div>
            <div className="text-caption text-text-secondary">Threats Detected</div>
          </div>
          <div className="text-center p-3 rounded-[var(--avs-radius-md)] bg-surface-muted">
            <div className="text-section-title font-bold text-semantic-danger">{summary?.totalThreatsQuarantined ?? '—'}</div>
            <div className="text-caption text-text-secondary">Quarantined</div>
          </div>
          <div className="text-center p-3 rounded-[var(--avs-radius-md)] bg-surface-muted">
            <div className="text-section-title font-bold text-semantic-success">
              {summary ? summary.totalThreatsDetected - summary.totalThreatsQuarantined : '—'}
            </div>
            <div className="text-caption text-text-secondary">Resolved</div>
          </div>
        </div>
      </Card>

      {/* CPU trend chart */}
      <Card variant="glass" className="p-4" data-testid="analytics-cpu-trend">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-small font-semibold text-text-primary">CPU Usage Trend</div>
            <div className="text-caption text-text-secondary">Recent CPU utilization over time</div>
          </div>
          <Badge tone="brand">Live Data</Badge>
        </div>
        <Sparkline data={healthTrend} color="rgb(59, 130, 246)" />
      </Card>

      {/* Optimization impact */}
      <Card variant="glass" className="p-4" data-testid="analytics-impact">
        <div className="text-small font-semibold text-text-primary mb-3">Optimization Impact</div>
        {summary && summary.totalCleanups > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-small">
              <span className="text-text-secondary">Average files per cleanup</span>
              <span className="font-medium text-text-primary">
                {Math.round(summary.totalFilesDeleted / summary.totalCleanups).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-small">
              <span className="text-text-secondary">Average space freed per cleanup</span>
              <span className="font-medium text-text-primary">
                {formatBytes(Math.round(summary.totalSpaceFreed / summary.totalCleanups))}
              </span>
            </div>
            <div className="flex items-center justify-between text-small">
              <span className="text-text-secondary">Cleanup efficiency</span>
              <span className="font-medium text-semantic-success">
                {summary.totalFilesDeleted > 0 ? 'Active' : 'No data'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-caption text-text-muted py-4 text-center">
            No cleanup data yet. Run a junk scan to see optimization impact.
          </p>
        )}
      </Card>
    </div>
  );
}
