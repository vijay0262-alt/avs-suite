import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMemo, type ComponentType } from 'react';
import clsx from 'clsx';
import { GlobalSearch } from './GlobalSearch';
import {
  Squares2X2Icon,
  ShieldExclamationIcon,
  TrashIcon,
  RocketLaunchIcon,
  DocumentDuplicateIcon,
  ChartBarIcon,
  BoltIcon,
  CpuChipIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  InformationCircleIcon,
  WrenchScrewdriverIcon,
  ArchiveBoxXMarkIcon,
  ArrowPathIcon,
  KeyIcon,
  DocumentChartBarIcon,
  MagnifyingGlassIcon,
  GlobeAltIcon,
  LifebuoyIcon,
  ArrowUpTrayIcon,
  FolderOpenIcon,
  BellIcon,
  ArrowPathRoundedSquareIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
  FireIcon,
  ArrowDownTrayIcon,
  CircleStackIcon,
  PuzzlePieceIcon,
  WifiIcon,
  ClipboardDocumentListIcon,
  LockClosedIcon,
  SparklesIcon,
  PauseIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import type { NavItemId } from '@avs/shared/types';
import { useIsPro } from '../features/sync/syncStore';
import { useLiveScores } from '../features/health/LiveSyncService';

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
      { id: 'protection-center', to: '/protection-center', labelKey: 'nav.protectionCenter', Icon: ShieldExclamationIcon },
      { id: 'ai-smart-optimize', to: '/ai-smart-optimize', labelKey: 'nav.aiSmartOptimize', Icon: BoltIcon, proEnhanced: true },
      { id: 'ai-smart-security', to: '/ai-smart-security', labelKey: 'nav.aiSmartSecurity', Icon: ShieldCheckIcon },
      { id: 'auto-care', to: '/auto-care', labelKey: 'nav.autoCare', Icon: SparklesIcon, proEnhanced: true },
      { id: 'workload', to: '/workload', labelKey: 'nav.workload', Icon: CpuChipIcon, proEnhanced: true },
      { id: 'predictive', to: '/predictive', labelKey: 'nav.predictive', Icon: ChartBarIcon, proEnhanced: true },
      { id: 'smart-notifications', to: '/smart-notifications', labelKey: 'nav.smartNotifications', Icon: BellIcon, proEnhanced: true },
      { id: 'app-freezer', to: '/app-freezer', labelKey: 'nav.appFreezer', Icon: PauseIcon, proEnhanced: true },
      { id: 'self-learning', to: '/self-learning', labelKey: 'nav.selfLearning', Icon: AcademicCapIcon, proEnhanced: true },
      { id: 'anomaly', to: '/anomaly', labelKey: 'nav.anomaly', Icon: ShieldExclamationIcon, proEnhanced: true },
    ],
  },
  // ── SYSTEM HEALTH — V1.0: Hidden to simplify the app.
  // System Health, Hardware Center, Process Intelligence, Predictive Health,
  // and Performance Analytics are kept in the codebase but hidden from the
  // sidebar. Users already have plenty of info on the Dashboard.
  // {
  //   id: 'system-health',
  //   labelKey: 'nav.section.systemHealth',
  //   entries: [
  //     { id: 'system-health', to: '/system-health', labelKey: 'nav.systemHealth', Icon: HeartIcon },
  //     { id: 'hardware-center', to: '/hardware-center', labelKey: 'nav.hardwareCenter', Icon: ComputerDesktopIcon },
  //     { id: 'process-intelligence', to: '/process-intelligence', labelKey: 'nav.processIntelligence', Icon: CpuChipIcon },
  //     { id: 'predictive-health', to: '/predictive-health', labelKey: 'nav.predictiveHealth', Icon: ArrowTrendingUpIcon },
  //     { id: 'performance-analytics', to: '/performance-analytics', labelKey: 'nav.performanceAnalytics', Icon: ChartBarIcon, proEnhanced: true },
  //   ],
  // },
  // ── OPTIMIZATION — V1.0: Moved above Security per user request. ──
  {
    id: 'optimization',
    labelKey: 'nav.section.optimization',
    entries: [
      { id: 'junk-cleaner', to: '/junk-cleaner', labelKey: 'nav.junkCleaner', Icon: TrashIcon },
      { id: 'startup-manager', to: '/startup-manager', labelKey: 'nav.startupManager', Icon: RocketLaunchIcon },
      { id: 'browser-cleaner', to: '/browser-cleaner', labelKey: 'nav.browserCleaner', Icon: GlobeAltIcon, proEnhanced: true },
      { id: 'browser-extensions', to: '/browser-extensions', labelKey: 'nav.browserExtensions', Icon: PuzzlePieceIcon, proEnhanced: true },
      { id: 'registry-cleaner', to: '/registry-cleaner', labelKey: 'nav.registryCleaner', Icon: WrenchScrewdriverIcon },
      { id: 'duplicate-finder', to: '/duplicate-finder', labelKey: 'nav.duplicateFinder', Icon: DocumentDuplicateIcon, proEnhanced: true },
      { id: 'uninstaller', to: '/uninstaller', labelKey: 'nav.uninstaller', Icon: ArchiveBoxXMarkIcon, proEnhanced: true },
      { id: 'software-updater', to: '/software-updater', labelKey: 'nav.softwareUpdater', Icon: ArrowPathIcon, proEnhanced: true },
      { id: 'disk-analyzer', to: '/disk-analyzer', labelKey: 'nav.diskAnalyzer', Icon: ChartBarIcon, proEnhanced: true },
      { id: 'recovery-center', to: '/recovery-center', labelKey: 'nav.recoveryCenter', Icon: LifebuoyIcon },
    ],
  },
  // ── SECURITY — V1.0: Moved below Optimization per user request. ──
  {
    id: 'security',
    labelKey: 'nav.section.security',
    entries: [
      { id: 'quick-scan', to: '/quick-scan', labelKey: 'nav.quickScan', Icon: MagnifyingGlassIcon },
      { id: 'full-scan', to: '/full-scan', labelKey: 'nav.fullScan', Icon: ShieldCheckIcon },
      { id: 'custom-scan', to: '/custom-scan', labelKey: 'nav.customScan', Icon: FolderOpenIcon },
      { id: 'pup-scanner', to: '/pup-scanner', labelKey: 'nav.pupScanner', Icon: ShieldExclamationIcon, proEnhanced: true },
      { id: 'quarantine', to: '/quarantine-vault', labelKey: 'nav.quarantine', Icon: LockClosedIcon, proEnhanced: true },
    ],
  },
  // ── REPORTS ───────────────────────────────────────────────────
  {
    id: 'reports',
    labelKey: 'nav.section.reports',
    entries: [
      { id: 'reports', to: '/reports', labelKey: 'nav.reports', Icon: DocumentChartBarIcon },
    ],
  },
  // ── TOOLS ─────────────────────────────────────────────────────
  {
    id: 'tools',
    labelKey: 'nav.section.tools',
    entries: [
      { id: 'system-information', to: '/system-information', labelKey: 'nav.systemInformation', Icon: CpuChipIcon },
      { id: 'driver-updater', to: '/driver-updater', labelKey: 'nav.driverUpdater', Icon: ArrowDownTrayIcon, proEnhanced: true },
      { id: 'disk-optimizer', to: '/disk-optimizer', labelKey: 'nav.diskOptimizer', Icon: CircleStackIcon, proEnhanced: true },
      { id: 'network-optimizer', to: '/network-optimizer', labelKey: 'nav.networkOptimizer', Icon: WifiIcon, proEnhanced: true },
      { id: 'context-menu', to: '/context-menu', labelKey: 'nav.contextMenu', Icon: ClipboardDocumentListIcon, proEnhanced: true },
      { id: 'file-shredder', to: '/file-shredder', labelKey: 'nav.fileShredder', Icon: FireIcon, proEnhanced: true },
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
    if (entry.id === 'upgrade' && isPro) return false;
    return true;
  });

  if (entries.length === 0) return null;

  return (
    <div data-testid={`sidebar-section-${section.id}`}>
      <span className="text-micro font-semibold uppercase tracking-[var(--avs-tracking-widest)] text-text-muted/60 px-3">
        {t(section.labelKey)}
      </span>
      <div className="flex flex-col gap-0.5 mt-1.5">
        {entries.map(({ id, to, labelKey, Icon, proEnhanced }) => (
          <NavLink
            key={id}
            to={to}
            data-testid={`sidebar-link-${id}`}
            className={({ isActive }) =>
              clsx(
                'group relative flex items-center gap-3 rounded-[var(--avs-radius-md)] px-3 py-2 text-small font-medium',
                'transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]',
                'outline-none focus-visible:shadow-focus',
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
                    className="absolute inset-0 rounded-[var(--avs-radius-md)] bg-[var(--avs-glass-bg)] border border-[var(--avs-glass-border)] shadow-glow"
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
                    'relative h-5 w-5 shrink-0 transition-colors',
                    isActive ? 'text-brand-primary' : 'text-text-muted group-hover:text-text-secondary',
                  )}
                  aria-hidden
                />
                <span className="relative truncate flex-1">{t(labelKey)}</span>
                {proEnhanced && !isPro && (
                  <StarIcon
                    className="relative h-3.5 w-3.5 shrink-0 text-semantic-warning/70"
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
  const liveScores = useLiveScores();

  const allEntries = useMemo(
    () => NAV_SECTIONS.flatMap((s) => s.entries).map((e) => ({
      id: e.id as string,
      to: e.to,
      label: e.labelKey,
      keywords: e.labelKey,
    })),
    [],
  );

  const scoreColor = liveScores.healthScore >= 80
    ? 'text-[var(--avs-success)]'
    : liveScores.healthScore >= 60
    ? 'text-[var(--avs-warning)]'
    : 'text-[var(--avs-danger)]';

  return (
    <aside
      className="w-60 shrink-0 border-r border-[var(--avs-border)] bg-[var(--avs-glass-bg)] backdrop-blur-[var(--avs-glass-blur)] px-3 py-4 overflow-y-auto"
      data-testid="app-sidebar"
      aria-label="Sidebar navigation"
    >
      <div className="mb-5">
        <GlobalSearch entries={allEntries} />
      </div>
      <nav aria-label="Primary navigation" className="flex flex-col gap-4">
        {NAV_SECTIONS.map((section) => (
          <NavSectionView
            key={section.id}
            section={section}
            isPro={isPro}
            t={t}
          />
        ))}
      </nav>
      {liveScores.healthScore > 0 && (
        <div className="mt-4 border-t border-[var(--avs-border)] pt-3">
          <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
            <span className="text-caption text-[var(--avs-text-muted)]">PC Health</span>
            <span className={`text-body font-bold ${scoreColor}`} data-testid="sidebar-health-score">
              {liveScores.healthScore}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
