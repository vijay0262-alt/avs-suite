/**
 * UpgradeDialog — tasteful modal shown when a Free user reaches a usage limit
 * or attempts a Pro-only enhanced action.
 *
 * Design principles:
 * - No scare tactics, no lock icons
 * - Explains what the feature does and why it's useful
 * - One-click upgrade
 * - "Don't remind me again" option
 * - Never shown in Professional edition
 */
import { useState } from 'react';
import { Button, Card } from '@avs/ui';
import { StarIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Modal } from '../dashboard/components/Modal';

export type UpgradeTier = 'professional';

export interface UpgradeDialogProps {
  open: boolean;
  moduleName: string;
  features: string[];
  /** Human-readable explanation of the limit reached (e.g. "You've cleaned 500 MB of junk files.") */
  limitDescription?: string;
  /** What Professional unlocks for this module (e.g. "Unlimited junk cleaning") */
  proBenefit?: string;
  onClose: () => void;
  onUpgrade?: (tier: UpgradeTier) => void;
  /** Called when user checks "Don't remind me again" — should persist dismissal */
  onDontRemind?: (moduleName: string) => void;
}

const TIER_FEATURES: Record<UpgradeTier, string[]> = {
  professional: [
    'Unlimited operations across all modules',
    'Automatic optimization & scheduling',
    'Real-time protection & continuous monitoring',
    'Full AI briefing & advanced analytics',
    'Historical trends & forecasting',
    'Export to PDF, CSV, JSON & Excel',
    'Priority customer support',
  ],
};

export function UpgradeDialog({
  open,
  moduleName,
  features,
  limitDescription,
  proBenefit,
  onClose,
  onUpgrade,
  onDontRemind,
}: UpgradeDialogProps) {
  const [dontRemind, setDontRemind] = useState(false);

  const handleClose = () => {
    if (dontRemind && onDontRemind) {
      onDontRemind(moduleName);
    }
    setDontRemind(false);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={`${moduleName} — Professional Feature`}
      onClose={handleClose}
      size="md"
      actions={
        <div className="flex flex-col gap-3 w-full">
          <label className="flex items-center gap-2 text-caption text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontRemind}
              onChange={(e) => setDontRemind(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--avs-border)] accent-[var(--avs-brand-primary)]"
              data-testid="upgrade-dont-remind"
            />
            Don&apos;t remind me again for this feature
          </label>
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={handleClose} data-testid="upgrade-continue-free">
              Continue with Free
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setDontRemind(false);
                onUpgrade?.('professional');
              }}
              data-testid="upgrade-professional-btn"
              leftIcon={<StarIcon className="h-4 w-4" />}
            >
              Upgrade to Professional
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex p-2 rounded-full bg-semantic-warning/10">
            <StarIcon className="h-6 w-6 text-semantic-warning" aria-hidden />
          </div>
          <div>
            <div className="text-base font-semibold text-text-primary">
              {proBenefit ? proBenefit : `${moduleName} offers enhanced capabilities`}
            </div>
            <div className="text-small text-text-secondary">
              You&apos;re using the Free edition. Upgrade for the full experience.
            </div>
          </div>
        </div>

        {limitDescription && (
          <Card className="bg-[var(--avs-surface-muted)] border-[var(--avs-border)]">
            <div className="text-small text-text-secondary">
              {limitDescription}
            </div>
          </Card>
        )}

        <div className="space-y-2">
          <div className="text-caption uppercase tracking-wide text-text-muted">
            What Professional unlocks:
          </div>
          {TIER_FEATURES.professional.map((f) => (
            <div key={f} className="flex items-center gap-2 text-small text-text-primary">
              <CheckIcon className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />
              <span>{f}</span>
            </div>
          ))}
        </div>

        {features.length > 0 && (
          <div className="text-caption text-text-muted">
            Affected capabilities: {features.join(', ')}
          </div>
        )}
      </div>
    </Modal>
  );
}
