/**
 * AI Integration Hub service — wraps backend ai_integration.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface RecommendedCleaners {
  recommendedSelect: string[];
  recommendedDeselect: string[];
  hasData: boolean;
  confidence: 'low' | 'medium' | 'high';
  totalEvents?: number;
}

export interface WorkloadPriorityResult {
  success: boolean;
  message: string;
  workloadMode?: string;
  confidence?: number;
  priorityMode?: string | null;
  applied: boolean;
  boostedCount?: number;
  loweredCount?: number;
}

export interface AutoCareSuggestions {
  hasData: boolean;
  suggestedIdleThreshold: number;
  suggestedTasks: Record<string, boolean>;
  preferredCleanupTime?: string | null;
  averageFrequencyHours?: number | null;
  totalEvents?: number;
}

export interface IntegrationStatus {
  selfLearningConnected: boolean;
  selfLearningHasData?: boolean;
  workloadConnected: boolean;
  workloadMode?: string;
  autoCareConnected: boolean;
  anomalyConnected: boolean;
  anomalyActiveCount?: number;
  smartNotificationsConnected: boolean;
  activeIntegrations: number;
  totalIntegrations: number;
}

export const aiIntegrationService = {
  async getRecommendedCleaners(): Promise<RecommendedCleaners> {
    return client().call(RPC_METHODS.AI_INTEGRATION_GET_RECOMMENDED_CLEANERS);
  },

  async applyWorkloadPriority(): Promise<WorkloadPriorityResult> {
    return client().call(RPC_METHODS.AI_INTEGRATION_APPLY_WORKLOAD_PRIORITY);
  },

  async getAutoCareSuggestions(): Promise<AutoCareSuggestions> {
    return client().call(RPC_METHODS.AI_INTEGRATION_GET_AUTOCARE_SUGGESTIONS);
  },

  async getStatus(): Promise<IntegrationStatus> {
    return client().call(RPC_METHODS.AI_INTEGRATION_GET_STATUS);
  },
};
