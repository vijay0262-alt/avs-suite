/**
 * UpgradeDialog — modal shown when a user attempts to use a locked feature.
 *
 * Displays the benefits of upgrading and provides buttons to upgrade
 * to Professional or Ultimate, or continue with Free.
 */
import { Button, Card } from '@avs/ui';
import { LockClosedIcon, CheckIcon } from '@heroicons/react/24/outline';
import { Modal } from '../dashboard/components/Modal';

export type UpgradeTier = 'professional' | 'ultimate';

interface UpgradeDialogProps {
  open: boolean;
  moduleName: string;
  features: string[];
  onClose: () => void;
  onUpgrade?: (tier: UpgradeTier) => void;
}

const TIER_FEATURES: Record<UpgradeTier, string[]> = {
  professional: [
    'Registry Cleaning',
    'Startup Optimization',
    'Privacy Cleaning',
    'Scheduled Optimization',
  ],
  ultimate: [
    'Everything in Professional',
    'Duplicate File Finder',
    'Software Updater',
    'Performance Optimization',
    'Priority Support',
  ],
};

export function UpgradeDialog({ open, moduleName, features, onClose, onUpgrade }: UpgradeDialogProps) {
  return (
    <Modal
      open={open}
      title={`${moduleName} — Professional Feature`}
      onClose={onClose}
      size="md"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose} data-testid="upgrade-continue-free">
            Continue with Free
          </Button>
          <Button
            onClick={() => onUpgrade?.('professional')}
            data-testid="upgrade-professional-btn"
          >
            Upgrade to Professional
          </Button>
          <Button
            variant="primary"
            onClick={() => onUpgrade?.('ultimate')}
            data-testid="upgrade-ultimate-btn"
          >
            Upgrade to Ultimate
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex p-2 rounded-full bg-semantic-warning/10">
            <LockClosedIcon className="h-6 w-6 text-semantic-warning" aria-hidden />
          </div>
          <div>
            <div className="text-base font-semibold text-text-primary">
              {moduleName} requires a paid license
            </div>
            <div className="text-sm text-text-secondary">
              You're currently using the Free edition.
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-text-muted">
            Unlock with Professional:
          </div>
          {TIER_FEATURES.professional.map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-text-primary">
              <CheckIcon className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-text-muted">
            Unlock with Ultimate:
          </div>
          {TIER_FEATURES.ultimate.map((f) => (
            <div key={f} className="flex items-center gap-2 text-sm text-text-primary">
              <CheckIcon className="h-4 w-4 text-semantic-success shrink-0" aria-hidden />
              <span>{f}</span>
            </div>
          ))}
        </div>

        {features.length > 0 && (
          <Card className="bg-surface-muted">
            <div className="text-xs text-text-secondary">
              This action ({features.join(', ')}) is not available in the Free edition.
              Upgrade now to unlock all features.
            </div>
          </Card>
        )}
      </div>
    </Modal>
  );
}
