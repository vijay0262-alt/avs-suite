/**
 * Scheduled Cleanup + Junk Monitor service.
 * Wraps the backend scheduler.* and junk_monitor.* RPC methods.
 */
import { rpc } from '../../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';

export interface ScheduledTask {
  taskName: string;
  action: string;
  description: string;
  nextRun: string | null;
  status: string;
}

export interface SchedulerStatus {
  available: boolean;
  serviceRunning: boolean;
  supported: boolean;
  availableActions: string[];
}

export interface JunkCategory {
  id: string;
  name: string;
  files: number;
  bytes: number;
  mb: number;
}

export interface JunkMonitorStatus {
  total_bytes: number;
  total_files: number;
  total_mb: number;
  total_gb: number;
  categories: JunkCategory[];
  scanned_at: string | null;
  threshold_bytes: number;
  threshold_exceeded: boolean;
}

export const scheduledCleanupService = {
  async listTasks(): Promise<{ tasks: ScheduledTask[]; count: number }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_LIST);
  },

  async getStatus(): Promise<SchedulerStatus> {
    return rpc.raw(RPC_METHODS.SCHEDULER_STATUS);
  },

  async createTask(params: {
    action: string;
    schedule: string;
    time?: string;
    day?: string;
  }): Promise<{ created: boolean; error?: string }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_CREATE, params);
  },

  async deleteTask(action: string): Promise<{ deleted: boolean; error?: string }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_DELETE, { action });
  },

  async runNow(action: string): Promise<{ ran: boolean; error?: string }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_RUN_NOW, { action });
  },

  async configureFromSettings(): Promise<{
    configured: boolean;
    enabled: boolean;
    error?: string;
  }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_CONFIGURE);
  },

  async getJunkStatus(): Promise<JunkMonitorStatus> {
    return rpc.raw(RPC_METHODS.JUNK_MONITOR_STATUS);
  },

  async scanJunkNow(): Promise<JunkMonitorStatus> {
    return rpc.raw(RPC_METHODS.JUNK_MONITOR_SCAN);
  },
};
