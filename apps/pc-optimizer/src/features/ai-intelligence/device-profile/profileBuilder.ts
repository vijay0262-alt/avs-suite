/**
 * Profile Builder — orchestrates the device profile pipeline.
 *
 * Pipeline:
 *   Context + Knowledge + Predictions →
 *   Hardware Analysis → Software Analysis → Usage Analysis →
 *   Workload Analysis → Device Classification → Profile Scoring →
 *   Profile Validation → Device Profile
 */
import type {
  AIContext,
  KnowledgeObject,
  PredictionList,
  DeviceProfile,
  ProfileScore,
  ProfileEvidence,
  ProfileConfiguration,
  ContextEvidence,
} from './types';
import {
  generateProfileId,
  createProfileEvidence,
} from './types';
import { HardwareAnalyzer } from './hardwareAnalyzer';
import { SoftwareAnalyzer } from './softwareAnalyzer';
import { UsageAnalyzer } from './usageAnalyzer';
import { WorkloadAnalyzer } from './workloadAnalyzer';
import { DeviceClassifier } from './deviceClassifier';
import { ProfileScorer } from './profileScorer';
import { ProfileValidator } from './profileValidator';
import type { ProfileHistory } from './profileHistory';
import type { ProfileRegistry } from './profileRegistry';
import type { ProfileEventEmitter } from './profileEvents';

export class ProfileBuilder {
  private _hardwareAnalyzer: HardwareAnalyzer;
  private _softwareAnalyzer: SoftwareAnalyzer;
  private _usageAnalyzer: UsageAnalyzer;
  private _workloadAnalyzer: WorkloadAnalyzer;
  private _classifier: DeviceClassifier;
  private _scorer: ProfileScorer;
  private _validator: ProfileValidator;
  private _history: ProfileHistory;
  private _registry: ProfileRegistry;
  private _events: ProfileEventEmitter;
  private _config: ProfileConfiguration;

  constructor(
    config: ProfileConfiguration,
    history: ProfileHistory,
    registry: ProfileRegistry,
    events: ProfileEventEmitter,
  ) {
    this._config = config;
    this._hardwareAnalyzer = new HardwareAnalyzer(config);
    this._softwareAnalyzer = new SoftwareAnalyzer(config);
    this._usageAnalyzer = new UsageAnalyzer(config);
    this._workloadAnalyzer = new WorkloadAnalyzer(config);
    this._classifier = new DeviceClassifier(config);
    this._scorer = new ProfileScorer(config);
    this._validator = new ProfileValidator(config);
    this._history = history;
    this._registry = registry;
    this._events = events;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
    this._hardwareAnalyzer.updateConfig(config);
    this._softwareAnalyzer.updateConfig(config);
    this._usageAnalyzer.updateConfig(config);
    this._workloadAnalyzer.updateConfig(config);
    this._classifier.updateConfig(config);
    this._scorer.updateConfig(config);
    this._validator.updateConfig(config);
    this._history.updateConfig(config);
  }

  build(
    context: AIContext,
    knowledge: KnowledgeObject,
    predictions: PredictionList | null,
  ): DeviceProfile | null {
    // 1. Hardware analysis
    const hardware = this._hardwareAnalyzer.analyze(context);
    const hardwareEvidence = this._hardwareAnalyzer.getEvidence(context);

    // 2. Software analysis
    const software = this._softwareAnalyzer.analyze(context);
    const softwareEvidence = this._softwareAnalyzer.getEvidence(context);

    // 3. Usage analysis
    const usage = this._usageAnalyzer.analyze(context, knowledge);
    const usageEvidence = this._usageAnalyzer.getEvidence(context, knowledge);

    // 4. Workload analysis
    const workload = this._workloadAnalyzer.analyze(context, knowledge, hardware, software, usage);
    const workloadEvidence = this._workloadAnalyzer.getEvidence(hardware, software, usage);

    // 5. Classification
    const { primary, secondary, scores } = this._classifier.classify(
      context, knowledge, hardware, software, usage, workload,
    );

    // 6. Plugin providers
    const pluginScores: ProfileScore[] = [];
    for (const plugin of this._registry.getAvailablePlugins()) {
      try {
        const pluginResult = plugin.analyzeProfile(context, knowledge, predictions, this._config);
        pluginScores.push(...pluginResult);
      } catch {
        // Plugin failure does not break the build
      }
    }

    // Merge plugin scores with classifier scores
    const allScores = [...scores, ...pluginScores].sort((a, b) => b.score - a.score);

    // 7. Scoring
    const allEvidence: ContextEvidence[] = [
      ...hardwareEvidence,
      ...softwareEvidence,
      ...usageEvidence,
      ...workloadEvidence,
    ];

    const sourceProviders: string[] = [];
    if (context.system) sourceProviders.push(context.system.provenance.providerName);
    if (context.browser) sourceProviders.push(context.browser.provenance.providerName);
    if (context.storage) sourceProviders.push(context.storage.provenance.providerName);
    if (context.startup) sourceProviders.push(context.startup.provenance.providerName);
    if (context.history) sourceProviders.push(context.history.provenance.providerName);

    const evidenceCount = allEvidence.length + knowledge.facts.length;
    const historicalStability = this._history.getHistoricalStability();
    const scoringResult = this._scorer.scoreProfile(
      hardware, software, usage, workload, allScores,
      evidenceCount, historicalStability,
    );

    // 8. Build evidence
    const assumptions = this._deriveAssumptions(hardware, software, usage, workload, primary);
    const evidence: ProfileEvidence = createProfileEvidence(
      knowledge.facts,
      [knowledge.metadata.knowledgeId],
      predictions?.predictions.map((p) => p.id) ?? [],
      allEvidence,
      knowledge.facts.map((f) => f.evidence),
      sourceProviders,
      scoringResult.confidence,
      scoringResult.stability,
      scoringResult.consistency,
      scoringResult.freshness,
      assumptions,
    );

    // 9. Build profile
    const deviceName = context.system?.hostname ?? 'Unknown Device';
    const platform = context.metadata?.platform ?? 'unknown';
    const now = new Date().toISOString();
    const profileId = generateProfileId(deviceName);

    const profile: DeviceProfile = {
      id: profileId,
      generatedAt: now,
      updatedAt: now,
      deviceName,
      platform,
      hardwareSummary: hardware,
      softwareSummary: software,
      usageSummary: usage,
      workloadSummary: workload,
      primaryProfile: primary,
      secondaryProfiles: secondary,
      profileScores: allScores,
      confidenceScore: scoringResult.confidence,
      evidence,
      changeHistory: [],
      futureMetadata: {
        profileVersion: this._config.profileVersion,
        predictionCount: predictions?.predictions.length ?? 0,
        knowledgeFactCount: knowledge.facts.length,
      },
    };

    // 10. Record history and detect changes
    const previous = this._history.getPreviousProfile();
    if (!previous) {
      const change = this._history.recordCreated(profile);
      if (change) profile.changeHistory.push(change);
      this._events.emit('profile_created', { profileId, primaryProfile: primary });
    } else {
      const changes = this._history.recordUpdated(previous, profile);
      profile.changeHistory.push(...changes);
      for (const change of changes) {
        if (change.changeType === 'changed') this._events.emit('profile_changed', { profileId, change });
        if (change.changeType === 'strengthened') this._events.emit('profile_strengthened', { profileId, change });
        if (change.changeType === 'weakened') this._events.emit('profile_weakened', { profileId, change });
      }
      this._events.emit('profile_updated', { profileId, changes: changes.length });
    }

    // 11. Validate
    const validation = this._validator.validateProfile(profile);
    this._history.recordValidated(profileId);
    this._events.emit('profile_validated', { profileId, valid: validation.valid, issues: validation.issues.length });

    return profile;
  }

  // ── Private ────────────────────────────────────────────────

  private _deriveAssumptions(
    hardware: DeviceProfile['hardwareSummary'],
    software: DeviceProfile['softwareSummary'],
    usage: DeviceProfile['usageSummary'],
    workload: DeviceProfile['workloadSummary'],
    primary: DeviceProfile['primaryProfile'],
  ): string[] {
    const assumptions: string[] = [];

    assumptions.push(`Primary profile classified as ${primary} based on available evidence`);
    assumptions.push(`Performance tier assessed as ${hardware.performanceTier}`);
    assumptions.push(`Primary workload estimated as ${workload.primaryWorkload}`);

    if (hardware.details.isLaptop === null) {
      assumptions.push('Laptop detection inconclusive — battery and display data not available');
    }
    if (software.installedAppCount === null) {
      assumptions.push('Installed application count not available — software analysis based on context signals');
    }
    if (usage.sessionDuration === 'unknown') {
      assumptions.push('Session duration unknown — uptime data not available');
    }

    return assumptions;
  }
}
