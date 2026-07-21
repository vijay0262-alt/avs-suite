import { createHashRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { AppLayout } from '../layouts/AppLayout';
import { LoadingFallback } from '../components/LoadingFallback';
import { ErrorBoundary } from '../components/ErrorBoundary';

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
const WiperPage = lazy(() => import('../pages/WiperPage'));
const PerformancePage = lazy(() => import('../pages/PerformancePage'));
const SystemInformationPage = lazy(() => import('../pages/SystemInformationPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const AboutPage = lazy(() => import('../pages/AboutPage'));
const DiagnosticsPage = lazy(() => import('../features/diagnostics/DiagnosticsPage'));

// Placeholder for the Security card's "Review" action until a full Security
// module is built. This prevents the app from navigating to a missing route.
function SecurityPlaceholder() {
  return (
    <div className="p-6" data-testid="page-security">
      <h1 className="text-2xl font-bold text-text-primary mb-2">Security</h1>
      <p className="text-text-secondary">
        Real-time security status and protection settings are shown on the Dashboard.
      </p>
    </div>
  );
}

// Module preloader - preloads frequently used modules in background
const ModulePreloader = () => {
  useEffect(() => {
    // Preload frequently used modules after initial render
    const timeout = setTimeout(() => {
      // Preload Dashboard (already loaded, but ensures it stays in memory)
      void import('../pages/DashboardPage');
      
      // Preload other frequently accessed modules
      void import('../pages/JunkCleanerPage');
      void import('../pages/StartupManagerPage');
      void import('../pages/PerformancePage');
    }, 1000); // Start preloading after 1 second

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
      <>
        <ModulePreloader />
        <AppLayout />
      </>
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
      { path: 'drive-wiper', element: wrap(WiperPage) },
      { path: 'performance', element: wrap(PerformancePage) },
      { path: 'security', element: wrap(SecurityPlaceholder) },
      { path: 'system-information', element: wrap(SystemInformationPage) },
      { path: 'settings', element: wrap(SettingsPage) },
      { path: 'about', element: wrap(AboutPage) },
      { path: 'diagnostics', element: wrap(DiagnosticsPage) },
    ],
  },
]);
