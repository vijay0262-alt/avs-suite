/**
 * AVS Product Registry — architecture for supporting future AVS products
 * without redesigning the licensing system.
 *
 * Future products (AVS Driver Updater, AVS Antivirus, AVS VPN, AVS Backup,
 * AVS File Recovery, AVS Disk Manager) register their features here.
 *
 * Adding a new product = add a ProductRegistration entry + register its
 * features in the FEATURES registry in @avs/shared/featureFlags.
 *
 * This keeps the licensing system modular: the FeatureGate, FeatureManager,
 * and EditionManager don't need to know about specific products — they
 * just check features via the registry.
 */
import type { FeatureKey, Edition } from '../featureFlags';

/**
 * ManagedFeature is defined in @avs/licensing as a union of dot-notation
 * strings. We use a string type here to avoid a circular dependency
 * (@avs/licensing imports from @avs/shared). The actual type safety is
 * enforced at the call site where FeatureGate.canUse() is called.
 */
type ManagedFeatureString = string;

/**
 * A product registration entry.
 */
export interface ProductRegistration {
  /** Unique product code (e.g., 'AVS_PC_OPTIMIZER', 'AVS_DRIVER_UPDATER'). */
  productCode: string;
  /** Human-readable product name. */
  productName: string;
  /** ManagedFeature keys used by this product. */
  features: readonly ManagedFeatureString[];
  /** FeatureKey entries in the shared registry for this product. */
  featureKeys: readonly FeatureKey[];
  /** Editions in which this product is available. */
  editions: readonly Edition[];
  /** Whether this product is currently active/installed. */
  active: boolean;
}

/**
 * Central product registry. Future products add entries here.
 */
const registry = new Map<string, ProductRegistration>();

/**
 * Register a product. Called at app startup or when a product is installed.
 */
export function registerProduct(entry: ProductRegistration): void {
  registry.set(entry.productCode, entry);
}

/**
 * Unregister a product. Called when a product is uninstalled.
 */
export function unregisterProduct(productCode: string): void {
  registry.delete(productCode);
}

/**
 * Get all registered products.
 */
export function getRegisteredProducts(): ProductRegistration[] {
  return Array.from(registry.values());
}

/**
 * Get a specific product registration.
 */
export function getProduct(productCode: string): ProductRegistration | undefined {
  return registry.get(productCode);
}

/**
 * Check if a product is registered and active.
 */
export function isProductActive(productCode: string): boolean {
  const product = registry.get(productCode);
  return Boolean(product && product.active);
}

/**
 * Get all features for a product.
 */
export function getProductFeatures(productCode: string): readonly ManagedFeatureString[] {
  return registry.get(productCode)?.features ?? [];
}

// ── Built-in product: AVS PC Optimizer ──────────────────────────

export const AVS_PC_OPTIMIZER = 'AVS_PC_OPTIMIZER';

const PC_OPTIMIZER_REGISTRATION: ProductRegistration = {
  productCode: AVS_PC_OPTIMIZER,
  productName: 'AVS PC Optimizer',
  features: [
    'junk.scan', 'junk.preview', 'junk.clean', 'junk.clean_unlimited', 'junk.deep_scan',
    'registry.scan', 'registry.fix',
    'startup.view', 'startup.disable',
    'privacy.scan', 'privacy.clean',
    'duplicate.scan', 'duplicate.delete',
    'uninstaller.view', 'uninstaller.standard', 'uninstaller.deep',
    'software.update_scan', 'software.update_manual', 'software.update_all',
    'performance.optimize',
    'scheduled.optimization',
    'smart.recommendations', 'optimization.history', 'health.timeline',
    'background.monitoring', 'real_time.protection',
    'auto.background_cleanup', 'auto.startup_optimization',
    'auto.junk_cleanup', 'auto.privacy_protection',
    'real_time.notifications',
    'driver.update',
    'antivirus.scan',
    'ai.smart_optimization',
    'browser.protection',
    'battery.optimization',
    'game.mode',
    'priority.support', 'premium.support',
    'multi_device.management',
    'dashboard', 'system.info', 'disk.analyzer',
  ],
  featureKeys: [],
  editions: ['free', 'professional', 'ultimate', 'trial'],
  active: true,
};

// ── Future product templates (not active yet) ───────────────────

export const AVS_DRIVER_UPDATER = 'AVS_DRIVER_UPDATER';
export const AVS_ANTIVIRUS = 'AVS_ANTIVIRUS';
export const AVS_VPN = 'AVS_VPN';
export const AVS_BACKUP = 'AVS_BACKUP';
export const AVS_FILE_RECOVERY = 'AVS_FILE_RECOVERY';
export const AVS_DISK_MANAGER = 'AVS_DISK_MANAGER';

/**
 * Register the built-in PC Optimizer product.
 * Called at app startup.
 */
export function registerBuiltinProducts(): void {
  registerProduct(PC_OPTIMIZER_REGISTRATION);
}
