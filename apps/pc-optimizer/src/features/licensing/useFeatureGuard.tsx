/**
 * useFeatureGuard — React hook for edition-aware feature gating.
 *
 * V2.0: Limit-based gating, not lock-based.
 * - Free users can access all pages and use features up to defined limits.
 * - When a limit is reached, a tasteful UpgradeDialog explains the benefit.
 * - "Don't remind me again" persists per-module dismissal.
 * - Professional edition: never shows any upgrade UI.
 *
 * Usage:
 *   const { guard, guardAsync, dialogElement } = useFeatureGuard();
 *   guard('junk.clean', 'Junk Cleaner', () => vm.clean(), {
 *     limitDescription: 'You\'ve cleaned 500 MB of junk files.',
 *     proBenefit: 'Unlimited junk cleaning with no size restrictions.',
 *   });
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { canUse } from './FeatureGate';
import type { ManagedFeature } from '@avs/licensing';
import { UpgradeDialog, type UpgradeTier } from './UpgradeDialog';
import { useIsPro } from '../sync/syncStore';

interface UpgradeDialogState {
  open: boolean;
  moduleName: string;
  features: string[];
  limitDescription?: string;
  proBenefit?: string;
}

const DISMISS_KEY = 'avs-upgrade-dismissed';

function isDismissed(moduleName: string): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const list: string[] = JSON.parse(raw);
    return list.includes(moduleName);
  } catch {
    return false;
  }
}

function persistDismissal(moduleName: string): void {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(moduleName)) {
      list.push(moduleName);
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify(list));
    }
  } catch {
    // localStorage may not be available
  }
}

interface GuardOptions {
  limitDescription?: string;
  proBenefit?: string;
}

export function useFeatureGuard() {
  const navigate = useNavigate();
  const isPro = useIsPro();
  const [dialog, setDialog] = useState<UpgradeDialogState>({
    open: false,
    moduleName: '',
    features: [],
  });

  const guard = useCallback(
    (feature: ManagedFeature, moduleName: string, action: () => void, options?: GuardOptions): void => {
      if (canUse(feature)) {
        action();
        return;
      }
      if (isPro) return;
      if (isDismissed(moduleName)) return;
      setDialog({
        open: true,
        moduleName,
        features: [feature],
        limitDescription: options?.limitDescription,
        proBenefit: options?.proBenefit,
      });
    },
    [isPro],
  );

  const guardAsync = useCallback(
    async (feature: ManagedFeature, moduleName: string, action: () => Promise<void>, options?: GuardOptions): Promise<void> => {
      if (canUse(feature)) {
        await action();
        return;
      }
      if (isPro) return;
      if (isDismissed(moduleName)) return;
      setDialog({
        open: true,
        moduleName,
        features: [feature],
        limitDescription: options?.limitDescription,
        proBenefit: options?.proBenefit,
      });
    },
    [isPro],
  );

  const closeDialog = useCallback(() => {
    setDialog({ open: false, moduleName: '', features: [] });
  }, []);

  const handleUpgrade = useCallback(
    (_tier: UpgradeTier) => {
      closeDialog();
      navigate('/license');
    },
    [closeDialog, navigate],
  );

  const handleDontRemind = useCallback((moduleName: string) => {
    persistDismissal(moduleName);
  }, []);

  const dialogElement = (
    <UpgradeDialog
      open={dialog.open}
      moduleName={dialog.moduleName}
      features={dialog.features}
      limitDescription={dialog.limitDescription}
      proBenefit={dialog.proBenefit}
      onClose={closeDialog}
      onUpgrade={handleUpgrade}
      onDontRemind={handleDontRemind}
    />
  );

  return { guard, guardAsync, dialogElement };
}
