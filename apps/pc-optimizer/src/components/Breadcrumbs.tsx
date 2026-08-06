/**
 * Breadcrumbs — contextual navigation trail shown above page content.
 *
 * Derives the breadcrumb trail from the current route path.
 * Includes a back button for quick navigation.
 */
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useMemo } from 'react';

const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'protection-center': 'Protection Center',
  'ai-smart-optimize': 'AI Smart Optimize',
  'ai-smart-security': 'AI Smart Security',
  'system-health': 'System Health',
  'hardware-center': 'Hardware Center',
  'process-intelligence': 'Process Intelligence',
  'predictive-health': 'Predictive Health',
  'performance-analytics': 'Performance Analytics',
  'quick-scan': 'Quick Scan',
  'full-scan': 'Full Scan',
  'custom-scan': 'Custom Scan',
  'junk-cleaner': 'Junk Cleaner',
  'registry-cleaner': 'Registry Cleaner',
  'startup-manager': 'Startup Manager',
  'privacy-cleaner': 'Privacy Cleaner',
  'browser-cleaner': 'Browser Cleaner',
  'duplicate-finder': 'Duplicate Finder',
  'disk-analyzer': 'Disk Analyzer',
  'large-files': 'Large Files',
  'uninstaller': 'Uninstaller',
  'software-updater': 'Software Updater',
  'maintenance-history': 'Maintenance History',
  'recovery-center': 'Recovery Center',
  'system-information': 'System Information',
  'restoration': 'Restoration',
  'reports': 'Reports',
  'reports-timeline': 'Reports Timeline',
  'analytics': 'Analytics',
  'export-center': 'Export Center',
  'license': 'Account & License',
  'upgrade': 'Upgrade',
  'settings': 'Settings',
  'notifications': 'Notifications',
  'help-support': 'Help & Support',
  'about': 'About',
  'security': 'Security',
  'security-center': 'Security Center',
  'performance': 'Performance',
  'diagnostics': 'Diagnostics',
};

interface Crumb {
  label: string;
  path: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [];

  const crumbs: Crumb[] = [];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    const label = ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, path: acc });
  }
  return crumbs;
}

export function Breadcrumbs() {
  const location = useLocation();
  const navigate = useNavigate();

  const crumbs = useMemo(() => buildCrumbs(location.pathname), [location.pathname]);

  if (crumbs.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-2" data-testid="breadcrumbs">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 rounded-[var(--avs-radius-sm)] px-2 py-1 text-caption text-text-muted hover:text-text-primary hover:bg-[var(--avs-surface-muted)] transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)] focus:outline-none focus-visible:shadow-focus"
        aria-label="Go back"
        data-testid="breadcrumb-back"
      >
        <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
        <span>Back</span>
      </button>
      <div className="flex items-center gap-1 text-caption text-text-muted">
        {crumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center gap-1">
            {index > 0 && <ChevronRightIcon className="h-3 w-3 text-text-muted" aria-hidden />}
            {index < crumbs.length - 1 ? (
              <button
                onClick={() => navigate(crumb.path)}
                className="hover:text-text-primary transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)] focus:outline-none focus-visible:shadow-focus rounded px-0.5"
              >
                {crumb.label}
              </button>
            ) : (
              <span className="text-text-primary font-medium" aria-current="page">
                {crumb.label}
              </span>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}
