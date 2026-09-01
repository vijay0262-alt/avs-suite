/**
 * AI Auto-Care service — wraps backend auto_care.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface AutoCareTasks {
  junkClean: boolean;
  memoryOptimize: boolean;
  tempClean: boolean;
}

export interface AutoCareConfig {
  enabled: boolean;
  idleThresholdSeconds: number;
  checkIntervalSeconds: number;
  tasks: AutoCareTasks;
  minCpuUsage: number;
}

export interface AutoCareStatus {
  config: AutoCareConfig;
  running: boolean;
  currentIdleSeconds: number;
  lastRunAt: string | null;
  nextCheckAt: string | null;
  supported: boolean;
}

export interface AutoCareTaskResult {
  task: string;
  success: boolean;
  details: string;
  itemsCleaned?: number;
  bytesFreed?: number;
}

export interface AutoCareLogEntry {
  id: string;
  timestamp: string;
  trigger: string;
  tasks: AutoCareTaskResult[];
  totalBytesFreed: number;
  totalItemsCleaned: number;
  success: boolean;
  idleSeconds: number;
}

export interface AutoCareRunResult {
  success: boolean;
  tasks: AutoCareTaskResult[];
  totalBytesFreed: number;
  totalItemsCleaned: number;
  logEntry: AutoCareLogEntry;
}

export interface AutoCareLogResponse {
  entries: AutoCareLogEntry[];
  count: number;
  supported: boolean;
}

export interface AutoCareConfigResult {
  success: boolean;
  config: AutoCareConfig;
  running: boolean;
  message: string;
}

export const autoCareService = {
  async getStatus(): Promise<AutoCareStatus> {
    return client().call(RPC_METHODS.AUTO_CARE_STATUS);
  },

  async configure(config: Partial<AutoCareConfig>): Promise<AutoCareConfigResult> {
    return client().call(RPC_METHODS.AUTO_CARE_CONFIGURE, config);
  },

  async getActivityLog(limit?: number): Promise<AutoCareLogResponse> {
    return client().call(RPC_METHODS.AUTO_CARE_GET_LOG, limit ? { limit } : undefined);
  },

  async runNow(): Promise<AutoCareRunResult> {
    return client().call(RPC_METHODS.AUTO_CARE_RUN_NOW);
  },

  async clearLog(): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.AUTO_CARE_CLEAR_LOG);
  },
};
