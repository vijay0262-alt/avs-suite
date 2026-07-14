/**
 * Renderer-side RPC helper. Wraps `window.avs.rpc` with typed method
 * names from `@avs/shared/rpc`.
 *
 * In non-Electron environments (e.g. Vitest, Storybook) it falls back to
 * a stub that rejects — callers must swap in a test double.
 */
import { RPC_METHODS, type RpcMethod } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export const rpc = {
  ping: () => client().call<{ pong: true }>(RPC_METHODS.SYSTEM_PING),
  systemInfo: () => client().call<Record<string, unknown>>(RPC_METHODS.SYSTEM_INFO),
  healthScore: () =>
    client().call<{ score: number; capturedAt: string }>(RPC_METHODS.SYSTEM_HEALTH_SCORE),
  metrics: {
    cpu: () => client().call<{ usage: number }>(RPC_METHODS.METRICS_CPU),
    memory: () =>
      client().call<{ total: number; used: number; usage: number }>(RPC_METHODS.METRICS_MEMORY),
    disk: () =>
      client().call<Array<{ mount: string; total: number; used: number; usage: number }>>(
        RPC_METHODS.METRICS_DISK,
      ),
  },
  raw<T>(method: RpcMethod, params?: unknown): Promise<T> {
    return client().call<T>(method, params);
  },
};
