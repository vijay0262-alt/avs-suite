import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'info';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium rounded-[var(--avs-radius-md)] ' +
  'transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)] ' +
  'outline-none focus-visible:shadow-focus ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none select-none ' +
  'active:scale-[0.97]';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-brand text-white shadow-sm hover:shadow-glow hover:brightness-110',
  secondary:
    'bg-[var(--avs-surface-muted)] text-[var(--avs-text-primary)] border border-[var(--avs-border)] ' +
    'hover:border-[var(--avs-border-hover)] hover:bg-[var(--avs-surface-elevated)]',
  ghost:
    'bg-transparent text-[var(--avs-text-secondary)] hover:bg-[var(--avs-surface-muted)] hover:text-[var(--avs-text-primary)]',
  danger:
    'bg-[var(--avs-danger)] text-white shadow-sm hover:brightness-110 hover:shadow-glow',
  info:
    'bg-[var(--avs-info)] text-white shadow-sm hover:brightness-110 hover:shadow-glow',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-10 px-4 text-body',
  lg: 'h-12 px-6 text-body',
  icon: 'h-9 w-9 p-0',
};

/**
 * AVS primary Button primitive. Compose feature buttons on top of this;
 * never re-style base HTML `<button>` elements directly.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leftIcon, rightIcon, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(base, variants[variant], sizes[size], className)}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="shrink-0 animate-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent" />
      ) : leftIcon ? (
        <span className="shrink-0">{leftIcon}</span>
      ) : null}
      <span>{children}</span>
      {!loading && rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
});
