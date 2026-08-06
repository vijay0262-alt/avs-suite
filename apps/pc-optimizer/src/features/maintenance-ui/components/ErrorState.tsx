/**
 * ErrorState — error display with retry action.
 */
import { ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button } from '@avs/ui';

export interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  testId?: string;
}

export function ErrorState({ message, onRetry, testId }: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center py-16 text-center"
      data-testid={testId ?? 'error-state'}
      role="alert"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--avs-danger)_12%,transparent)] text-[var(--avs-danger)]">
        <ExclamationTriangleIcon className="h-8 w-8" />
      </div>
      <h3 className="text-base font-semibold text-[var(--avs-text-primary)]">
        Something went wrong
      </h3>
      <p className="mt-1 max-w-sm text-small text-[var(--avs-text-secondary)]">
        {message ?? 'An unexpected error occurred while loading data.'}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<ArrowPathIcon className="h-4 w-4" />}
          className="mt-4"
        >
          Retry
        </Button>
      )}
    </div>
  );
}
