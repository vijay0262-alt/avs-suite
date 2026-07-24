/**
 * License Manager — the centralized orchestrator for all licensing.
 *
 * Responsibilities:
 * - Hold the current license state
 * - Delegate to IActivationService for lifecycle operations
 * - Delegate to ILicenseStorage for persistence
 * - Emit license events
 * - Provide edition resolution for the FeatureManager
 * - Handle offline startup and grace periods
 *
 * This is the single object the application interacts with.
 * No other module should access storage or activation directly.
 *
 * IMPORTANT: No mock implementation is provided. The concrete
 * LicenseManager is created at bootstrap with real (or null)
 * implementations of its dependencies.
 */
import type { LicenseModel, LicenseView, ValidationResult, ActivationResult, DeactivationResult } from './model';
import { toLicenseView } from './model';
import type { LicenseState } from './states';
import { stateToEdition } from './states';
import { LicenseEventEmitter, createLicenseEvent, type LicenseEventListener } from './events';
import type { IActivationService } from './activation';
import type { ILicenseStorage } from './storage';
import type { IDeviceIdProvider } from './deviceId';
import { validateOffline, shouldEnterGrace, calculateGraceExpiry, hasGraceEnded, type OfflineConfig, DEFAULT_OFFLINE_CONFIG } from './offline';

/**
 * Configuration for the LicenseManager.
 */
export interface LicenseManagerConfig {
  storage: ILicenseStorage;
  activation: IActivationService;
  deviceIdProvider: IDeviceIdProvider;
  events?: LicenseEventEmitter;
  offline?: OfflineConfig;
}

/**
 * The License Manager interface.
 * Consumers depend on this, not on a concrete class.
 */
export interface ILicenseManager {
  /** Current license state. */
  getState(): LicenseState;

  /** Current resolved edition (derived from state). */
  getEdition(): 'free' | 'professional' | 'ultimate' | 'trial';

  /** Whether a paid license is currently active. */
  isActivated(): boolean;

  /** Whether the license is in grace period. */
  isInGracePeriod(): boolean;

  /** Get the UI-safe license view (no sensitive data). */
  getLicenseView(): LicenseView | null;

  /** Get the raw license model (for internal use only). */
  getLicenseModel(): LicenseModel | null;

  /** Activate a license with a key and email. */
  activate(key: string, email: string): Promise<ActivationResult>;

  /** Deactivate the current license. */
  deactivate(): Promise<DeactivationResult>;

  /** Validate the current license locally. */
  validate(): Promise<ValidationResult>;

  /** Refresh the license (online or offline fallback). */
  refresh(): Promise<ValidationResult>;

  /** Subscribe to license events. Returns unsubscribe function. */
  onEvent(listener: LicenseEventListener): () => void;

  /** Initialize on application startup (load cached license, validate). */
  initialize(): Promise<ValidationResult>;

  /** Get the anonymous device ID. */
  getDeviceId(): Promise<string>;
}

/**
 * Concrete License Manager implementation.
 *
 * This is the real implementation — no mocks. It requires real
 * dependencies to be injected. At bootstrap, the Electron main
 * process provides concrete implementations of ILicenseStorage,
 * IActivationService, and IDeviceIdProvider.
 *
 * Until those concrete implementations are built, the application
 * uses the NullLicenseManager (defined in index.ts) which always
 * returns 'free' state.
 */
export class LicenseManager implements ILicenseManager {
  private readonly storage: ILicenseStorage;
  private readonly activation: IActivationService;
  private readonly deviceIdProvider: IDeviceIdProvider;
  private readonly events: LicenseEventEmitter;
  private readonly offlineConfig: OfflineConfig;

  private currentLicense: LicenseModel | null = null;
  private currentState: LicenseState = 'free';
  private deviceId: string | null = null;

  constructor(config: LicenseManagerConfig) {
    this.storage = config.storage;
    this.activation = config.activation;
    this.deviceIdProvider = config.deviceIdProvider;
    this.events = config.events ?? new LicenseEventEmitter();
    this.offlineConfig = config.offline ?? DEFAULT_OFFLINE_CONFIG;
  }

  getState(): LicenseState {
    return this.currentState;
  }

  getEdition(): 'free' | 'professional' | 'ultimate' | 'trial' {
    if (this.currentLicense && this.currentLicense.edition) {
      const modelEdition = this.currentLicense.edition;
      if (this.currentState === 'expired' || this.currentState === 'invalid' || this.currentState === 'revoked') {
        return 'free';
      }
      if (this.currentState === 'trial') return 'trial';
      if (this.currentState === 'free') return 'free';
      return modelEdition;
    }
    return stateToEdition(this.currentState);
  }

  isActivated(): boolean {
    return this.currentState !== 'free' &&
           this.currentState !== 'invalid' &&
           this.currentState !== 'revoked' &&
           this.currentState !== 'expired';
  }

  isInGracePeriod(): boolean {
    return this.currentState === 'grace_period';
  }

  getLicenseView(): LicenseView | null {
    return this.currentLicense ? toLicenseView(this.currentLicense) : null;
  }

  getLicenseModel(): LicenseModel | null {
    return this.currentLicense;
  }

  async activate(key: string, email: string): Promise<ActivationResult> {
    try {
      const deviceId = await this.getDeviceId();
      const result = await this.activation.activate(key, deviceId, email);

      if (result.success && result.license) {
        const previousState = this.currentState;
        const previousEdition = this.getEdition();

        this.currentLicense = result.license;
        this.currentState = result.license.state;

        await this.storage.write(result.license);

        this.events.emit(createLicenseEvent('license_activated', {
          licenseId: result.license.licenseId,
          newState: this.currentState,
          previousState,
        }));

        if (this.getEdition() !== previousEdition) {
          this.events.emit(createLicenseEvent('edition_changed', {
            previousEdition,
            newEdition: this.getEdition(),
          }));
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async deactivate(): Promise<DeactivationResult> {
    if (!this.currentLicense) {
      return { success: false, error: 'No active license to deactivate.' };
    }

    try {
      const deviceId = await this.getDeviceId();
      const result = await this.activation.deactivate(this.currentLicense.licenseId, deviceId);

      if (result.success) {
        const previousState = this.currentState;
        const previousEdition = this.getEdition();

        await this.storage.remove();
        this.currentLicense = null;
        this.currentState = 'free';

        this.events.emit(createLicenseEvent('license_deactivated', {
          previousState,
          newState: 'free',
        }));

        if (this.getEdition() !== previousEdition) {
          this.events.emit(createLicenseEvent('edition_changed', {
            previousEdition,
            newEdition: 'free',
          }));
        }
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async validate(): Promise<ValidationResult> {
    if (!this.currentLicense) {
      return { valid: true, state: 'free' };
    }

    const result = validateOffline(this.currentLicense, this.offlineConfig);

    if (result.state !== this.currentState) {
      const previousState = this.currentState;
      this.currentState = result.state;

      if (result.state === 'grace_period' && previousState !== 'grace_period') {
        this.events.emit(createLicenseEvent('grace_started', {
          previousState,
          newState: 'grace_period',
          detail: result.reason,
        }));
      }

      if (result.state === 'expired' && previousState === 'grace_period') {
        this.events.emit(createLicenseEvent('grace_ended', {
          previousState,
          newState: 'expired',
        }));
      }

      if (result.state === 'expired') {
        this.events.emit(createLicenseEvent('license_expired', {
          previousState,
          newState: 'expired',
          detail: result.reason,
        }));
      }

      this.events.emit(createLicenseEvent('license_validated', {
        previousState,
        newState: result.state,
      }));
    }

    return result;
  }

  async refresh(): Promise<ValidationResult> {
    if (!this.currentLicense) {
      return { valid: true, state: 'free' };
    }

    try {
      const result = await this.activation.refresh(this.currentLicense);

      if (result.state !== this.currentState) {
        const previousState = this.currentState;
        this.currentState = result.state;

        this.events.emit(createLicenseEvent('license_refreshed', {
          previousState,
          newState: result.state,
        }));
      }

      return result;
    } catch {
      // Offline fallback — validate locally
      return this.validate();
    }
  }

  onEvent(listener: LicenseEventListener): () => void {
    return this.events.onAll(listener);
  }

  async initialize(): Promise<ValidationResult> {
    this.events.emit(createLicenseEvent('application_started'));

    try {
      this.currentLicense = await this.storage.read();
    } catch {
      this.currentLicense = null;
      this.currentState = 'free';
      this.events.emit(createLicenseEvent('storage_error', {
        detail: 'Failed to read license from storage.',
      }));
    }

    if (this.currentLicense) {
      // Check if we should enter grace period
      if (shouldEnterGrace(this.currentLicense)) {
        const graceExpiry = calculateGraceExpiry(
          this.currentLicense.expiryDate!,
          this.offlineConfig,
        );
        this.currentLicense = {
          ...this.currentLicense,
          state: 'grace_period',
          graceExpiry,
        };
        await this.storage.write(this.currentLicense);
      } else if (hasGraceEnded(this.currentLicense)) {
        this.currentLicense = {
          ...this.currentLicense,
          state: 'expired',
        };
        await this.storage.write(this.currentLicense);
      }

      const result = validateOffline(this.currentLicense, this.offlineConfig);
      this.currentState = result.state;
      return result;
    }

    this.currentState = 'free';
    return { valid: true, state: 'free' };
  }

  async getDeviceId(): Promise<string> {
    if (this.deviceId) return this.deviceId;
    this.deviceId = await this.deviceIdProvider.getDeviceId();
    return this.deviceId;
  }
}
