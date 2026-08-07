/**
 * Performance Monitor service
 */

import { RPC_METHODS } from '@avs/shared/rpc';
import type { PerformanceMetrics, GraphHistory, ProcessInfo, Alert } from './performance.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ProcessOptimizeResult {
  detected: Array<{
    pid: number;
    name: string;
    cpuPercent: number;
    memoryMB: number;
    diskMBps: number;
    reason: string;
    critical: boolean;
  }>;
  killed: Array<{ pid: number; name: string; terminated: boolean }>;
  errors: string[];
  totalDetected: number;
  totalKilled: number;
  thresholds: { cpuPercent: number; memoryPercent: number; diskMBps: number };
}

export interface IPerformanceService {
  getMetrics(): Promise<PerformanceMetrics>;
  getGraphHistory(): Promise<GraphHistory>;
  clearGraphHistory(): Promise<{ success: boolean }>;
  getTopProcesses(sortBy?: string, limit?: number, search?: string): Promise<{ processes: ProcessInfo[] }>;
  getAlerts(): Promise<{ alerts: Alert[] }>;
  optimizeMemory(): Promise<MemoryOptimizeResult>;
  optimizeProcesses(params?: { kill?: boolean; cpuThreshold?: number; memThresholdPercent?: number; diskThreshold?: number }): Promise<ProcessOptimizeResult>;
}

export interface MemoryOptimizeResult {
  status: string;
  memoryFreed: number;
  optimizationTimeMs: number;
  processesOptimized: number;
  errors: string[];
  healthImprovement: number;
  beforeMemory: { usedRam: number; memoryLoadPercent: number } | null;
  afterMemory: { usedRam: number; memoryLoadPercent: number } | null;
}

class PerformanceService implements IPerformanceService {
  async getMetrics(): Promise<PerformanceMetrics> {
    return await client().call('performance.monitor.getMetrics');
  }

  async getGraphHistory(): Promise<GraphHistory> {
    return await client().call('performance.monitor.getGraphHistory');
  }

  async clearGraphHistory(): Promise<{ success: boolean }> {
    return await client().call('performance.monitor.clearGraphHistory');
  }

  async getTopProcesses(sortBy?: string, limit?: number, search?: string): Promise<{ processes: ProcessInfo[] }> {
    return await client().call('performance.monitor.getTopProcesses', { sortBy, limit, search });
  }

  async getAlerts(): Promise<{ alerts: Alert[] }> {
    return await client().call('performance.monitor.getAlerts');
  }

  async optimizeMemory(): Promise<MemoryOptimizeResult> {
    return await client().call('performance.memory.optimize');
  }

  async optimizeProcesses(params?: { kill?: boolean; cpuThreshold?: number; memThresholdPercent?: number; diskThreshold?: number }): Promise<ProcessOptimizeResult> {
    return await client().call(RPC_METHODS.PERFORMANCE_OPTIMIZE_PROCESSES, params ?? {});
  }
}

export const performanceService = new PerformanceService();
