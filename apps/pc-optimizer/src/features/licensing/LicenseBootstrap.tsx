/**
 * LicenseBootstrap — initializes the real LicenseManager on app startup.
 *
 * On mount:
 * 1. Calls window.avs.license.startup() to get current license status from the SDK
 * 2. Creates SdkActivationService + MemoryLicenseStorage + IpcDeviceIdProvider
 * 3. Creates a real LicenseManager and FeatureManager
 * 4. Calls manager.initialize() to load cached license
 * 5. Calls initFeatureGate() with the resolved state
 * 6. If no valid license and on first launch, redirects to /license
 * 7. Renders LicenseProvider with the real manager
 */
import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LicenseManager, createFeatureManager, type ILicenseManager, type IFeatureManager } from '@avs/licensing';
import { LicenseProvider } from './LicenseContext';
import { SdkActivationService } from './SdkActivationService';
import { MemoryLicenseStorage, IpcDeviceIdProvider } from './rendererProviders';
import { initFeatureGate, updateFeatureGateEdition } from './FeatureGate';

type BootstrapPhase = 'loading' | 'ready' | 'error';

interface BootstrapState {
  phase: BootstrapPhase;
  manager: ILicenseManager | null;
  featureManager: IFeatureManager | null;
  error: string | null;
}

export function LicenseBootstrap({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<BootstrapState>({
    phase: 'loading',
    manager: null,
    featureManager: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // 1. Call the SDK startup to initialize the backend license client
        try {
          await window.avs.license.startup();
        } catch {
          // SDK not ready — continue in free mode
        }

        // 2. Create real dependencies
        const storage = new MemoryLicenseStorage();
        const activation = new SdkActivationService();
        const deviceIdProvider = new IpcDeviceIdProvider();

        // 3. Create the real LicenseManager
        const manager = new LicenseManager({
          storage,
          activation,
          deviceIdProvider,
        });

        // 4. Initialize (loads cached license, validates offline)
        await manager.initialize();

        // 5. Create FeatureManager
        const featureManager = createFeatureManager({
          getState: () => manager.getState(),
        });

        // 6. Initialize FeatureGate
        initFeatureGate(manager.getState());

        // 6b. Update edition from license model if available (e.g., 'ultimate')
        const licenseView = manager.getLicenseView();
        if (licenseView) {
          updateFeatureGateEdition(licenseView.edition);
        }

        if (cancelled) return;

        // 7. If no valid license, redirect to activation page
        const currentState = manager.getState();
        const needsActivation =
          currentState === 'free' ||
          currentState === 'invalid' ||
          currentState === 'revoked' ||
          currentState === 'expired';

        setState({
          phase: 'ready',
          manager,
          featureManager,
          error: null,
        });

        if (needsActivation) {
          navigate('/license', { replace: true });
        }
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: 'error',
          manager: null,
          featureManager: null,
          error: err instanceof Error ? err.message : 'Failed to initialize licensing',
        });
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (state.phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto" />
          <p className="text-sm text-text-muted">Initializing licensing…</p>
        </div>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="text-center space-y-3 max-w-md">
          <p className="text-sm text-semantic-danger">Licensing initialization failed</p>
          <p className="text-xs text-text-muted">{state.error}</p>
          <p className="text-xs text-text-muted">The application will continue in Free mode.</p>
        </div>
      </div>
    );
  }

  return (
    <LicenseProvider manager={state.manager} featureManager={state.featureManager}>
      {children}
    </LicenseProvider>
  );
}
