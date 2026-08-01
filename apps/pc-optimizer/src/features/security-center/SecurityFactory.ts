/**
 * SecurityFactory — factory for creating security providers.
 *
 * Creates and registers all built-in providers. Also supports
 * creating custom providers for extensibility.
 */
import type { SecurityConfiguration, ProviderScanContext, ProviderScanResult, ProviderType } from './types';
import { SecurityProvider } from './SecurityProvider';
import { BehaviorProvider } from './BehaviorProvider';
import { SignatureProvider } from './SignatureProvider';
import { PersistenceProvider } from './PersistenceProvider';
import { BrowserProtectionProvider } from './BrowserProtectionProvider';
import { ReputationProvider } from './ReputationProvider';
import { ThreatIntelligenceProvider } from './ThreatIntelligenceProvider';
import { SpywareDetectionProvider } from './SpywareDetectionProvider';
import { AdwareDetectionProvider } from './AdwareDetectionProvider';
import { PUPDetectionProvider } from './PUPDetectionProvider';
import { BrowserHijackerProvider } from './BrowserHijackerProvider';
import { PersistenceDetectionProvider } from './PersistenceDetectionProvider';
import { StartupAbuseProvider } from './StartupAbuseProvider';
import { ScheduledTaskProvider } from './ScheduledTaskProvider';
import { ServiceAnalysisProvider } from './ServiceAnalysisProvider';
import { PowerShellDetectionProvider } from './PowerShellDetectionProvider';
import { MacroDetectionProvider } from './MacroDetectionProvider';
import { ScriptDetectionProvider } from './ScriptDetectionProvider';
import { CryptoMinerDetectionProvider } from './CryptoMinerDetectionProvider';
import { SuspiciousProcessProvider } from './SuspiciousProcessProvider';
import { UnsignedExecutableProvider } from './UnsignedExecutableProvider';
import { NetworkBehaviorProvider } from './NetworkBehaviorProvider';
import { FileReputationProvider } from './FileReputationProvider';
import { PublisherTrustProvider } from './PublisherTrustProvider';
import type { SecurityRegistry } from './SecurityRegistry';

export class SecurityFactory {
  static createDefaultProviders(config: SecurityConfiguration): SecurityProvider[] {
    const providers: SecurityProvider[] = [];

    if (config.enableBehaviorAnalysis) {
      providers.push(new BehaviorProvider());
    }
    if (config.enableSignatureDetection) {
      providers.push(new SignatureProvider());
    }
    if (config.enablePersistenceDetection) {
      providers.push(new PersistenceProvider());
    }
    if (config.enableBrowserProtection) {
      providers.push(new BrowserProtectionProvider());
    }
    if (config.enableReputationAnalysis) {
      providers.push(new ReputationProvider());
    }
    if (config.enableThreatIntelligence) {
      providers.push(new ThreatIntelligenceProvider());
    }

    // Part 2 — Detection providers (priority by importance)
    if (config.enableBehaviorAnalysis) {
      providers.push(new SpywareDetectionProvider());
      providers.push(new SuspiciousProcessProvider());
      providers.push(new PowerShellDetectionProvider());
      providers.push(new MacroDetectionProvider());
      providers.push(new ScriptDetectionProvider());
      providers.push(new CryptoMinerDetectionProvider());
      providers.push(new NetworkBehaviorProvider());
      providers.push(new AdwareDetectionProvider());
      providers.push(new PUPDetectionProvider());
    }
    if (config.enablePersistenceDetection) {
      providers.push(new PersistenceDetectionProvider());
      providers.push(new StartupAbuseProvider());
      providers.push(new ScheduledTaskProvider());
      providers.push(new ServiceAnalysisProvider());
    }
    if (config.enableBrowserProtection) {
      providers.push(new BrowserHijackerProvider());
    }
    if (config.enableReputationAnalysis) {
      providers.push(new UnsignedExecutableProvider());
      providers.push(new FileReputationProvider());
      providers.push(new PublisherTrustProvider());
    }

    return providers;
  }

  static createAndRegisterAll(registry: SecurityRegistry, config: SecurityConfiguration): void {
    const providers = this.createDefaultProviders(config);
    for (const provider of providers) {
      registry.register(provider);
    }
  }

  static createCustomProvider(
    id: string,
    name: string,
    type: ProviderType,
    version: string,
    description: string,
    scanFn: (context: ProviderScanContext) => Promise<ProviderScanResult>,
    priority = 0,
  ): SecurityProvider {
    return new (class extends SecurityProvider {
      async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
        return scanFn(context);
      }
    })(id, name, type, version, description, priority);
  }
}
