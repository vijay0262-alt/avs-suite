/**
 * OnboardingProvider — wraps the app and manages first-run onboarding.
 *
 * Shows the WelcomeDialog on first launch.
 * Shows the FirstScanDialog after welcome (or on returning login) if the
 * user hasn't completed their first system health scan yet.
 * Renders ContextualTips above page content for non-dismissed tips.
 * Provides a hook to re-trigger onboarding from Settings.
 */
import { useState, useCallback, type ReactNode } from 'react';
import { WelcomeDialog } from './WelcomeDialog';
import { FirstScanDialog } from './FirstScanDialog';
import { ContextualTips } from './ContextualTips';
import { onboardingService } from './OnboardingService';

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  // V1.0: Do NOT show any modal dialogs on startup.  The user requested
  // that the application open cleanly without modal popups.  The
  // WelcomeDialog and FirstScanDialog are kept available for manual
  // re-trigger from Settings, but they default to closed.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [firstScanOpen, setFirstScanOpen] = useState(false);

  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
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

export { onboardingService };
