/**
 * Self-Learning Cleanup service — wraps backend self_learning.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface CleanupEvent {
  timestamp: string;
  bytesCleaned: number;
  itemsCleaned: number;
  categories: string[];
  duration: number;
}

export interface PreferredTime {
  hour: number;
  label: string;
  count: number;
}

export interface PreferredDay {
  day: string;
  count: number;
}

export interface CleanupPatterns {
  preferredTimes: PreferredTime[];
  preferredDays: PreferredDay[];
  averageFrequencyHours: number | null;
  averageBytesCleaned: number;
  averageItemsCleaned: number;
  totalEvents: number;
}

export interface CategoryPreference {
  selectedCount: number;
  deselectedCount: number;
  preferenceScore: number;
  recommendation: 'select' | 'deselect' | 'neutral';
  totalObservations: number;
}

export interface ExclusionPattern {
  path: string;
  count: number;
}

export interface ExclusionPatterns {
  frequentExclusions: ExclusionPattern[];
  totalExclusions: number;
  uniquePaths: number;
}

export interface SelfLearningHabits {
  cleanupPatterns: CleanupPatterns;
  categoryPreferences: Record<string, CategoryPreference>;
  exclusionPatterns: ExclusionPatterns;
  stats: {
    totalCleanups: number;
    totalBytesCleaned: number;
    totalItemsCleaned: number;
  };
  learningEnabled: boolean;
}

export interface RecommendationAction {
  label: string;
  rpcMethod: string;
  params: Record<string, unknown>;
}

export interface Recommendation {
  id: string;
  type: 'schedule' | 'category' | 'exclusion' | 'frequency';
  priority: 'critical' | 'high' | 'normal' | 'low';
  title: string;
  message: string;
  action: RecommendationAction;
}

export interface RecommendationsResponse {
  recommendations: Recommendation[];
  count: number;
  autoApply: boolean;
}

export interface SelfLearningConfig {
  enabled: boolean;
  autoApplyRecommendations: boolean;
  learningRate: number;
  minObservations: number;
}

export interface SelfLearningStatus {
  enabled: boolean;
  autoApplyRecommendations: boolean;
  config: SelfLearningConfig;
  stats: {
    totalCleanups: number;
    totalBytesCleaned: number;
    totalItemsCleaned: number;
    totalEvents: number;
    totalCategoriesTracked: number;
    totalExclusions: number;
  };
  hasEnoughData: boolean;
  supported: boolean;
}

export const selfLearningService = {
  async recordCleanup(params: {
    bytesCleaned: number;
    itemsCleaned: number;
    categories: string[];
    duration?: number;
  }): Promise<{ success: boolean; message: string; totalEvents: number }> {
    return client().call(RPC_METHODS.SELF_LEARNING_RECORD_CLEANUP, params);
  },

  async recordSelection(category: string, selected: boolean): Promise<{
    success: boolean;
    message: string;
    category: string;
    selectedCount: number;
    deselectedCount: number;
  }> {
    return client().call(RPC_METHODS.SELF_LEARNING_RECORD_SELECTION, { category, selected });
  },

  async recordExclusion(path: string, reason?: string): Promise<{
    success: boolean;
    message: string;
    totalExclusions: number;
  }> {
    return client().call(RPC_METHODS.SELF_LEARNING_RECORD_EXCLUSION, { path, reason });
  },

  async getHabits(): Promise<SelfLearningHabits> {
    return client().call(RPC_METHODS.SELF_LEARNING_GET_HABITS);
  },

  async getRecommendations(): Promise<RecommendationsResponse> {
    return client().call(RPC_METHODS.SELF_LEARNING_GET_RECOMMENDATIONS);
  },

  async getStatus(): Promise<SelfLearningStatus> {
    return client().call(RPC_METHODS.SELF_LEARNING_STATUS);
  },

  async reset(): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.SELF_LEARNING_RESET);
  },

  async configure(config: Partial<SelfLearningConfig>): Promise<{
    success: boolean;
    config: SelfLearningConfig;
    message: string;
  }> {
    return client().call(RPC_METHODS.SELF_LEARNING_CONFIGURE, config);
  },
};
