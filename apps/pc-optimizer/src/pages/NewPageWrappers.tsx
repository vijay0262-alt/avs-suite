/**
 * NewPageWrappers — re-exports and redirects for v2.0 sidebar routes.
 *
 * Each wrapper either re-exports an existing feature page or
 * redirects to the most relevant existing page.
 */
import { Navigate } from 'react-router-dom';
import { RecoveryCenterPage as RecoveryCenterPageImpl } from '../features/recovery/RecoveryCenterPage';
import AIDailyBriefingPageImpl from '../features/ai-assistant/AIDailyBriefingPage';
import SystemHealthOverviewPage from '../features/system-health-dashboard/SystemHealthOverviewPage';
import PerformanceAnalyticsPageImpl from '../features/performance/PerformanceAnalyticsPage';
import ExportCenterPage from '../features/export-center/ExportCenterPage';
import NotificationsPage from '../features/notifications/NotificationsPage';
import HelpCenterPage from '../features/help-center/HelpCenterPage';
import UpgradePageImpl from '../features/licensing/UpgradePage';

// ── HOME ──────────────────────────────────────────────────────

export function AIDailyBriefingPage() {
  return <AIDailyBriefingPageImpl />;
}

export function AISmartOptimizePage() {
  return <Navigate to="/dashboard" replace state={{ action: 'smart-optimize' }} />;
}

// ── SYSTEM HEALTH ─────────────────────────────────────────────

export function SystemHealthPage() {
  return <SystemHealthOverviewPage />;
}

export function PerformanceAnalyticsPage() {
  return <PerformanceAnalyticsPageImpl />;
}

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

export function NetworkInformationPage() {
  return <Navigate to="/system-information" replace />;
}

export function RecoveryCenterPage() {
  return <RecoveryCenterPageImpl />;
}

// ── REPORTS ───────────────────────────────────────────────────

export function ExportCenterPageWrapper() {
  return <ExportCenterPage />;
}

// ── ACCOUNT ───────────────────────────────────────────────────

export function UpgradePage() {
  return <UpgradePageImpl />;
}

export function HelpPage() {
  return <HelpCenterPage />;
}

export function NotificationsPageWrapper() {
  return <NotificationsPage />;
}
