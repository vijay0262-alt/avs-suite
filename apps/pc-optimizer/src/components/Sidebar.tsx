import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo, type ComponentType } from 'react';
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
  ComputerDesktopIcon,
  ShieldExclamationIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  ArchiveBoxXMarkIcon,
  ArrowPathIcon,
  KeyIcon,
  ClipboardDocumentListIcon,
  DocumentChartBarIcon,
  CircleStackIcon,
  HeartIcon,
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
      { id: 'hardware-center', to: '/hardware-center', labelKey: 'nav.hardwareCenter', Icon: ComputerDesktopIcon },
      { id: 'security-dashboard', to: '/security-dashboard', labelKey: 'nav.securityDashboard', Icon: ShieldExclamationIcon },
      { id: 'process-intelligence', to: '/process-intelligence', labelKey: 'nav.processIntelligence', Icon: CircleStackIcon },
      { id: 'predictive-health', to: '/predictive-health', labelKey: 'nav.predictiveHealth', Icon: HeartIcon },
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


function NavSectionView({
  section,
  guard,
  t,
}: {
  section: NavSection;
  guard: ReturnType<typeof useFeatureGuard>['guard'];
  t: (key: string) => string;
}) {
  return (
    <div data-testid={`sidebar-section-${section.id}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted/70">
        {t(section.labelKey)}
      </span>
      <div className="flex flex-col gap-0.5">
        {section.entries.map(({ id, to, labelKey, Icon, feature }) => {
          const locked = feature ? !canUse(feature) : false;

          if (locked) {
            return (
              <button
                key={id}
                data-testid={`sidebar-link-${id}`}
                onClick={() => feature && guard(feature, t(labelKey), () => {})}
                className={clsx(
                  'group relative flex w-full items-center gap-3 rounded-[var(--avs-radius-md)] px-3 py-2 text-[13px] font-medium',
                  'transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]',
                  'text-text-muted hover:bg-[var(--avs-surface-muted)] hover:text-text-secondary',
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                <span className="truncate flex-1 text-left">{t(labelKey)}</span>
                <LockClosedIcon className="h-3.5 w-3.5 shrink-0 text-text-muted/60" aria-hidden />
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
                    'group relative flex items-center gap-3 rounded-[var(--avs-radius-md)] px-3 py-2 text-[13px] font-medium',
                    'transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]',
                    'outline-none focus-visible:shadow-[var(--avs-focus-ring)]',
                    isActive
                      ? 'text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-[var(--avs-surface-muted)]',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span
                        className="absolute inset-0 rounded-[var(--avs-radius-md)] bg-[var(--avs-glass-bg)] border border-[var(--avs-glass-border)] shadow-[var(--avs-shadow-glow)]"
                        aria-hidden
                      />
                    )}
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-gradient-to-b from-brand-primary to-brand-secondary"
                        aria-hidden
                      />
                    )}
                    <Icon
                      className={clsx(
                        'relative h-[18px] w-[18px] shrink-0 transition-colors',
                        isActive ? 'text-brand-primary' : 'text-text-muted group-hover:text-text-secondary',
                      )}
                      aria-hidden
                    />
                    <span className="relative truncate">{t(labelKey)}</span>
                  </>
                )}
              </NavLink>
            );
          })}
      </div>
    </div>
  );
}

/**
 * Persistent sidebar navigation with grouped sections.
 * Modules with a `feature` prop are gated by the license edition —
 * locked modules show a lock icon and trigger the UpgradeDialog on click.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { guard, dialogElement } = useFeatureGuard();

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
      className="w-60 shrink-0 border-r border-[var(--avs-glass-border)] bg-[var(--avs-glass-bg)] backdrop-blur-[var(--avs-glass-blur)] px-3 py-4 overflow-y-auto"
      data-testid="app-sidebar"
      aria-label="Sidebar navigation"
    >
      <div className="mb-4">
        <GlobalSearch entries={allEntries} />
      </div>
      <nav aria-label="Primary navigation" className="flex flex-col gap-3">
        {NAV_SECTIONS.map((section) => (
          <NavSectionView
            key={section.id}
            section={section}
            guard={guard}
            t={t}
          />
        ))}
      </nav>
      {dialogElement}
    </aside>
  );
}
