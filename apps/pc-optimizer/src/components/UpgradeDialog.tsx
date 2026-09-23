/**
 * UpgradeDialog — reusable upgrade prompt for Free / Professional / Ultimate.
 *
 * Can be triggered from anywhere in the app via the useUpgradeDialog hook.
 * Shows:
 * - Current edition
 * - Professional benefits
 * - Ultimate benefits
 * - Feature comparison table (Free vs Pro vs Ultimate)
 * - Upgrade button
 * - Activate License button
 * - Learn More
 * - Continue with Free
 */
import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Badge } from '@avs/ui';
import { useEdition } from '../config/EditionManager';
import { useAuthStore } from '../features/auth/authStore';
import type { Edition } from '@avs/shared/featureFlags';

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
  onActivate?: () => void;
  onLearnMore?: () => void;
  trigger?: string;
}

interface FeatureRow {
  feature: string;
  free: string | boolean;
  professional: string | boolean;
}

const COMPARISON: readonly FeatureRow[] = [
  { feature: 'Junk Cleaner (Basic)', free: true, professional: true },
  { feature: 'Junk Cleaner (Deep Scan)', free: false, professional: true },
  { feature: 'Unlimited Junk Cleaning', free: '500 MB/run', professional: true },
  { feature: 'Registry Fix', free: true, professional: true },
  { feature: 'Startup Disable', free: true, professional: true },
  { feature: 'Privacy Cleaning', free: false, professional: true },
  { feature: 'Duplicate File Finder', free: false, professional: true },
  { feature: 'Disk Analyzer', free: false, professional: true },
  { feature: 'Uninstaller', free: false, professional: true },
  { feature: 'Software Updater', free: false, professional: true },
  { feature: 'Uninstaller Deep Cleanup', free: false, professional: true },
  { feature: 'Software Update (Manual)', free: false, professional: true },
  { feature: 'Performance Optimization', free: false, professional: true },
  { feature: 'Scheduled Maintenance', free: false, professional: true },
  { feature: 'Smart Recommendations', free: false, professional: true },
  { feature: 'Optimization History', free: false, professional: true },
  { feature: 'Health Timeline', free: false, professional: true },
  { feature: 'AI Smart Optimization & Auto-Care', free: false, professional: true },
  { feature: 'Automatic Background Cleanup', free: false, professional: true },
  { feature: 'Real-Time Health Monitoring', free: false, professional: true },
  { feature: 'Auto Startup Optimization', free: false, professional: true },
  { feature: 'Browser Extension Manager', free: 'View only', professional: true },
  { feature: 'App Freezer', free: 'View only', professional: true },
  { feature: 'Anomaly Detection', free: 'View only', professional: true },
  { feature: 'Priority Support', free: false, professional: true },
];

const PROFESSIONAL_BENEFITS: readonly string[] = [
  'Unlimited junk cleaning — no daily cap',
  'Full registry cleaning with unlimited fixes',
  'Startup optimization — disable unwanted startup items',
  'Privacy cleaning — clear all browser and system traces',
  'Duplicate file finder with content hash verification',
  'Deep uninstaller cleanup for residual files and registry',
  'Manual software updates for installed applications',
  'One-click performance tuning presets for gaming, work, and battery',
  'Scheduled maintenance — weekly, monthly, or custom',
  'AI Smart Optimization & Auto-Care — automatic system tuning',
  'Automatic background cleanup — no user intervention needed',
  'Real-time health monitoring with instant alerts',
  'Smart recommendations powered by system analysis',
  'Optimization history and health timeline',
  'Priority email support',
];

function CheckIcon() {
  return (
    <svg className="h-4 w-4 text-semantic-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4 text-semantic-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function renderCell(value: string | boolean): ReactNode {
  if (value === true) return <CheckIcon />;
  if (value === false) return <XIcon />;
  return <span className="text-text-muted text-caption">{value}</span>;
}

const EDITION_LABELS: Record<Edition, string> = {
  free: 'Free',
  professional: 'Professional',
};

const STRIPE_PAYMENT_LINKS = {
  yearly: 'https://buy.stripe.com/28E5kDeNNc8U995g2a0x200',
  monthly: 'https://buy.stripe.com/4gM5kDdJJ8WIdpl7vE0x201',
} as const;

type BillingInterval = keyof typeof STRIPE_PAYMENT_LINKS;

function buildCheckoutUrl(interval: BillingInterval, customerId: string, email: string): string {
  const url = new URL(STRIPE_PAYMENT_LINKS[interval]);
  url.searchParams.set('client_reference_id', customerId);
  url.searchParams.set('prefilled_email', email);
  return url.toString();
}

export function UpgradeDialog({ open, onClose, onUpgrade, onActivate, onLearnMore, trigger }: UpgradeDialogProps) {
  const currentEdition = useEdition();
  if (!open) return null;

  const handleUpgrade = () => {
    onUpgrade?.();
    onClose();
  };

  const handleActivate = () => {
    onActivate?.();
    onClose();
  };

  const handleLearnMore = () => {
    onLearnMore?.();
  };

  const showProfessional = currentEdition === 'free';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      data-testid="upgrade-dialog-overlay"
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-[var(--avs-border)] bg-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="upgrade-dialog"
      >
        {trigger && (
          <div className="mb-2">
            <Badge tone="brand">{trigger}</Badge>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-text-primary">Upgrade Your Edition</h2>
            <Badge tone="neutral" data-testid="upgrade-dialog-current-edition">
              Current: {EDITION_LABELS[currentEdition]}
            </Badge>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
            aria-label="Close"
            data-testid="upgrade-dialog-close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {showProfessional && (
          <div className="mb-6" data-testid="upgrade-dialog-professional-section">
            <h3 className="mb-2 text-small font-semibold text-text-secondary">Professional Benefits</h3>
            <ul className="space-y-1.5">
              {PROFESSIONAL_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2 text-small text-text-secondary">
                  <CheckIcon />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Card title="Feature Comparison">
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead>
                <tr className="border-b border-[var(--avs-border)]">
                  <th className="py-2 text-left text-text-muted">Feature</th>
                  <th className="py-2 text-center text-text-muted">Free</th>
                  <th className="py-2 text-center text-brand-primary">Professional</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-[var(--avs-border)]/50">
                    <td className="py-2 text-text-primary">{row.feature}</td>
                    <td className="py-2 text-center">{renderCell(row.free)}</td>
                    <td className="py-2 text-center">{renderCell(row.professional)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="secondary" onClick={handleLearnMore} data-testid="upgrade-dialog-learn-more">
            Learn More
          </Button>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onClose} data-testid="upgrade-dialog-continue-free">
              Continue with Free
            </Button>
            <Button variant="secondary" onClick={handleActivate} data-testid="upgrade-dialog-activate-license">
              Activate License
            </Button>
            <Button variant="primary" onClick={handleUpgrade} data-testid="upgrade-dialog-upgrade">
              Upgrade
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Hook for programmatic access ----

interface UpgradeDialogState {
  open: boolean;
  trigger?: string;
  show: (trigger?: string) => void;
  hide: () => void;
}

const UpgradeDialogContext = createContext<UpgradeDialogState>({
  open: false,
  show: () => {},
  hide: () => {},
});

export function UpgradeDialogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<string | undefined>(undefined);
  const navigate = useNavigate();
  const customer = useAuthStore((state) => state.customer);

  const show = useCallback((t?: string) => {
    setTrigger(t);
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
    setTrigger(undefined);
  }, []);

  return (
    <UpgradeDialogContext.Provider value={{ open, trigger, show, hide }}>
      {children}
      <UpgradeDialog
        open={open}
        trigger={trigger}
        onClose={hide}
        onUpgrade={() => {
          if (customer?.id && customer?.email) {
            window.open(buildCheckoutUrl('yearly', customer.id, customer.email), '_blank');
          } else {
            window.open('https://www.avsshield.com/pricing', '_blank');
          }
        }}
        onActivate={() => {
          navigate('/license');
        }}
        onLearnMore={() => {
          window.open('https://www.avsshield.com/editions', '_blank');
        }}
      />
    </UpgradeDialogContext.Provider>
  );
}

export function useUpgradeDialog(): UpgradeDialogState {
  return useContext(UpgradeDialogContext);
}

// ---- Convenience hook: gate a feature and show upgrade dialog ----

export function useFeatureGate() {
  const edition = useEdition();
  const { show } = useUpgradeDialog();

  const checkFeature = (featureName: string, trigger?: string): boolean => {
    if (edition === 'professional') return true;
    show(trigger ?? `Professional feature: ${featureName}`);
    return false;
  };

  return { checkFeature, edition };
}
