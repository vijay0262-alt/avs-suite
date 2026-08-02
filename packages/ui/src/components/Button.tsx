import clsx from 'clsx';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

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
  'outline-none focus-visible:shadow-[var(--avs-focus-ring)] ' +
  'disabled:opacity-50 disabled:cursor-not-allowed select-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-brand text-white hover:shadow-glow hover:brightness-110 active:scale-[0.98]',
  secondary:
    'bg-[var(--avs-surface-muted)] text-[var(--avs-text-primary)] border border-[var(--avs-border)] hover:border-[var(--avs-border-hover)] hover:bg-[var(--avs-surface-elevated)]',
  ghost:
    'bg-transparent text-[var(--avs-text-primary)] hover:bg-[var(--avs-surface-muted)]',
  danger: 'bg-[var(--avs-danger)] text-white hover:brightness-110 active:scale-[0.98] hover:shadow-glow',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

/**
 * AVS primary Button primitive. Compose feature buttons on top of this;
 * never re-style base HTML `<button>` elements directly.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leftIcon, rightIcon, loading, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(base, variants[variant], sizes[size], className)}
      data-loading={loading || undefined}
      {...rest}
    >
      {leftIcon ? <span className="shrink-0">{leftIcon}</span> : null}
      <span>{children}</span>
      {rightIcon ? <span className="shrink-0">{rightIcon}</span> : null}
    </button>
  );
});
