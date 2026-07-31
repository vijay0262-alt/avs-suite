/**
 * OnboardingService — manages first-run state and dismissed tips.
 *
 * Persists onboarding completion and dismissed tip IDs in localStorage.
 * Tips that are dismissed are never shown again.
 */

const ONBOARDING_KEY = 'avs-onboarding-complete';
const DISMISSED_TIPS_KEY = 'avs-dismissed-tips';
const LEARNING_MODE_KEY = 'avs-learning-mode';

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
}

export const onboardingService = new OnboardingServiceImpl();
