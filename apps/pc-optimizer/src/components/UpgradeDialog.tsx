/**
 * UpgradeDialog — reusable Pro upgrade prompt.
 *
 * Can be triggered from anywhere in the app via the useUpgradeDialog hook.
 * Shows a comparison table, benefits, and calls onUpgrade / onLearnMore /
 * onContinue callbacks.
 */
import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import { Button, Card, Badge } from '@avs/ui';
import { useEdition } from '../config/EditionManager';

interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
  onLearnMore?: () => void;
  trigger?: string;
}

interface FeatureRow {
  feature: string;
  free: string | boolean;
  pro: string | boolean;
}

const COMPARISON: readonly FeatureRow[] = [
  { feature: 'Junk Cleaner (Basic)', free: true, pro: true },
  { feature: 'Junk Cleaner (Deep Scan)', free: false, pro: true },
  { feature: 'Startup Manager', free: true, pro: true },
  { feature: 'Privacy Cleaner', free: true, pro: true },
  { feature: 'Duplicate Finder', free: false, pro: true },
  { feature: 'Disk Analyzer', free: true, pro: true },
  { feature: 'Performance Boost Presets', free: false, pro: true },
  { feature: 'Scheduled Maintenance', free: false, pro: true },
  { feature: 'Priority Support', free: false, pro: true },
];

const PRO_BENEFITS: readonly string[] = [
  'Deep scan cleaning for browser caches, app data, and system traces',
  'Duplicate file finder with content hash verification',
  'One-click performance tuning presets for gaming, work, and battery',
  'Automatic scheduled maintenance — set it and forget it',
  'Priority customer support with remote assistance',
  'Free updates for life within the Pro edition',
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

export function UpgradeDialog({ open, onClose, onUpgrade, onLearnMore, trigger }: UpgradeDialogProps) {
  if (!open) return null;

  const handleUpgrade = () => {
    onUpgrade?.();
    onClose();
  };

  const handleLearnMore = () => {
    onLearnMore?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      data-testid="upgrade-dialog-overlay"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-bg p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="upgrade-dialog"
      >
        {trigger && (
          <div className="mb-2">
            <Badge tone="brand">{trigger}</Badge>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-primary">Upgrade to AVS PC Optimizer Pro</h2>
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

        <div className="mb-6">
          <h3 className="mb-2 text-sm font-semibold text-text-secondary">Pro Benefits</h3>
          <ul className="space-y-1.5">
            {PRO_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm text-text-secondary">
                <CheckIcon />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <Card title="Feature Comparison">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 text-left text-text-muted">Feature</th>
                  <th className="py-2 text-center text-text-muted">Free</th>
                  <th className="py-2 text-center text-brand-primary">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-border/50">
                    <td className="py-2 text-text-primary">{row.feature}</td>
                    <td className="py-2 text-center">
                      {row.free === true ? <CheckIcon /> : row.free === false ? <XIcon /> : <span className="text-text-muted">{row.free}</span>}
                    </td>
                    <td className="py-2 text-center">
                      {row.pro === true ? <CheckIcon /> : row.pro === false ? <XIcon /> : <span className="text-text-muted">{row.pro}</span>}
                    </td>
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
            <Button variant="primary" onClick={handleUpgrade} data-testid="upgrade-dialog-upgrade">
              Upgrade to Pro
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
        onLearnMore={() => {
          window.open('https://www.avs.example.com/pro', '_blank');
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
    if (edition === 'pro' || edition === 'enterprise') return true;
    show(trigger ?? `Pro feature: ${featureName}`);
    return false;
  };

  return { checkFeature, edition };
}
