/**
 * ThreatProvider — base threat detection provider.
 *
 * Provides common threat detection functionality that specific
 * providers (Behavior, Signature, etc.) build upon.
 */
import { SecurityProvider } from './SecurityProvider';
import type { ProviderScanContext, ProviderScanResult, ProviderType, Threat } from './types';

export abstract class ThreatProvider extends SecurityProvider {
  protected detectThreats: (context: ProviderScanContext) => Promise<{ threats: Threat[]; itemsScanned: number; metadata: Record<string, unknown> }>;

  constructor(
    id: string,
    name: string,
    type: ProviderType,
    version: string,
    description: string,
    detectFn: (context: ProviderScanContext) => Promise<{ threats: Threat[]; itemsScanned: number; metadata: Record<string, unknown> }>,
    priority = 0,
  ) {
    super(id, name, type, version, description, priority);
    this.detectThreats = detectFn;
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const { threats, itemsScanned, metadata } = await this.detectThreats(context);
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, itemsScanned, metadata);
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }
}
