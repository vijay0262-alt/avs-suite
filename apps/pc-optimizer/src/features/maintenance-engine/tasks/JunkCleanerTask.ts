/**
 * Junk Cleaner Task — runs the full junk cleaner scan + clean cycle.
 *
 * Uses the existing junkCleanerService RPC to:
 *   1. Start a scan (all cleaners)
 *   2. Wait for scan completion
 *   3. Execute clean on all scanned items
 *   4. Wait for clean completion
 *   5. Collect results (files cleaned, bytes recovered)
 */
import { BaseMaintenanceTask, isRpcAvailable, getRpcBridge } from './BaseMaintenanceTask';
import type { TaskResult, ValidationResult } from '../types';
import { RPC_METHODS } from '@avs/shared/rpc';

const SCAN_POLL_INTERVAL_MS = 500;
const SCAN_TIMEOUT_MS = 120_000; // 2 minutes
const CLEAN_POLL_INTERVAL_MS = 500;
const CLEAN_TIMEOUT_MS = 120_000;

interface ScanStatusSnapshot {
  present: boolean;
  taskId?: string;
  status?: string;
  progress?: number;
  totalFiles?: number;
  totalBytes?: number;
  cleaners?: Array<{ id: string; status: string; totalFiles: number; totalBytes: number }>;
}

interface CleaningStatusSnapshot {
  present: boolean;
  cleaningTaskId?: string;
  status?: string;
  progress?: number;
  totalFilesRemoved?: number;
  totalBytesRecovered?: number;
  totalFilesSkipped?: number;
  totalFilesFailed?: number;
}

async function pollUntilDone(
  pollFn: () => Promise<{ present: boolean; status?: string }>,
  intervalMs: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await pollFn();
    if (!snap.present) break;
    if (snap.status === 'completed' || snap.status === 'failed' || snap.status === 'cancelled') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export class JunkCleanerTask extends BaseMaintenanceTask {
  readonly displayName = 'Junk Cleaner';
  readonly description = 'Scans and cleans junk files, temporary files, caches, and logs.';

  constructor() {
    super('junk-cleaner');
  }

  estimateDuration(): number {
    return 60_000; // 60 seconds estimate
  }

  async validate(): Promise<ValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!isRpcAvailable()) {
      errors.push('RPC bridge is unavailable (outside Electron?)');
    }

    return { canRun: errors.length === 0, warnings, errors };
  }

  async execute(): Promise<TaskResult> {
    return this.runSafely(async () => {
      const rpc = getRpcBridge();
      if (!rpc) {
        this._errors.push('RPC bridge unavailable');
        return;
      }

      // Step 1: Start scan
      console.info('[JunkCleanerTask] Starting scan');
      const { taskId } = (await rpc.call(RPC_METHODS.CLEANER_SCAN_START)) as { taskId: string };

      // Step 2: Wait for scan completion
      await pollUntilDone(
        async () => {
          return (await rpc.call(RPC_METHODS.CLEANER_SCAN_STATUS, { taskId })) as ScanStatusSnapshot;
        },
        SCAN_POLL_INTERVAL_MS,
        SCAN_TIMEOUT_MS,
      );

      // Step 3: Execute clean
      console.info('[JunkCleanerTask] Scan complete, starting clean');
      const { cleaningTaskId } = (await rpc.call(RPC_METHODS.CLEANER_CLEAN_EXECUTE, { taskId })) as {
        cleaningTaskId: string;
      };

      // Step 4: Wait for clean completion
      await pollUntilDone(
        async () => {
          return (await rpc.call(RPC_METHODS.CLEANER_CLEAN_STATUS, { cleaningTaskId })) as CleaningStatusSnapshot;
        },
        CLEAN_POLL_INTERVAL_MS,
        CLEAN_TIMEOUT_MS,
      );

      // Step 5: Collect results
      const finalSnap = (await rpc.call(RPC_METHODS.CLEANER_CLEAN_STATUS, { cleaningTaskId })) as CleaningStatusSnapshot;
      this._filesCleaned = finalSnap.totalFilesRemoved ?? 0;
      this._bytesRecovered = finalSnap.totalBytesRecovered ?? 0;

      if (finalSnap.totalFilesFailed && finalSnap.totalFilesFailed > 0) {
        this._warnings.push(`${finalSnap.totalFilesFailed} files could not be cleaned`);
      }

      console.info(
        `[JunkCleanerTask] Clean complete: files=${this._filesCleaned}, bytes=${this._bytesRecovered}`,
      );
    });
  }
}
