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
const AIAssistantPage = lazy(() => import('../pages/AIAssistantPage'));
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
const MaintenanceHistoryPage = lazy(() => import('../pages/MaintenanceHistoryPage'));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));
const OptimizationReportsPage = lazy(() => import('../pages/OptimizationReportsPage'));
const SmartOptimizationPage = lazy(() => import('../pages/SmartOptimizationPage'));
const AIWorkspacePage = lazy(() => import('../pages/AIWorkspacePage'));

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
  AIDailyBriefingPage,
  SystemHealthPage,
  PerformanceAnalyticsPage,
  BrowserCleanerPage,
  LargeFilesPage,
  ReportsTimelinePage,
  AnalyticsPage,
  NetworkInformationPage,
  DriverInformationPage,
  BackupRestorePage,
  SecurityHistoryPage,
  AntispywareMalwareRemovalPage,
  RestorationPage,
  HelpSupportPage,
  RecoveryCenterPage,
  UpgradePage,
  HelpPage,
  ExportCenterPageWrapper,
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
      { path: 'ai-AIAssistant', element: wrap(AIAssistantPage) },
      { path: 'ai-daily-briefing', element: wrap(AIDailyBriefingPage) },
      { path: 'ai-smart-optimize', element: wrap(SmartOptimizationPage) },
      { path: 'ai-workspace', element: wrap(AIWorkspacePage) },
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
      { path: 'large-files', element: <LargeFilesPage /> },
      { path: 'uninstaller', element: wrap(UninstallerPage) },
      { path: 'software-updater', element: wrap(UpdaterPage) },
      { path: 'maintenance-history', element: wrap(MaintenanceHistoryPage) },
      // REPORTS
      { path: 'reports', element: wrap(ReportsPage) },
      { path: 'optimization-reports', element: wrap(OptimizationReportsPage) },
      { path: 'reports-timeline', element: <ReportsTimelinePage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'export-center', element: wrap(ExportCenterPageWrapper) },
      // TOOLS
      { path: 'system-information', element: wrap(SystemInformationPage) },
      { path: 'disk-analyzer', element: wrap(DiskAnalyzerPage) },
      { path: 'network-information', element: wrap(NetworkInformationPage) },
      { path: 'driver-information', element: wrap(DriverInformationPage) },
      { path: 'backup-restore', element: wrap(BackupRestorePage) },
      { path: 'recovery-center', element: wrap(RecoveryCenterPage) },
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
