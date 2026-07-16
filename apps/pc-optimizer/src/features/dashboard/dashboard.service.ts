/**
 * Dashboard service — RPC wrapper for system health and optimization.
 */
import { RPC_METHODS } from '@avs/shared/rpc';
import type {
  DashboardMetrics,
  HealthScore,
  OptimizePreview,
  OptimizeExecuteResponse,
} from './dashboard.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface DashboardService {
  getMetrics(): Promise<DashboardMetrics>;
  getHealthScore(): Promise<HealthScore>;
  getOptimizePreview(): Promise<OptimizePreview>;
  executeOptimize(): Promise<OptimizeExecuteResponse>;
}

export const dashboardService: DashboardService = {
  getMetrics: () => client().call(RPC_METHODS.DASHBOARD_METRICS),
  getHealthScore: () => client().call(RPC_METHODS.DASHBOARD_HEALTH),
  getOptimizePreview: () => client().call(RPC_METHODS.DASHBOARD_OPTIMIZE_PREVIEW),
  executeOptimize: () => client().call(RPC_METHODS.DASHBOARD_OPTIMIZE_EXECUTE),
};
