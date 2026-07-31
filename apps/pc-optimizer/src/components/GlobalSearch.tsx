import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, ClockIcon } from '@heroicons/react/24/outline';

export interface SearchEntry {
  id: string;
  to: string;
  label: string;
  keywords: string;
  category?: string;
}

const SETTINGS_ENTRIES: SearchEntry[] = [
  { id: 'settings', to: '/settings', label: 'Settings', keywords: 'settings preferences options appearance theme language updates telemetry', category: 'Settings' },
  { id: 'settings-appearance', to: '/settings', label: 'Appearance Settings', keywords: 'appearance theme light dark system mode', category: 'Settings' },
  { id: 'settings-updates', to: '/settings', label: 'Update Preferences', keywords: 'updates check download install channel stable', category: 'Settings' },
  { id: 'settings-account', to: '/settings', label: 'Account & License', keywords: 'account license subscription entitlement edition upgrade professional', category: 'Settings' },
  { id: 'settings-developer', to: '/settings', label: 'Developer Mode', keywords: 'developer verification logs rpc debug', category: 'Settings' },
];

const ACTION_ENTRIES: SearchEntry[] = [
  { id: 'action-scan', to: '/dashboard', label: 'Run Health Scan', keywords: 'scan health check system analyze optimize improve', category: 'Action' },
  { id: 'action-junk-clean', to: '/junk-cleaner', label: 'Clean Junk Files', keywords: 'clean junk temp files cache clutter remove delete', category: 'Action' },
  { id: 'action-registry-fix', to: '/registry-cleaner', label: 'Fix Registry Issues', keywords: 'fix registry issues repair clean', category: 'Action' },
  { id: 'action-startup-manage', to: '/startup-manager', label: 'Manage Startup Programs', keywords: 'startup manage disable enable boot launch programs', category: 'Action' },
  { id: 'action-privacy-clean', to: '/privacy-cleaner', label: 'Clean Privacy Traces', keywords: 'privacy clean traces browser history cookies', category: 'Action' },
  { id: 'action-disk-analyze', to: '/disk-analyzer', label: 'Analyze Disk Usage', keywords: 'disk analyze usage space storage large files folders', category: 'Action' },
  { id: 'action-duplicate-find', to: '/duplicate-finder', label: 'Find Duplicate Files', keywords: 'duplicate finder copies files redundant', category: 'Action' },
  { id: 'action-uninstall', to: '/uninstaller', label: 'Uninstall Applications', keywords: 'uninstall remove programs applications', category: 'Action' },
  { id: 'action-performance', to: '/performance', label: 'Optimize Performance', keywords: 'performance optimize boost speed tuning gaming work battery', category: 'Action' },
  { id: 'action-reports', to: '/reports', label: 'View Reports', keywords: 'reports history maintenance optimization results', category: 'Action' },
  { id: 'action-about', to: '/about', label: 'About AVS Shield', keywords: 'about version build channel help support', category: 'Action' },
];

const RECENT_KEY = 'avs-recent-searches';
const MAX_RECENT = 5;

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
}

function saveRecentSearch(query: string): void {
  try {
    const existing = loadRecentSearches();
    const filtered = existing.filter((s) => s !== query);
    const updated = [query, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch { /* ignore */ }
}

interface GlobalSearchProps {
  entries?: SearchEntry[];
}

export function GlobalSearch({ entries: navEntries }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecentSearches);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allEntries = useCallback((): SearchEntry[] => {
    const nav = (navEntries ?? []).map((e) => ({ ...e, category: e.category ?? 'Modules' }));
    return [...nav, ...SETTINGS_ENTRIES, ...ACTION_ENTRIES];
  }, [navEntries]);

  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? allEntries().filter((e) =>
        e.keywords.toLowerCase().includes(normalized) ||
        e.label.toLowerCase().includes(normalized),
      )
    : [];

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const select = (to: string) => {
    navigate(to);
    if (normalized) {
      saveRecentSearch(normalized);
      setRecentSearches(loadRecentSearches());
    }
    setQuery('');
    setOpen(false);
  };

  const selectRecent = (term: string) => {
    setQuery(term);
    inputRef.current?.focus();
  };

  const onKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[highlighted]) {
      e.preventDefault();
      select(results[highlighted]!.to);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const showRecent = open && !normalized && recentSearches.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search modules, settings, and actions"
          placeholder="Search…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDownInput}
          className="w-full rounded-md bg-bg-secondary border border-border py-1.5 pl-9 pr-7 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-block rounded bg-bg px-1.5 py-0.5 text-[10px] text-text-muted">
          Ctrl+K
        </kbd>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-surface shadow-lg overflow-hidden">
          {showRecent ? (
            <div data-testid="search-recent">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted flex items-center gap-1.5">
                <ClockIcon className="h-3 w-3" aria-hidden />
                Recent Searches
              </div>
              <ul role="listbox">
                {recentSearches.map((term) => (
                  <li key={term}>
                    <button
                      role="option"
                      onClick={() => selectRecent(term)}
                      className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <ClockIcon className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                        {term}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : normalized === '' ? (
            <div className="px-3 py-2 text-xs text-text-muted">Type to find a module, setting, or action — e.g. startup, disk, clean</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            <ul role="listbox" className="max-h-72 overflow-y-auto" data-testid="search-results">
              {results.map((entry, index) => (
                <li key={entry.id}>
                  <button
                    role="option"
                    aria-selected={index === highlighted}
                    onClick={() => select(entry.to)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      index === highlighted ? 'bg-brand-primary text-white' : 'text-text-primary hover:bg-bg-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{entry.label}</span>
                      {entry.category && (
                        <span className={`text-[10px] uppercase tracking-wider ${index === highlighted ? 'text-white/70' : 'text-text-muted'}`}>
                          {entry.category}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
