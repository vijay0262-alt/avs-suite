/**
 * RpcProcessProvider — ProcessProvider implementation backed by the
 * real backend `process_intelligence.scan` RPC.
 *
 * SC-8C15 Phase 1: replaces MockProcessProvider with a production
 * provider that enumerates real system processes via the backend.
 *
 * This provider is READ-ONLY. It does not terminate, modify, or
 * start processes. It only collects process data for the AI engine.
 */
import type { ProcessEntry } from './types';
import type { ProcessProvider } from './ProcessScanner';
import { RPC_METHODS } from '@avs/shared/rpc';
import { rpc } from '../../services/rpc';

/** Backend response shape for process_intelligence.scan. */
interface ProcessScanResponse {
  ok: boolean;
  entries?: ProcessEntry[];
  count?: number;
  scanDurationMs?: number;
  error?: string;
}

export class RpcProcessProvider implements ProcessProvider {
  readonly id = 'rpc-process-provider';
  readonly source = 'backend';

  async initialize(): Promise<void> {
    // No initialization needed — the backend is stateless.
  }

  dispose(): void {
    // No resources to release.
  }

  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.avs?.rpc;
  }

  async scan(): Promise<ProcessEntry[]> {
    const response = await rpc.raw<ProcessScanResponse>(
      RPC_METHODS.PROCESS_INTELLIGENCE_SCAN,
    );

    if (!response || typeof response !== 'object') {
      throw new Error('Invalid response from process_intelligence.scan');
    }

    if (!response.ok) {
      const msg = response.error ?? 'Unknown backend error';
      throw new Error(msg);
    }

    const entries = response.entries;
    if (!Array.isArray(entries)) {
      throw new Error('Malformed response: entries is not an array');
    }

    // Validate each entry has the required shape. Skip invalid entries
    // rather than failing the entire scan — partial results are better
    // than no results.
    const valid: ProcessEntry[] = [];
    for (const entry of entries) {
      if (this._isValidEntry(entry)) {
        valid.push(entry);
      }
    }

    return valid;
  }

  /** Validate that an entry has the required info and sensors fields. */
  private _isValidEntry(entry: unknown): entry is ProcessEntry {
    if (!entry || typeof entry !== 'object') return false;
    const e = entry as Record<string, unknown>;
    if (!e.info || typeof e.info !== 'object') return false;
    if (!e.sensors || typeof e.sensors !== 'object') return false;
    const info = e.info as Record<string, unknown>;
    const sensors = e.sensors as Record<string, unknown>;
    // Check required info fields
    if (typeof info.pid !== 'number') return false;
    if (typeof info.name !== 'string') return false;
    // Check required sensor fields
    if (typeof sensors.cpuUsagePercent !== 'number') return false;
    if (typeof sensors.memoryMB !== 'number') return false;
    return true;
  }
}
