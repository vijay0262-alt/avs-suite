/**
 * LicenseManagerContext — React context providing the ILicenseManager
 * and FeatureManager to the entire app.
 *
 * This is the bridge between the @avs/licensing package and the
 * React frontend. The Electron main process injects the concrete
 * LicenseManager via IPC; until then, a null context is used.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { ILicenseManager } from '@avs/licensing';
import type { IFeatureManager, ManagedFeature } from '@avs/licensing';
import type { LicenseView, ValidationResult } from '@avs/licensing';
import type { LicenseState } from '@avs/licensing';
import { LICENSE_STATE_LABELS } from '@avs/licensing';

export interface LicenseContextValue {
  manager: ILicenseManager | null;
  featureManager: IFeatureManager | null;
  state: LicenseState;
  edition: 'free' | 'pro' | 'enterprise' | 'trial';
  isActivated: boolean;
  isInGracePeriod: boolean;
  licenseView: LicenseView | null;
  deviceId: string | null;
  activate: (key: string, email: string) => Promise<{ success: boolean; error?: string }>;
  deactivate: () => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<ValidationResult | null>;
  hasFeature: (feature: ManagedFeature) => boolean;
}

const defaultContext: LicenseContextValue = {
  manager: null,
  featureManager: null,
  state: 'free',
  edition: 'free',
  isActivated: false,
  isInGracePeriod: false,
  licenseView: null,
  deviceId: null,
  activate: async () => ({ success: false, error: 'Licensing is not yet available.' }),
  deactivate: async () => ({ success: false, error: 'No active license.' }),
  refresh: async () => null,
  hasFeature: () => false,
};

const LicenseContext = createContext<LicenseContextValue>(defaultContext);

export function LicenseProvider({
  children,
  manager = null,
  featureManager = null,
}: {
  children: ReactNode;
  manager?: ILicenseManager | null;
  featureManager?: IFeatureManager | null;
}) {
  const [state, setState] = useState<LicenseState>('free');
  const [licenseView, setLicenseView] = useState<LicenseView | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const syncFromManager = useCallback(() => {
    if (!manager) return;
    setState(manager.getState());
    setLicenseView(manager.getLicenseView());
  }, [manager]);

  useEffect(() => {
    if (!manager) return;
    syncFromManager();
    const unsub = manager.onEvent(() => {
      syncFromManager();
    });
    return unsub;
  }, [manager, syncFromManager]);

  useEffect(() => {
    if (!manager) return;
    manager.getDeviceId().then(setDeviceId).catch(() => setDeviceId(null));
  }, [manager]);

  const activate = useCallback(
    async (key: string, email: string) => {
      if (!manager) return { success: false, error: 'Licensing is not yet available.' };
      const result = await manager.activate(key, email);
      syncFromManager();
      return { success: result.success, error: result.error };
    },
    [manager, syncFromManager],
  );

  const deactivate = useCallback(async () => {
    if (!manager) return { success: false, error: 'No active license.' };
    const result = await manager.deactivate();
    syncFromManager();
    return { success: result.success, error: result.error };
  }, [manager, syncFromManager]);

  const refresh = useCallback(async () => {
    if (!manager) return null;
    const result = await manager.refresh();
    syncFromManager();
    return result;
  }, [manager, syncFromManager]);

  const hasFeature = useCallback(
    (feature: ManagedFeature) => {
      if (featureManager) return featureManager.has(feature);
      return false;
    },
    [featureManager],
  );

  const edition = manager?.getEdition() ?? 'free';
  const isActivated = manager?.isActivated() ?? false;
  const isInGracePeriod = manager?.isInGracePeriod() ?? false;

  const value: LicenseContextValue = {
    manager,
    featureManager,
    state,
    edition,
    isActivated,
    isInGracePeriod,
    licenseView,
    deviceId,
    activate,
    deactivate,
    refresh,
    hasFeature,
  };

  return <LicenseContext.Provider value={value}>{children}</LicenseContext.Provider>;
}

export function useLicense(): LicenseContextValue {
  return useContext(LicenseContext);
}

export function useLicenseState(): LicenseState {
  return useContext(LicenseContext).state;
}

export function useLicenseStateLabel(): string {
  return LICENSE_STATE_LABELS[useContext(LicenseContext).state];
}
