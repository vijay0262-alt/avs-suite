/**
 * App Freezer service — wraps backend app_freezer.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ProcessCandidate {
  pid: number;
  name: string;
  exe: string;
  memoryMB: number;
  cpuPercent: number;
  createTime: number;
}

export interface FrozenProcess {
  pid: number;
  name: string;
  exe: string;
  memoryMBAtFreeze: number;
  frozenAt: string;
  currentMemoryMB?: number;
}

export interface AppFreezerConfig {
  enabled: boolean;
  autoFreeze: boolean;
  idleThresholdSeconds: number;
  minMemoryMB: number;
  maxFrozen: number;
  protectedProcesses: string[];
}

export interface AppFreezerStatus {
  enabled: boolean;
  autoFreeze: boolean;
  frozenCount: number;
  totalFrozenMemoryMB: number;
  maxFrozen: number;
  config: AppFreezerConfig;
  stats: {
    totalFrozen: number;
    totalUnfrozen: number;
    totalBytesFreed: number;
  };
  supported: boolean;
}

export interface CandidatesResponse {
  candidates: ProcessCandidate[];
  count: number;
  currentFrozen: number;
  remainingSlots: number;
  supported: boolean;
  enabled: boolean;
}

export interface FrozenListResponse {
  frozen: FrozenProcess[];
  count: number;
  supported: boolean;
}

export interface FreezeResult {
  success: boolean;
  message: string;
  process?: FrozenProcess;
  totalFrozen: number;
}

export interface FreezeAllResult {
  success: boolean;
  frozenCount: number;
  failedCount: number;
  totalMemoryMB: number;
  totalFrozen: number;
  message: string;
}

export interface ConfigResult {
  success: boolean;
  config: AppFreezerConfig;
  message: string;
}

export const appFreezerService = {
  async listCandidates(): Promise<CandidatesResponse> {
    return client().call(RPC_METHODS.APP_FREEZER_LIST_CANDIDATES);
  },

  async listFrozen(): Promise<FrozenListResponse> {
    return client().call(RPC_METHODS.APP_FREEZER_LIST_FROZEN);
  },

  async freeze(pid: number): Promise<FreezeResult> {
    return client().call(RPC_METHODS.APP_FREEZER_FREEZE, { pid });
  },

  async unfreeze(pid: number): Promise<FreezeResult> {
    return client().call(RPC_METHODS.APP_FREEZER_UNFREEZE, { pid });
  },

  async freezeAll(): Promise<FreezeAllResult> {
    return client().call(RPC_METHODS.APP_FREEZER_FREEZE_ALL);
  },

  async unfreezeAll(): Promise<FreezeAllResult> {
    return client().call(RPC_METHODS.APP_FREEZER_UNFREEZE_ALL);
  },

  async getStatus(): Promise<AppFreezerStatus> {
    return client().call(RPC_METHODS.APP_FREEZER_STATUS);
  },

  async configure(config: Partial<AppFreezerConfig>): Promise<ConfigResult> {
    return client().call(RPC_METHODS.APP_FREEZER_CONFIGURE, config);
  },
};
