/**
 * SecurityProvider — abstract base class for all security providers.
 *
 * Every provider must implement this interface. Providers never
 * communicate with each other directly. The SecurityEngine
 * coordinates all provider interactions.
 *
 * Provider types:
 *   - Behavior Analysis
 *   - Signature Detection
 *   - Persistence Detection
 *   - Browser Security
 *   - Reputation Analysis
 *   - Threat Intelligence
 */
import type {
  SecurityProviderInfo,
  ProviderScanContext,
  ProviderScanResult,
  ProviderType,
  Threat,
} from './types';

export abstract class SecurityProvider {
  protected info: SecurityProviderInfo;

  constructor(
    id: string,
    name: string,
    type: ProviderType,
    version: string,
    description: string,
    priority = 0,
  ) {
    this.info = {
      id,
      name,
      type,
      version,
      status: 'inactive',
      enabled: true,
      priority,
      description,
      capabilities: [],
      lastError: null,
      lastRun: null,
    };
  }

  abstract scan(context: ProviderScanContext): Promise<ProviderScanResult>;

  getInfo(): SecurityProviderInfo {
    return { ...this.info };
  }

  getId(): string {
    return this.info.id;
  }

  getType(): ProviderType {
    return this.info.type;
  }

  isEnabled(): boolean {
    return this.info.enabled;
  }

  enable(): void {
    this.info.enabled = true;
  }

  disable(): void {
    this.info.enabled = false;
  }

  setStatus(status: typeof this.info.status): void {
    this.info.status = status;
  }

  setLastError(error: string | null): void {
    this.info.lastError = error;
    if (error) {
      this.info.status = 'error';
    }
  }

  markRun(): void {
    this.info.lastRun = Date.now();
  }

  protected addCapability(capability: string): void {
    if (!this.info.capabilities.includes(capability)) {
      this.info.capabilities.push(capability);
    }
  }

  protected createThreat(partial: Partial<Threat> & {
    name: string;
    category: Threat['category'];
    severity: Threat['severity'];
    detectionSource: string;
  }): Threat {
    const now = Date.now();
    return {
      id: `threat-${this.info.id}-${now}-${Math.random().toString(36).slice(2, 8)}`,
      name: partial.name,
      category: partial.category,
      severity: partial.severity,
      confidence: partial.confidence ?? 0.5,
      confidenceLabel: partial.confidenceLabel ?? 'medium',
      risk: partial.risk ?? 'low',
      status: partial.status ?? 'active',
      evidence: partial.evidence ?? [],
      detectionSource: partial.detectionSource,
      detectionTime: partial.detectionTime ?? now,
      recommendation: partial.recommendation ?? 'Review and monitor.',
      explanation: partial.explanation ?? 'Threat detected by provider analysis.',
      mitreAttack: partial.mitreAttack ?? null,
      affectedAssets: partial.affectedAssets ?? [],
      requiresRestart: partial.requiresRestart ?? false,
      reversible: partial.reversible ?? true,
      canRemediate: partial.canRemediate ?? false,
    };
  }

  protected successResult(
    context: ProviderScanContext,
    threats: Threat[],
    duration: number,
    itemsScanned: number,
    metadata: Record<string, unknown> = {},
  ): ProviderScanResult {
    return {
      providerId: this.info.id,
      providerType: this.info.type,
      threats,
      duration,
      success: true,
      error: null,
      itemsScanned,
      metadata,
    };
  }

  protected failureResult(
    context: ProviderScanContext,
    error: string,
    duration: number,
  ): ProviderScanResult {
    return {
      providerId: this.info.id,
      providerType: this.info.type,
      threats: [],
      duration,
      success: false,
      error,
      itemsScanned: 0,
      metadata: {},
    };
  }
}
