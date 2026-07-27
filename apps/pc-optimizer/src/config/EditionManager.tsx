/**
 * Edition Manager — centralized runtime edition resolution.
 *
 * In the thin-client architecture, edition and feature availability are
 * determined solely by the backend sync response. The EditionManager
 * reads from the syncStore (GET /api/customer/sync) and provides:
 *   - Current edition (derived from subscription plan)
 *   - Feature availability (from backend feature flags)
 *   - Refresh capability (re-sync from backend)
 *
 * No local business logic for edition selection or feature gating.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Edition, FeatureKey } from '@avs/shared/featureFlags';
import { isFeatureEnabled, shouldHideFeature } from '@avs/shared/featureFlags';
import { useSyncStore, planToEdition } from '../features/sync/syncStore';

export interface EditionManagerValue {
  edition: Edition;
  isActivated: boolean;
  isOffline: boolean;
  isFeatureAvailable: (feature: FeatureKey) => boolean;
  isFeatureHidden: (feature: FeatureKey) => boolean;
  /** Check if a backend feature flag is present. */
  hasBackendFeature: (feature: string) => boolean;
  refresh: () => Promise<void>;
}

// Default context — replaced by EditionManagerProvider with real sync data
const EditionManagerContext = createContext<EditionManagerValue>({
  edition: 'free',
  isActivated: false,
  isOffline: false,
  isFeatureAvailable: () => false,
  isFeatureHidden: () => false,
  hasBackendFeature: () => false,
  refresh: async () => {},
});

export function EditionManagerProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { data, sync, isOffline } = useSyncStore();

  const value = useMemo<EditionManagerValue>(() => {
    const plan = data?.subscription.plan ?? 'FREE';
    const edition: Edition = planToEdition(plan) === 'PROFESSIONAL' ? 'professional' : 'free';
    const isActivated = edition === 'professional';
    const backendFeatures = data?.features ?? [];

    return {
      edition,
      isActivated,
      isOffline,
      isFeatureAvailable: (feature: FeatureKey) => isFeatureEnabled(feature, edition),
      isFeatureHidden: (feature: FeatureKey) => shouldHideFeature(feature, edition),
      hasBackendFeature: (feature: string) => backendFeatures.includes(feature),
      refresh: async () => {
        await sync();
      },
    };
  }, [data, sync, isOffline]);

  return <EditionManagerContext.Provider value={value}>{children}</EditionManagerContext.Provider>;
}

export function useEditionManager(): EditionManagerValue {
  return useContext(EditionManagerContext);
}

export function useEdition(): Edition {
  return useContext(EditionManagerContext).edition;
}

export function useIsPro(): boolean {
  const { edition } = useContext(EditionManagerContext);
  return edition === 'professional';
}
