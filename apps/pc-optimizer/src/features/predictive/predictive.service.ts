/**
 * Predictive Maintenance service — wraps backend predictive.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface PredictiveConfig {
  enabled: boolean;
  thresholdGB: number;
  sampleIntervalMinutes: number;
  maxSamples: number;
  notificationThresholdHours: number;
}

export interface Prediction {
  predictedDate: string | null;
  daysUntilCleanup: number | null;
  confidence: number;
  currentJunkBytes: number;
  accumulationRateBytesPerDay: number;
  recommendedAction: string;
}

export interface PredictiveStatus {
  prediction: Prediction;
  config: PredictiveConfig;
  sampleCount: number;
  lastSampleAt: string | null;
  supported: boolean;
}

export interface PredictiveSample {
  timestamp: string;
  junkBytes: number;
  tempBytes: number;
  cacheBytes: number;
  totalBytes: number;
}

export interface PredictiveHistoryEntry {
  timestamp: string;
  predictedDate: string | null;
  daysUntilCleanup: number | null;
  confidence: number;
  currentJunkBytes: number;
  accumulationRateBytesPerDay: number;
  recommendedAction: string;
}

export interface PredictiveHistoryResponse {
  samples: PredictiveSample[];
  predictions: PredictiveHistoryEntry[];
  sampleCount: number;
  predictionCount: number;
  supported: boolean;
}

export interface PredictiveSampleResult {
  success: boolean;
  sample: PredictiveSample;
  prediction: Prediction;
  sampleCount: number;
}

export interface PredictiveConfigResult {
  success: boolean;
  config: PredictiveConfig;
  message: string;
}

export const predictiveService = {
  async sample(): Promise<PredictiveSampleResult> {
    return client().call(RPC_METHODS.PREDICTIVE_SAMPLE);
  },

  async getStatus(): Promise<PredictiveStatus> {
    return client().call(RPC_METHODS.PREDICTIVE_STATUS);
  },

  async getHistory(limit?: number): Promise<PredictiveHistoryResponse> {
    return client().call(RPC_METHODS.PREDICTIVE_HISTORY, limit ? { limit } : undefined);
  },

  async configure(config: Partial<PredictiveConfig>): Promise<PredictiveConfigResult> {
    return client().call(RPC_METHODS.PREDICTIVE_CONFIGURE, config);
  },

  async clearData(): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.PREDICTIVE_CLEAR_DATA);
  },
};
