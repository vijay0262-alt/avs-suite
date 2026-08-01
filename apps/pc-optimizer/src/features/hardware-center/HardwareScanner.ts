/**
 * HardwareScanner — orchestrates a full hardware scan across all
 * registered providers.
 *
 * For each enabled category, finds the best available provider and
 * calls scan(). Collects all components into a unified snapshot.
 * Providers that fail are recorded but don't block other categories.
 */

import type {
  HardwareCategory,
  HardwareComponent,
  HardwareSnapshot,
  HardwareConfiguration,
  ProviderHealthStatus,
} from './types';
import { hardwareRegistry } from './HardwareRegistry';
import { hardwareEventBus } from './HardwareEvents';

export class HardwareScanner {
  private readonly config: HardwareConfiguration;

  constructor(config: HardwareConfiguration) {
    this.config = config;
  }

  async scan(): Promise<HardwareSnapshot> {
    hardwareEventBus.emitScanStarted();
    const startTime = Date.now();
    const components: HardwareComponent[] = [];
    const providerHealth: Record<string, ProviderHealthStatus> = {};
    let partial = false;

    const categories = this.config.enabledCategories;

    const results = await Promise.allSettled(
      categories.map((category) => this.scanCategory(category)),
    );

    for (const [i, result] of results.entries()) {
      const category = categories[i];
      if (!category) continue;

      if (result.status === 'fulfilled') {
        for (const component of result.value.components) {
          components.push(component);
        }
        if (result.value.providerId) {
          providerHealth[result.value.providerId] =
            hardwareRegistry.getProvider(result.value.providerId)?.getHealth() ?? {
              state: 'failed' as const,
              consecutiveFailures: 0,
              consecutiveSuccesses: 0,
            };
        }
        if (result.value.partial) {
          partial = true;
        }
      } else {
        partial = true;
        hardwareEventBus.emitProviderFailed(
          'unknown',
          category,
          result.reason instanceof Error ? result.reason.message : String(result.reason),
        );
      }
    }

    const scanDurationMs = Date.now() - startTime;
    const snapshot: HardwareSnapshot = {
      id: `hw-snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      scanDurationMs,
      components,
      providerHealth,
      metadata: {
        source: this.config.preferredProviderSource,
        version: '1.1.0',
        partial,
      },
    };

    hardwareEventBus.emitScanCompleted(snapshot.id, scanDurationMs, components.length);
    return snapshot;
  }

  private async scanCategory(
    category: HardwareCategory,
  ): Promise<{ components: HardwareComponent[]; providerId: string | null; partial: boolean }> {
    const providers = hardwareRegistry.getProvidersForCategory(category);

    if (providers.length === 0) {
      return { components: [], providerId: null, partial: false };
    }

    let partial = false;

    for (const provider of providers) {
      if (!provider.isAvailable()) continue;

      try {
        const scannedComponents = await provider.scan();
        const categoryComponents = scannedComponents.filter((c) => c.category === category);
        if (categoryComponents.length > 0) {
          return {
            components: categoryComponents,
            providerId: provider.id,
            partial,
          };
        }
      } catch {
        partial = true;
        hardwareEventBus.emitProviderFailed(
          provider.source,
          category,
          `Provider ${provider.id} failed for ${category}`,
        );
        continue;
      }
    }

    return { components: [], providerId: null, partial };
  }
}
