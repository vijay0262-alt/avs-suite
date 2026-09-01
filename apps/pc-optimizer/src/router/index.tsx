import { createHashRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { AppLayout } from '../layouts/AppLayout';
import { LoadingFallback } from '../components/LoadingFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AuthBootstrap } from '../features/auth/AuthBootstrap';
import { EditionManagerProvider } from '../config/EditionManager';
import { UpgradeDialogProvider } from '../components/UpgradeDialog';
import { OnboardingProvider } from '../features/onboarding/OnboardingProvider';

// Lazy load all pages
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const ProtectionCenterPage = lazy(() => import('../pages/ProtectionCenterPage'));
const SecurityCenterPage = lazy(() => import('../pages/SecurityCenterPage'));
const JunkCleanerPage = lazy(() => import('../pages/JunkCleanerPage'));
const RegistryCleanerPage = lazy(() => import('../pages/RegistryCleanerPage'));
const StartupManagerPage = lazy(() => import('../pages/StartupManagerPage'));
const PrivacyCleanerPage = lazy(() => import('../pages/PrivacyCleanerPage'));
const DuplicateFinderPage = lazy(() => import('../pages/DuplicateFinderPage'));
const DiskAnalyzerPage = lazy(() => import('../pages/DiskAnalyzerPage'));
const UninstallerPage = lazy(() => import('../pages/UninstallerPage'));
const UpdaterPage = lazy(() => import('../pages/UpdaterPage'));
const PerformancePage = lazy(() => import('../pages/PerformancePage'));
const SystemInformationPage = lazy(() => import('../pages/SystemInformationPage'));
const HardwareCenterPage = lazy(() => import('../pages/HardwareCenterPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const DiagnosticsPage = lazy(() => import('../features/diagnostics/DiagnosticsPage'));
const ProcessIntelligencePage = lazy(() => import('../pages/ProcessIntelligencePage'));
const PredictiveHealthPage = lazy(() => import('../pages/PredictiveHealthPage'));
const ActivationPage = lazy(() => import('../features/licensing/ActivationPage'));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));
const OptimizationReportsPage = lazy(() => import('../pages/OptimizationReportsPage'));
const SmartOptimizationPage = lazy(() => import('../pages/SmartOptimizationPage'));

// v2.0 security sub-pages and new route wrappers
import {
  QuickScanPage,
  FullScanPage,
  CustomScanPage,
  AIActiveProtectionPage,
  SpywareProtectionPage,
  MalwareProtectionPage,
  AdwareProtectionPage,
  RansomwareProtectionPage,
  BrowserProtectionPage,
  ThreatInvestigationPage,
  QuarantinePage,
  SecurityReportsPage,
  TrojanProtectionPage,
  PUPProtectionPage,
  CryptoMinerProtectionPage,
  ScriptProtectionPage,
  KeyloggerProtectionPage,
  RootkitProtectionPage,
  BackdoorProtectionPage,
  PersistenceDetectionPage,
  NetworkBehaviorAnalysisPage,
  FileReputationAnalysisPage,
  PublisherTrustAnalysisPage,
} from '../pages/SecuritySubPages';
import {
  SystemHealthPage,
  PerformanceAnalyticsPage,
  BrowserCleanerPage,
  DriverInformationPage,
  DriverUpdaterPage,
  BackupRestorePage,
  SecurityHistoryPage,
  AntispywareMalwareRemovalPage,
  RestorationPage,
  HelpSupportPage,
  RecoveryCenterPage,
  FileShredderPage,
  DiskOptimizerPage,
  PUPScannerPage,
  BrowserExtensionManagerPage,
  NetworkOptimizerPage,
  ContextMenuManagerPage,
  QuarantineVaultPage,
  AutoCarePage,
  WorkloadDetectionPage,
  PredictiveMaintenancePage,
  SmartNotificationsPage,
  UpgradePage,
  HelpPage,
  NotificationsPageWrapper,
} from '../pages/NewPageWrappers';

// Module preloader - preloads frequently used modules in background
const ModulePreloader = () => {
  useEffect(() => {
    const preload = () => {
      // Preload frequently accessed modules
      void import('../pages/JunkCleanerPage');
      void import('../pages/StartupManagerPage');
      void import('../pages/PerformancePage');
      void import('../pages/SecurityCenterPage');
      void import('../pages/ProcessIntelligencePage');
      void import('../pages/ProtectionCenterPage');
    };

    // Use requestIdleCallback if available (better than setTimeout)
    // Falls back to setTimeout for older browsers
    if (typeof requestIdleCallback !== 'undefined') {
      const handle = requestIdleCallback(preload, { timeout: 3000 });
      return () => cancelIdleCallback(handle);
    }
    const timeout = setTimeout(preload, 1500);
    return () => clearTimeout(timeout);
  }, []);

  return null;
};

const wrap = (Element: React.ComponentType) => (
  <ErrorBoundary>
    <Suspense fallback={<LoadingFallback />}>
      <Element />
    </Suspense>
  </ErrorBoundary>
);

export const router = createHashRouter([
  {
    path: '/',
    element: (
      <AuthBootstrap>
        <EditionManagerProvider>
          <UpgradeDialogProvider>
            <>
              <ModulePreloader />
              <OnboardingProvider>
                <AppLayout />
              </OnboardingProvider>
            </>
          </UpgradeDialogProvider>
        </EditionManagerProvider>
      </AuthBootstrap>
    ),
    errorElement: <ErrorBoundary standalone />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      // HOME
      { path: 'dashboard', element: wrap(DashboardPage) },
      { path: 'protection-center', element: wrap(ProtectionCenterPage) },
      { path: 'ai-assistant', element: <Navigate to="/dashboard" replace /> },
      { path: 'ai-daily-briefing', element: <Navigate to="/dashboard" replace /> },
      { path: 'ai-smart-optimize', element: wrap(SmartOptimizationPage) },
      { path: 'ai-smart-security', element: wrap(SecurityCenterPage) },
      { path: 'ai-workspace', element: <Navigate to="/dashboard" replace /> },
      // SYSTEM HEALTH
      { path: 'system-health', element: wrap(SystemHealthPage) },
      { path: 'hardware-center', element: wrap(HardwareCenterPage) },
      { path: 'process-intelligence', element: wrap(ProcessIntelligencePage) },
      { path: 'predictive-health', element: wrap(PredictiveHealthPage) },
      { path: 'performance-analytics', element: wrap(PerformanceAnalyticsPage) },
      // SECURITY
      { path: 'security-center', element: wrap(SecurityCenterPage) },
      { path: 'quick-scan', element: <QuickScanPage /> },
      { path: 'full-scan', element: <FullScanPage /> },
      { path: 'custom-scan', element: <CustomScanPage /> },
      { path: 'ai-active-protection', element: <AIActiveProtectionPage /> },
      { path: 'spyware-protection', element: <SpywareProtectionPage /> },
      { path: 'malware-protection', element: <MalwareProtectionPage /> },
      { path: 'adware-protection', element: <AdwareProtectionPage /> },
      { path: 'ransomware-protection', element: <RansomwareProtectionPage /> },
      { path: 'browser-protection', element: <BrowserProtectionPage /> },
      { path: 'trojan-protection', element: <TrojanProtectionPage /> },
      { path: 'pup-protection', element: <PUPProtectionPage /> },
      { path: 'crypto-miner-protection', element: <CryptoMinerProtectionPage /> },
      { path: 'script-protection', element: <ScriptProtectionPage /> },
      { path: 'keylogger-protection', element: <KeyloggerProtectionPage /> },
      { path: 'rootkit-protection', element: <RootkitProtectionPage /> },
      { path: 'backdoor-protection', element: <BackdoorProtectionPage /> },
      { path: 'persistence-detection', element: <PersistenceDetectionPage /> },
      { path: 'network-behavior-analysis', element: <NetworkBehaviorAnalysisPage /> },
      { path: 'file-reputation-analysis', element: <FileReputationAnalysisPage /> },
      { path: 'publisher-trust-analysis', element: <PublisherTrustAnalysisPage /> },
      { path: 'threat-investigation', element: <ThreatInvestigationPage /> },
      { path: 'quarantine', element: <QuarantinePage /> },
      { path: 'security-reports', element: <SecurityReportsPage /> },
      { path: 'security-history', element: wrap(SecurityHistoryPage) },
      { path: 'antispyware-malware-removal', element: <AntispywareMalwareRemovalPage /> },
      // OPTIMIZATION
      { path: 'junk-cleaner', element: wrap(JunkCleanerPage) },
      { path: 'startup-manager', element: wrap(StartupManagerPage) },
      { path: 'browser-cleaner', element: <BrowserCleanerPage /> },
      { path: 'registry-cleaner', element: wrap(RegistryCleanerPage) },
      { path: 'duplicate-finder', element: wrap(DuplicateFinderPage) },
      // Large Files disabled — redirect to disk analyzer
      { path: 'large-files', element: <Navigate to="/disk-analyzer" replace /> },
      { path: 'uninstaller', element: wrap(UninstallerPage) },
      { path: 'software-updater', element: wrap(UpdaterPage) },
      // Maintenance History disabled
      { path: 'maintenance-history', element: <Navigate to="/dashboard" replace /> },
      // REPORTS
      { path: 'reports', element: wrap(ReportsPage) },
      { path: 'optimization-reports', element: wrap(OptimizationReportsPage) },
      // Reports Timeline, Analytics, Export Center disabled
      { path: 'reports-timeline', element: <Navigate to="/reports" replace /> },
      { path: 'analytics', element: <Navigate to="/reports" replace /> },
      { path: 'export-center', element: <Navigate to="/reports" replace /> },
      // TOOLS
      { path: 'system-information', element: wrap(SystemInformationPage) },
      { path: 'disk-analyzer', element: wrap(DiskAnalyzerPage) },
      // Network Information hidden — backend module unavailable, redirect to dashboard
      { path: 'network-information', element: <Navigate to="/dashboard" replace /> },
      { path: 'driver-information', element: wrap(DriverInformationPage) },
      { path: 'driver-updater', element: wrap(DriverUpdaterPage) },
      { path: 'backup-restore', element: wrap(BackupRestorePage) },
      { path: 'recovery-center', element: wrap(RecoveryCenterPage) },
      { path: 'file-shredder', element: wrap(FileShredderPage) },
      { path: 'disk-optimizer', element: wrap(DiskOptimizerPage) },
      { path: 'pup-scanner', element: wrap(PUPScannerPage) },
      { path: 'browser-extensions', element: wrap(BrowserExtensionManagerPage) },
      { path: 'network-optimizer', element: wrap(NetworkOptimizerPage) },
      { path: 'context-menu', element: wrap(ContextMenuManagerPage) },
      { path: 'quarantine-vault', element: wrap(QuarantineVaultPage) },
      { path: 'auto-care', element: wrap(AutoCarePage) },
      { path: 'workload', element: wrap(WorkloadDetectionPage) },
      { path: 'predictive', element: wrap(PredictiveMaintenancePage) },
      { path: 'smart-notifications', element: wrap(SmartNotificationsPage) },
      { path: 'restoration', element: <RestorationPage /> },
      // ACCOUNT
      { path: 'license', element: wrap(ActivationPage) },
      { path: 'upgrade', element: wrap(UpgradePage) },
      { path: 'settings', element: wrap(SettingsPage) },
      { path: 'notifications', element: wrap(NotificationsPageWrapper) },
      { path: 'help', element: wrap(HelpPage) },
      { path: 'help-support', element: <HelpSupportPage /> },
      { path: 'about', element: wrap(AboutPage) },
      // LEGACY REDIRECTS
      { path: 'security', element: <Navigate to="/security-center" replace /> },
      { path: 'security-dashboard', element: <Navigate to="/security-center" replace /> },
      { path: 'privacy-cleaner', element: wrap(PrivacyCleanerPage) },
      { path: 'performance', element: wrap(PerformancePage) },
      { path: 'diagnostics', element: wrap(DiagnosticsPage) },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
