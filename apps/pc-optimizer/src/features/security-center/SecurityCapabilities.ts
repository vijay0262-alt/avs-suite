/**
 * SecurityCapabilities — reports available and enabled security capabilities.
 */
import type { SecurityCapabilityInfo, SecurityCapabilitiesReport } from './types';

export class SecurityCapabilities {
  report(capabilities: SecurityCapabilityInfo[]): SecurityCapabilitiesReport {
    const available = capabilities.filter((c) => c.available);
    const enabled = capabilities.filter((c) => c.enabled);
    const unavailable = capabilities.filter((c) => !c.available).map((c) => c.name);

    return {
      available,
      enabled,
      unavailable,
      totalCapabilities: capabilities.length,
      availableCount: available.length,
      enabledCount: enabled.length,
    };
  }
}
