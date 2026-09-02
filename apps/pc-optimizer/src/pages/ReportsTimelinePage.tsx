/**
 * ReportsTimelinePage — chronological timeline of all optimization and security events.
 *
 * Shows a unified timeline of:
 * - AI timeline events (ai_features.timeline.get)
 * - Junk monitor history (junk_monitor.history)
 * - Threat history (threat.history)
 * - Security history (ai_features.security.history)
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import {
  ClockIcon,
  ArrowPathIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

interface TimelineEntry {
  id: string;
  timestamp: string;
  type: 'optimization' | 'security' | 'cleanup' | 'system';
  title: string;
  description: string;
  details?: Record<string, unknown>;
}

interface JunkHistoryEntry {
  timestamp: string;
  total_bytes: number;
  total_files: number;
  mb: number;
  gb: number;
}

interface ThreatHistoryEntry {
  id: string;
  timestamp: string;
  threat_name: string;
  action: string;
  severity: string;
}

export default function ReportsTimelinePage() {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'optimization' | 'security' | 'cleanup'>('all');

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries: TimelineEntry[] = [];

      // Load AI timeline
      try {
        const aiTimeline = await rpc.raw<{ events: Array<{ id: string; timestamp: string; type: string; title: string; description: string }> }>(RPC_METHODS.AI_TIMELINE_GET, { limit: 50 });
        if (aiTimeline.events) {
          for (const e of aiTimeline.events) {
            entries.push({
              id: e.id || `ai-${e.timestamp}`,
              timestamp: e.timestamp,
              type: (e.type === 'security' ? 'security' : e.type === 'cleanup' ? 'cleanup' : 'optimization') as TimelineEntry['type'],
              title: e.title || 'Optimization Event',
              description: e.description || '',
            });
          }
        }
      } catch { /* ignore */ }

      // Load junk monitor history
      try {
        const junkHistory = await rpc.raw<{ history: JunkHistoryEntry[] }>(RPC_METHODS.JUNK_MONITOR_HISTORY);
        if (junkHistory.history) {
          for (const h of junkHistory.history) {
            entries.push({
              id: `junk-${h.timestamp}`,
              timestamp: h.timestamp,
              type: 'cleanup',
              title: `Junk Scan: ${h.total_files} files, ${h.gb > 0 ? h.gb.toFixed(2) : h.mb.toFixed(1)} ${h.gb > 0 ? 'GB' : 'MB'}`,
              description: `Detected ${h.total_files} junk files occupying ${h.gb > 0 ? h.gb.toFixed(2) + ' GB' : h.mb.toFixed(1) + ' MB'}`,
            });
          }
        }
      } catch { /* ignore */ }

      // Load threat history
      try {
        const threatHistory = await rpc.raw<{ history: ThreatHistoryEntry[] }>(RPC_METHODS.THREAT_HISTORY);
        if (threatHistory.history) {
          for (const t of threatHistory.history) {
            entries.push({
              id: t.id || `threat-${t.timestamp}`,
              timestamp: t.timestamp,
              type: 'security',
              title: `Threat ${t.action}: ${t.threat_name}`,
              description: `Severity: ${t.severity}`,
            });
          }
        }
      } catch { /* ignore */ }

      // Sort by timestamp descending
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setTimeline(entries);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  const handleClear = async () => {
    if (!confirm('Clear all timeline history? This cannot be undone.')) return;
    try {
      await rpc.raw(RPC_METHODS.AI_TIMELINE_CLEAR);
      loadTimeline();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleExport = async () => {
    try {
      const result = await rpc.raw<{ data?: string; format?: string }>(RPC_METHODS.AI_TIMELINE_EXPORT, { format: 'json' });
      if (result.data) {
        const blob = new Blob([result.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `avs-timeline-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(String(e));
    }
  };

  const filtered = filter === 'all' ? timeline : timeline.filter((e) => e.type === filter);

  const typeIcon = (type: TimelineEntry['type']) => {
    switch (type) {
      case 'security': return <ShieldCheckIcon className="h-5 w-5 text-semantic-danger" />;
      case 'cleanup': return <TrashIcon className="h-5 w-5 text-semantic-warning" />;
      case 'optimization': return <SparklesIcon className="h-5 w-5 text-brand-primary" />;
      default: return <ChartBarIcon className="h-5 w-5 text-text-muted" />;
    }
  };

  const typeBadge = (type: TimelineEntry['type']) => {
    switch (type) {
      case 'security': return <Badge tone="danger">Security</Badge>;
      case 'cleanup': return <Badge tone="warning">Cleanup</Badge>;
      case 'optimization': return <Badge tone="brand">Optimization</Badge>;
      default: return <Badge tone="neutral">System</Badge>;
    }
  };

  return (
    <div data-testid="page-reports-timeline" className="space-y-4">
      <PageHeader
        title="Reports Timeline"
        description="Chronological history of all optimization, cleanup, and security events."
        actions={
          <div className="flex items-center gap-2">
            <HelpButton text="The timeline aggregates events from junk scans, threat detections, and optimization actions. Use filters to focus on specific event types." />
            <Button variant="ghost" size="sm" onClick={handleExport} leftIcon={<ArrowDownTrayIcon className="h-4 w-4" />} data-testid="timeline-export-btn">
              Export
            </Button>
            <Button variant="ghost" size="sm" onClick={handleClear} leftIcon={<TrashIcon className="h-4 w-4" />} data-testid="timeline-clear-btn">
              Clear
            </Button>
          </div>
        }
      />

      {/* Filter buttons */}
      <div className="flex items-center gap-2">
        {(['all', 'optimization', 'security', 'cleanup'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-[var(--avs-radius-md)] text-small font-medium transition-colors ${
              filter === f
                ? 'bg-brand-primary text-white'
                : 'bg-surface-muted text-text-secondary hover:bg-[var(--avs-border)]'
            }`}
            data-testid={`timeline-filter-${f}`}
          >
            {f === 'all' ? 'All Events' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={loadTimeline} disabled={loading} leftIcon={<ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4">
          <p className="text-small text-semantic-danger">{error}</p>
        </div>
      )}

      {/* Timeline */}
      <Card variant="glass" className="p-4">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <ClockIcon className="h-12 w-12 text-text-muted mx-auto mb-3" />
            <p className="text-small text-text-secondary">No timeline events yet. Run a scan or optimization to see events here.</p>
          </div>
        ) : (
          <div className="space-y-1" data-testid="timeline-list">
            {filtered.map((entry) => (
              <div key={entry.id} className="flex gap-3 py-3 border-b border-[var(--avs-border)] last:border-0">
                <div className="shrink-0 pt-0.5">{typeIcon(entry.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {typeBadge(entry.type)}
                    <span className="text-caption text-text-muted">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-small font-medium text-text-primary">{entry.title}</div>
                  {entry.description && (
                    <div className="text-caption text-text-secondary mt-0.5">{entry.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
