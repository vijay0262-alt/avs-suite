/**
 * OnboardingProvider — wraps the app and manages first-run onboarding.
 *
 * Shows the WelcomeDialog on first launch.
 * Shows the FirstScanDialog after welcome (or on returning login) if the
 * user hasn't completed their first system health scan yet.
 * Renders ContextualTips above page content for non-dismissed tips.
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
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try {
      const sessionSeen = sessionStorage.getItem('avs-welcome-session-seen');
      if (sessionSeen) return false;
      sessionStorage.setItem('avs-welcome-session-seen', '1');
      return true;
    } catch {
      return false;
    }
  });
  const [firstScanOpen, setFirstScanOpen] = useState(false);

  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
    // After welcome dialog closes, check if first scan is needed
    if (!onboardingService.hasCompletedFirstScan()) {
      setFirstScanOpen(true);
    }
  }, []);

  const closeFirstScan = useCallback(() => {
    setFirstScanOpen(false);
  }, []);

  // If onboarding is already done but first scan hasn't been completed,
  // show the first scan dialog on mount
  useEffect(() => {
    if (onboardingService.hasCompletedOnboarding() && !onboardingService.hasCompletedFirstScan()) {
      setFirstScanOpen(true);
    }
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

export { onboardingService };
