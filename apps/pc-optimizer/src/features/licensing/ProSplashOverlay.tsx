/**
 * ProSplashOverlay — premium welcome experience for Professional edition users.
 *
 * Shows a brief animated splash on app launch celebrating Pro ownership:
 *   - Brand logo + "AVS AI Shield Professional" title
 *   - Active feature indicators (Real-Time Protection, AVS AI Assistant, etc.)
 *   - Personalized greeting
 *   - Auto-dismisses after 3 seconds or on click/Escape
 *
 * In Free edition, renders nothing — no upgrade nags at launch.
 */
import { useEffect, useState, useCallback } from 'react';
import { useIsPro } from '../sync/syncStore';
import {
  ShieldCheckIcon,
  SparklesIcon,
  BoltIcon,
  ClockIcon,
  CheckCircleIcon,
  StarIcon,
} from '@heroicons/react/24/outline';

const SPLASH_SEEN_KEY = 'avs-pro-splash-seen';
const SPLASH_DURATION_MS = 3000;

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function ProSplashOverlay() {
  const isPro = useIsPro();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isPro) return;

    // Only show once per session
    const seen = sessionStorage.getItem(SPLASH_SEEN_KEY);
    if (seen) return;

    sessionStorage.setItem(SPLASH_SEEN_KEY, '1');
    setVisible(true);
  }, [isPro]);

  const dismiss = useCallback(() => setVisible(false), []);

  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(dismiss, SPLASH_DURATION_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
    };
  }, [visible, dismiss]);

  if (!visible) return null;

  const indicators = [
    { icon: ShieldCheckIcon, label: 'Real-Time Protection Active' },
    { icon: SparklesIcon, label: 'AVS AI Assistant Ready' },
    { icon: ClockIcon, label: 'Scheduled Maintenance Enabled' },
    { icon: BoltIcon, label: 'Automatic Optimization Enabled' },
  ];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--avs-bg)]/95 backdrop-blur-sm animate-in fade-in duration-300"
      onClick={dismiss}
      data-testid="pro-splash-overlay"
    >
      <div
        className="flex flex-col items-center text-center max-w-md px-8"
        style={{ animation: 'pro-splash-rise 0.5s ease-out' }}
      >
        {/* Logo */}
        <div
          className="h-16 w-16 rounded-[var(--avs-radius-xl)] flex items-center justify-center mb-6"
          style={{ background: 'var(--avs-gradient-brand)' }}
        >
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15L15 9.75" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          </svg>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2 mb-1">
          <StarIcon className="h-5 w-5 text-brand-primary" />
          <h1 className="text-xl font-bold text-text-primary">AVS AI Shield Professional</h1>
        </div>

        {/* Active indicators */}
        <div className="grid grid-cols-2 gap-3 mt-6 w-full">
          {indicators.map((ind) => (
            <div
              key={ind.label}
              className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-semantic-success/10 border border-semantic-success/20 px-3 py-2"
            >
              <ind.icon className="h-4 w-4 text-semantic-success shrink-0" />
              <span className="text-caption font-medium text-semantic-success text-left">{ind.label}</span>
              <CheckCircleIcon className="h-3.5 w-3.5 text-semantic-success ml-auto shrink-0" />
            </div>
          ))}
        </div>

        {/* Greeting */}
        <div className="mt-8">
          <p className="text-section-title font-semibold text-text-primary">{getGreeting()}</p>
          <p className="mt-1 text-small text-text-secondary">Your PC is protected and optimized.</p>
        </div>

        {/* Skip hint */}
        <p className="mt-8 text-caption text-text-muted">
          Click or press Escape to continue
        </p>
      </div>

      <style>{`
        @keyframes pro-splash-rise {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
