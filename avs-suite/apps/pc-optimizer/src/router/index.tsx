import { createHashRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppLayout } from './layouts/AppLayout';
import { LoadingFallback } from './components/LoadingFallback';
import { ErrorBoundary } from './components/ErrorBoundary';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const JunkCleanerPage = lazy(() => import('./pages/JunkCleanerPage'));
const StartupManagerPage = lazy(() => import('./pages/StartupManagerPage'));
const PrivacyCleanerPage = lazy(() => import('./pages/PrivacyCleanerPage'));
const DuplicateFinderPage = lazy(() => import('./pages/DuplicateFinderPage'));
const DiskAnalyzerPage = lazy(() => import('./pages/DiskAnalyzerPage'));
const PerformancePage = lazy(() => import('./pages/PerformancePage'));
const SystemInformationPage = lazy(() => import('./pages/SystemInformationPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));

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
    element: <AppLayout />,
    errorElement: <ErrorBoundary standalone />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: wrap(DashboardPage) },
      { path: 'junk-cleaner', element: wrap(JunkCleanerPage) },
      { path: 'startup-manager', element: wrap(StartupManagerPage) },
      { path: 'privacy-cleaner', element: wrap(PrivacyCleanerPage) },
      { path: 'duplicate-finder', element: wrap(DuplicateFinderPage) },
      { path: 'disk-analyzer', element: wrap(DiskAnalyzerPage) },
      { path: 'performance', element: wrap(PerformancePage) },
      { path: 'system-information', element: wrap(SystemInformationPage) },
      { path: 'settings', element: wrap(SettingsPage) },
      { path: 'about', element: wrap(AboutPage) },
    ],
  },
]);
