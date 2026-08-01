/**
 * BrowserProtectionProvider — browser security analysis provider.
 *
 * Detects browser hijackers, malicious extensions, suspicious
 * homepage/search engine changes, and unsafe browser configurations.
 */
import { SecurityProvider } from './SecurityProvider';
import type { ProviderScanContext, ProviderScanResult, Threat, SecurityEvidence, AffectedAsset } from './types';
import { confidenceToLabel } from './types';

export interface BrowserExtensionInfo {
  id: string;
  name: string;
  browser: string;
  permissions: string[];
  suspicious: boolean;
  reasons: string[];
}

export interface BrowserSettingsInfo {
  homepage: string;
  searchEngine: string;
  defaultNewTab: string;
  proxy: string | null;
  suspicious: boolean;
  reasons: string[];
}

export interface BrowserDetectionInput {
  extensions: BrowserExtensionInfo[];
  settings: BrowserSettingsInfo | null;
}

export class BrowserProtectionProvider extends SecurityProvider {
  constructor() {
    super(
      'browser-protection-provider',
      'Browser Protection Provider',
      'browser_protection',
      '1.0.0',
      'Detects browser hijackers, malicious extensions, and unsafe browser settings',
      12,
    );
    this.addCapability('extension_analysis');
    this.addCapability('hijacker_detection');
    this.addCapability('browser_settings_analysis');
    this.addCapability('proxy_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['browserInput'] as BrowserDetectionInput | undefined;
      const extensions = input?.extensions ?? [];
      const settings = input?.settings ?? null;

      for (const ext of extensions) {
        if (!ext.suspicious) continue;

        const evidence: SecurityEvidence[] = ext.reasons.map((reason) => ({
          source: this.getId(),
          type: 'browser_extension_indicator',
          value: ext.name,
          description: reason,
          timestamp: Date.now(),
        }));

        const assets: AffectedAsset[] = [{
          type: 'browser_extension',
          path: `${ext.browser}://${ext.id}`,
          name: ext.name,
        }];

        const confidence = Math.min(0.9, 0.4 + ext.reasons.length * 0.15);
        threats.push(this.createThreat({
          name: `Suspicious browser extension: ${ext.name}`,
          category: 'browser_hijacker',
          severity: ext.reasons.length > 3 ? 'high' : 'medium',
          confidence,
          confidenceLabel: confidenceToLabel(confidence),
          risk: ext.reasons.length > 3 ? 'high' : 'moderate',
          evidence,
          detectionSource: this.getId(),
          affectedAssets: assets,
          recommendation: `Review the "${ext.name}" extension. Remove if unrecognized or unnecessary.`,
          explanation: `Browser extension "${ext.name}" (${ext.browser}) flagged as suspicious. Permissions: ${ext.permissions.join(', ')}. Reasons: ${ext.reasons.join(', ')}.`,
          reversible: true,
          canRemediate: false,
        }));
      }

      if (settings?.suspicious) {
        const evidence: SecurityEvidence[] = settings.reasons.map((reason) => ({
          source: this.getId(),
          type: 'browser_settings_indicator',
          value: settings.homepage,
          description: reason,
          timestamp: Date.now(),
        }));

        threats.push(this.createThreat({
          name: 'Suspicious browser settings change',
          category: 'browser_hijacker',
          severity: 'medium',
          confidence: 0.7,
          confidenceLabel: confidenceToLabel(0.7),
          risk: 'moderate',
          evidence,
          detectionSource: this.getId(),
          affectedAssets: [{ type: 'network', path: settings.homepage, name: 'Browser Settings' }],
          recommendation: 'Review browser homepage and search engine settings. Reset to defaults if unauthorized.',
          explanation: `Browser settings appear modified. Homepage: ${settings.homepage}, Search engine: ${settings.searchEngine}. Reasons: ${settings.reasons.join(', ')}.`,
          reversible: true,
          canRemediate: false,
        }));
      }

      const itemsScanned = extensions.length + (settings ? 1 : 0);
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('inactive');
      return this.successResult(context, threats, duration, itemsScanned, { extensionsScanned: extensions.length });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }
}
