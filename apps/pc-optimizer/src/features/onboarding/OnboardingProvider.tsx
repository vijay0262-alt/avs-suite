/**
 * OnboardingProvider — wraps the app and manages first-run onboarding.
 *
 * Shows the WelcomeDialog on first launch only.
 * Shows the FirstScanDialog after welcome if the user hasn't completed
 * their first system health scan yet.
 * ContextualTips remain disabled (user preference: no tips on top of pages).
 * Provides a hook to re-trigger onboarding from Settings.
 */
import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { WelcomeDialog } from './WelcomeDialog';
import { FirstScanDialog } from './FirstScanDialog';
import { ContextualTips } from './ContextualTips';
import { onboardingService } from './OnboardingService';

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [firstScanOpen, setFirstScanOpen] = useState(false);

  // On mount, check if this is a first-run user who hasn't completed
  // onboarding yet. Show the WelcomeDialog only once per user.
  useEffect(() => {
    if (onboardingService.shouldShowWelcome()) {
      setWelcomeOpen(true);
    } else if (!onboardingService.hasCompletedFirstScan()) {
      // Returning user who completed welcome but never ran their first scan.
      setFirstScanOpen(true);
    }
  }, []);

  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
    // After welcome, show the first scan prompt if they haven't scanned yet.
    if (!onboardingService.hasCompletedFirstScan()) {
      setFirstScanOpen(true);
    }
  }, []);

  const closeFirstScan = useCallback(() => {
    setFirstScanOpen(false);
  }, []);

  return (
    <>
      <WelcomeDialog open={welcomeOpen} onClose={closeWelcome} />
      <FirstScanDialog open={firstScanOpen} onClose={closeFirstScan} />
      <ContextualTips />
      {children}
    </>
  );
}

/** Re-trigger the welcome flow (used by Settings page). */
export function replayWelcome(): void {
  onboardingService.resetOnboarding();
  // Reload the app to trigger the OnboardingProvider's first-run check.
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

export { onboardingService };
