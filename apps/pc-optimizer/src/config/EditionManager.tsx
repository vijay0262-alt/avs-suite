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
import { NullLicensingService, type ILicensingService } from '@avs/licensing';

export interface EditionManagerValue {
  edition: Edition;
  isActivated: boolean;
  license: LicenseInfo | null;
  isFeatureAvailable: (feature: FeatureKey) => boolean;
  isFeatureHidden: (feature: FeatureKey) => boolean;
  refresh: () => Promise<void>;
}

const defaultService = new NullLicensingService();

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
  service = defaultService,
}: {
  children: ReactNode;
  service?: ILicensingService;
}) {
  const value = useMemo<EditionManagerValue>(() => {
    const edition = service.currentEdition();
    const isActivated = service.isActivated();
    return {
      edition,
      isActivated,
      license: null,
      isFeatureAvailable: (feature: FeatureKey) => isFeatureEnabled(feature, edition),
      isFeatureHidden: (feature: FeatureKey) => shouldHideFeature(feature, edition),
      refresh: async () => {
        await service.refresh();
      },
    };
  }, [service]);

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
