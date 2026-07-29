/**
 * Profile Scorer — calculates profile confidence and stability.
 *
 * Confidence is based on:
 *   Evidence count, historical stability, profile consistency, data freshness.
 */
import type {
  ProfileScore,
  ProfileEvidence,
  ProfileConfiguration,
  HardwareSummary,
  SoftwareSummary,
  UsageSummary,
  WorkloadSummary,
} from './types';
import { clampScore } from './types';

export class ProfileScorer {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  calculateConfidence(
    hardware: HardwareSummary,
    software: SoftwareSummary,
    usage: UsageSummary,
    workload: WorkloadSummary,
    evidenceCount: number,
  ): number {
    const rules = this._config.scoringRules;
    const confRules = this._config.confidenceRules;

    // Weighted average of component confidences
    const componentConfidence = clampScore(
      hardware.confidence * rules.hardwareWeight +
      software.confidence * rules.softwareWeight +
      usage.confidence * rules.usageWeight +
      workload.confidence * rules.workloadWeight,
    );

    // Evidence factor
    const evidenceFactor = evidenceCount >= confRules.minEvidenceCount ? 1.0 : evidenceCount / confRules.minEvidenceCount;

    return clampScore(componentConfidence * evidenceFactor);
  }

  calculateStability(history: { primaryProfile: string }[]): number {
    if (history.length === 0) return 0;
    const profileCounts: Record<string, number> = {};
    for (const entry of history) {
      profileCounts[entry.primaryProfile] = (profileCounts[entry.primaryProfile] ?? 0) + 1;
    }
    const dominantCount = Math.max(...Object.values(profileCounts));
    return clampScore(dominantCount / history.length);
  }

  calculateConsistency(scores: ProfileScore[]): number {
    if (scores.length === 0) return 0;
    const topScore = scores[0]?.score ?? 0;
    const secondScore = scores[1]?.score ?? 0;
    // High consistency when there's a clear winner
    return clampScore(topScore - secondScore + 0.3);
  }

  calculateDataFreshness(generatedAt: string): number {
    const ageHours = (Date.now() - new Date(generatedAt).getTime()) / (60 * 60 * 1000);
    // Freshness decreases with age: 100% at 0h, 50% at 24h, 25% at 48h
    return Math.max(0, 1 / (1 + ageHours / 12));
  }

  scoreProfile(
    hardware: HardwareSummary,
    software: SoftwareSummary,
    usage: UsageSummary,
    workload: WorkloadSummary,
    scores: ProfileScore[],
    evidenceCount: number,
    historicalStability: number,
  ): { confidence: number; stability: number; consistency: number; freshness: number } {
    const confidence = this.calculateConfidence(hardware, software, usage, workload, evidenceCount);
    const consistency = this.calculateConsistency(scores);
    const freshness = 1.0; // Fresh on creation

    return {
      confidence,
      stability: historicalStability,
      consistency,
      freshness,
    };
  }

  buildEvidence(
    scores: ProfileScore[],
    evidenceCount: number,
    sourceProviders: string[],
    confidence: number,
    stability: number,
    consistency: number,
    freshness: number,
    assumptions: string[],
  ): ProfileEvidence {
    return {
      relatedFacts: [],
      relatedKnowledge: [],
      relatedPredictions: [],
      contextEvidence: [],
      knowledgeEvidence: [],
      evidenceCount,
      sourceProviders,
      confidence: clampScore(confidence),
      historicalStability: clampScore(stability),
      profileConsistency: clampScore(consistency),
      dataFreshness: Math.max(0, freshness),
      assumptions,
    };
  }
}
