import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
} from '@heroicons/react/24/outline';
import type { NavItemId } from '@avs/shared/types';
import type { ComponentType } from 'react';
import { canUse } from '../features/licensing/FeatureGate';
import type { ManagedFeature } from '@avs/licensing';
import { useFeatureGuard } from '../features/licensing/useFeatureGuard';

interface NavEntry {
  id: NavItemId;
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
  /** Feature required to unlock this module. If absent, always available. */
  feature?: ManagedFeature;
}

const NAV: readonly NavEntry[] = [
  { id: 'dashboard', to: '/dashboard', labelKey: 'nav.dashboard', Icon: Squares2X2Icon },
  { id: 'junk-cleaner', to: '/junk-cleaner', labelKey: 'nav.junkCleaner', Icon: TrashIcon },
  { id: 'registry-cleaner', to: '/registry-cleaner', labelKey: 'nav.registryCleaner', Icon: WrenchScrewdriverIcon },
  { id: 'startup-manager', to: '/startup-manager', labelKey: 'nav.startupManager', Icon: RocketLaunchIcon },
  { id: 'privacy-cleaner', to: '/privacy-cleaner', labelKey: 'nav.privacyCleaner', Icon: LockClosedIcon, feature: 'privacy.scan' },
  { id: 'duplicate-finder', to: '/duplicate-finder', labelKey: 'nav.duplicateFinder', Icon: DocumentDuplicateIcon, feature: 'duplicate.scan' },
  { id: 'disk-analyzer', to: '/disk-analyzer', labelKey: 'nav.diskAnalyzer', Icon: ChartBarIcon, feature: 'disk.analyzer' },
  { id: 'uninstaller', to: '/uninstaller', labelKey: 'nav.uninstaller', Icon: ArchiveBoxXMarkIcon, feature: 'uninstaller.view' },
  { id: 'software-updater', to: '/software-updater', labelKey: 'nav.softwareUpdater', Icon: ArrowPathIcon, feature: 'software.update_scan' },
  { id: 'performance', to: '/performance', labelKey: 'nav.performance', Icon: BoltIcon, feature: 'performance.optimize' },
  { id: 'system-information', to: '/system-information', labelKey: 'nav.systemInformation', Icon: CpuChipIcon },
  { id: 'maintenance-history', to: '/maintenance-history', labelKey: 'nav.maintenanceHistory', Icon: ClipboardDocumentListIcon },
  { id: 'reports', to: '/reports', labelKey: 'nav.reports', Icon: DocumentChartBarIcon },
  { id: 'license', to: '/license', labelKey: 'nav.license', Icon: KeyIcon },
  { id: 'settings', to: '/settings', labelKey: 'nav.settings', Icon: Cog6ToothIcon },
  { id: 'about', to: '/about', labelKey: 'nav.about', Icon: InformationCircleIcon },
];

/**
 * Persistent sidebar navigation. Populated declaratively from `NAV`.
 * Modules with a `feature` prop are gated by the license edition —
 * locked modules show a lock icon and trigger the UpgradeDialog on click.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const { guard, dialogElement } = useFeatureGuard();

  return (
    <aside
      className="w-60 shrink-0 border-r border-border bg-surface px-3 py-4 overflow-y-auto"
      data-testid="app-sidebar"
    >
      <div className="mb-4">
        <GlobalSearch />
      </div>
      <nav aria-label="Primary navigation" className="flex flex-col gap-1">
        {NAV.map(({ id, to, labelKey, Icon, feature }) => {
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
      </nav>
      {dialogElement}
    </aside>
  );
}
