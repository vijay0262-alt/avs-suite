/**
 * useFeatureGuard — React hook for feature-gated actions.
 *
 * Returns a function that checks FeatureGate before executing an action.
 * If the feature is locked, it opens the UpgradeDialog instead of executing.
 *
 * Usage:
 *   const guard = useFeatureGuard();
 *   <Button onClick={() => guard('registry.fix', 'Registry Cleaner', () => vm.clean())} />
 */
import { useState, useCallback } from 'react';
import { canUse } from './FeatureGate';
import type { ManagedFeature } from '@avs/licensing';
import { UpgradeDialog, type UpgradeTier } from './UpgradeDialog';

interface UpgradeDialogState {
  open: boolean;
  moduleName: string;
  features: string[];
}

export function useFeatureGuard() {
  const [dialog, setDialog] = useState<UpgradeDialogState>({
    open: false,
    moduleName: '',
    features: [],
  });

  const guard = useCallback(
    (feature: ManagedFeature, moduleName: string, action: () => void): void => {
      if (canUse(feature)) {
        action();
      } else {
        setDialog({ open: true, moduleName, features: [feature] });
      }
    },
    [],
  );

  const guardAsync = useCallback(
    async (feature: ManagedFeature, moduleName: string, action: () => Promise<void>): Promise<void> => {
      if (canUse(feature)) {
        await action();
      } else {
        setDialog({ open: true, moduleName, features: [feature] });
      }
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setDialog({ open: false, moduleName: '', features: [] });
  }, []);

  const handleUpgrade = useCallback(
    (_tier: UpgradeTier) => {
      closeDialog();
      // Navigate to activation page — architecture prepared for purchase flow
      if (typeof window !== 'undefined') {
        window.location.hash = '#/license/activation';
      }
    },
    [closeDialog],
  );

  const dialogElement = (
    <UpgradeDialog
      open={dialog.open}
      moduleName={dialog.moduleName}
      features={dialog.features}
      onClose={closeDialog}
      onUpgrade={handleUpgrade}
    />
  );

  return { guard, guardAsync, dialogElement };
}
