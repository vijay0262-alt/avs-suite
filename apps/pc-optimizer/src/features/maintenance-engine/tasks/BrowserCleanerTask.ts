/**
 * Browser Cleaner Task — cleans browser cache via the cleaner RPC.
 *
 * Uses the existing cleaner system with `only: ['browser-cache']` to
 * scan and clean only browser cache files.
 */
import { BaseMaintenanceTask, isRpcAvailable, getRpcBridge } from './BaseMaintenanceTask';
import type { TaskResult, ValidationResult } from '../types';
import { RPC_METHODS } from '@avs/shared/rpc';

const SCAN_POLL_INTERVAL_MS = 500;
const SCAN_TIMEOUT_MS = 60_000;
const CLEAN_POLL_INTERVAL_MS = 500;
const CLEAN_TIMEOUT_MS = 60_000;

const BROWSER_CLEANER_ID = 'browser-cache';

interface ScanStatusSnapshot {
  present: boolean;
  status?: string;
  totalFiles?: number;
  totalBytes?: number;
}

interface CleaningStatusSnapshot {
  present: boolean;
  status?: string;
  totalFilesRemoved?: number;
  totalBytesRecovered?: number;
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

export class BrowserCleanerTask extends BaseMaintenanceTask {
  readonly displayName = 'Browser Cleaner';
  readonly description = 'Cleans browser caches (Chrome, Edge, Firefox, etc.).';

  constructor() {
    super('browser-cleaner');
  }

  estimateDuration(): number {
    return 30_000; // 30 seconds estimate
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

      // Step 1: Start scan with only browser-cache cleaner
      const { taskId } = (await rpc.call(RPC_METHODS.CLEANER_SCAN_START, {
        only: [BROWSER_CLEANER_ID],
      })) as { taskId: string };

      // Step 2: Wait for scan completion
      await pollUntilDone(
        async () => {
          return (await rpc.call(RPC_METHODS.CLEANER_SCAN_STATUS, { taskId })) as ScanStatusSnapshot;
        },
        SCAN_POLL_INTERVAL_MS,
        SCAN_TIMEOUT_MS,
      );

      // Step 3: Execute clean
      const { cleaningTaskId } = (await rpc.call(RPC_METHODS.CLEANER_CLEAN_EXECUTE, {
        taskId,
        only: [BROWSER_CLEANER_ID],
      })) as { cleaningTaskId: string };

      // Step 4: Wait for clean completion
      await pollUntilDone(
        async () => {
          return (await rpc.call(RPC_METHODS.CLEANER_CLEAN_STATUS, { cleaningTaskId })) as CleaningStatusSnapshot;
        },
        CLEAN_POLL_INTERVAL_MS,
        CLEAN_TIMEOUT_MS,
      );

      // Step 5: Collect results
      const finalSnap = (await rpc.call(RPC_METHODS.CLEANER_CLEAN_STATUS, {
        cleaningTaskId,
      })) as CleaningStatusSnapshot;
      this._filesCleaned = finalSnap.totalFilesRemoved ?? 0;
      this._bytesRecovered = finalSnap.totalBytesRecovered ?? 0;

      console.info(
        `[BrowserCleanerTask] Clean complete: files=${this._filesCleaned}, bytes=${this._bytesRecovered}`,
      );
    });
  }
}
