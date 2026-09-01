/**
 * Process Priority service — wraps backend process_priority.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export type PriorityMode = 'balanced' | 'game' | 'work' | 'creative' | 'battery';
export type PriorityLevel = 'idle' | 'below_normal' | 'normal' | 'above_normal' | 'high' | 'realtime';

export interface ModeInfo {
  id: PriorityMode;
  label: string;
  description: string;
}

export interface ProcessPriorityStatus {
  enabled: boolean;
  currentMode: PriorityMode;
  modeLabel: string;
  modeDescription: string;
  autoDetect: boolean;
  applyAffinity: boolean;
  availableModes: ModeInfo[];
  stats: {
    totalAdjustments: number;
    totalBoosted: number;
    totalLowered: number;
    totalResets: number;
  };
  adjustedCount: number;
  supported: boolean;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryMB: number;
  priority: number | null;
  priorityLabel: string;
  classification: 'protected' | 'boost' | 'lower' | 'neutral';
}

export interface ListProcessesResponse {
  processes: ProcessInfo[];
  count: number;
  totalCount: number;
  currentMode: PriorityMode;
  supported: boolean;
}

export interface ApplyModeResult {
  success: boolean;
  boostedCount: number;
  loweredCount: number;
  failedCount: number;
  mode: PriorityMode;
  message: string;
}

export interface PriorityResult {
  success: boolean;
  message: string;
  pid?: number;
  name?: string;
  priority?: string;
}

export interface ResetResult {
  success: boolean;
  resetCount: number;
  failedCount: number;
  message: string;
}

export interface ConfigResult {
  success: boolean;
  config: Record<string, unknown>;
  message: string;
}

export const processPriorityService = {
  async getStatus(): Promise<ProcessPriorityStatus> {
    return client().call(RPC_METHODS.PROC_PRIORITY_GET_STATUS);
  },

  async listProcesses(params?: { limit?: number; sortBy?: string }): Promise<ListProcessesResponse> {
    return client().call(RPC_METHODS.PROC_PRIORITY_LIST_PROCESSES, params);
  },

  async setMode(mode: PriorityMode): Promise<{ success: boolean; mode: string; label: string; description: string; message: string }> {
    return client().call(RPC_METHODS.PROC_PRIORITY_SET_MODE, { mode });
  },

  async applyMode(): Promise<ApplyModeResult> {
    return client().call(RPC_METHODS.PROC_PRIORITY_APPLY_MODE);
  },

  async setPriority(pid: number, priority: PriorityLevel): Promise<PriorityResult> {
    return client().call(RPC_METHODS.PROC_PRIORITY_SET_PRIORITY, { pid, priority });
  },

  async setAffinity(pid: number, affinity: number): Promise<PriorityResult> {
    return client().call(RPC_METHODS.PROC_PRIORITY_SET_AFFINITY, { pid, affinity });
  },

  async resetAll(): Promise<ResetResult> {
    return client().call(RPC_METHODS.PROC_PRIORITY_RESET_ALL);
  },

  async configure(config: Record<string, unknown>): Promise<ConfigResult> {
    return client().call(RPC_METHODS.PROC_PRIORITY_CONFIGURE, config);
  },
};
