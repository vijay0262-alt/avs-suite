/**
 * ContextualTips — dismissible, context-aware hints shown above page content.
 *
 * Tips are tied to specific routes and are shown only once per user
 * (dismissed tips are persisted in localStorage via OnboardingService).
 * When learning mode is enabled, all non-dismissed tips for the current
 * route are shown.
 */
import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { LightBulbIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { onboardingService } from './OnboardingService';

export interface Tip {
  id: string;
  route: string;
  title: string;
  body: string;
}

const TIPS: readonly Tip[] = [
  {
    id: 'tip-junk-cleaner-preview',
    route: '/junk-cleaner',
    title: 'Preview Before Cleaning',
    body: 'Always review the scan results before cleaning. You can deselect items you want to keep.',
  },
  {
    id: 'tip-registry-backup',
    route: '/registry-cleaner',
    title: 'Registry Backup',
    body: 'AVS Shield automatically creates a registry backup before applying any fixes. You can restore from Settings if needed.',
  },
  {
    id: 'tip-startup-impact',
    route: '/startup-manager',
    title: 'Startup Impact',
    body: 'Disabling high-impact startup programs can significantly reduce boot time. Look for the "High" impact label.',
  },
  {
    id: 'tip-privacy-cleaner-scan',
    route: '/privacy-cleaner',
    title: 'Privacy Traces',
    body: 'Privacy cleaning removes browser history, cookies, and temporary files that could expose your activity.',
  },
  {
    id: 'tip-disk-analyzer-drill',
    route: '/disk-analyzer',
    title: 'Drill Down',
    body: 'Click on any folder to drill deeper and find what\'s consuming your disk space.',
  },
  {
    id: 'tip-duplicate-finder-hash',
    route: '/duplicate-finder',
    title: 'Content Verification',
    body: 'Duplicate files are verified by content hash, not just file names. This ensures accurate duplicate detection.',
  },
  {
    id: 'tip-performance-presets',
    route: '/performance',
    title: 'Performance Presets',
    body: 'Choose a preset that matches your use case: Gaming, Work, or Battery. Each preset optimizes different system settings.',
  },
  {
    id: 'tip-settings-shortcuts',
    route: '/settings',
    title: 'Keyboard Shortcuts',
    body: 'Press Ctrl+K to search, Ctrl+D for Dashboard, Ctrl+, for Settings, Alt+Left/Right to navigate back and forward.',
  },
  {
    id: 'tip-reports-history',
    route: '/reports',
    title: 'Optimization History',
    body: 'Review past optimization actions and their results to track improvements over time.',
  },
];

export function ContextualTips() {
  const location = useLocation();
  const [dismissedRefresh, setDismissedRefresh] = useState(0);

  const visibleTips = useMemo(() => {
    const dismissed = onboardingService.getDismissedTips();
    return TIPS.filter(
      (tip) =>
        location.pathname.startsWith(tip.route) &&
        !dismissed.has(tip.id),
    );
    // dismissedRefresh is an indirect dependency — it forces recompute
    // when tips are dismissed via onboardingService.dismissTip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, dismissedRefresh]);

  // Don't render if no tips or onboarding not completed
  const shouldShow = onboardingService.hasCompletedOnboarding();
  useEffect(() => {
    // Trigger re-render when location changes
    setDismissedRefresh((n) => n + 1);
  }, [location.pathname]);

  if (!shouldShow || visibleTips.length === 0) return null;

  const dismissTip = (tipId: string) => {
    onboardingService.dismissTip(tipId);
    setDismissedRefresh((n) => n + 1);
  };

  return (
    <div className="space-y-2 mb-4" data-testid="contextual-tips">
      {visibleTips.map((tip) => (
        <div
          key={tip.id}
          className="flex items-start gap-3 rounded-lg border border-semantic-warning/30 bg-semantic-warning/5 px-4 py-3"
          data-testid={`tip-${tip.id}`}
        >
          <LightBulbIcon className="h-5 w-5 text-semantic-warning shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="text-small font-medium text-text-primary">{tip.title}</div>
            <div className="text-caption text-text-secondary mt-0.5">{tip.body}</div>
          </div>
          <button
            onClick={() => dismissTip(tip.id)}
            className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
            aria-label={`Dismiss tip: ${tip.title}`}
            data-testid={`tip-dismiss-${tip.id}`}
          >
            <XMarkIcon className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
