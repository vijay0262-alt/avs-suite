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
  ShieldCheckIcon,
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
  SparklesIcon,
  LightBulbIcon,
  MagnifyingGlassIcon,
  BugAntIcon,
  EyeIcon,
  GlobeAltIcon,
  BeakerIcon,
  ClockIcon,
  WifiIcon,
  LifebuoyIcon,
  ArrowTrendingUpIcon,
  ArrowUpTrayIcon,
  FolderOpenIcon,
  BellIcon,
  DocumentArrowDownIcon,
  CommandLineIcon,
  CodeBracketIcon,
  FingerPrintIcon,
  ServerStackIcon,
  CpuChipIcon as ChipIcon,
  ArrowPathRoundedSquareIcon,
  ClockIcon as HistoryIcon,
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
  // ── HOME ──────────────────────────────────────────────────────
  {
    id: 'home',
    labelKey: 'nav.section.home',
    entries: [
      { id: 'dashboard', to: '/dashboard', labelKey: 'nav.dashboard', Icon: Squares2X2Icon },
      { id: 'ai-copilot', to: '/ai-copilot', labelKey: 'nav.aiCopilot', Icon: SparklesIcon },
      { id: 'ai-daily-briefing', to: '/ai-daily-briefing', labelKey: 'nav.aiDailyBriefing', Icon: LightBulbIcon },
      { id: 'ai-smart-optimize', to: '/ai-smart-optimize', labelKey: 'nav.aiSmartOptimize', Icon: BoltIcon },
      { id: 'ai-workspace', to: '/ai-workspace', labelKey: 'nav.aiWorkspace', Icon: CommandLineIcon },
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
      { id: 'performance-analytics', to: '/performance-analytics', labelKey: 'nav.performanceAnalytics', Icon: ChartBarIcon },
    ],
  },
  // ── SECURITY ──────────────────────────────────────────────────
  {
    id: 'security',
    labelKey: 'nav.section.security',
    entries: [
      { id: 'security-center', to: '/security-center', labelKey: 'nav.securityCenter', Icon: ShieldCheckIcon },
      { id: 'quick-scan', to: '/quick-scan', labelKey: 'nav.quickScan', Icon: MagnifyingGlassIcon },
      { id: 'full-scan', to: '/full-scan', labelKey: 'nav.fullScan', Icon: ShieldCheckIcon },
      { id: 'custom-scan', to: '/custom-scan', labelKey: 'nav.customScan', Icon: FolderOpenIcon },
      { id: 'ai-active-protection', to: '/ai-active-protection', labelKey: 'nav.aiActiveProtection', Icon: ShieldExclamationIcon },
      { id: 'spyware-protection', to: '/spyware-protection', labelKey: 'nav.spywareProtection', Icon: EyeIcon },
      { id: 'malware-protection', to: '/malware-protection', labelKey: 'nav.malwareProtection', Icon: BugAntIcon },
      { id: 'adware-protection', to: '/adware-protection', labelKey: 'nav.adwareProtection', Icon: TrashIcon },
      { id: 'ransomware-protection', to: '/ransomware-protection', labelKey: 'nav.ransomwareProtection', Icon: LockClosedIcon },
      { id: 'browser-protection', to: '/browser-protection', labelKey: 'nav.browserProtection', Icon: GlobeAltIcon },
      { id: 'trojan-protection', to: '/trojan-protection', labelKey: 'nav.trojanProtection', Icon: BugAntIcon },
      { id: 'pup-protection', to: '/pup-protection', labelKey: 'nav.pupProtection', Icon: CircleStackIcon },
      { id: 'crypto-miner-protection', to: '/crypto-miner-protection', labelKey: 'nav.cryptoMinerProtection', Icon: CpuChipIcon },
      { id: 'script-protection', to: '/script-protection', labelKey: 'nav.scriptProtection', Icon: CodeBracketIcon },
      { id: 'keylogger-protection', to: '/keylogger-protection', labelKey: 'nav.keyloggerProtection', Icon: FingerPrintIcon },
      { id: 'rootkit-protection', to: '/rootkit-protection', labelKey: 'nav.rootkitProtection', Icon: ServerStackIcon },
      { id: 'backdoor-protection', to: '/backdoor-protection', labelKey: 'nav.backdoorProtection', Icon: KeyIcon },
      { id: 'threat-investigation', to: '/threat-investigation', labelKey: 'nav.threatInvestigation', Icon: BeakerIcon },
      { id: 'quarantine', to: '/quarantine', labelKey: 'nav.quarantine', Icon: ArchiveBoxXMarkIcon },
      { id: 'security-reports', to: '/security-reports', labelKey: 'nav.securityReports', Icon: DocumentChartBarIcon },
      { id: 'security-history', to: '/security-history', labelKey: 'nav.securityHistory', Icon: HistoryIcon },
    ],
  },
  // ── OPTIMIZATION ──────────────────────────────────────────────
  {
    id: 'optimization',
    labelKey: 'nav.section.optimization',
    entries: [
      { id: 'junk-cleaner', to: '/junk-cleaner', labelKey: 'nav.junkCleaner', Icon: TrashIcon },
      { id: 'startup-manager', to: '/startup-manager', labelKey: 'nav.startupManager', Icon: RocketLaunchIcon },
      { id: 'browser-cleaner', to: '/browser-cleaner', labelKey: 'nav.browserCleaner', Icon: GlobeAltIcon },
      { id: 'registry-cleaner', to: '/registry-cleaner', labelKey: 'nav.registryCleaner', Icon: WrenchScrewdriverIcon },
      { id: 'duplicate-finder', to: '/duplicate-finder', labelKey: 'nav.duplicateFinder', Icon: DocumentDuplicateIcon, feature: 'duplicate.scan' },
      { id: 'large-files', to: '/large-files', labelKey: 'nav.largeFiles', Icon: CircleStackIcon },
      { id: 'uninstaller', to: '/uninstaller', labelKey: 'nav.uninstaller', Icon: ArchiveBoxXMarkIcon, feature: 'uninstaller.view' },
      { id: 'software-updater', to: '/software-updater', labelKey: 'nav.softwareUpdater', Icon: ArrowPathIcon, feature: 'software.update_scan' },
      { id: 'maintenance-history', to: '/maintenance-history', labelKey: 'nav.maintenanceHistory', Icon: ClipboardDocumentListIcon },
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
      { id: 'disk-analyzer', to: '/disk-analyzer', labelKey: 'nav.diskAnalyzer', Icon: ChartBarIcon, feature: 'disk.analyzer' },
      { id: 'network-information', to: '/network-information', labelKey: 'nav.networkInformation', Icon: WifiIcon },
      { id: 'driver-information', to: '/driver-information', labelKey: 'nav.driverInformation', Icon: ChipIcon },
      { id: 'backup-restore', to: '/backup-restore', labelKey: 'nav.backupRestore', Icon: ArrowPathRoundedSquareIcon },
      { id: 'recovery-center', to: '/recovery-center', labelKey: 'nav.recoveryCenter', Icon: LifebuoyIcon },
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
      { id: 'help', to: '/help', labelKey: 'nav.help', Icon: LifebuoyIcon },
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
 * v2.0 navigation with Home, System Health, Security, Optimization,
 * Reports, Tools, and Account sections.
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
