import React from 'react';
import { HEALTH_BADGE_CONFIG } from '../dashboard.types';
import type { HealthBadgeType } from '../dashboard.types';

export interface HealthBadgeProps {
  badge: HealthBadgeType;
  size?: 'sm' | 'md' | 'lg';
}

export const HealthBadge = React.memo(function HealthBadge({ badge, size = 'md' }: HealthBadgeProps) {
  const config = HEALTH_BADGE_CONFIG[badge];
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-1.5 text-base',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.colorClass} ${config.bgClass} ${sizeClasses[size]} transition-colors duration-500`}
      data-testid={`health-badge-${badge}`}
    >
      {config.label}
    </span>
  );
});
