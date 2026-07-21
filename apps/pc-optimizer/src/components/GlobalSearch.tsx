import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface SearchEntry {
  id: string;
  to: string;
  label: string;
  keywords: string;
}

const ENTRIES: SearchEntry[] = [
  { id: 'dashboard', to: '/dashboard', label: 'Dashboard', keywords: 'dashboard health score overview' },
  { id: 'junk-cleaner', to: '/junk-cleaner', label: 'Junk Cleaner', keywords: 'junk cleaner temp files cache clutter scan' },
  { id: 'registry-cleaner', to: '/registry-cleaner', label: 'Registry Cleaner', keywords: 'registry cleaner issues' },
  { id: 'startup-manager', to: '/startup-manager', label: 'Startup Manager', keywords: 'startup manager boot launch' },
  { id: 'privacy-cleaner', to: '/privacy-cleaner', label: 'Privacy Cleaner', keywords: 'privacy cleaner tracks traces' },
  { id: 'duplicate-finder', to: '/duplicate-finder', label: 'Duplicate Finder', keywords: 'duplicate finder copies' },
  { id: 'disk-analyzer', to: '/disk-analyzer', label: 'Disk Analyzer', keywords: 'disk analyzer storage space' },
  { id: 'uninstaller', to: '/uninstaller', label: 'Uninstaller', keywords: 'uninstaller remove programs' },
  { id: 'software-updater', to: '/software-updater', label: 'Software Updater', keywords: 'software updater updates' },
  { id: 'performance', to: '/performance', label: 'Performance', keywords: 'performance speed boost optimize' },
  { id: 'system-information', to: '/system-information', label: 'System Information', keywords: 'system information info cpu memory ram network os graphics' },
  { id: 'settings', to: '/settings', label: 'Settings', keywords: 'settings preferences options' },
  { id: 'about', to: '/about', label: 'About', keywords: 'about license help' },
  { id: 'diagnostics', to: '/diagnostics', label: 'Diagnostics', keywords: 'diagnostics logs debug' },
];

export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalized = query.trim().toLowerCase();
  const results = normalized
    ? ENTRIES.filter((e) => e.keywords.toLowerCase().includes(normalized) || e.label.toLowerCase().includes(normalized))
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
    setQuery('');
    setOpen(false);
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
      select(results[highlighted].to);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          aria-label="Search modules"
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
          {query === '' ? (
            <div className="px-3 py-2 text-xs text-text-muted">Type to find a module, e.g. startup, disk, memory</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-xs text-text-muted">No results for “{query}”</div>
          ) : (
            <ul role="listbox" className="max-h-60 overflow-y-auto">
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
                    {entry.label}
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
