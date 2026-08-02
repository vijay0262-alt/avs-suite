/**
 * NewPageWrappers — re-exports and redirects for v2.0 sidebar routes.
 *
 * Each wrapper either re-exports an existing feature page or
 * redirects to the most relevant existing page.
 */
import { Navigate } from 'react-router-dom';
import { RecoveryCenterPage as RecoveryCenterPageImpl } from '../features/recovery/RecoveryCenterPage';

// ── HOME ──────────────────────────────────────────────────────

export function AIDailyBriefingPage() {
  return <Navigate to="/ai-copilot" replace state={{ view: 'briefing' }} />;
}

export function AISmartOptimizePage() {
  return <Navigate to="/dashboard" replace state={{ action: 'smart-optimize' }} />;
}

// ── SYSTEM HEALTH ─────────────────────────────────────────────

export function SystemHealthPage() {
  return <Navigate to="/dashboard" replace />;
}

export function PerformanceAnalyticsPage() {
  return <Navigate to="/performance" replace />;
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

// ── ACCOUNT ───────────────────────────────────────────────────

export function UpgradePage() {
  return <Navigate to="/license" replace />;
}

export function HelpPage() {
  return <Navigate to="/about" replace />;
}
