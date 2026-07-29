/**
 * Device Classifier — classifies the device into primary and secondary profiles.
 *
 * Supports hybrid classifications. Profiles are not mutually exclusive.
 * Examples:
 *   70% Developer, 20% Office, 10% Gaming
 *   60% Trading, 25% Office, 15% Browser Heavy
 */
import type {
  AIContext,
  KnowledgeObject,
  HardwareSummary,
  SoftwareSummary,
  UsageSummary,
  WorkloadSummary,
  DeviceProfileType,
  ProfileScore,
  ProfileConfiguration,
} from './types';
import { clampScore } from './types';

export class DeviceClassifier {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  classify(
    context: AIContext,
    knowledge: KnowledgeObject,
    hardware: HardwareSummary,
    software: SoftwareSummary,
    usage: UsageSummary,
    workload: WorkloadSummary,
  ): { primary: DeviceProfileType; secondary: ProfileScore[]; scores: ProfileScore[] } {
    const scores: ProfileScore[] = [];

    for (const def of this._config.profileDefinitions) {
      const score = this._scoreProfile(def.type, hardware, software, usage, workload);
      if (score.score > 0) {
        scores.push(score);
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Determine primary profile
    const rules = this._config.classificationRules;
    let primary: DeviceProfileType = 'general_purpose';

    if (scores.length > 0 && scores[0]!.score >= rules.primaryProfileThreshold) {
      primary = scores[0]!.profileType;
    }

    // Determine secondary profiles (exclude primary, above threshold)
    const secondary = scores
      .filter((s) => s.profileType !== primary && s.score >= rules.secondaryProfileThreshold)
      .slice(0, rules.maxSecondaryProfiles);

    return { primary, secondary, scores };
  }

  // ── Private ────────────────────────────────────────────────

  private _scoreProfile(
    type: DeviceProfileType,
    hardware: HardwareSummary,
    software: SoftwareSummary,
    usage: UsageSummary,
    workload: WorkloadSummary,
  ): ProfileScore {
    let score = 0;
    const evidence: string[] = [];

    switch (type) {
      case 'developer_workstation': {
        if (software.developerToolCount > 0) { score += 0.35; evidence.push(`Developer tools: ${software.developerToolCount}`); }
        if (software.virtualizationCount > 0) { score += 0.15; evidence.push(`Virtualization: ${software.virtualizationCount}`); }
        if (workload.primaryWorkload === 'development' || (workload.workloadScores['development'] ?? 0) > 0.3) { score += 0.25; evidence.push('Development workload detected'); }
        if (hardware.details.cpuTier === 'high' || hardware.details.cpuTier === 'very_high') { score += 0.1; evidence.push('High-end CPU'); }
        if (hardware.details.ramCapacity === 'high' || hardware.details.ramCapacity === 'very_high') { score += 0.1; evidence.push('High RAM'); }
        break;
      }
      case 'gaming_pc': {
        if (software.gameCount > 0) { score += 0.3; evidence.push(`Games detected: ${software.gameCount}`); }
        if (hardware.details.gpuTier === 'very_high') { score += 0.3; evidence.push('Very high GPU'); }
        else if (hardware.details.gpuTier === 'high') { score += 0.2; evidence.push('High GPU'); }
        if (hardware.performanceTier === 'high_end') { score += 0.2; evidence.push('High-end performance'); }
        if (workload.primaryWorkload === 'gaming' || (workload.workloadScores['gaming'] ?? 0) > 0.3) { score += 0.2; evidence.push('Gaming workload detected'); }
        break;
      }
      case 'creative_workstation': {
        if (software.creativeSoftwareCount > 0) { score += 0.35; evidence.push(`Creative software: ${software.creativeSoftwareCount}`); }
        if (hardware.details.gpuTier === 'high' || hardware.details.gpuTier === 'very_high') { score += 0.2; evidence.push('High GPU'); }
        if (hardware.details.ramCapacity === 'high' || hardware.details.ramCapacity === 'very_high') { score += 0.2; evidence.push('High RAM'); }
        if (workload.primaryWorkload === 'media_editing' || (workload.workloadScores['media_editing'] ?? 0) > 0.3) { score += 0.2; evidence.push('Media editing workload'); }
        break;
      }
      case 'office_workstation': {
        if (software.officeSuiteCount > 0) { score += 0.3; evidence.push(`Office suites: ${software.officeSuiteCount}`); }
        if (software.browserCount > 0) { score += 0.1; evidence.push('Browsers installed'); }
        if (usage.optimizationFrequency !== 'high') { score += 0.1; evidence.push('Low optimization frequency'); }
        if (workload.primaryWorkload === 'office' || (workload.workloadScores['office'] ?? 0) > 0.3) { score += 0.2; evidence.push('Office workload'); }
        if (hardware.performanceTier === 'low_end' || hardware.performanceTier === 'mid_range') { score += 0.1; evidence.push('Mid-range hardware'); }
        break;
      }
      case 'trading_workstation': {
        if (hardware.performanceTier === 'high_end' || hardware.performanceTier === 'enterprise') { score += 0.25; evidence.push('High-end hardware'); }
        if (hardware.details.ramCapacity === 'high' || hardware.details.ramCapacity === 'very_high') { score += 0.2; evidence.push('High RAM'); }
        if (software.browserCount >= 2) { score += 0.2; evidence.push('Multiple browsers'); }
        if (workload.primaryWorkload === 'trading' || (workload.workloadScores['trading'] ?? 0) > 0.3) { score += 0.25; evidence.push('Trading workload'); }
        break;
      }
      case 'home_pc': {
        if (usage.browsingActivity === 'medium' || usage.browsingActivity === 'high') { score += 0.2; evidence.push('Moderate browsing'); }
        if (software.browserCount > 0) { score += 0.1; evidence.push('Browsers installed'); }
        if (hardware.performanceTier === 'low_end' || hardware.performanceTier === 'mid_range') { score += 0.15; evidence.push('Consumer hardware'); }
        if (software.gameCount > 0) { score += 0.1; evidence.push('Some games'); }
        if (usage.maintenanceHabits === 'negligent' || usage.maintenanceHabits === 'reactive') { score += 0.1; evidence.push('Reactive maintenance'); }
        break;
      }
      case 'media_center': {
        if (workload.primaryWorkload === 'streaming' || (workload.workloadScores['streaming'] ?? 0) > 0.3) { score += 0.3; evidence.push('Streaming workload'); }
        if (software.browserCount > 0) { score += 0.1; evidence.push('Browsers installed'); }
        if (hardware.details.gpuTier === 'medium' || hardware.details.gpuTier === 'high') { score += 0.15; evidence.push('Decent GPU'); }
        break;
      }
      case 'power_user': {
        const diverseCount = software.categories.length;
        if (diverseCount >= 4) { score += 0.25; evidence.push(`Diverse software: ${diverseCount} categories`); }
        if (hardware.performanceTier === 'high_end') { score += 0.2; evidence.push('High-end hardware'); }
        if (workload.primaryWorkload === 'mixed_usage') { score += 0.25; evidence.push('Mixed workload'); }
        if (usage.optimizationFrequency === 'high') { score += 0.15; evidence.push('High optimization frequency'); }
        if (software.developerToolCount > 0 && software.gameCount > 0) { score += 0.15; evidence.push('Both dev tools and games'); }
        break;
      }
      case 'server': {
        if (hardware.details.isServer === true) { score += 0.5; evidence.push('Server hardware detected'); }
        if (hardware.performanceTier === 'enterprise') { score += 0.2; evidence.push('Enterprise tier'); }
        if (software.backgroundServiceCount > 20) { score += 0.15; evidence.push('Many background services'); }
        if (hardware.details.isLaptop === false) { score += 0.1; evidence.push('Not a laptop'); }
        break;
      }
      case 'virtual_machine': {
        if (hardware.details.isVirtualMachine === true) { score += 0.5; evidence.push('VM indicators detected'); }
        if (hardware.details.cpuTier === 'low' || hardware.details.cpuTier === 'medium') { score += 0.1; evidence.push('Limited CPU'); }
        if (hardware.details.ramCapacity === 'low' || hardware.details.ramCapacity === 'medium') { score += 0.1; evidence.push('Limited RAM'); }
        break;
      }
      case 'student_laptop': {
        if (hardware.details.isLaptop === true) { score += 0.2; evidence.push('Laptop detected'); }
        if (software.browserCount > 0) { score += 0.15; evidence.push('Browsers installed'); }
        if (hardware.performanceTier === 'low_end' || hardware.performanceTier === 'mid_range') { score += 0.15; evidence.push('Budget hardware'); }
        if (usage.browsingActivity === 'medium' || usage.browsingActivity === 'high') { score += 0.1; evidence.push('Active browsing'); }
        break;
      }
      case 'business_laptop': {
        if (hardware.details.isLaptop === true) { score += 0.2; evidence.push('Laptop detected'); }
        if (software.officeSuiteCount > 0) { score += 0.2; evidence.push('Office suites installed'); }
        if (software.securitySoftwareCount > 0) { score += 0.15; evidence.push('Security software'); }
        if (hardware.performanceTier === 'mid_range') { score += 0.15; evidence.push('Mid-range hardware'); }
        break;
      }
      case 'general_purpose': {
        score += 0.2;
        evidence.push('Default general purpose');
        if (hardware.performanceTier === 'mid_range') { score += 0.1; evidence.push('Mid-range hardware'); }
        break;
      }
      default:
        break;
    }

    return {
      profileType: type,
      score: clampScore(score),
      weight: clampScore(score),
      evidence,
    };
  }
}
