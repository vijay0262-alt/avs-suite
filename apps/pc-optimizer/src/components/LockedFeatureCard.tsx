/**
 * LockedFeatureCard — displays a locked feature with a professional
 * upsell presentation instead of hiding it.
 *
 * Shows:
 * - Lock icon
 * - Feature name
 * - Short explanation of what the feature does
 * - Benefits the user gains by upgrading
 * - Upgrade button
 */
import { type ReactNode } from 'react';
import { Button, Card, Badge } from '@avs/ui';
import { useUpgradeDialog } from './UpgradeDialog';

interface LockedFeatureCardProps {
  /** Feature name displayed to the user. */
  featureName: string;
  /** Short explanation of what the feature does. */
  explanation: string;
  /** Benefits the user gains by upgrading. */
  benefits: readonly string[];
  /** Minimum edition required (for badge display). */
  requiredEdition: 'professional' | 'ultimate';
  /** Optional icon node. */
  icon?: ReactNode;
  /** Optional trigger label for the upgrade dialog. */
  trigger?: string;
  /** Optional children rendered below the benefits list. */
  children?: ReactNode;
}

function LockIcon() {
  return (
    <svg
      className="h-6 w-6 text-text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      data-testid="locked-feature-icon"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

export function LockedFeatureCard({
  featureName,
  explanation,
  benefits,
  requiredEdition,
  icon,
  trigger,
  children,
}: LockedFeatureCardProps) {
  const { show } = useUpgradeDialog();

  const handleUpgrade = () => {
    show(trigger ?? `Upgrade to unlock ${featureName}`);
  };

  return (
    <Card title={featureName}>
      <div className="flex flex-col items-center py-6 text-center" data-testid="locked-feature-card">
        <div className="mb-3 flex items-center justify-center">
          {icon ?? <LockIcon />}
        </div>
        <Badge tone="brand" >
          {requiredEdition === 'ultimate' ? 'Ultimate' : 'Professional'} Edition Required
        </Badge>
        <p className="mt-3 max-w-md text-sm text-text-secondary">{explanation}</p>

        {benefits.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-left">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm text-text-secondary">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        )}

        {children}

        <Button
          variant="primary"
          onClick={handleUpgrade}
          className="mt-5"
          data-testid="locked-feature-upgrade-btn"
        >
          Upgrade to {requiredEdition === 'ultimate' ? 'Ultimate' : 'Professional'}
        </Button>
      </div>
    </Card>
  );
}
