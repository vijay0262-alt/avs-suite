/**
 * ProStatusBadge — premium status indicator for Professional edition.
 *
 * Shows a tasteful "Professional" badge with active feature indicators.
 * In Free edition, renders nothing — no upgrade nags, no lock icons.
 *
 * Usage:
 *   <ProStatusBanner />                    // Full banner with all indicators
 *   <ProStatusPill />                      // Compact pill badge
 *   <ProFeatureIndicator icon={...} label="Real-Time Protection" />  // Single indicator
 */
import { useIsPro } from '../sync/syncStore';
import {
  ShieldCheckIcon,
  BoltIcon,
  ClockIcon,
  CpuChipIcon,
  StarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType } from 'react';

interface ProStatusPillProps {
  className?: string;
}

export function ProStatusPill({ className = '' }: ProStatusPillProps) {
  const isPro = useIsPro();
  if (!isPro) return <FreeStatusPill className={className} />;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-primary/15 to-brand-secondary/15 border border-brand-primary/30 px-3 py-1 text-caption font-semibold text-brand-primary ${className}`}
      data-testid="pro-status-pill"
    >
      <StarIcon className="h-3.5 w-3.5" />
      Professional
    </span>
  );
}

/**
 * FreeStatusPill — shows "Free Edition" badge for non-Pro users.
 * Ensures users always know which edition they're running.
 */
export function FreeStatusPill({ className = '' }: ProStatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-[var(--avs-surface)] border border-[var(--avs-border)] px-3 py-1 text-caption font-medium text-text-secondary ${className}`}
      data-testid="free-status-pill"
    >
      Free Edition
    </span>
  );
}

interface ProFeatureIndicatorProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  className?: string;
}

export function ProFeatureIndicator({ icon: Icon, label, className = '' }: ProFeatureIndicatorProps) {
  const isPro = useIsPro();
  if (!isPro) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-semantic-success/10 border border-semantic-success/20 px-3 py-1.5 ${className}`}
      data-testid={`pro-indicator-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <Icon className="h-4 w-4 text-semantic-success" />
      <span className="text-caption font-medium text-semantic-success">{label}</span>
      <CheckCircleIcon className="h-3.5 w-3.5 text-semantic-success" />
    </div>
  );
}

interface ProStatusBannerProps {
  className?: string;
  /** Show the compact version (single row) vs full version (with indicators) */
  compact?: boolean;
}

export function ProStatusBanner({ className = '', compact = false }: ProStatusBannerProps) {
  const isPro = useIsPro();
  if (!isPro) return null;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-3 rounded-[var(--avs-radius-lg)] bg-gradient-to-r from-brand-primary/10 to-brand-secondary/10 border border-brand-primary/20 px-4 py-2.5 ${className}`}
        data-testid="pro-status-banner-compact"
      >
        <StarIcon className="h-5 w-5 text-brand-primary shrink-0" />
        <span className="text-small font-semibold text-brand-primary">AVS AI Shield Professional</span>
        <div className="flex items-center gap-2 ml-auto">
          <ProFeatureIndicator icon={ShieldCheckIcon} label="Real-Time Protection" />
          <ProFeatureIndicator icon={BoltIcon} label="Auto Optimization" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[var(--avs-radius-lg)] bg-gradient-to-r from-brand-primary/10 to-brand-secondary/10 border border-brand-primary/20 p-4 ${className}`}
      data-testid="pro-status-banner"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex p-2 rounded-full bg-brand-primary/15">
          <StarIcon className="h-5 w-5 text-brand-primary" />
        </div>
        <div>
          <div className="text-small font-bold text-brand-primary">AVS AI Shield Professional</div>
          <div className="text-caption text-text-secondary">Your PC is protected and optimized automatically</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <ProFeatureIndicator icon={ShieldCheckIcon} label="Real-Time Protection" />
        <ProFeatureIndicator icon={BoltIcon} label="Auto Optimization" />
        <ProFeatureIndicator icon={ClockIcon} label="Scheduled Maintenance" />
        <ProFeatureIndicator icon={CpuChipIcon} label="Background Monitoring" />
      </div>
    </div>
  );
}

/**
 * ProOnlySection — wraps content that should only be visible to Pro users.
 * In Free edition, renders null (no lock icon, no upgrade prompt).
 * Use this to show Pro-only UI sections like auto-optimization toggles,
 * scheduling controls, or advanced analytics.
 */
export function ProOnlySection({ children }: { children: React.ReactNode }) {
  const isPro = useIsPro();
  if (!isPro) return null;
  return <>{children}</>;
}
