/**
 * schedulerBackendService — RPC bridge for the Python scheduler backend.
 *
 * Wraps `rpc.raw()` calls to the backend scheduler module that manages
 * Windows Task Scheduler integration for automated maintenance tasks.
 *
 * Data flow:
 *   Backend (schtasks.exe) → schedulerBackendService → Maintenance UI
 */
import { rpc } from '../../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';

// ── Types ──────────────────────────────────────────────────────

export interface ScheduledTaskInfo {
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
  capturedAt: string;
}

export interface CreateTaskResult {
  created: boolean;
  taskName?: string;
  action?: string;
  schedule?: string;
  time?: string | null;
  timestamp?: string;
  error?: string;
  supported?: boolean;
}

// ── Service ────────────────────────────────────────────────────

export const schedulerBackendService = {
  async listTasks(): Promise<{ tasks: ScheduledTaskInfo[]; count: number; availableActions: string[]; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_LIST);
  },

  async createTask(params: {
    action: string;
    schedule?: string;
    time?: string;
    day?: string;
  }): Promise<CreateTaskResult> {
    return rpc.raw(RPC_METHODS.SCHEDULER_CREATE, params);
  },

  async updateTask(params: {
    action: string;
    schedule?: string;
    time?: string;
    day?: string;
  }): Promise<{ updated: boolean; error?: string; supported?: boolean }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_UPDATE, params);
  },

  async deleteTask(action: string): Promise<{ deleted: boolean; taskName?: string; timestamp?: string; error?: string; notFound?: boolean }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_DELETE, { action });
  },

  async runTaskNow(action: string): Promise<{ ran: boolean; taskName?: string; timestamp?: string; error?: string }> {
    return rpc.raw(RPC_METHODS.SCHEDULER_RUN_NOW, { action });
  },

  async getStatus(): Promise<SchedulerStatus> {
    return rpc.raw(RPC_METHODS.SCHEDULER_STATUS);
  },
};
