/**
 * Software Analyzer — analyzes software characteristics from context.
 *
 * Analyzes: Installed Applications, Developer Tools, Creative Software,
 * Games, Office Suites, Browsers, Virtualization, Security Software,
 * Background Services.
 *
 * NEVER inspects private user data. Only uses application categories
 * and aggregated system telemetry.
 */
import type {
  AIContext,
  SoftwareSummary,
  SoftwareCategory,
  ProfileConfiguration,
  ContextEvidence,
} from './types';
import { clampScore } from './types';

export class SoftwareAnalyzer {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  analyze(context: AIContext): SoftwareSummary {
    const rules = this._config.softwareRules;
    const categories: SoftwareCategory[] = [];

    const browserCount = context.browser?.installedBrowsers.length ?? 0;
    const backgroundServiceCount = context.windows?.services.length ?? 0;

    // Detect software categories from context signals
    const devToolCount = this._countIndicators(context, rules.devToolIndicators);
    const creativeSoftwareCount = this._countIndicators(context, rules.creativeSoftwareIndicators);
    const gameCount = this._countIndicators(context, rules.gameIndicators);
    const officeSuiteCount = this._countIndicators(context, rules.officeSuiteIndicators);
    const virtualizationCount = this._countIndicators(context, rules.virtualizationIndicators);
    const securitySoftwareCount = this._countIndicators(context, rules.securitySoftwareIndicators);

    if (browserCount > 0) categories.push({ category: 'browser', count: browserCount, relevance: clampScore(browserCount * 0.3) });
    if (devToolCount > 0) categories.push({ category: 'developer', count: devToolCount, relevance: clampScore(devToolCount * 0.25) });
    if (creativeSoftwareCount > 0) categories.push({ category: 'creative', count: creativeSoftwareCount, relevance: clampScore(creativeSoftwareCount * 0.3) });
    if (gameCount > 0) categories.push({ category: 'games', count: gameCount, relevance: clampScore(gameCount * 0.2) });
    if (officeSuiteCount > 0) categories.push({ category: 'office', count: officeSuiteCount, relevance: clampScore(officeSuiteCount * 0.25) });
    if (virtualizationCount > 0) categories.push({ category: 'virtualization', count: virtualizationCount, relevance: clampScore(virtualizationCount * 0.3) });
    if (securitySoftwareCount > 0) categories.push({ category: 'security', count: securitySoftwareCount, relevance: clampScore(securitySoftwareCount * 0.2) });

    const confidence = this._calculateConfidence(context);

    return {
      installedAppCount: null,
      developerToolCount: devToolCount,
      creativeSoftwareCount,
      gameCount,
      officeSuiteCount,
      browserCount,
      virtualizationCount,
      securitySoftwareCount,
      backgroundServiceCount,
      categories,
      confidence,
    };
  }

  getEvidence(context: AIContext): ContextEvidence[] {
    const evidence: ContextEvidence[] = [];
    const ts = new Date().toISOString();
    const rules = this._config.softwareRules;

    if (context.browser) {
      evidence.push({ source: 'browser', metric: 'installed_browsers', value: context.browser.installedBrowsers.length, timestamp: ts });
      evidence.push({ source: 'browser', metric: 'extensions', value: context.browser.extensions.length, timestamp: ts });
    }
    if (context.windows) {
      evidence.push({ source: 'windows', metric: 'service_count', value: context.windows.services.length, timestamp: ts });
    }
    if (context.startup) {
      evidence.push({ source: 'startup', metric: 'total_items', value: context.startup.totalStartupItems, timestamp: ts });
    }

    const devCount = this._countIndicators(context, rules.devToolIndicators);
    if (devCount > 0) evidence.push({ source: 'software', metric: 'developer_tools', value: devCount, timestamp: ts });

    return evidence;
  }

  // ── Private ────────────────────────────────────────────────

  private _countIndicators(context: AIContext, indicators: string[]): number {
    let count = 0;
    const haystack = this._buildHaystack(context);
    for (const indicator of indicators) {
      if (haystack.includes(indicator)) count++;
    }
    return count;
  }

  private _buildHaystack(context: AIContext): string {
    const parts: string[] = [];
    if (context.system) parts.push(context.system.cpuModel, context.system.hostname);
    if (context.browser) {
      for (const b of context.browser.installedBrowsers) parts.push(b.name);
      for (const e of context.browser.extensions) parts.push(e.name);
    }
    if (context.startup) {
      for (const item of context.startup.highImpactItems) parts.push(item.name, item.publisher);
    }
    if (context.windows) {
      for (const svc of context.windows.services) parts.push(svc.displayName, svc.name);
    }
    return parts.join(' ').toLowerCase();
  }

  private _calculateConfidence(context: AIContext): number {
    let confidence = 0;
    if (context.browser) confidence += 0.3;
    if (context.windows) confidence += 0.2;
    if (context.startup) confidence += 0.2;
    if (context.system) confidence += 0.3;
    return clampScore(confidence);
  }
}
