/**
 * OnboardingProvider — wraps the app and manages first-run onboarding.
 *
 * Shows the WelcomeDialog on first launch.
 * Renders ContextualTips above page content for non-dismissed tips.
 * Provides a hook to re-trigger onboarding from Settings.
 */
import { useState, useCallback, type ReactNode } from 'react';
import { WelcomeDialog } from './WelcomeDialog';
import { ContextualTips } from './ContextualTips';
import { onboardingService } from './OnboardingService';

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const [welcomeOpen, setWelcomeOpen] = useState(() => !onboardingService.hasCompletedOnboarding());

  const closeWelcome = useCallback(() => {
    setWelcomeOpen(false);
  }, []);

  return (
    <>
      <WelcomeDialog open={welcomeOpen} onClose={closeWelcome} />
      <ContextualTips />
      {children}
    </>
  );
}

export { onboardingService };
