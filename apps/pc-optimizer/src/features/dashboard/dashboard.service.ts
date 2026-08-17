/**
 * Dashboard service — RPC wrapper for system health and optimization.
 */
import { RPC_METHODS } from '@avs/shared/rpc';
import { rpcCache } from '../../services/rpcCache';
import type {
  DashboardMetrics,
  LiveMetrics,
  HealthScore,
  OptimizePreview,
  HardwareSensors,
} from './dashboard.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface DashboardService {
  getMetrics(): Promise<DashboardMetrics>;
  getLiveMetrics(): Promise<LiveMetrics>;
  getHealthScore(): Promise<HealthScore>;
  /**
   * Invalidate the backend's cached metrics snapshot. Must be called
   * after any optimization/cleaning action, before the next getMetrics()
   * call, so the Dashboard reflects real post-optimization state instead
   * of a stale cached snapshot (backend TTL cache is 15 seconds).
   */
  refreshCache(): Promise<{ refreshed: boolean }>;
  getOptimizePreview(): Promise<OptimizePreview>;
  getHardwareSensors(): Promise<HardwareSensors>;
  enableSmartScreen(): Promise<{ enabled: boolean; message: string }>;
  enableDefender(): Promise<{ enabled: boolean; message: string }>;
  enableFirewall(): Promise<{ enabled: boolean; message: string }>;
}

export const dashboardService: DashboardService = {
  getMetrics: () => rpcCache.get('dashboard.metrics', () => client().call<DashboardMetrics>(RPC_METHODS.DASHBOARD_METRICS), 15_000),
  getLiveMetrics: () => client().call(RPC_METHODS.DASHBOARD_LIVE),
  getHealthScore: () => rpcCache.get('dashboard.health', () => client().call<HealthScore>(RPC_METHODS.DASHBOARD_HEALTH), 15_000),
  refreshCache: () => { rpcCache.invalidate('dashboard.metrics'); rpcCache.invalidate('dashboard.health'); return client().call(RPC_METHODS.DASHBOARD_REFRESH_CACHE); },
  getOptimizePreview: () => client().call(RPC_METHODS.DASHBOARD_OPTIMIZE_PREVIEW),
  getHardwareSensors: () => rpcCache.get('dashboard.hardware', () => client().call<HardwareSensors>(RPC_METHODS.HARDWARE_SENSORS), 30_000),
  enableSmartScreen: () => client().call(RPC_METHODS.SECURITY_ENABLE_SMARTSCREEN),
  enableDefender: () => client().call(RPC_METHODS.SECURITY_ENABLE_DEFENDER),
  enableFirewall: () => client().call(RPC_METHODS.SECURITY_ENABLE_FIREWALL),
};
