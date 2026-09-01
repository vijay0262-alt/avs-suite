// @vitest-environment happy-dom
/**
 * Tests for the onboarding flow: OnboardingProvider, WelcomeDialog,
 * FirstScanDialog, and OnboardingService.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingProvider } from '../OnboardingProvider';
import { onboardingService } from '../OnboardingService';

// ── OnboardingService ────────────────────────────────────────────────

describe('OnboardingService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports incomplete onboarding by default', () => {
    expect(onboardingService.hasCompletedOnboarding()).toBe(false);
  });

  it('reports that welcome should show for new users', () => {
    expect(onboardingService.shouldShowWelcome()).toBe(true);
  });

  it('completes onboarding and stops showing welcome', () => {
    onboardingService.completeOnboarding();
    expect(onboardingService.hasCompletedOnboarding()).toBe(true);
    expect(onboardingService.shouldShowWelcome()).toBe(false);
  });

  it('neverShowWelcome prevents welcome on future launches', () => {
    onboardingService.neverShowWelcome();
    expect(onboardingService.shouldShowWelcome()).toBe(false);
    expect(onboardingService.hasCompletedOnboarding()).toBe(true);
  });

  it('resetOnboarding allows welcome to show again', () => {
    onboardingService.completeOnboarding();
    expect(onboardingService.shouldShowWelcome()).toBe(false);
    onboardingService.resetOnboarding();
    expect(onboardingService.shouldShowWelcome()).toBe(true);
  });

  it('tracks first scan completion', () => {
    expect(onboardingService.hasCompletedFirstScan()).toBe(false);
    onboardingService.completeFirstScan();
    expect(onboardingService.hasCompletedFirstScan()).toBe(true);
  });

  it('persists dismissed tips', () => {
    expect(onboardingService.isTipDismissed('tip-1')).toBe(false);
    onboardingService.dismissTip('tip-1');
    expect(onboardingService.isTipDismissed('tip-1')).toBe(true);
  });

  it('tracks learning mode', () => {
    expect(onboardingService.isLearningMode()).toBe(false);
    onboardingService.setLearningMode(true);
    expect(onboardingService.isLearningMode()).toBe(true);
  });
});

// ── OnboardingProvider ───────────────────────────────────────────────

describe('OnboardingProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows WelcomeDialog on first run', async () => {
    render(
      <MemoryRouter>
        <OnboardingProvider>
          <div data-testid="app-content">App</div>
        </OnboardingProvider>
      </MemoryRouter>,
    );

    // Welcome dialog should be visible on first run
    await waitFor(() => {
      expect(screen.getByTestId('welcome-content')).toBeInTheDocument();
    });
  });

  it('does not show WelcomeDialog after onboarding is complete', async () => {
    onboardingService.completeOnboarding();
    onboardingService.completeFirstScan();

    render(
      <MemoryRouter>
        <OnboardingProvider>
          <div data-testid="app-content">App</div>
        </OnboardingProvider>
      </MemoryRouter>,
    );

    // Welcome dialog should NOT be visible
    expect(screen.queryByTestId('welcome-content')).not.toBeInTheDocument();
  });

  it('shows FirstScanDialog when onboarding is complete but first scan is not', async () => {
    onboardingService.completeOnboarding();
    // Don't complete first scan

    render(
      <MemoryRouter>
        <OnboardingProvider>
          <div data-testid="app-content">App</div>
        </OnboardingProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('first-scan-content')).toBeInTheDocument();
    });
  });

  it('renders children content alongside onboarding dialogs', () => {
    onboardingService.completeOnboarding();
    onboardingService.completeFirstScan();

    render(
      <MemoryRouter>
        <OnboardingProvider>
          <div data-testid="app-content">App Content</div>
        </OnboardingProvider>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('app-content')).toBeInTheDocument();
  });
});
