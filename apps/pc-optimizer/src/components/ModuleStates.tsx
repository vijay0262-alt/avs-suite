/**
 * Shared module state components — consistent loading, error, empty, and success states.
 *
 * Every feature module should use these instead of ad-hoc inline markup
 * to ensure visual and behavioral consistency across the app.
 */
import type { ReactNode } from 'react';
import { Card } from '@avs/ui';
import { Button } from '@avs/ui';
import {
  ExclamationTriangleIcon,
  ArrowPathIcon,
  InboxIcon,
  CheckCircleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

// ── Loading State ────────────────────────────────────────────────

export function ModuleLoadingState({
  message = 'Loading…',
  testId,
}: {
  message?: string;
  testId?: string;
}) {
  return (
    <Card>
      <div
        className="flex flex-col items-center justify-center py-12"
        data-testid={testId ?? 'module-loading'}
        role="status"
        aria-live="polite"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--avs-border)] border-t-brand-primary" />
        <p className="mt-3 text-sm text-text-secondary">{message}</p>
      </div>
    </Card>
  );
}

// ── Error State ──────────────────────────────────────────────────

export function ModuleErrorState({
  message,
  onRetry,
  retryLabel = 'Retry',
  testId,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
}) {
  return (
    <Card>
      <div
        className="flex flex-col items-center justify-center py-12"
        data-testid={testId ?? 'module-error'}
        role="alert"
        aria-live="assertive"
      >
        <ExclamationTriangleIcon className="h-10 w-10 text-semantic-danger" aria-hidden />
        <p className="mt-3 max-w-md text-center text-sm font-medium text-text-primary">
          Something went wrong
        </p>
        <p className="mt-1 max-w-md text-center text-xs text-text-muted">{message}</p>
        {onRetry && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            className="mt-4"
            data-testid={(testId ?? 'module-error') + '-retry'}
          >
            {retryLabel}
          </Button>
        )}
      </div>
    </Card>
  );
}

// ── Empty State ──────────────────────────────────────────────────

export function ModuleEmptyState({
  icon: Icon = InboxIcon,
  title = 'Nothing to show',
  message,
  action,
  testId,
}: {
  icon?: typeof InboxIcon;
  title?: string;
  message?: string;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <Card>
      <div
        className="flex flex-col items-center justify-center py-12"
        data-testid={testId ?? 'module-empty'}
      >
        <Icon className="h-10 w-10 text-text-muted" aria-hidden />
        <p className="mt-3 text-sm font-medium text-text-primary">{title}</p>
        {message && <p className="mt-1 max-w-md text-center text-xs text-text-muted">{message}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </Card>
  );
}

// ── Success Banner ───────────────────────────────────────────────

export function ModuleSuccessBanner({
  title,
  message,
  onDismiss,
  testId,
}: {
  title: string;
  message?: string;
  onDismiss?: () => void;
  testId?: string;
}) {
  return (
    <Card className="mb-4">
      <div
        className="flex items-start gap-3 py-1"
        data-testid={testId ?? 'module-success'}
        role="status"
        aria-live="polite"
      >
        <CheckCircleIcon className="h-5 w-5 shrink-0 text-semantic-success" aria-hidden />
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">{title}</p>
          {message && <p className="mt-0.5 text-xs text-text-secondary">{message}</p>}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-text-muted hover:text-text-primary transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
            aria-label="Dismiss"
            data-testid={(testId ?? 'module-success') + '-dismiss'}
          >
            ✕
          </button>
        )}
      </div>
    </Card>
  );
}

// ── Error Banner ─────────────────────────────────────────────────

export function ModuleErrorBanner({
  message,
  onRetry,
  onDismiss,
  testId,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  testId?: string;
}) {
  return (
    <Card className="mb-4">
      <div
        className="flex items-start gap-3 py-1"
        data-testid={testId ?? 'module-error-banner'}
        role="alert"
        aria-live="assertive"
      >
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-semantic-danger" aria-hidden />
        <div className="flex-1">
          <p className="text-sm text-semantic-danger">{message}</p>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            leftIcon={<ArrowPathIcon className="h-3.5 w-3.5" />}
            data-testid={(testId ?? 'module-error-banner') + '-retry'}
          >
            Retry
          </Button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-text-muted hover:text-text-primary transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </Card>
  );
}

// ── Info Banner ──────────────────────────────────────────────────

export function ModuleInfoBanner({
  message,
  onDismiss,
  testId,
}: {
  message: string;
  onDismiss?: () => void;
  testId?: string;
}) {
  return (
    <Card className="mb-4">
      <div
        className="flex items-start gap-3 py-1"
        data-testid={testId ?? 'module-info-banner'}
        role="status"
      >
        <InformationCircleIcon className="h-5 w-5 shrink-0 text-semantic-info" aria-hidden />
        <div className="flex-1">
          <p className="text-sm text-text-secondary">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-text-muted hover:text-text-primary transition-colors duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </Card>
  );
}
