/**
 * BrowserHijackerProvider — advanced browser security analysis.
 *
 * Priority: ⭐⭐⭐⭐ (Browser Security)
 *
 * Analyzes:
 *   - Extensions (permissions, publisher, rating)
 *   - Homepage / search engine / new tab modifications
 *   - Notification permission abuse
 *   - Proxy settings anomalies
 *   - Certificate anomalies
 *
 * False-positive control: Extensions require suspicious permissions
 * + low rating or unknown publisher. Settings changes require
 * unexpected values.
 */
import { SecurityProvider } from './SecurityProvider';
import type {
  ProviderScanContext,
  ProviderScanResult,
  Threat,
  SecurityEvidence,
  AffectedAsset,
  BrowserAnalysisInput,
  BrowserExtensionDetail,
  BrowserSettingsDetail,
} from './types';
import { confidenceToLabel } from './types';

export class BrowserHijackerProvider extends SecurityProvider {
  constructor() {
    super('browser-hijacker', 'Browser Hijacker Provider', 'browser_protection', '1.0.0',
      'Advanced browser security: extension analysis, hijacker detection, settings anomalies', 35);
    this.addCapability('extension_analysis');
    this.addCapability('hijacker_detection');
    this.addCapability('notification_abuse_detection');
    this.addCapability('proxy_anomaly_detection');
    this.addCapability('certificate_anomaly_detection');
  }

  async scan(context: ProviderScanContext): Promise<ProviderScanResult> {
    const start = Date.now();
    try {
      this.setStatus('active');
      const threats: Threat[] = [];
      const input = context.options['browserAnalysis'] as BrowserAnalysisInput | undefined;

      if (input) {
        for (const ext of input.extensions) {
          const threat = this.analyzeExtension(ext);
          if (threat) threats.push(threat);
        }
        if (input.settings) {
          const settingsThreat = this.analyzeSettings(input.settings);
          if (settingsThreat) threats.push(settingsThreat);
        }
      }

      const itemsScanned = (input?.extensions.length ?? 0) + (input?.settings ? 1 : 0);
      const duration = Date.now() - start;
      this.markRun();
      this.setStatus('active');
      return this.successResult(context, threats, duration, itemsScanned, { extensions: input?.extensions.length ?? 0 });
    } catch (e) {
      const duration = Date.now() - start;
      const error = e instanceof Error ? e.message : String(e);
      this.setLastError(error);
      return this.failureResult(context, error, duration);
    }
  }

  private analyzeExtension(ext: BrowserExtensionDetail): Threat | null {
    const suspiciousCount = ext.suspiciousPermissions.length;
    const hasAllUrls = ext.permissions.includes('<all_urls>');
    const lowRating = ext.rating < 2.5;
    const unknownPublisher = !ext.publisher;
    const hasNativeMessaging = ext.permissions.includes('nativeMessaging');

    // False-positive control: require 2+ risk factors
    const riskFactors =
      (suspiciousCount >= 2 ? 1 : 0) +
      (lowRating ? 1 : 0) +
      (unknownPublisher ? 1 : 0) +
      (hasAllUrls ? 1 : 0) +
      (hasNativeMessaging ? 1 : 0);

    if (riskFactors < 2) return null;

    const evidence: SecurityEvidence[] = [];

    if (suspiciousCount > 0) {
      evidence.push({
        source: this.getId(),
        type: 'suspicious_permissions',
        value: ext.suspiciousPermissions.join(', '),
        description: `Extension requests suspicious permissions: ${ext.suspiciousPermissions.join(', ')}`,
        timestamp: Date.now(),
      });
    }
    if (lowRating) {
      evidence.push({
        source: this.getId(),
        type: 'low_rating',
        value: ext.rating.toString(),
        description: `Extension has low rating: ${ext.rating}/5`,
        timestamp: Date.now(),
      });
    }
    if (unknownPublisher) {
      evidence.push({
        source: this.getId(),
        type: 'unknown_publisher',
        value: 'null',
        description: 'Extension has no verified publisher',
        timestamp: Date.now(),
      });
    }
    if (hasAllUrls) {
      evidence.push({
        source: this.getId(),
        type: 'all_urls_access',
        value: '<all_urls>',
        description: 'Extension requests access to all URLs',
        timestamp: Date.now(),
      });
    }

    const assets: AffectedAsset[] = [{
      type: 'browser_extension',
      path: `${ext.browser}://${ext.id}`,
      name: ext.name,
    }];

    const severity = riskFactors >= 4 ? 'high' : riskFactors >= 3 ? 'medium' : 'low';
    const confidence = Math.min(0.9, 0.3 + riskFactors * 0.15);

    return this.createThreat({
      name: `Suspicious browser extension: ${ext.name}`,
      category: 'browser_hijacker',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: severity === 'high' ? 'high' : 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: assets,
      recommendation: `Review the "${ext.name}" extension. Remove if unrecognized or unnecessary. Check permissions carefully.`,
      explanation: `Browser extension "${ext.name}" (${ext.browser}) has ${riskFactors} risk factor(s): ${evidence.map((e) => e.description).join('; ')}.`,
      mitreAttack: {
        tactic: 'Persistence',
        technique: 'Browser Extensions',
        reference: 'https://attack.mitre.org/techniques/T1176',
      },
      canRemediate: false,
    });
  }

  private analyzeSettings(settings: BrowserSettingsDetail): Threat | null {
    const evidence: SecurityEvidence[] = [];
    const suspiciousNotifications = settings.notificationPermissions.filter((n) => n.suspicious && n.granted);

    if (settings.homepage !== '' && !this.isKnownHomepage(settings.homepage)) {
      evidence.push({
        source: this.getId(),
        type: 'homepage_modification',
        value: settings.homepage,
        description: `Homepage set to unknown: ${settings.homepage}`,
        timestamp: Date.now(),
      });
    }

    if (settings.searchEngine !== '' && !this.isKnownSearchEngine(settings.searchEngine)) {
      evidence.push({
        source: this.getId(),
        type: 'search_engine_replacement',
        value: settings.searchEngine,
        description: `Search engine set to unknown: ${settings.searchEngine}`,
        timestamp: Date.now(),
      });
    }

    if (settings.proxy) {
      evidence.push({
        source: this.getId(),
        type: 'proxy_setting',
        value: settings.proxy,
        description: `Proxy configured: ${settings.proxy}`,
        timestamp: Date.now(),
      });
    }

    for (const notif of suspiciousNotifications) {
      evidence.push({
        source: this.getId(),
        type: 'notification_abuse',
        value: notif.origin,
        description: `Suspicious notification permission granted to: ${notif.origin}`,
        timestamp: Date.now(),
      });
    }

    for (const cert of settings.certificateAnomalies) {
      evidence.push({
        source: this.getId(),
        type: 'certificate_anomaly',
        value: cert,
        description: `Certificate anomaly: ${cert}`,
        timestamp: Date.now(),
      });
    }

    if (evidence.length < 2) return null;

    const assets: AffectedAsset[] = [{ type: 'network', path: settings.homepage, name: 'Browser Settings' }];
    const severity = evidence.length >= 4 ? 'medium' : 'low';
    const confidence = Math.min(0.85, 0.3 + evidence.length * 0.1);

    return this.createThreat({
      name: 'Suspicious browser settings',
      category: 'browser_hijacker',
      severity,
      confidence,
      confidenceLabel: confidenceToLabel(confidence),
      risk: 'moderate',
      evidence,
      detectionSource: this.getId(),
      affectedAssets: assets,
      recommendation: 'Review browser settings. Reset homepage, search engine, and notification permissions to defaults.',
      explanation: `Browser settings show ${evidence.length} suspicious modification(s): ${evidence.map((e) => e.description).join('; ')}.`,
      canRemediate: false,
    });
  }

  private isKnownHomepage(url: string): boolean {
    const known = ['google.com', 'bing.com', 'yahoo.com', 'msn.com', 'edge.com', 'about:blank', 'about:newtab', 'chrome://'];
    return known.some((k) => url.toLowerCase().includes(k));
  }

  private isKnownSearchEngine(name: string): boolean {
    const known = ['google', 'bing', 'yahoo', 'duckduckgo', 'ecosia', 'ask', 'aol', 'baidu', 'yandex'];
    return known.some((k) => name.toLowerCase().includes(k));
  }
}
