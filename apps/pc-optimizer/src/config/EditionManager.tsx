/**
 * Edition Manager — centralized runtime edition resolution.
 *
 * Wraps the existing @avs/licensing ILicensingService and
 * @avs/shared/featureFlags to provide a single hook and context
 * for the entire frontend. No module should contain hardcoded
 * edition checks — all go through here.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Edition, FeatureKey } from '@avs/shared/featureFlags';
import { isFeatureEnabled, shouldHideFeature } from '@avs/shared/featureFlags';
import type { LicenseInfo } from '@avs/licensing';
import { type ILicensingService } from '@avs/licensing';
import { useLicense } from '../features/licensing/LicenseContext';

export interface EditionManagerValue {
  edition: Edition;
  isActivated: boolean;
  license: LicenseInfo | null;
  isFeatureAvailable: (feature: FeatureKey) => boolean;
  isFeatureHidden: (feature: FeatureKey) => boolean;
  refresh: () => Promise<void>;
}

// Default context — replaced by EditionManagerProvider with real license state
const EditionManagerContext = createContext<EditionManagerValue>({
  edition: 'free',
  isActivated: false,
  license: null,
  isFeatureAvailable: () => false,
  isFeatureHidden: () => false,
  refresh: async () => {},
});

export function EditionManagerProvider({
  children,
  service,
}: {
  children: ReactNode;
  service?: ILicensingService;
}) {
  const { edition: licenseEdition, isActivated, refresh } = useLicense();

  const value = useMemo<EditionManagerValue>(() => {
    const edition = service ? service.currentEdition() : licenseEdition;
    const activated = service ? service.isActivated() : isActivated;
    return {
      edition,
      isActivated: activated,
      license: null,
      isFeatureAvailable: (feature: FeatureKey) => isFeatureEnabled(feature, edition),
      isFeatureHidden: (feature: FeatureKey) => shouldHideFeature(feature, edition),
      refresh: async () => {
        if (service) {
          await service.refresh();
        } else {
          await refresh();
        }
      },
    };
  }, [service, licenseEdition, isActivated, refresh]);

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
  return edition === 'pro' || edition === 'enterprise';
}
