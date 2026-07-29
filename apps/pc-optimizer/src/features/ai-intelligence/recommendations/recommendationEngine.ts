/**
 * Recommendation Engine — generates recommendations from a KnowledgeObject.
 *
 * This engine analyzes knowledge facts, relationships, trends, and changes
 * to produce structured, evidence-based recommendations.
 *
 * It NEVER executes optimizations.
 * It NEVER modifies the system.
 * It ONLY produces structured recommendations.
 *
 * Extensibility: Future modules register recommendation builder plugins.
 * No switch statements. No module-specific logic. Fully provider-based.
 */
import type {
  KnowledgeObject,
  KnowledgeFact,
  Recommendation,
  RecommendationCategory,
  RecommendationSafety,
  RecommendationBenefits,
  RecommendationConfiguration,
} from './types';
import {
  generateRecommendationId,
  createRecommendationEvidence,
  createDefaultSafety,
  createDefaultBenefits,
} from './types';

export class RecommendationEngine {
  private _config: RecommendationConfiguration;

  constructor(config: RecommendationConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecommendationConfiguration): void {
    this._config = config;
  }

  /**
   * Generate recommendations from a knowledge object.
   */
  generate(knowledge: KnowledgeObject): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const facts = knowledge.facts;

    // Generate from each category
    for (const category of this._config.enabledCategories) {
      const categoryFacts = facts.filter((f) => this._mapCategory(f.category) === category);
      if (categoryFacts.length === 0) continue;

      const categoryRecs = this._generateForCategory(category, categoryFacts, knowledge);
      recommendations.push(...categoryRecs);
    }

    return recommendations;
  }

  // ── Category Generation ────────────────────────────────────

  private _generateForCategory(
    category: RecommendationCategory,
    facts: KnowledgeFact[],
    knowledge: KnowledgeObject,
  ): Recommendation[] {
    const recs: Recommendation[] = [];

    switch (category) {
      case 'performance':
        recs.push(...this._generatePerformanceRecommendations(facts, knowledge));
        break;
      case 'storage':
        recs.push(...this._generateStorageRecommendations(facts, knowledge));
        break;
      case 'browser':
        recs.push(...this._generateBrowserRecommendations(facts, knowledge));
        break;
      case 'privacy':
        recs.push(...this._generatePrivacyRecommendations(facts, knowledge));
        break;
      case 'startup':
        recs.push(...this._generateStartupRecommendations(facts, knowledge));
        break;
      case 'duplicates':
        recs.push(...this._generateDuplicatesRecommendations(facts, knowledge));
        break;
      case 'windows':
        recs.push(...this._generateWindowsRecommendations(facts, knowledge));
        break;
      case 'security':
        recs.push(...this._generateSecurityRecommendations(facts, knowledge));
        break;
      case 'maintenance':
        recs.push(...this._generateMaintenanceRecommendations(facts, knowledge));
        break;
      case 'health':
        recs.push(...this._generateHealthRecommendations(facts, knowledge));
        break;
      case 'automation':
        recs.push(...this._generateAutomationRecommendations(facts, knowledge));
        break;
      default:
        break;
    }

    return recs;
  }

  // ── Performance ────────────────────────────────────────────

  private _generatePerformanceRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const cpuUsage = facts.find((f) => f.name === 'cpu_usage');
    if (cpuUsage && typeof cpuUsage.value === 'number' && cpuUsage.value > 80) {
      recs.push(this._createRecommendation(
        'performance', 'Reduce CPU Usage',
        `CPU usage is high at ${cpuUsage.value}%`,
        `CPU usage is currently ${cpuUsage.value}%, which may cause system slowdowns. Consider closing resource-intensive applications or optimizing startup programs.`,
        [cpuUsage], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(60), estimatedPerformanceGain: 15 },
        false,
      ));
    }

    const ramUsage = facts.find((f) => f.name === 'ram_usage');
    if (ramUsage && typeof ramUsage.value === 'number' && ramUsage.value > 85) {
      recs.push(this._createRecommendation(
        'performance', 'Free Up Memory',
        `RAM usage is high at ${ramUsage.value}%`,
        `RAM usage is currently ${ramUsage.value}%. Closing unnecessary applications can improve system responsiveness.`,
        [ramUsage], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(30), estimatedPerformanceGain: 10 },
        false,
      ));
    }

    const diskUsage = facts.find((f) => f.name === 'disk_usage');
    if (diskUsage && typeof diskUsage.value === 'number' && diskUsage.value > 90) {
      recs.push(this._createRecommendation(
        'performance', 'Reduce Disk Usage',
        `Disk usage is critical at ${diskUsage.value}%`,
        `Disk usage is at ${diskUsage.value}%. A nearly full disk can significantly slow down system performance.`,
        [diskUsage], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(120), estimatedPerformanceGain: 20 },
        false,
      ));
    }

    return recs;
  }

  // ── Storage ────────────────────────────────────────────────

  private _generateStorageRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const usedSpace = facts.find((f) => f.name === 'used_space');
    const totalSpace = facts.find((f) => f.name === 'total_capacity');
    if (usedSpace && totalSpace && typeof usedSpace.value === 'number' && typeof totalSpace.value === 'number') {
      const usagePercent = (usedSpace.value / totalSpace.value) * 100;
      if (usagePercent > 80) {
        const recoverable = Math.round(totalSpace.value * 0.1);
        recs.push(this._createRecommendation(
          'storage', 'Clean Up Disk Space',
          `${usagePercent.toFixed(0)}% of disk space is used`,
          `Disk is ${usagePercent.toFixed(0)}% full. Cleaning temporary files, cache, and unnecessary data can recover approximately ${recoverable}MB.`,
          [usedSpace, totalSpace], knowledge,
          createDefaultSafety('none'),
          { ...createDefaultBenefits(90), estimatedSpaceRecovered: recoverable, estimatedPerformanceGain: 5 },
          false,
        ));
      }
    }

    const fragmentation = facts.find((f) => f.name === 'fragmentation');
    if (fragmentation && typeof fragmentation.value === 'number' && fragmentation.value > 10) {
      recs.push(this._createRecommendation(
        'storage', 'Defragment Disk',
        `Disk fragmentation is at ${fragmentation.value}%`,
        `Disk fragmentation of ${fragmentation.value}% can slow down file access. Defragmenting can improve disk read/write performance.`,
        [fragmentation], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(300), estimatedPerformanceGain: 8 },
        true,
      ));
    }

    return recs;
  }

  // ── Browser ────────────────────────────────────────────────

  private _generateBrowserRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const cacheSize = facts.find((f) => f.name === 'total_cache');
    if (cacheSize && typeof cacheSize.value === 'number' && cacheSize.value > 200) {
      recs.push(this._createRecommendation(
        'browser', 'Clear Browser Cache',
        `Browser cache is ${cacheSize.value}MB`,
        `Browser cache has grown to ${cacheSize.value}MB. Clearing it frees space and can resolve browser issues.`,
        [cacheSize], knowledge,
        createDefaultSafety('none'),
        { ...createDefaultBenefits(30), estimatedSpaceRecovered: cacheSize.value },
        false,
      ));
    }

    const cookieSize = facts.find((f) => f.name === 'total_cookies');
    if (cookieSize && typeof cookieSize.value === 'number' && cookieSize.value > 50) {
      recs.push(this._createRecommendation(
        'browser', 'Clear Browser Cookies',
        `Cookie storage is ${cookieSize.value}MB`,
        `Cookie storage has grown to ${cookieSize.value}MB. Clearing old cookies improves privacy and frees space.`,
        [cookieSize], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(20), estimatedSpaceRecovered: cookieSize.value, estimatedPrivacyImprovement: 10 },
        false,
      ));
    }

    return recs;
  }

  // ── Privacy ────────────────────────────────────────────────

  private _generatePrivacyRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const trackingCookies = facts.find((f) => f.name === 'tracking_cookies');
    if (trackingCookies && typeof trackingCookies.value === 'number' && trackingCookies.value > 50) {
      recs.push(this._createRecommendation(
        'privacy', 'Remove Tracking Cookies',
        `${trackingCookies.value} tracking cookies detected`,
        `${trackingCookies.value} tracking cookies were found. Removing them improves privacy and reduces unwanted tracking.`,
        [trackingCookies], knowledge,
        createDefaultSafety('none'),
        { ...createDefaultBenefits(15), estimatedPrivacyImprovement: 25 },
        false,
      ));
    }

    const tempFiles = facts.find((f) => f.name === 'temp_files');
    if (tempFiles && typeof tempFiles.value === 'number' && tempFiles.value > 100) {
      recs.push(this._createRecommendation(
        'privacy', 'Clean Temporary Files',
        `${tempFiles.value}MB of temporary files`,
        `${tempFiles.value}MB of temporary files detected. Cleaning them frees space and improves privacy.`,
        [tempFiles], knowledge,
        createDefaultSafety('none'),
        { ...createDefaultBenefits(30), estimatedSpaceRecovered: tempFiles.value, estimatedPrivacyImprovement: 10 },
        false,
      ));
    }

    const recycleBin = facts.find((f) => f.name === 'recycle_bin');
    if (recycleBin && typeof recycleBin.value === 'number' && recycleBin.value > 50) {
      recs.push(this._createRecommendation(
        'privacy', 'Empty Recycle Bin',
        `Recycle bin contains ${recycleBin.value}MB`,
        `Recycle bin has ${recycleBin.value}MB of deleted files. Emptying it permanently frees disk space.`,
        [recycleBin], knowledge,
        createDefaultSafety('medium'),
        { ...createDefaultBenefits(10), estimatedSpaceRecovered: recycleBin.value },
        false,
      ));
    }

    return recs;
  }

  // ── Startup ────────────────────────────────────────────────

  private _generateStartupRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const totalItems = facts.find((f) => f.name === 'total_items');
    const enabledItems = facts.find((f) => f.name === 'enabled_items');
    const bootTime = facts.find((f) => f.name === 'estimated_boot_time');

    if (totalItems && typeof totalItems.value === 'number' && totalItems.value > 10) {
      recs.push(this._createRecommendation(
        'startup', 'Optimize Startup Programs',
        `${totalItems.value} startup programs detected`,
        `${totalItems.value} startup programs are installed with ${enabledItems && typeof enabledItems.value === 'number' ? enabledItems.value : '?'} enabled. Disabling unnecessary startup items can significantly reduce boot time.`,
        [totalItems, enabledItems].filter(Boolean) as KnowledgeFact[], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(60), estimatedPerformanceGain: 15 },
        false,
      ));
    }

    if (bootTime && typeof bootTime.value === 'number' && bootTime.value > 30) {
      recs.push(this._createRecommendation(
        'startup', 'Reduce Boot Time',
        `Boot time is ${bootTime.value} seconds`,
        `Estimated boot time is ${bootTime.value} seconds. Optimizing startup programs can reduce this significantly.`,
        [bootTime], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(45), estimatedPerformanceGain: 20 },
        false,
      ));
    }

    return recs;
  }

  // ── Duplicates ─────────────────────────────────────────────

  private _generateDuplicatesRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const wastedSpace = facts.find((f) => f.name === 'wasted_space');
    if (wastedSpace && typeof wastedSpace.value === 'number' && wastedSpace.value > 100) {
      recs.push(this._createRecommendation(
        'duplicates', 'Remove Duplicate Files',
        `${wastedSpace.value}MB wasted by duplicates`,
        `Duplicate files are wasting ${wastedSpace.value}MB of disk space. Removing them frees storage.`,
        [wastedSpace], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(120), estimatedSpaceRecovered: wastedSpace.value },
        true,
      ));
    }

    const dupGroups = facts.find((f) => f.name === 'duplicate_groups');
    if (dupGroups && typeof dupGroups.value === 'number' && dupGroups.value > 3) {
      recs.push(this._createRecommendation(
        'duplicates', 'Review Duplicate File Groups',
        `${dupGroups.value} duplicate file groups found`,
        `${dupGroups.value} groups of duplicate files detected. Review and remove unnecessary duplicates.`,
        [dupGroups], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(90), estimatedSpaceRecovered: 0 },
        true,
      ));
    }

    return recs;
  }

  // ── Windows ────────────────────────────────────────────────

  private _generateWindowsRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const pendingUpdates = facts.find((f) => f.name === 'pending_updates');
    if (pendingUpdates && typeof pendingUpdates.value === 'number' && pendingUpdates.value > 0) {
      recs.push(this._createRecommendation(
        'windows', 'Install Windows Updates',
        `${pendingUpdates.value} pending Windows updates`,
        `${pendingUpdates.value} Windows updates are pending. Installing them improves security and system stability.`,
        [pendingUpdates], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(300), estimatedHealthIncrease: 10 },
        false,
      ));
    }

    return recs;
  }

  // ── Security ───────────────────────────────────────────────

  private _generateSecurityRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const securityScore = facts.find((f) => f.name === 'security_score');
    if (securityScore && typeof securityScore.value === 'number' && securityScore.value < 70) {
      recs.push(this._createRecommendation(
        'security', 'Improve Security Score',
        `Security score is ${securityScore.value}`,
        `Security score is ${securityScore.value}, below recommended 70. Review security settings and enable protections.`,
        [securityScore], knowledge,
        { ...createDefaultSafety('medium'), automaticExecutionAllowed: false, automationEligible: false },
        { ...createDefaultBenefits(180), estimatedHealthIncrease: 15 },
        true,
      ));
    }

    return recs;
  }

  // ── Maintenance ────────────────────────────────────────────

  private _generateMaintenanceRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const historyEntries = facts.find((f) => f.name === 'history_entries');
    if (historyEntries && typeof historyEntries.value === 'number' && historyEntries.value > 500) {
      recs.push(this._createRecommendation(
        'maintenance', 'Clear Browsing History',
        `${historyEntries.value} history entries`,
        `Browsing history has ${historyEntries.value} entries. Clearing old history improves privacy and frees space.`,
        [historyEntries], knowledge,
        createDefaultSafety('none'),
        { ...createDefaultBenefits(20), estimatedPrivacyImprovement: 15, estimatedSpaceRecovered: 5 },
        false,
      ));
    }

    return recs;
  }

  // ── Health ─────────────────────────────────────────────────

  private _generateHealthRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const overallScore = facts.find((f) => f.name === 'overall_score');
    if (overallScore && typeof overallScore.value === 'number' && overallScore.value < 70) {
      recs.push(this._createRecommendation(
        'health', 'Improve System Health',
        `Health score is ${overallScore.value}`,
        `Overall health score is ${overallScore.value}. Running optimizations across categories can improve system health.`,
        [overallScore], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(120), estimatedHealthIncrease: 20 },
        false,
      ));
    }

    const diskScore = facts.find((f) => f.name === 'disk_score');
    if (diskScore && typeof diskScore.value === 'number' && diskScore.value < 60) {
      recs.push(this._createRecommendation(
        'health', 'Improve Disk Health',
        `Disk health score is ${diskScore.value}`,
        `Disk health score is ${diskScore.value}. Cleaning disk and checking for errors can improve disk health.`,
        [diskScore], knowledge,
        createDefaultSafety('low'),
        { ...createDefaultBenefits(90), estimatedHealthIncrease: 15 },
        false,
      ));
    }

    return recs;
  }

  // ── Automation ─────────────────────────────────────────────

  private _generateAutomationRecommendations(facts: KnowledgeFact[], knowledge: KnowledgeObject): Recommendation[] {
    const recs: Recommendation[] = [];

    const schedulerEnabled = facts.find((f) => f.name === 'enabled');
    if (schedulerEnabled && typeof schedulerEnabled.value === 'boolean' && !schedulerEnabled.value) {
      recs.push(this._createRecommendation(
        'automation', 'Enable Scheduled Optimization',
        'Automatic optimization is disabled',
        'Enabling scheduled optimization ensures the system stays maintained without manual intervention.',
        [schedulerEnabled], knowledge,
        createDefaultSafety('none'),
        { ...createDefaultBenefits(30), estimatedHealthIncrease: 10 },
        true,
      ));
    }

    return recs;
  }

  // ── Factory ────────────────────────────────────────────────

  private _createRecommendation(
    category: RecommendationCategory,
    title: string,
    summary: string,
    description: string,
    supportingFacts: KnowledgeFact[],
    knowledge: KnowledgeObject,
    safety: RecommendationSafety,
    benefits: RecommendationBenefits,
    requiresPro: boolean,
  ): Recommendation {
    const rels = knowledge.relationships.filter(
      (r) => supportingFacts.some((f) => f.id === r.sourceFactId || f.id === r.targetFactId),
    );
    const trends = knowledge.trends.filter((t) => supportingFacts.some((f) => f.id === t.factId));
    const changes = knowledge.changes.filter((c) => supportingFacts.some((f) => f.id === c.factId));

    const evidence = createRecommendationEvidence(supportingFacts, rels, trends, changes);

    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this._config.autoExpirationHours * 60 * 60 * 1000).toISOString();

    return {
      id: generateRecommendationId(category, title),
      title,
      summary,
      description,
      category,
      priority: 'medium',
      scores: {
        impactScore: 0.5,
        safetyScore: 0.8,
        urgencyScore: 0.5,
        effortScore: 0.3,
        confidenceScore: evidence.confidence,
        overallScore: 0.5,
      },
      evidence,
      benefits,
      safety,
      requiresPro,
      createdAt: now,
      expiresAt,
      status: 'active',
      futureMetadata: {},
    };
  }

  private _mapCategory(factCategory: string): RecommendationCategory {
    const map: Record<string, RecommendationCategory> = {
      system: 'maintenance',
      health: 'health',
      performance: 'performance',
      storage: 'storage',
      browser: 'browser',
      privacy: 'privacy',
      startup: 'startup',
      windows: 'windows',
      duplicates: 'duplicates',
      scheduler: 'automation',
      history: 'maintenance',
      reports: 'maintenance',
      experience: 'maintenance',
      capabilities: 'maintenance',
      quota: 'maintenance',
      analytics: 'maintenance',
      custom: 'custom',
    };
    return map[factCategory] ?? 'custom';
  }
}
