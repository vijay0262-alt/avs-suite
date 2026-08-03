/**
 * NewPageWrappers — re-exports and redirects for v2.0 sidebar routes.
 *
 * Redirect-only wrappers are static (trivial size).
 * Feature page implementations are lazy-loaded to keep them
 * out of the main bundle.
 */
import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingFallback } from '../components/LoadingFallback';

// Lazy-load feature page implementations (code-split out of main bundle)
// For named exports, we destructure and re-export as default for lazy()
const RecoveryCenterPageImpl = lazy(() =>
  import('../features/recovery/RecoveryCenterPage').then((m) => ({ default: m.RecoveryCenterPage })),
);
const AIDailyBriefingPageImpl = lazy(() => import('../features/ai-assistant/AIDailyBriefingPage'));
const SystemHealthOverviewPage = lazy(() => import('../features/system-health-dashboard/SystemHealthOverviewPage'));
const PerformanceAnalyticsPageImpl = lazy(() => import('../features/performance/PerformanceAnalyticsPage'));
const ExportCenterPage = lazy(() => import('../features/export-center/ExportCenterPage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const HelpCenterPage = lazy(() => import('../features/help-center/HelpCenterPage'));
const UpgradePageImpl = lazy(() => import('../features/licensing/UpgradePage'));
const NetworkInformationPageImpl = lazy(() => import('../features/network-info/NetworkInformationPage'));
const DriverInformationPageImpl = lazy(() => import('../features/drivers/DriverInformationPage'));
const BackupRestorePageImpl = lazy(() => import('../features/backup-restore/BackupRestorePage'));
const SecurityHistoryPageImpl = lazy(() => import('../features/security-history/SecurityHistoryPage'));

// Helper to wrap lazy components in Suspense
function withSuspense(Component: React.LazyExoticComponent<React.ComponentType>) {
  return function SuspenseWrapper() {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Component />
      </Suspense>
    );
  };
}

// ── HOME ──────────────────────────────────────────────────────

export const AIDailyBriefingPage = withSuspense(AIDailyBriefingPageImpl);

export function AISmartOptimizePage() {
  return <Navigate to="/dashboard" replace state={{ action: 'smart-optimize' }} />;
}

// ── SYSTEM HEALTH ─────────────────────────────────────────────

export const SystemHealthPage = withSuspense(SystemHealthOverviewPage);

export const PerformanceAnalyticsPage = withSuspense(PerformanceAnalyticsPageImpl);

// ── OPTIMIZATION ──────────────────────────────────────────────

export function BrowserCleanerPage() {
  return <Navigate to="/privacy-cleaner" replace />;
}

export function LargeFilesPage() {
  return <Navigate to="/disk-analyzer" replace />;
}

// ── REPORTS ───────────────────────────────────────────────────

export function ReportsTimelinePage() {
  return <Navigate to="/maintenance-history" replace />;
}

export function AnalyticsPage() {
  return <Navigate to="/reports" replace />;
}

// ── TOOLS ─────────────────────────────────────────────────────

export const NetworkInformationPage = withSuspense(NetworkInformationPageImpl);
export const DriverInformationPage = withSuspense(DriverInformationPageImpl);
export const BackupRestorePage = withSuspense(BackupRestorePageImpl);
export const SecurityHistoryPage = withSuspense(SecurityHistoryPageImpl);

export function AntispywareMalwareRemovalPage() {
  return <Navigate to="/security-center" replace state={{ filter: 'malware' }} />;
}

export function RestorationPage() {
  return <Navigate to="/recovery-center" replace />;
}

export function HelpSupportPage() {
  return <Navigate to="/help" replace />;
}

export const RecoveryCenterPage = withSuspense(RecoveryCenterPageImpl);

// ── REPORTS ───────────────────────────────────────────────────

export const ExportCenterPageWrapper = withSuspense(ExportCenterPage);

// ── ACCOUNT ───────────────────────────────────────────────────

export const UpgradePage = withSuspense(UpgradePageImpl);
export const HelpPage = withSuspense(HelpCenterPage);
export const NotificationsPageWrapper = withSuspense(NotificationsPage);
