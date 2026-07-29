/**
 * AI Context Aggregator — collects and merges context from providers.
 *
 * The aggregator:
 *   Collects context from each provider
 *   Merges all provider contexts into one
 *   Handles failures gracefully (one provider failure doesn't stop others)
 *   Tracks provenance for every section
 */
import type {
  AIContextProvider,
  AIContext,
  ContextProvenance,
  ContextEvidence,
  ContextMetadata,
  AIContextConfiguration,
} from './types';
import { createProvenance, generateContextId, CONTEXT_SECTIONS } from './types';
import { aiContextEvents } from './aiContextEvents';

export class AIContextAggregator {
  private _config: AIContextConfiguration;

  constructor(config: AIContextConfiguration) {
    this._config = config;
  }

  updateConfig(config: AIContextConfiguration): void {
    this._config = config;
  }

  /**
   * Aggregate context from all providers.
   * If one provider fails, the remaining providers continue.
   */
  async aggregate(
    providers: AIContextProvider[],
    currentPlan: string,
  ): Promise<{ context: AIContext; failures: string[]; successes: string[] }> {
    const startTime = Date.now();
    const failures: string[] = [];
    const successes: string[] = [];
    const provenanceList: ContextProvenance[] = [];

    // Build the base context with metadata
    const context: AIContext = {
      metadata: this._buildMetadata(startTime, currentPlan),
      provenance: [],
    };

    // Collect from each provider
    for (const provider of providers) {
      const name = provider.getProviderName();

      if (!provider.isAvailable()) {
        failures.push(name);
        aiContextEvents.emit('context_provider_failed', {
          providerName: name,
          reason: 'not available',
        });
        continue;
      }

      try {
        const providerContext = await this._collectWithTimeout(provider);
        if (providerContext) {
          this._mergeContext(context, providerContext, provider);
          successes.push(name);

          const prov = createProvenance(
            name,
            provider.getVersion(),
            this._extractConfidence(providerContext),
            this._extractEvidence(providerContext),
          );
          provenanceList.push(prov);

          aiContextEvents.emit('context_provider_loaded', {
            providerName: name,
            version: provider.getVersion(),
          });
        }
      } catch (err) {
        failures.push(name);
        aiContextEvents.emit('context_provider_failed', {
          providerName: name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Set provenance
    context.provenance = provenanceList;

    // Update generation time
    context.metadata.generationTimeMs = Date.now() - startTime;

    return { context, failures, successes };
  }

  // ── Private ────────────────────────────────────────────────

  private _buildMetadata(startTime: number, currentPlan: string): ContextMetadata {
    return {
      contextId: generateContextId(),
      timestamp: new Date(startTime).toISOString(),
      contextVersion: this._config.metadata.contextVersion,
      appVersion: this._config.metadata.appVersion,
      platform: this._config.metadata.platform,
      language: this._config.metadata.language,
      currentPlan,
      generationTimeMs: 0,
    };
  }

  private async _collectWithTimeout(provider: AIContextProvider): Promise<Record<string, unknown> | null> {
    const result = provider.getContext();
    if (result instanceof Promise) {
      return await Promise.race([
        result,
        new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), this._config.timeoutMs),
        ),
      ]);
    }
    return result;
  }

  private _mergeContext(
    context: AIContext,
    providerContext: Record<string, unknown>,
    _provider: AIContextProvider,
  ): void {
    for (const key of Object.keys(providerContext)) {
      if (key === 'metadata' || key === 'provenance') continue;

      if (CONTEXT_SECTIONS.includes(key as never)) {
        // Merge section — later providers can override earlier ones (priority sorted)
        (context as unknown as Record<string, unknown>)[key] = providerContext[key];
      } else {
        // Unknown section goes into futureExtensions
        if (!context.futureExtensions) {
          context.futureExtensions = {};
        }
        context.futureExtensions[key] = providerContext[key];
      }
    }
  }

  private _extractConfidence(providerContext: Record<string, unknown>): number {
    if (typeof providerContext._confidence === 'number') {
      return Math.max(0, Math.min(1, providerContext._confidence));
    }
    return 1.0;
  }

  private _extractEvidence(providerContext: Record<string, unknown>): ContextEvidence[] {
    if (Array.isArray(providerContext._evidence)) {
      return providerContext._evidence;
    }
    return [];
  }
}
