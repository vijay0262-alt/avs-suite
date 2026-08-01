/**
 * OptimizationLearning — tracks user preferences locally.
 *
 * Learns from accepted/rejected optimizations to improve future plans.
 * Never uploads personal usage data. All data stays local.
 */
import type {
  OptimizationLearningData,
  AcceptanceRecord,
  RejectionRecord,
  OptimizationStyle,
  OptimizationCategory,
  OptimizationAction,
  OptimizationBenefits,
} from './types';

export class OptimizationLearning {
  private data: OptimizationLearningData;

  constructor() {
    this.data = {
      acceptedOptimizations: [],
      rejectedRecommendations: [],
      preferredStyle: 'balanced',
      typicalUsageTime: 'unknown',
      totalOptimizations: 0,
      averageHealthScoreGain: 0,
      mostFrequentCategories: [],
      lastOptimizedAt: null,
    };
  }

  recordAcceptance(action: OptimizationAction, benefitRealized?: Partial<OptimizationBenefits>): void {
    const record: AcceptanceRecord = {
      actionType: action.type,
      category: action.category,
      timestamp: Date.now(),
      benefitRealized: benefitRealized ?? {},
    };
    this.data.acceptedOptimizations.unshift(record);
    if (this.data.acceptedOptimizations.length > 200) {
      this.data.acceptedOptimizations = this.data.acceptedOptimizations.slice(0, 200);
    }
    this.data.totalOptimizations++;
    this.data.lastOptimizedAt = Date.now();
    this.updateFrequentCategories();
    this.inferPreferredStyle();
  }

  recordRejection(action: OptimizationAction, reason?: string): void {
    const record: RejectionRecord = {
      actionType: action.type,
      category: action.category,
      timestamp: Date.now(),
      reason: reason ?? null,
    };
    this.data.rejectedRecommendations.unshift(record);
    if (this.data.rejectedRecommendations.length > 200) {
      this.data.rejectedRecommendations = this.data.rejectedRecommendations.slice(0, 200);
    }
    this.inferPreferredStyle();
  }

  getLearningData(): OptimizationLearningData {
    return { ...this.data };
  }

  getPreferredStyle(): OptimizationStyle {
    return this.data.preferredStyle;
  }

  getAcceptanceRate(category: OptimizationCategory): number {
    const accepted = this.data.acceptedOptimizations.filter((r) => r.category === category).length;
    const rejected = this.data.rejectedRecommendations.filter((r) => r.category === category).length;
    const total = accepted + rejected;
    return total > 0 ? accepted / total : 0.5;
  }

  getRejectionRate(category: OptimizationCategory): number {
    return 1 - this.getAcceptanceRate(category);
  }

  isCategoryFrequentlyRejected(category: OptimizationCategory): boolean {
    return this.getRejectionRate(category) > 0.7 && this.data.rejectedRecommendations.length >= 5;
  }

  isCategoryFrequentlyAccepted(category: OptimizationCategory): boolean {
    return this.getAcceptanceRate(category) > 0.8 && this.data.acceptedOptimizations.length >= 5;
  }

  setAverageHealthScoreGain(gain: number): void {
    this.data.averageHealthScoreGain = gain;
  }

  setTypicalUsageTime(time: string): void {
    this.data.typicalUsageTime = time;
  }

  clear(): void {
    this.data = {
      acceptedOptimizations: [],
      rejectedRecommendations: [],
      preferredStyle: 'balanced',
      typicalUsageTime: 'unknown',
      totalOptimizations: 0,
      averageHealthScoreGain: 0,
      mostFrequentCategories: [],
      lastOptimizedAt: null,
    };
  }

  private updateFrequentCategories(): void {
    const counts = new Map<OptimizationCategory, number>();
    for (const record of this.data.acceptedOptimizations) {
      counts.set(record.category, (counts.get(record.category) ?? 0) + 1);
    }
    this.data.mostFrequentCategories = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);
  }

  private inferPreferredStyle(): void {
    const total = this.data.acceptedOptimizations.length + this.data.rejectedRecommendations.length;
    if (total < 5) return;

    const acceptanceRate = this.data.acceptedOptimizations.length / total;

    if (acceptanceRate > 0.85) {
      this.data.preferredStyle = 'aggressive';
    } else if (acceptanceRate > 0.6) {
      this.data.preferredStyle = 'balanced';
    } else if (acceptanceRate > 0.3) {
      this.data.preferredStyle = 'conservative';
    } else {
      this.data.preferredStyle = 'minimal';
    }
  }
}
