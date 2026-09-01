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
const SystemHealthOverviewPage = lazy(() => import('../features/system-health-dashboard/SystemHealthOverviewPage'));
const PerformanceAnalyticsPageImpl = lazy(() => import('../features/performance/PerformanceAnalyticsPage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const HelpCenterPage = lazy(() => import('../features/help-center/HelpCenterPage'));
const UpgradePageImpl = lazy(() => import('../features/licensing/UpgradePage'));
const DriverInformationPageImpl = lazy(() => import('../features/drivers/DriverInformationPage'));
const DriverUpdaterPageImpl = lazy(() => import('../features/drivers/DriverUpdaterPage'));
const BackupRestorePageImpl = lazy(() => import('../features/backup-restore/BackupRestorePage'));
const SecurityHistoryPageImpl = lazy(() => import('../features/security-history/SecurityHistoryPage'));
const FileShredderPageImpl = lazy(() => import('../features/file-shredder/FileShredderPage'));
const DiskOptimizerPageImpl = lazy(() => import('../features/disk-optimizer/DiskOptimizerPage'));
const PUPScannerPageImpl = lazy(() => import('../features/pup-scanner/PUPScannerPage'));
const BrowserExtensionManagerPageImpl = lazy(() => import('../features/browser-extensions/BrowserExtensionManagerPage'));
const NetworkOptimizerPageImpl = lazy(() => import('../features/network-optimizer/NetworkOptimizerPage'));
const ContextMenuManagerPageImpl = lazy(() => import('../features/context-menu/ContextMenuManagerPage'));

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

// ── SYSTEM HEALTH ─────────────────────────────────────────────

export const SystemHealthPage = withSuspense(SystemHealthOverviewPage);

export const PerformanceAnalyticsPage = withSuspense(PerformanceAnalyticsPageImpl);

// ── OPTIMIZATION ──────────────────────────────────────────────

export function BrowserCleanerPage() {
  return <Navigate to="/privacy-cleaner" replace />;
}

// ── TOOLS ─────────────────────────────────────────────────────

export const DriverInformationPage = withSuspense(DriverInformationPageImpl);
export const DriverUpdaterPage = withSuspense(DriverUpdaterPageImpl);
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
export const FileShredderPage = withSuspense(FileShredderPageImpl);
export const DiskOptimizerPage = withSuspense(DiskOptimizerPageImpl);
export const PUPScannerPage = withSuspense(PUPScannerPageImpl);
export const BrowserExtensionManagerPage = withSuspense(BrowserExtensionManagerPageImpl);
export const NetworkOptimizerPage = withSuspense(NetworkOptimizerPageImpl);
export const ContextMenuManagerPage = withSuspense(ContextMenuManagerPageImpl);

// ── ACCOUNT ───────────────────────────────────────────────────

export const UpgradePage = withSuspense(UpgradePageImpl);
export const HelpPage = withSuspense(HelpCenterPage);
export const NotificationsPageWrapper = withSuspense(NotificationsPage);
