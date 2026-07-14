/**
 * Canonical injection tokens. Registering a token here (not deep in a
 * feature module) means every consumer can import a single, stable
 * reference — decoupling call sites from concrete implementations.
 */
import { createToken } from './Container';

// Forward-declared placeholder interfaces. Concrete types live in the
// packages that implement them; here we only need structural handles.
export interface IRpcClient {
  call<TResult>(method: string, params?: unknown): Promise<TResult>;
}
export interface ILogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}
export interface ISettingsStore<T = Record<string, unknown>> {
  get(): T;
  set(patch: Partial<T>): Promise<void>;
}
export interface ILicensingService {
  currentEdition(): 'free' | 'pro' | 'enterprise' | 'trial';
  isActivated(): boolean;
}
export interface IUpdateService {
  checkForUpdates(): Promise<void>;
  onUpdateAvailable(cb: () => void): () => void;
}
export interface IAnalyticsService {
  track(event: string, props?: Record<string, unknown>): void;
  setOptIn(enabled: boolean): void;
}

export const TOKENS = {
  RpcClient: createToken<IRpcClient>('RpcClient'),
  Logger: createToken<ILogger>('Logger'),
  SettingsStore: createToken<ISettingsStore>('SettingsStore'),
  Licensing: createToken<ILicensingService>('Licensing'),
  Updater: createToken<IUpdateService>('Updater'),
  Analytics: createToken<IAnalyticsService>('Analytics'),
} as const;
