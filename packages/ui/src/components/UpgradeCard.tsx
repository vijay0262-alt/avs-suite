import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Card } from './Card';
import { Badge } from './Badge';

export interface UpgradeCardProps {
  title?: string;
  description?: string;
  features?: string[];
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  className?: string;
  'data-testid'?: string;
}

/**
 * UpgradeCard — elegant upgrade prompt for Professional features.
 * Shows value proposition without excessive lock icons.
 */
export function UpgradeCard({
  title = 'Upgrade to Professional',
  description = 'Unlock advanced AI features, real-time protection, and predictive health monitoring.',
  features = [],
  icon,
  action,
  className,
  ...rest
}: UpgradeCardProps) {
  return (
    <Card
      variant="gradient"
      className={clsx('relative overflow-hidden', className)}
      {...rest as Record<string, unknown>}
    >
      {/* Subtle brand glow */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-[var(--avs-brand-glow)] blur-3xl" />

      <div className="relative">
        <div className="flex items-start gap-3 mb-3">
          {icon && (
            <div className="p-2.5 rounded-[var(--avs-radius-md)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_15%,transparent)] text-[var(--avs-brand-primary)]">
              {icon}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--avs-text-primary)]">{title}</h3>
              <Badge tone="brand">PRO</Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--avs-text-secondary)] leading-relaxed">{description}</p>
          </div>
        </div>

        {features.length > 0 && (
          <ul className="space-y-1.5 mb-4">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-[var(--avs-text-secondary)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--avs-brand-primary)]" />
                {f}
              </li>
            ))}
          </ul>
        )}

        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--avs-radius-md)] text-sm font-medium bg-gradient-brand text-white hover:shadow-glow hover:brightness-110 transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]"
          >
            {action.label}
          </button>
        )}
      </div>
    </Card>
  );
}
