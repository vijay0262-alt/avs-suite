/**
 * Network Optimizer service — wraps backend network_opt.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface NetworkSetting {
  name: string;
  description: string;
  category: string;
  currentValue: number | null;
  recommendedValue: number;
  defaultValue: number;
  needsOptimization: boolean;
  regPath: string;
}

export interface NetworkAdapter {
  name: string;
  mtu: number;
  speed: number;
  isUp: boolean;
}

export interface AnalyzeResult {
  supported: boolean;
  currentSettings: NetworkSetting[];
  recommendations: NetworkSetting[];
  recommendationCount: number;
  adapters: NetworkAdapter[];
  dnsServers: string[];
  optimized: boolean;
  analyzedAt: string;
}

export interface OptimizeResult {
  success: boolean;
  message: string;
  applied: { name: string; oldValue: number | null; newValue: number; description: string }[];
  failed: { name: string; error: string }[];
  appliedCount: number;
  failedCount: number;
  backupFile: string | null;
  note: string;
}

export interface RevertResult {
  success: boolean;
  message: string;
  reverted: { name: string; description: string }[];
  failed: { name: string; error: string }[];
  revertedCount: number;
  failedCount: number;
  note: string;
}

export interface OptimizeStatus {
  optimized: boolean;
  appliedAt: string | null;
  revertedAt: string | null;
  appliedSettings: { name: string; oldValue: number | null; newValue: number; description: string }[];
  supported: boolean;
}

export const networkOptimizerService = {
  async analyze(): Promise<AnalyzeResult> {
    return client().call(RPC_METHODS.NETWORK_OPT_ANALYZE);
  },

  async optimize(): Promise<OptimizeResult> {
    return client().call(RPC_METHODS.NETWORK_OPT_OPTIMIZE);
  },

  async revert(): Promise<RevertResult> {
    return client().call(RPC_METHODS.NETWORK_OPT_REVERT);
  },

  async getStatus(): Promise<OptimizeStatus> {
    return client().call(RPC_METHODS.NETWORK_OPT_STATUS);
  },
};
