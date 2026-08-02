/**
 * realtimeBackendService — RPC bridge for the Python realtime_protection backend.
 *
 * Wraps `rpc.raw()` calls to the backend real-time protection module.
 * The frontend RealTimeProtectionEngine uses this to start/stop backend
 * monitoring and fetch real events and alerts.
 *
 * Data flow:
 *   Backend (psutil process polling) → realtimeBackendService → RealTimeProtectionEngine
 *   → ProtectionRuleEngine → ProtectionNotificationCenter → UI
 */
import { rpc } from '../../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';

// ── Types ──────────────────────────────────────────────────────

export interface RealtimeStatus {
  running: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  eventsCollected: number;
  alertsGenerated: number;
  monitoredProcesses: number;
  capturedAt: string;
}

export interface RealtimeEvent {
  type: string;
  pid?: number;
  name?: string;
  exe?: string;
  createTime?: number;
  timestamp: string;
}

export interface RealtimeAlert {
  type: string;
  severity: string;
  pid: number;
  name: string;
  exe: string;
  reason: string;
  timestamp: string;
}

// ── Service ────────────────────────────────────────────────────

export const realtimeBackendService = {
  async getStatus(): Promise<RealtimeStatus> {
    return rpc.raw<RealtimeStatus>(RPC_METHODS.REALTIME_PROTECTION_STATUS);
  },

  async start(): Promise<{ started: boolean; startedAt?: string; reason?: string }> {
    return rpc.raw(RPC_METHODS.REALTIME_PROTECTION_START);
  },

  async stop(): Promise<{ stopped: boolean; stoppedAt?: string; reason?: string }> {
    return rpc.raw(RPC_METHODS.REALTIME_PROTECTION_STOP);
  },

  async getEvents(limit?: number, type?: string): Promise<{ events: RealtimeEvent[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.REALTIME_PROTECTION_EVENTS, { limit, type });
  },

  async getAlerts(limit?: number, severity?: string): Promise<{ alerts: RealtimeAlert[]; count: number; capturedAt: string }> {
    return rpc.raw(RPC_METHODS.REALTIME_PROTECTION_ALERTS, { limit, severity });
  },
};
