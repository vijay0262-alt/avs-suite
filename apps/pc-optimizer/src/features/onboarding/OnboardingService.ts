/**
 * OnboardingService — manages first-run state and dismissed tips.
 *
 * Persists onboarding completion and dismissed tip IDs in localStorage.
 * Tips that are dismissed are never shown again.
 */

const ONBOARDING_KEY = 'avs-onboarding-complete';
const DISMISSED_TIPS_KEY = 'avs-dismissed-tips';
const LEARNING_MODE_KEY = 'avs-learning-mode';
const FIRST_SCAN_KEY = 'avs-first-scan-complete';
const WELCOME_NEVER_SHOW_KEY = 'avs-welcome-never-show';

export interface OnboardingState {
  hasCompleted: boolean;
  dismissedTips: Set<string>;
  learningMode: boolean;
}

function loadDismissedTips(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_TIPS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveDismissedTips(set: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_TIPS_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

class OnboardingServiceImpl {
  hasCompletedOnboarding(): boolean {
    try {
      return localStorage.getItem(ONBOARDING_KEY) === 'true';
    } catch {
      return false;
    }
  }

  shouldShowWelcome(): boolean {
    try {
      if (localStorage.getItem(WELCOME_NEVER_SHOW_KEY) === 'true') return false;
      return !this.hasCompletedOnboarding();
    } catch {
      return true;
    }
  }

  neverShowWelcome(): void {
    try {
      localStorage.setItem(WELCOME_NEVER_SHOW_KEY, 'true');
      localStorage.setItem(ONBOARDING_KEY, 'true');
    } catch { /* ignore */ }
  }

  completeOnboarding(): void {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true');
    } catch { /* ignore */ }
  }

  resetOnboarding(): void {
    try {
      localStorage.removeItem(ONBOARDING_KEY);
    } catch { /* ignore */ }
  }

  isTipDismissed(tipId: string): boolean {
    return loadDismissedTips().has(tipId);
  }

  dismissTip(tipId: string): void {
    const set = loadDismissedTips();
    set.add(tipId);
    saveDismissedTips(set);
  }

  getDismissedTips(): Set<string> {
    return loadDismissedTips();
  }

  isLearningMode(): boolean {
    try {
      return localStorage.getItem(LEARNING_MODE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  setLearningMode(enabled: boolean): void {
    try {
      localStorage.setItem(LEARNING_MODE_KEY, String(enabled));
    } catch { /* ignore */ }
  }

  hasCompletedFirstScan(): boolean {
    try {
      return localStorage.getItem(FIRST_SCAN_KEY) === 'true';
    } catch {
      return false;
    }
  }

  completeFirstScan(): void {
    try {
      localStorage.setItem(FIRST_SCAN_KEY, 'true');
    } catch { /* ignore */ }
  }
}

export const onboardingService = new OnboardingServiceImpl();
