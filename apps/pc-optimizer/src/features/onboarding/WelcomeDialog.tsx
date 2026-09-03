/**
 * WelcomeDialog — first-run onboarding experience.
 *
 * Multi-step welcome flow:
 *   1. Welcome / product introduction
 *   2. Permission guidance
 *   3. Quick system overview
 *   4. Recommended first scan
 *   5. Optional guided tour (or skip)
 *
 * Shown only on first launch. User can skip at any step.
 * Completion is persisted via OnboardingService.
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@avs/ui';
import { Modal } from '../dashboard/components/Modal';
import {
  ShieldCheckIcon,
  CpuChipIcon,
  SparklesIcon,
  ArrowRightIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { onboardingService } from './OnboardingService';

type Step = 'welcome' | 'permissions' | 'overview' | 'scan' | 'tour';

const STEPS: readonly { id: Step; title: string }[] = [
  { id: 'welcome', title: 'Welcome to AVS AI Shield' },
  { id: 'permissions', title: 'System Permissions' },
  { id: 'overview', title: 'Quick System Overview' },
  { id: 'scan', title: 'Recommended First Scan' },
  { id: 'tour', title: 'Guided Tour' },
];

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
}

export function WelcomeDialog({ open, onClose }: WelcomeDialogProps) {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const currentStep = STEPS[stepIndex]!;
  const isLastStep = stepIndex === STEPS.length - 1;

  const handleNext = useCallback(() => {
    if (isLastStep) {
      if (dontShowAgain) {
        onboardingService.neverShowWelcome();
      } else {
        onboardingService.completeOnboarding();
      }
      onClose();
    } else {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }
  }, [isLastStep, onClose, dontShowAgain]);

  const handleSkip = useCallback(() => {
    if (dontShowAgain) {
      onboardingService.neverShowWelcome();
    } else {
      onboardingService.completeOnboarding();
    }
    onClose();
  }, [onClose, dontShowAgain]);

  const handleContinueToApp = useCallback(() => {
    if (dontShowAgain) {
      onboardingService.neverShowWelcome();
    } else {
      onboardingService.completeOnboarding();
    }
    onClose();
  }, [onClose, dontShowAgain]);

  const handleStartScan = useCallback(() => {
    onboardingService.completeOnboarding();
    onClose();
    // FirstScanDialog will appear automatically after welcome closes
  }, [onClose]);

  const handleStartTour = useCallback(() => {
    onboardingService.completeOnboarding();
    onboardingService.setLearningMode(true);
    onClose();
    navigate('/dashboard');
  }, [onClose, navigate]);

  return (
    <Modal
      open={open}
      title={currentStep.title}
      onClose={handleSkip}
      size="md"
      actions={
        <div className="flex flex-col gap-3 w-full">
          <label className="flex items-center gap-2 text-caption text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--avs-border)] accent-brand-primary"
              data-testid="welcome-never-show"
            />
            Don&apos;t show this welcome message again
          </label>
          <div className="flex items-center justify-between w-full">
            <Button variant="ghost" size="sm" onClick={handleSkip} data-testid="welcome-skip">
              Skip
            </Button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
                  data-testid="welcome-back"
                >
                  Back
                </Button>
              )}
              {!isLastStep && (
                <Button variant="primary" size="sm" onClick={handleNext} data-testid="welcome-next">
                  Continue
                  <ArrowRightIcon className="h-4 w-4" />
                </Button>
              )}
              {isLastStep && (
                <Button variant="primary" size="sm" onClick={handleContinueToApp} data-testid="welcome-continue-app">
                  Continue to Application
                  <ArrowRightIcon className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4" data-testid="welcome-content">
        {/* Progress dots */}
        <div className="flex items-center gap-1.5" data-testid="welcome-progress">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex
                  ? 'w-6 bg-brand-primary'
                  : i < stepIndex
                    ? 'w-1.5 bg-brand-primary/60'
                    : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        {currentStep.id === 'welcome' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex p-3 rounded-xl bg-brand-primary/10">
                <ShieldCheckIcon className="h-8 w-8 text-brand-primary" aria-hidden />
              </div>
              <div>
                <p className="text-small text-text-secondary">
                  Your all-in-one PC health and optimization platform.
                </p>
              </div>
            </div>
            <p className="text-small text-text-secondary">
              AVS AI Shield helps you keep your Windows PC fast, clean, and secure.
              With real-time health monitoring, one-click optimization, and AI-powered
              recommendations, maintaining your PC has never been easier.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-2">
              {[
                'Health Score Monitoring',
                'Junk & Registry Cleaning',
                'Startup Optimization',
                'Privacy Protection',
                'Disk Analysis',
                'Performance Tuning',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-1.5 text-caption text-text-secondary">
                  <CheckIcon className="h-3.5 w-3.5 text-semantic-success shrink-0" aria-hidden />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep.id === 'permissions' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex p-3 rounded-xl bg-semantic-warning/10">
                <CpuChipIcon className="h-8 w-8 text-semantic-warning" aria-hidden />
              </div>
              <div>
                <p className="text-small text-text-secondary">
                  AVS AI Shield needs access to system information to provide accurate health monitoring.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'System Information', desc: 'CPU, memory, disk, and hardware details' },
                { label: 'Process List', desc: 'Running processes and startup programs' },
                { label: 'File System Access', desc: 'Scan and clean temporary files, cache, and duplicates' },
                { label: 'Registry Access', desc: 'Scan and repair registry issues (read + write)' },
              ].map((perm) => (
                <div key={perm.label} className="flex items-start gap-2 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-2.5">
                  <CheckIcon className="h-4 w-4 text-semantic-success shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <div className="text-small font-medium text-text-primary">{perm.label}</div>
                    <div className="text-caption text-text-muted">{perm.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-caption text-text-muted">
              All operations are performed locally on your device. No personal data is sent to remote servers.
            </p>
          </div>
        )}

        {currentStep.id === 'overview' && (
          <div className="space-y-3">
            <p className="text-small text-text-secondary">
              The Dashboard gives you a real-time overview of your PC&apos;s health.
              Here&apos;s what you&apos;ll see:
            </p>
            <div className="space-y-2">
              {[
                { label: 'Health Score', desc: 'A single number (0-100) summarizing your PC\'s overall condition' },
                { label: 'Category Breakdown', desc: 'Storage, startup, privacy, performance, security, and windows scores' },
                { label: 'Issues List', desc: 'Detected problems with recommended actions' },
                { label: 'Quick Actions', desc: 'Shortcuts to commonly used optimization modules' },
                { label: 'Live Status', desc: 'Real-time CPU, memory, and disk usage metrics' },
              ].map((item) => (
                <div key={item.label} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-2.5">
                  <div className="text-small font-medium text-text-primary">{item.label}</div>
                  <div className="text-caption text-text-muted mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentStep.id === 'scan' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex p-3 rounded-xl bg-brand-primary/10">
                <SparklesIcon className="h-8 w-8 text-brand-primary" aria-hidden />
              </div>
              <div>
                <p className="text-small text-text-secondary">
                  We recommend running your first health scan to get a baseline.
                </p>
              </div>
            </div>
            <p className="text-small text-text-secondary">
              The scan analyzes your system for junk files, startup issues, privacy traces,
              and performance bottlenecks. It takes about 30 seconds and is completely safe —
              nothing is changed until you approve.
            </p>
            <Button
              variant="primary"
              onClick={handleStartScan}
              className="w-full"
              data-testid="welcome-start-scan"
            >
              <SparklesIcon className="h-4 w-4" />
              Run First Scan Now
            </Button>
          </div>
        )}

        {currentStep.id === 'tour' && (
          <div className="space-y-3">
            <p className="text-small text-text-secondary">
              Would you like a quick guided tour of the main features?
            </p>
            <p className="text-small text-text-secondary">
              The tour will walk you through the Dashboard, Health Score, Quick Actions,
              and key optimization modules. You can exit the tour at any time.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button
                variant="primary"
                onClick={handleStartTour}
                className="w-full"
                data-testid="welcome-start-tour"
              >
                <SparklesIcon className="h-4 w-4" />
                Start Guided Tour
              </Button>
              <Button
                variant="secondary"
                onClick={handleContinueToApp}
                className="w-full"
                data-testid="welcome-skip-tour"
              >
                No Thanks, I&apos;ll Explore on My Own
              </Button>
            </div>
            <p className="text-caption text-text-muted text-center">
              You can restart the tour anytime from Settings.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
