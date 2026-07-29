/**
 * Workload Analyzer — estimates workload characteristics.
 *
 * Estimates: Gaming, Development, Office, Media Editing, Trading,
 * Browsing, Streaming, General Use, Mixed Usage.
 *
 * NEVER inspects private user data. Only uses application categories,
 * system telemetry, and aggregated metrics.
 */
import type {
  AIContext,
  KnowledgeObject,
  HardwareSummary,
  SoftwareSummary,
  UsageSummary,
  WorkloadSummary,
  WorkloadType,
  ProfileConfiguration,
  ContextEvidence,
} from './types';
import { clampScore } from './types';

export class WorkloadAnalyzer {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  analyze(
    context: AIContext,
    knowledge: KnowledgeObject,
    hardware: HardwareSummary,
    software: SoftwareSummary,
    usage: UsageSummary,
  ): WorkloadSummary {
    const scores: Record<string, number> = {};

    scores['gaming'] = this._scoreGaming(hardware, software, usage);
    scores['development'] = this._scoreDevelopment(hardware, software, usage);
    scores['office'] = this._scoreOffice(hardware, software, usage);
    scores['media_editing'] = this._scoreMediaEditing(hardware, software, usage);
    scores['trading'] = this._scoreTrading(hardware, software, usage);
    scores['browsing'] = this._scoreBrowsing(hardware, software, usage);
    scores['streaming'] = this._scoreStreaming(hardware, software, usage);
    scores['general_use'] = this._scoreGeneralUse(hardware, software, usage);

    // Sort by score descending
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const primaryWorkload = (sorted[0]?.[0] as WorkloadType) ?? 'unknown';

    // Secondary workloads (score > 0.2 and not primary)
    const secondaryWorkloads: WorkloadType[] = sorted
      .filter(([name, score]) => score > 0.2 && name !== primaryWorkload)
      .map(([name]) => name as WorkloadType);

    // Check for mixed usage
    const highScores = sorted.filter(([, score]) => score > 0.4);
    const isMixed = highScores.length >= 3;

    const finalPrimary: WorkloadType = isMixed ? 'mixed_usage' : primaryWorkload;
    if (isMixed) {
      scores['mixed_usage'] = clampScore(highScores.reduce((sum, [, s]) => sum + s, 0) / highScores.length);
    }

    const confidence = this._calculateConfidence(hardware, software, usage);

    return {
      primaryWorkload: finalPrimary,
      secondaryWorkloads: isMixed ? [primaryWorkload, ...secondaryWorkloads.slice(0, 3)] : secondaryWorkloads.slice(0, 4),
      workloadScores: scores,
      confidence,
    };
  }

  getEvidence(
    hardware: HardwareSummary,
    software: SoftwareSummary,
    usage: UsageSummary,
  ): ContextEvidence[] {
    const evidence: ContextEvidence[] = [];
    const ts = new Date().toISOString();

    evidence.push({ source: 'hardware', metric: 'performance_tier', value: hardware.performanceTier, timestamp: ts });
    evidence.push({ source: 'software', metric: 'developer_tools', value: software.developerToolCount, timestamp: ts });
    evidence.push({ source: 'software', metric: 'games', value: software.gameCount, timestamp: ts });
    evidence.push({ source: 'software', metric: 'creative_software', value: software.creativeSoftwareCount, timestamp: ts });
    evidence.push({ source: 'usage', metric: 'browsing_activity', value: usage.browsingActivity, timestamp: ts });
    evidence.push({ source: 'usage', metric: 'startup_behavior', value: usage.startupBehavior, timestamp: ts });

    return evidence;
  }

  // ── Private ────────────────────────────────────────────────

  private _scoreGaming(hardware: HardwareSummary, software: SoftwareSummary, _usage: UsageSummary): number {
    let score = 0;
    if (hardware.details.gpuTier === 'very_high') score += 0.4;
    else if (hardware.details.gpuTier === 'high') score += 0.3;
    else if (hardware.details.gpuTier === 'medium') score += 0.1;

    if (hardware.performanceTier === 'high_end') score += 0.2;
    else if (hardware.performanceTier === 'enterprise') score += 0.15;

    if (software.gameCount > 0) score += clampScore(software.gameCount * 0.2);
    return clampScore(score);
  }

  private _scoreDevelopment(hardware: HardwareSummary, software: SoftwareSummary, _usage: UsageSummary): number {
    let score = 0;
    if (software.developerToolCount > 0) score += clampScore(software.developerToolCount * 0.25);
    if (software.virtualizationCount > 0) score += 0.15;
    if (hardware.details.cpuTier === 'high' || hardware.details.cpuTier === 'very_high') score += 0.2;
    if (hardware.details.ramCapacity === 'high' || hardware.details.ramCapacity === 'very_high') score += 0.15;
    return clampScore(score);
  }

  private _scoreOffice(hardware: HardwareSummary, software: SoftwareSummary, _usage: UsageSummary): number {
    let score = 0;
    if (software.officeSuiteCount > 0) score += clampScore(software.officeSuiteCount * 0.3);
    if (software.browserCount > 0) score += 0.1;
    if (hardware.performanceTier === 'low_end' || hardware.performanceTier === 'mid_range') score += 0.1;
    return clampScore(score);
  }

  private _scoreMediaEditing(hardware: HardwareSummary, software: SoftwareSummary, _usage: UsageSummary): number {
    let score = 0;
    if (software.creativeSoftwareCount > 0) score += clampScore(software.creativeSoftwareCount * 0.3);
    if (hardware.details.gpuTier === 'high' || hardware.details.gpuTier === 'very_high') score += 0.2;
    if (hardware.details.ramCapacity === 'high' || hardware.details.ramCapacity === 'very_high') score += 0.2;
    if (hardware.details.cpuTier === 'high' || hardware.details.cpuTier === 'very_high') score += 0.15;
    return clampScore(score);
  }

  private _scoreTrading(hardware: HardwareSummary, software: SoftwareSummary, _usage: UsageSummary): number {
    let score = 0;
    if (hardware.performanceTier === 'high_end' || hardware.performanceTier === 'enterprise') score += 0.2;
    if (hardware.details.ramCapacity === 'high' || hardware.details.ramCapacity === 'very_high') score += 0.15;
    if (software.browserCount >= 2) score += 0.2;
    if (software.officeSuiteCount > 0) score += 0.1;
    if (hardware.displayCount !== null && hardware.displayCount >= 2) score += 0.2;
    return clampScore(score);
  }

  private _scoreBrowsing(hardware: HardwareSummary, software: SoftwareSummary, usage: UsageSummary): number {
    let score = 0;
    if (software.browserCount > 0) score += clampScore(software.browserCount * 0.2);
    if (usage.browsingActivity === 'high') score += 0.3;
    else if (usage.browsingActivity === 'medium') score += 0.15;
    return clampScore(score);
  }

  private _scoreStreaming(hardware: HardwareSummary, software: SoftwareSummary, _usage: UsageSummary): number {
    let score = 0;
    if (software.gameCount > 0) score += 0.1;
    if (software.creativeSoftwareCount > 0) score += 0.1;
    if (hardware.details.gpuTier === 'high' || hardware.details.gpuTier === 'very_high') score += 0.2;
    if (hardware.performanceTier === 'high_end') score += 0.15;
    return clampScore(score);
  }

  private _scoreGeneralUse(_hardware: HardwareSummary, _software: SoftwareSummary, _usage: UsageSummary): number {
    return 0.3;
  }

  private _calculateConfidence(
    hardware: HardwareSummary,
    software: SoftwareSummary,
    usage: UsageSummary,
  ): number {
    return clampScore(
      hardware.confidence * 0.3 +
      software.confidence * 0.4 +
      usage.confidence * 0.3,
    );
  }
}
