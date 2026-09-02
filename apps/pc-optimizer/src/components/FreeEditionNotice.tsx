/**
 * FreeEditionNotice — consistent upgrade prompt for Free edition users.
 *
 * Shows a standardized amber-tinted card with an icon, message, and
 * optional CTA. Use this on any feature page where Free users hit
 * edition limits.
 */
import type { ComponentType, ReactNode } from 'react';
import { Card } from '@avs/ui';
import { BoltIcon } from '@heroicons/react/24/outline';

interface FreeEditionNoticeProps {
  /** Icon to display in the badge circle. Defaults to BoltIcon. */
  icon?: ComponentType<{ className?: string }>;
  /** Short label shown in the badge circle, e.g. "PRO". Mutually exclusive with icon. */
  badgeLabel?: string;
  /** Main heading text. */
  title: string;
  /** Supporting description. */
  message: string;
  /** Optional CTA content (e.g. a Button to open upgrade dialog). */
  action?: ReactNode;
  testId?: string;
  className?: string;
}

export function FreeEditionNotice({
  icon: Icon = BoltIcon,
  badgeLabel,
  title,
  message,
  action,
  testId = 'free-edition-notice',
  className = '',
}: FreeEditionNoticeProps) {
  return (
    <Card variant="glass" className={`p-6 border-amber-500/30 bg-amber-500/5 ${className}`} data-testid={testId}>
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
          {badgeLabel ? (
            <span className="text-amber-500 text-xl font-bold">{badgeLabel}</span>
          ) : (
            <Icon className="h-6 w-6 text-amber-500" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-small font-semibold text-text-primary">{title}</p>
          <p className="mt-1 text-caption text-text-secondary">{message}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </Card>
  );
}
