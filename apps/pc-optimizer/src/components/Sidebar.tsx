import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo, type ComponentType } from 'react';
import clsx from 'clsx';
import { GlobalSearch } from './GlobalSearch';
import {
  Squares2X2Icon,
  TrashIcon,
  RocketLaunchIcon,
  DocumentDuplicateIcon,
  ChartBarIcon,
  BoltIcon,
  CpuChipIcon,
  ComputerDesktopIcon,
  ShieldCheckIcon,
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
  MagnifyingGlassIcon,
  GlobeAltIcon,
  ClockIcon,
  LifebuoyIcon,
  ArrowTrendingUpIcon,
  ArrowUpTrayIcon,
  FolderOpenIcon,
  BellIcon,
  DocumentArrowDownIcon,
  ArrowPathRoundedSquareIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import type { NavItemId } from '@avs/shared/types';
import { useIsPro } from '../features/sync/syncStore';

interface NavEntry {
  id: NavItemId;
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
  /** If true, shows a subtle star badge for Pro-enhanced capabilities. Navigation is never blocked. */
  proEnhanced?: boolean;
}

interface NavSection {
  id: string;
  labelKey: string;
  entries: readonly NavEntry[];
}

const NAV_SECTIONS: readonly NavSection[] = [
  // ── HOME ──────────────────────────────────────────────────────
  {
    id: 'home',
    labelKey: 'nav.section.home',
    entries: [
      { id: 'dashboard', to: '/dashboard', labelKey: 'nav.dashboard', Icon: Squares2X2Icon },
      { id: 'ai-smart-optimize', to: '/ai-smart-optimize', labelKey: 'nav.aiSmartOptimize', Icon: BoltIcon, proEnhanced: true },
      { id: 'ai-smart-security', to: '/ai-smart-security', labelKey: 'nav.aiSmartSecurity', Icon: ShieldCheckIcon },
      // AI Assistant and AI Daily Briefing disabled — replaced by AI Smart Security
      // { id: 'ai-assistant', to: '/ai-assistant', labelKey: 'nav.aiAssistant', Icon: SparklesIcon },
      // { id: 'ai-daily-briefing', to: '/ai-daily-briefing', labelKey: 'nav.aiDailyBriefing', Icon: LightBulbIcon },
      // AI Workspace disabled — kept in codebase for future use
      // { id: 'ai-workspace', to: '/ai-workspace', labelKey: 'nav.aiWorkspace', Icon: CommandLineIcon },
    ],
  },
  // ── SYSTEM HEALTH ─────────────────────────────────────────────
  {
    id: 'system-health',
    labelKey: 'nav.section.systemHealth',
    entries: [
      { id: 'system-health', to: '/system-health', labelKey: 'nav.systemHealth', Icon: HeartIcon },
      { id: 'hardware-center', to: '/hardware-center', labelKey: 'nav.hardwareCenter', Icon: ComputerDesktopIcon },
      { id: 'process-intelligence', to: '/process-intelligence', labelKey: 'nav.processIntelligence', Icon: CpuChipIcon },
      { id: 'predictive-health', to: '/predictive-health', labelKey: 'nav.predictiveHealth', Icon: ArrowTrendingUpIcon },
      { id: 'performance-analytics', to: '/performance-analytics', labelKey: 'nav.performanceAnalytics', Icon: ChartBarIcon, proEnhanced: true },
    ],
  },
  // ── SECURITY ──────────────────────────────────────────────────
  {
    id: 'security',
    labelKey: 'nav.section.security',
    entries: [
      { id: 'quick-scan', to: '/quick-scan', labelKey: 'nav.quickScan', Icon: MagnifyingGlassIcon },
      { id: 'full-scan', to: '/full-scan', labelKey: 'nav.fullScan', Icon: ShieldCheckIcon },
      { id: 'custom-scan', to: '/custom-scan', labelKey: 'nav.customScan', Icon: FolderOpenIcon },
    ],
  },
  // ── OPTIMIZATION ──────────────────────────────────────────────
  {
    id: 'optimization',
    labelKey: 'nav.section.optimization',
    entries: [
      { id: 'junk-cleaner', to: '/junk-cleaner', labelKey: 'nav.junkCleaner', Icon: TrashIcon },
      { id: 'startup-manager', to: '/startup-manager', labelKey: 'nav.startupManager', Icon: RocketLaunchIcon },
      { id: 'browser-cleaner', to: '/browser-cleaner', labelKey: 'nav.browserCleaner', Icon: GlobeAltIcon, proEnhanced: true },
      { id: 'registry-cleaner', to: '/registry-cleaner', labelKey: 'nav.registryCleaner', Icon: WrenchScrewdriverIcon },
      { id: 'duplicate-finder', to: '/duplicate-finder', labelKey: 'nav.duplicateFinder', Icon: DocumentDuplicateIcon, proEnhanced: true },
      { id: 'large-files', to: '/large-files', labelKey: 'nav.largeFiles', Icon: CircleStackIcon },
      { id: 'uninstaller', to: '/uninstaller', labelKey: 'nav.uninstaller', Icon: ArchiveBoxXMarkIcon, proEnhanced: true },
      { id: 'software-updater', to: '/software-updater', labelKey: 'nav.softwareUpdater', Icon: ArrowPathIcon, proEnhanced: true },
      { id: 'maintenance-history', to: '/maintenance-history', labelKey: 'nav.maintenanceHistory', Icon: ClipboardDocumentListIcon, proEnhanced: true },
      { id: 'disk-analyzer', to: '/disk-analyzer', labelKey: 'nav.diskAnalyzer', Icon: ChartBarIcon, proEnhanced: true },
      { id: 'recovery-center', to: '/recovery-center', labelKey: 'nav.recoveryCenter', Icon: LifebuoyIcon },
    ],
  },
  // ── REPORTS ───────────────────────────────────────────────────
  {
    id: 'reports',
    labelKey: 'nav.section.reports',
    entries: [
      { id: 'reports', to: '/reports', labelKey: 'nav.reports', Icon: DocumentChartBarIcon },
      { id: 'reports-timeline', to: '/reports-timeline', labelKey: 'nav.reportsTimeline', Icon: ClockIcon },
      { id: 'analytics', to: '/analytics', labelKey: 'nav.analytics', Icon: ChartBarIcon },
      { id: 'export-center', to: '/export-center', labelKey: 'nav.exportCenter', Icon: DocumentArrowDownIcon },
    ],
  },
  // ── TOOLS ─────────────────────────────────────────────────────
  {
    id: 'tools',
    labelKey: 'nav.section.tools',
    entries: [
      { id: 'system-information', to: '/system-information', labelKey: 'nav.systemInformation', Icon: CpuChipIcon },
      // Network Information hidden — backend module unavailable
      // { id: 'network-information', to: '/network-information', labelKey: 'nav.networkInformation', Icon: WifiIcon },
      { id: 'restoration', to: '/restoration', labelKey: 'nav.restoration', Icon: ArrowPathRoundedSquareIcon },
    ],
  },
  // ── ACCOUNT ───────────────────────────────────────────────────
  {
    id: 'account',
    labelKey: 'nav.section.account',
    entries: [
      { id: 'license', to: '/license', labelKey: 'nav.license', Icon: KeyIcon },
      { id: 'upgrade', to: '/upgrade', labelKey: 'nav.upgrade', Icon: ArrowUpTrayIcon },
      { id: 'settings', to: '/settings', labelKey: 'nav.settings', Icon: Cog6ToothIcon },
      { id: 'notifications', to: '/notifications', labelKey: 'nav.notifications', Icon: BellIcon },
      { id: 'help-support', to: '/help-support', labelKey: 'nav.helpSupport', Icon: ChatBubbleLeftRightIcon },
      { id: 'about', to: '/about', labelKey: 'nav.about', Icon: InformationCircleIcon },
    ],
  },
];


function NavSectionView({
  section,
  isPro,
  t,
}: {
  section: NavSection;
  isPro: boolean;
  t: (key: string) => string;
}) {
  const entries = section.entries.filter((entry) => {
    // Hide 'upgrade' entry for Pro users — they're already upgraded
    if (entry.id === 'upgrade' && isPro) return false;
    return true;
  });

  if (entries.length === 0) return null;

  return (
    <div data-testid={`sidebar-section-${section.id}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted/70">
        {t(section.labelKey)}
      </span>
      <div className="flex flex-col gap-0.5">
        {entries.map(({ id, to, labelKey, Icon, proEnhanced }) => (
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
                <span className="relative truncate flex-1">{t(labelKey)}</span>
                {proEnhanced && !isPro && (
                  <StarIcon
                    className="relative h-3 w-3 shrink-0 text-semantic-warning/70"
                    aria-label="Professional feature"
                    data-testid={`sidebar-pro-badge-${id}`}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

/**
 * Persistent sidebar navigation with grouped sections.
 * v2.0 navigation with Home, System Health, Security, Optimization,
 * Reports, Tools, and Account sections.
 * Pro-enhanced items show a subtle star badge in Free edition.
 * All items are navigable in all editions — no locks, no hidden pages.
 */
export function Sidebar() {
  const { t } = useTranslation();
  const isPro = useIsPro();

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
            isPro={isPro}
            t={t}
          />
        ))}
      </nav>
    </aside>
  );
}
