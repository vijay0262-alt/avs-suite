import type { ReactNode } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
  testId?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
};

/**
 * Local modal primitive for the cleaning flow. Kept in-feature (not
 * promoted to `@avs/ui`) until a second consumer exists.
 */
export function Modal({ open, title, onClose, actions, children, testId, size = 'md' }: ModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-[700] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      data-testid={testId}
    >
      <div
        className={`${SIZE[size]} w-full mx-4 rounded-[var(--avs-radius-xl)] border border-border bg-surface shadow-[var(--avs-shadow-xl,var(--avs-shadow-lg))]`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 id="modal-title" className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-surface-muted hover:text-text-primary"
            aria-label="Close"
            data-testid={testId ? `${testId}-close` : undefined}
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-4">{children}</div>
        {actions && (
          <footer className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
            {actions}
          </footer>
        )}
      </div>
    </div>
  );
}
