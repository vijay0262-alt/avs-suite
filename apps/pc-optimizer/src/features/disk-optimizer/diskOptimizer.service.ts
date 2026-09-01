/**
 * Disk Optimizer service — wraps backend disk_optimizer.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface OptimizerDriveInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  percent: number;
  driveType: string;
  isSSD: boolean;
  needsOptimization: boolean;
}

export interface DriveAnalysis {
  drive: string;
  driveType: string;
  fragmentationPercent: number;
  needsOptimization: boolean;
  analyzedAt: string;
  error?: string;
}

export interface OptimizeResult {
  started: boolean;
  drive: string;
  driveType: string;
  action: string;
  message: string;
  error?: string;
}

export interface OptimizeStatus {
  running: boolean;
  drive: string | null;
  progress: number;
  message: string;
  startedAt: string | null;
  completedAt: string | null;
  result: { success: boolean; message: string; action?: string } | null;
}

export const diskOptimizerService = {
  async listDrives(): Promise<{ drives: OptimizerDriveInfo[]; count: number; supported: boolean }> {
    return client().call(RPC_METHODS.DISK_OPTIMIZER_LIST_DRIVES);
  },

  async analyzeDrive(drive: string): Promise<DriveAnalysis> {
    return client().call(RPC_METHODS.DISK_OPTIMIZER_ANALYZE, { drive });
  },

  async optimizeDrive(drive: string, driveType?: string): Promise<OptimizeResult> {
    return client().call(RPC_METHODS.DISK_OPTIMIZER_OPTIMIZE, { drive, driveType });
  },

  async getStatus(): Promise<OptimizeStatus> {
    return client().call(RPC_METHODS.DISK_OPTIMIZER_STATUS);
  },
};
