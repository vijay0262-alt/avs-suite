import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo, type ComponentType } from 'react';
import clsx from 'clsx';
import { GlobalSearch } from './GlobalSearch';
import {
  Squares2X2Icon,
  TrashIcon,
  RocketLaunchIcon,
  LockClosedIcon,
  DocumentDuplicateIcon,
  ChartBarIcon,
  BoltIcon,
  CpuChipIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  ArchiveBoxXMarkIcon,
  ArrowPathIcon,
  KeyIcon,
  ClipboardDocumentListIcon,
  DocumentChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { NavItemId } from '@avs/shared/types';
import { canUse } from '../features/licensing/FeatureGate';
import type { ManagedFeature } from '@avs/licensing';
import { useFeatureGuard } from '../features/licensing/useFeatureGuard';

interface NavEntry {
  id: NavItemId;
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
  feature?: ManagedFeature;
}

interface NavSection {
  id: string;
  labelKey: string;
  entries: readonly NavEntry[];
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    labelKey: 'nav.section.overview',
    entries: [
      { id: 'dashboard', to: '/dashboard', labelKey: 'nav.dashboard', Icon: Squares2X2Icon },
      { id: 'system-information', to: '/system-information', labelKey: 'nav.systemInformation', Icon: CpuChipIcon },
      { id: 'disk-analyzer', to: '/disk-analyzer', labelKey: 'nav.diskAnalyzer', Icon: ChartBarIcon, feature: 'disk.analyzer' },
    ],
  },
  {
    id: 'optimization',
    labelKey: 'nav.section.optimization',
    entries: [
      { id: 'junk-cleaner', to: '/junk-cleaner', labelKey: 'nav.junkCleaner', Icon: TrashIcon },
      { id: 'registry-cleaner', to: '/registry-cleaner', labelKey: 'nav.registryCleaner', Icon: WrenchScrewdriverIcon },
      { id: 'startup-manager', to: '/startup-manager', labelKey: 'nav.startupManager', Icon: RocketLaunchIcon },
      { id: 'privacy-cleaner', to: '/privacy-cleaner', labelKey: 'nav.privacyCleaner', Icon: LockClosedIcon, feature: 'privacy.scan' },
      { id: 'duplicate-finder', to: '/duplicate-finder', labelKey: 'nav.duplicateFinder', Icon: DocumentDuplicateIcon, feature: 'duplicate.scan' },
      { id: 'uninstaller', to: '/uninstaller', labelKey: 'nav.uninstaller', Icon: ArchiveBoxXMarkIcon, feature: 'uninstaller.view' },
      { id: 'software-updater', to: '/software-updater', labelKey: 'nav.softwareUpdater', Icon: ArrowPathIcon, feature: 'software.update_scan' },
      { id: 'performance', to: '/performance', labelKey: 'nav.performance', Icon: BoltIcon, feature: 'performance.optimize' },
    ],
  },
  {
    id: 'reports',
    labelKey: 'nav.section.reports',
    entries: [
      { id: 'maintenance-history', to: '/maintenance-history', labelKey: 'nav.maintenanceHistory', Icon: ClipboardDocumentListIcon },
      { id: 'reports', to: '/reports', labelKey: 'nav.reports', Icon: DocumentChartBarIcon },
    ],
  },
  {
    id: 'account',
    labelKey: 'nav.section.account',
    entries: [
      { id: 'license', to: '/license', labelKey: 'nav.license', Icon: KeyIcon },
      { id: 'settings', to: '/settings', labelKey: 'nav.settings', Icon: Cog6ToothIcon },
      { id: 'about', to: '/about', labelKey: 'nav.about', Icon: InformationCircleIcon },
    ],
  },
];

const COLLAPSED_KEY = 'avs-sidebar-collapsed-sections';

function loadCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveCollapsedSections(set: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

function NavSectionView({
  section,
  collapsed,
  onToggle,
  guard,
  t,
}: {
  section: NavSection;
  collapsed: boolean;
  onToggle: () => void;
  guard: ReturnType<typeof useFeatureGuard>['guard'];
  t: (key: string) => string;
}) {
  return (
    <div data-testid={`sidebar-section-${section.id}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors"
        aria-expanded={!collapsed}
        aria-label={t(section.labelKey)}
        data-testid={`sidebar-section-toggle-${section.id}`}
      >
        {collapsed ? (
          <ChevronRightIcon className="h-3 w-3 shrink-0" aria-hidden />
        ) : (
          <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden />
        )}
        <span>{t(section.labelKey)}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-0.5 mt-0.5">
          {section.entries.map(({ id, to, labelKey, Icon, feature }) => {
            const locked = feature ? !canUse(feature) : false;

            if (locked) {
              return (
                <button
                  key={id}
                  data-testid={`sidebar-link-${id}`}
                  onClick={() => feature && guard(feature, t(labelKey), () => {})}
                  className={clsx(
                    'group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                    'transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]',
                    'text-text-muted hover:bg-surface-muted hover:text-text-secondary',
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="truncate flex-1 text-left">{t(labelKey)}</span>
                  <LockClosedIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                </button>
              );
            }

            return (
              <NavLink
                key={id}
                to={to}
                data-testid={`sidebar-link-${id}`}
                className={({ isActive }) =>
                  clsx(
                    'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                    'transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]',
                    'outline-none focus-visible:shadow-[var(--avs-focus-ring)]',
                    isActive
                      ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_16%,transparent)] text-brand-primary'
                      : 'text-text-secondary hover:bg-surface-muted hover:text-text-primary',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="truncate">{t(labelKey)}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Persistent sidebar navigation with grouped, collapsible sections.
 * Modules with a `feature` prop are gated by the license edition —
 * locked modules show a lock icon and trigger the UpgradeDialog on click.
 * Section collapse state persists in localStorage.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { guard, dialogElement } = useFeatureGuard();
  const location = useLocation();

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(loadCollapsedSections);

  useEffect(() => {
    saveCollapsedSections(collapsedSections);
  }, [collapsedSections]);

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  // Auto-expand section containing the active route
  useEffect(() => {
    const activeSection = NAV_SECTIONS.find((s) =>
      s.entries.some((e) => location.pathname.startsWith(e.to)),
    );
    if (activeSection && collapsedSections.has(activeSection.id)) {
      setCollapsedSections((prev) => {
        const next = new Set(prev);
        next.delete(activeSection!.id);
        return next;
      });
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const allEntries = useMemo(
    () => NAV_SECTIONS.flatMap((s) => s.entries).map((e) => ({
      id: e.id as string,
      to: e.to,
      label: e.labelKey,
      keywords: e.labelKey,
    })),
    [],
  );

  return (
    <aside
      className="w-60 shrink-0 border-r border-border bg-surface px-3 py-4 overflow-y-auto"
      data-testid="app-sidebar"
      aria-label="Sidebar navigation"
    >
      <div className="mb-4">
        <GlobalSearch entries={allEntries} />
      </div>
      <nav aria-label="Primary navigation" className="flex flex-col gap-2">
        {NAV_SECTIONS.map((section) => (
          <NavSectionView
            key={section.id}
            section={section}
            collapsed={collapsedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            guard={guard}
            t={t}
          />
        ))}
      </nav>
      {dialogElement}
    </aside>
  );
}
