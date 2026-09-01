/**
 * Anomaly Detection service — wraps backend anomaly.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface Anomaly {
  id: string;
  pid: number;
  name: string;
  exe: string;
  score: number;
  severity: 'critical' | 'high' | 'normal' | 'low';
  indicators: string[];
  cpuPercent: number;
  memoryMB: number;
  childCount: number;
  timestamp: string;
  dismissed: boolean;
}

export interface AnomalyConfig {
  enabled: boolean;
  sensitivity: 'low' | 'normal' | 'high';
  maxAnomalies: number;
  minScoreToReport: number;
  baselineDays: number;
}

export interface AnomalyStatus {
  enabled: boolean;
  sensitivity: string;
  config: AnomalyConfig;
  stats: {
    totalScans: number;
    totalAnomalies: number;
    totalDismissed: number;
    activeCount: number;
    bySeverity: Record<string, number>;
  };
  supported: boolean;
}

export interface AnomalyScanResult {
  success: boolean;
  anomalies: Anomaly[];
  count: number;
  scannedProcesses: number;
  supported: boolean;
  message?: string;
}

export interface AnomalyListResponse {
  anomalies: Anomaly[];
  count: number;
  totalActive: number;
}

export interface AnomalyConfigResult {
  success: boolean;
  config: AnomalyConfig;
  message: string;
}

export interface BaselineResponse {
  baseline: Record<string, unknown>;
  hasBaseline: boolean;
  baselineDays: number;
  supported: boolean;
}

export const anomalyService = {
  async scan(): Promise<AnomalyScanResult> {
    return client().call(RPC_METHODS.ANOMALY_SCAN);
  },

  async getStatus(): Promise<AnomalyStatus> {
    return client().call(RPC_METHODS.ANOMALY_STATUS);
  },

  async listAnomalies(params?: { limit?: number; dismissed?: boolean; minScore?: number }): Promise<AnomalyListResponse> {
    return client().call(RPC_METHODS.ANOMALY_LIST, params);
  },

  async dismiss(id: string): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.ANOMALY_DISMISS, { id });
  },

  async clearAll(): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.ANOMALY_CLEAR_ALL);
  },

  async getHistory(limit?: number): Promise<AnomalyListResponse> {
    return client().call(RPC_METHODS.ANOMALY_HISTORY, limit ? { limit } : undefined);
  },

  async configure(config: Partial<AnomalyConfig>): Promise<AnomalyConfigResult> {
    return client().call(RPC_METHODS.ANOMALY_CONFIGURE, config);
  },

  async getBaseline(): Promise<BaselineResponse> {
    return client().call(RPC_METHODS.ANOMALY_GET_BASELINE);
  },
};
