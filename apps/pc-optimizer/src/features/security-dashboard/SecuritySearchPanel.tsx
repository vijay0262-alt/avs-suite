/**
 * SecuritySearchPanel — unified search across threats, processes,
 * investigations, evidence, timeline, reports, and providers.
 */
import { useState, useMemo } from 'react';
import { Card, Badge } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import {
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CpuChipIcon,
  MagnifyingGlassCircleIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  DocumentTextIcon,
  ServerIcon,
} from '@heroicons/react/24/outline';
import type { SearchResult } from './SecurityDashboardViewModel';

interface SecuritySearchPanelProps {
  query: string;
  results: SearchResult[] | null;
  onSearchChange: (query: string) => void;
}

const TYPE_ICONS: Record<SearchResult['type'], typeof MagnifyingGlassIcon> = {
  threat: ExclamationTriangleIcon,
  process: CpuChipIcon,
  investigation: MagnifyingGlassCircleIcon,
  evidence: ClipboardDocumentListIcon,
  timeline: ClockIcon,
  report: DocumentTextIcon,
  provider: ServerIcon,
};

const TYPE_LABELS: Record<SearchResult['type'], string> = {
  threat: 'Threat',
  process: 'Process',
  investigation: 'Investigation',
  evidence: 'Evidence',
  timeline: 'Timeline',
  report: 'Report',
  provider: 'Provider',
};

function typeTone(type: SearchResult['type']): BadgeTone {
  switch (type) {
    case 'threat': return 'danger';
    case 'investigation': return 'warning';
    case 'evidence': return 'brand';
    case 'provider': return 'neutral';
    default: return 'neutral';
  }
}

export function SecuritySearchPanel({ query, results, onSearchChange }: SecuritySearchPanelProps) {
  const [filter, setFilter] = useState<'all' | SearchResult['type']>('all');

  const filtered = useMemo(() => {
    if (!results) return null;
    if (filter === 'all') return results;
    return results.filter((r) => r.type === filter);
  }, [results, filter]);

  const typeCounts = useMemo(() => {
    if (!results) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const r of results) {
      counts[r.type] = (counts[r.type] ?? 0) + 1;
    }
    return counts;
  }, [results]);

  return (
    <div className="space-y-4" data-testid="security-search-panel">
      {/* Search input */}
      <div className="flex items-center gap-2">
        <MagnifyingGlassIcon className="h-5 w-5 text-text-muted" aria-hidden />
        <input
          type="text"
          placeholder="Search threats, processes, investigations, evidence, timeline, reports, providers…"
          value={query}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
          aria-label="Search security data"
          autoFocus
          data-testid="security-search-input"
        />
      </div>

      {/* Type filters */}
      {results && results.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label={`All (${results.length})`} />
          {(Object.keys(TYPE_LABELS) as SearchResult['type'][]).map((type) => {
            const count = typeCounts[type] ?? 0;
            if (count === 0) return null;
            return (
              <FilterChip
                key={type}
                active={filter === type}
                onClick={() => setFilter(type)}
                label={`${TYPE_LABELS[type]} (${count})`}
              />
            );
          })}
        </div>
      )}

      {/* Results */}
      {query && !results && (
        <Card data-testid="search-loading">
          <div className="py-4 text-center text-sm text-text-secondary">Searching…</div>
        </Card>
      )}

      {query && results && results.length === 0 && (
        <Card data-testid="search-no-results">
          <div className="py-8 text-center">
            <MagnifyingGlassIcon className="h-10 w-10 text-text-muted mx-auto" aria-hidden />
            <p className="mt-3 text-sm font-medium text-text-primary">No results found</p>
            <p className="mt-1 text-xs text-text-muted">Try different keywords or check your spelling.</p>
          </div>
        </Card>
      )}

      {!query && (
        <Card data-testid="search-empty">
          <div className="py-8 text-center">
            <MagnifyingGlassIcon className="h-10 w-10 text-text-muted mx-auto" aria-hidden />
            <p className="mt-3 text-sm font-medium text-text-primary">Search Security Data</p>
            <p className="mt-1 text-xs text-text-muted">
              Search across threats, processes, investigations, evidence, timeline, reports, and providers.
            </p>
          </div>
        </Card>
      )}

      {filtered && filtered.length > 0 && (
        <div className="space-y-2" data-testid="search-results">
          {filtered.map((result) => {
            const Icon = TYPE_ICONS[result.type];
            return (
              <Card key={`${result.type}-${result.id}`} data-testid={`search-result-${result.type}-${result.id}`}>
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{result.title}</span>
                      <Badge tone={typeTone(result.type)}>{TYPE_LABELS[result.type]}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-text-secondary truncate">{result.description}</p>
                    <div className="mt-1 flex items-center gap-3 text-[10px] text-text-muted">
                      <span>{new Date(result.timestamp).toLocaleString()}</span>
                      <span>Relevance: {(result.relevance * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? 'rounded-md bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary'
          : 'rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-muted'
      }
      data-testid={`search-filter-${label.toLowerCase().replace(/[^a-z]/g, '')}`}
    >
      {label}
    </button>
  );
}
