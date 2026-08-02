/**
 * HardwareCard — wrapper around Card with consistent hardware styling.
 */
import type { ReactNode, HTMLAttributes } from 'react';
import { Card, Badge } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';

interface HardwareCardProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  model: string;
  badge?: string;
  badgeTone?: BadgeTone;
  children: ReactNode;
}

export function HardwareCard({ title, model, badge, badgeTone, children, ...rest }: HardwareCardProps) {
  return (
    <Card
      title={
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {badge && <Badge tone={badgeTone ?? 'neutral'}>{badge}</Badge>}
        </div>
      }
      {...rest}
    >
      <div className="mb-3 text-sm font-medium text-text-primary">{model}</div>
      <div className="divide-y divide-[var(--avs-border)]">{children}</div>
    </Card>
  );
}
