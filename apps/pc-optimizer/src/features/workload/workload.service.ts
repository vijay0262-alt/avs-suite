/**
 * Workload Detection service — wraps backend workload.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface MatchedProcess {
  name: string;
  cpu: number;
  memoryMB: number;
}

export interface OptimizationProfile {
  label: string;
  description: string;
  actions: string[];
  icon: string;
  color: string;
}

export interface WorkloadConfig {
  enabled: boolean;
  autoOptimize: boolean;
  manualOverride: string | null;
  checkIntervalSeconds: number;
  minConfidence: number;
}

export interface WorkloadDetectResult {
  mode: string;
  confidence: number;
  matchedProcesses: MatchedProcess[];
  categoryScores: Record<string, number>;
  profile: OptimizationProfile;
  detectedAt: string;
  supported: boolean;
  manualOverride: boolean;
}

export interface WorkloadStatus {
  currentMode: string;
  currentConfidence: number;
  detectedAt: string | null;
  detectedProcesses: MatchedProcess[];
  profile: OptimizationProfile;
  config: WorkloadConfig;
  supported: boolean;
}

export interface WorkloadHistoryEntry {
  timestamp: string;
  mode: string;
  confidence: number;
  matchedCount: number;
  manualOverride: boolean;
}

export interface WorkloadHistoryResponse {
  entries: WorkloadHistoryEntry[];
  count: number;
  supported: boolean;
}

export interface WorkloadConfigResult {
  success: boolean;
  config: WorkloadConfig;
  message: string;
}

export interface WorkloadSetModeResult {
  success: boolean;
  message: string;
  config?: WorkloadConfig;
  profile?: OptimizationProfile;
}

export const workloadService = {
  async detect(): Promise<WorkloadDetectResult> {
    return client().call(RPC_METHODS.WORKLOAD_DETECT);
  },

  async getStatus(): Promise<WorkloadStatus> {
    return client().call(RPC_METHODS.WORKLOAD_STATUS);
  },

  async configure(config: Partial<WorkloadConfig>): Promise<WorkloadConfigResult> {
    return client().call(RPC_METHODS.WORKLOAD_CONFIGURE, config);
  },

  async setMode(mode: string | null): Promise<WorkloadSetModeResult> {
    return client().call(RPC_METHODS.WORKLOAD_SET_MODE, { mode });
  },

  async getHistory(limit?: number): Promise<WorkloadHistoryResponse> {
    return client().call(RPC_METHODS.WORKLOAD_HISTORY, limit ? { limit } : undefined);
  },
};
