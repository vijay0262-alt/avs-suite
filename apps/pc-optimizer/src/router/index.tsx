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
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const DiagnosticsPage = lazy(() => import('../features/diagnostics/DiagnosticsPage'));
const SecurityPage = lazy(() => import('../features/security/SecurityPage'));
const ActivationPage = lazy(() => import('../features/licensing/ActivationPage'));
const MaintenanceHistoryPage = lazy(() => import('../pages/MaintenanceHistoryPage'));
const ReportsPage = lazy(() => import('../pages/ReportsPage'));

// Module preloader - preloads frequently used modules in background
const ModulePreloader = () => {
  useEffect(() => {
    const preload = () => {
      // Preload frequently accessed modules
      void import('../pages/JunkCleanerPage');
      void import('../pages/StartupManagerPage');
      void import('../pages/PerformancePage');
      void import('../features/security/SecurityPage');
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
      { path: 'dashboard', element: wrap(DashboardPage) },
      { path: 'junk-cleaner', element: wrap(JunkCleanerPage) },
      { path: 'registry-cleaner', element: wrap(RegistryCleanerPage) },
      { path: 'startup-manager', element: wrap(StartupManagerPage) },
      { path: 'privacy-cleaner', element: wrap(PrivacyCleanerPage) },
      { path: 'duplicate-finder', element: wrap(DuplicateFinderPage) },
      { path: 'disk-analyzer', element: wrap(DiskAnalyzerPage) },
      { path: 'uninstaller', element: wrap(UninstallerPage) },
      { path: 'software-updater', element: wrap(UpdaterPage) },
      { path: 'performance', element: wrap(PerformancePage) },
      { path: 'security', element: wrap(SecurityPage) },
      { path: 'system-information', element: wrap(SystemInformationPage) },
      { path: 'maintenance-history', element: wrap(MaintenanceHistoryPage) },
      { path: 'reports', element: wrap(ReportsPage) },
      { path: 'settings', element: wrap(SettingsPage) },
      { path: 'about', element: wrap(AboutPage) },
      { path: 'license', element: wrap(ActivationPage) },
      { path: 'diagnostics', element: wrap(DiagnosticsPage) },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
