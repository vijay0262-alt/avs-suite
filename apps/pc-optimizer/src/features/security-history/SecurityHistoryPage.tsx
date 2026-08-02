/**
 * SecurityHistoryPage — displays security-related history entries.
 *
 * Shows:
 *   - Security events from history module
 *   - Searchable, filterable list
 *   - Statistics summary
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState, ModuleErrorState } from '../../components/ModuleStates';
import {
  ClockIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  TrashIcon,
  ShieldExclamationIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';

interface HistoryEntry {
  id: string;
  type: string;
  action: string;
  description: string;
  timestamp: string;
  status: string;
  details?: Record<string, unknown>;
}

interface HistoryStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
}

interface SecurityHistoryState {
  loading: boolean;
  error: string | null;
  entries: HistoryEntry[];
  stats: HistoryStats | null;
  searchQuery: string;
  filterType: string;
}

class SecurityHistoryViewModel extends ViewModel<SecurityHistoryState> {
  constructor() {
    super({ loading: false, error: null, entries: [], stats: null, searchQuery: '', filterType: '' });
  }

  async bootstrap() {
    this.setState({ loading: true, error: null });
    try {
      if (typeof window === 'undefined' || !window.avs) {
        throw new Error('AVS RPC bridge is unavailable');
      }
      const [listResult, statsResult] = await Promise.all([
        window.avs.rpc.call('history.list', { filter: 'security', limit: 200 }) as Promise<{ entries: HistoryEntry[]; total: number } | { history: HistoryEntry[] }>,
        window.avs.rpc.call('history.statistics') as Promise<HistoryStats>,
      ]);
      const entries = 'entries' in listResult ? listResult.entries : ('history' in listResult ? listResult.history : []);
      this.setState({ loading: false, entries, stats: statsResult });
    } catch (e) {
      this.setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load security history' });
    }
  }

  setSearch(query: string) {
    this.setState({ searchQuery: query });
  }

  setFilterType(type: string) {
    this.setState({ filterType: type });
  }

  async search() {
    if (!this.state.searchQuery.trim()) {
      return this.bootstrap();
    }
    this.setState({ loading: true });
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      const result = await window.avs.rpc.call('history.search', { query: this.state.searchQuery, filter: 'security' }) as { entries: HistoryEntry[] } | { results: HistoryEntry[] };
      const entries = 'entries' in result ? result.entries : ('results' in result ? result.results : []);
      this.setState({ loading: false, entries });
    } catch (e) {
      this.setState({ loading: false, error: e instanceof Error ? e.message : 'Search failed' });
    }
  }

  async deleteEntry(id: string) {
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      await window.avs.rpc.call('history.delete', { id });
      this.setState({ entries: this.state.entries.filter((e) => e.id !== id) });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Delete failed' });
    }
  }

  async clearAll() {
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      await window.avs.rpc.call('history.clear', { filter: 'security' });
      this.setState({ entries: [] });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Clear failed' });
    }
  }

  async exportHistory() {
    try {
      if (typeof window === 'undefined' || !window.avs) return;
      await window.avs.rpc.call('history.export', { format: 'json', filter: 'security' });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Export failed' });
    }
  }
}

export default function SecurityHistoryPage() {
  const vm = useMemo(() => new SecurityHistoryViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const types = useMemo(() => {
    const set = new Set(state.entries.map((e) => e.type).filter(Boolean));
    return Array.from(set).sort();
  }, [state.entries]);

  const filteredEntries = useMemo(() => {
    let result = state.entries;
    if (state.filterType) {
      result = result.filter((e) => e.type === state.filterType);
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter((e) =>
        e.description?.toLowerCase().includes(q) ||
        e.action?.toLowerCase().includes(q) ||
        e.type?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [state.entries, state.filterType, state.searchQuery]);

  if (state.loading) {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Security History" description="Complete log of security events and actions" />
        <ModuleLoadingState message="Loading security history…" />
      </div>
    );
  }

  if (state.error && state.entries.length === 0) {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Security History" description="Complete log of security events and actions" />
        <ModuleErrorState message={state.error} onRetry={() => vm.bootstrap()} />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <PageHeader
        title="Security History"
        description="Complete log of security events and actions"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => vm.exportHistory()} variant="secondary" size="sm" leftIcon={<DocumentArrowDownIcon className="h-4 w-4" />}>
              Export
            </Button>
            <Button onClick={() => vm.bootstrap()} variant="secondary" size="sm" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              Refresh
            </Button>
          </div>
        }
      />

      {/* Stats */}
      {state.stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Total Events" value={state.stats.total} icon={ClockIcon} />
          <StatCard label="Threats Detected" value={state.stats.byType?.threat_detected ?? state.stats.byType?.threat ?? 0} icon={ShieldExclamationIcon} tone="warning" />
          <StatCard label="Threats Resolved" value={state.stats.byType?.threat_resolved ?? state.stats.byType?.resolved ?? 0} icon={CheckCircleIcon} tone="success" />
          <StatCard label="Errors" value={state.stats.byStatus?.error ?? 0} icon={ExclamationTriangleIcon} tone={state.stats.byStatus?.error ? 'warning' : 'neutral'} />
        </div>
      )}

      {/* Filters */}
      <Card variant="glass">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--avs-text-muted)]" />
            <input
              value={state.searchQuery}
              onChange={(e) => vm.setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && vm.search()}
              placeholder="Search security history…"
              className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] pl-9 pr-3 py-2 text-sm text-[var(--avs-text-primary)]"
            />
          </div>
          <select
            value={state.filterType}
            onChange={(e) => vm.setFilterType(e.target.value)}
            className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-sm text-[var(--avs-text-primary)]"
          >
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <Button onClick={() => vm.search()} size="sm" leftIcon={<MagnifyingGlassIcon className="h-3.5 w-3.5" />}>
            Search
          </Button>
          <Button onClick={() => vm.clearAll()} size="sm" variant="ghost" leftIcon={<TrashIcon className="h-3.5 w-3.5" />}>
            Clear All
          </Button>
        </div>
      </Card>

      {/* History List */}
      <Card title={`Events (${filteredEntries.length})`} variant="glass">
        {filteredEntries.length > 0 ? (
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {filteredEntries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--avs-text-primary)]">{entry.description || entry.action}</span>
                    <Badge tone="neutral">{entry.type}</Badge>
                  </div>
                  <div className="text-xs text-[var(--avs-text-muted)] mt-0.5">
                    {entry.timestamp} · {entry.action}
                  </div>
                </div>
                <Badge tone={entry.status === 'success' ? 'success' : entry.status === 'error' ? 'danger' : 'neutral'}>
                  {entry.status}
                </Badge>
                <button
                  onClick={() => vm.deleteEntry(entry.id)}
                  className="text-[var(--avs-text-muted)] hover:text-[var(--avs-danger)]"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <ModuleEmptyState icon={ClockIcon} title="No security events" message="Security events will appear here as they occur." />
        )}
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = 'neutral' }: { label: string; value: number; icon: typeof ClockIcon; tone?: 'neutral' | 'success' | 'warning' }) {
  const colorClass = tone === 'success' ? 'text-[var(--avs-success)]' : tone === 'warning' ? 'text-[var(--avs-warning)]' : 'text-[var(--avs-text-primary)]';
  return (
    <Card variant="glass">
      <div className="flex items-center gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2.5">
          <Icon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
        </div>
        <div>
          <p className={`text-2xl font-bold ${colorClass}`}>{value}</p>
          <p className="text-xs text-[var(--avs-text-muted)]">{label}</p>
        </div>
      </div>
    </Card>
  );
}
