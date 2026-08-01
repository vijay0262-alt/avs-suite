/**
 * HardwareDiagnostics — runs diagnostics on all registered providers
 * and reports issues, capabilities, and availability.
 */

import type {
  HardwareDiagnosticsResult,
  HardwareDiagnosticIssue,
  HardwareCapabilities,
  HardwareCategory,
  HardwareComponent,
} from './types';
import { hardwareRegistry } from './HardwareRegistry';
import { HardwareCapabilitiesDetector } from './HardwareCapabilities';

export class HardwareDiagnosticsRunner {
  private readonly capabilitiesDetector = new HardwareCapabilitiesDetector();

  async run(
    components?: HardwareComponent[],
  ): Promise<HardwareDiagnosticsResult> {
    const issues: HardwareDiagnosticIssue[] = [];
    const providersChecked: string[] = [];
    const categoriesChecked: HardwareCategory[] = [];
    let capabilities: HardwareCapabilities = this.emptyCapabilities();

    const providers = hardwareRegistry.getAllProviders();

    for (const provider of providers) {
      providersChecked.push(provider.id);

      if (!provider.isAvailable()) {
        for (const category of provider.categories) {
          issues.push({
            category,
            providerId: provider.id,
            severity: 'warning',
            message: `Provider ${provider.id} is not available for ${category}`,
          });
        }
        continue;
      }

      for (const category of provider.categories) {
        categoriesChecked.push(category);
        const health = provider.getHealth();
        if (health.state === 'failed') {
          issues.push({
            category,
            providerId: provider.id,
            severity: 'error',
            message: `Provider ${provider.id} has failed: ${health.lastError ?? 'unknown error'}`,
          });
        } else if (health.state === 'degraded') {
          issues.push({
            category,
            providerId: provider.id,
            severity: 'warning',
            message: `Provider ${provider.id} is degraded (${health.consecutiveFailures} consecutive failures)`,
          });
        }
      }
    }

    if (components && components.length > 0) {
      capabilities = this.capabilitiesDetector.detect(components);
    }

    return {
      timestamp: Date.now(),
      providersChecked,
      categoriesChecked,
      issues,
      capabilities,
    };
  }

  private emptyCapabilities(): HardwareCapabilities {
    return {
      cpu: {
        temperature: false,
        powerDraw: false,
        voltage: false,
        perCoreUtilization: false,
        frequency: false,
        thermalThrottling: false,
      },
      gpu: {
        utilization: false,
        temperature: false,
        fanSpeed: false,
        powerDraw: false,
        encoderDecoder: false,
      },
      storage: {
        temperature: false,
        smart: false,
        lifetimeRemaining: false,
        readWriteSpeed: false,
      },
      network: {
        signalStrength: false,
        usage: false,
      },
      battery: {
        wearLevel: false,
        chargeCycles: false,
        estimatedRuntime: false,
      },
      cooling: {
        fanRPM: false,
      },
    };
  }
}
