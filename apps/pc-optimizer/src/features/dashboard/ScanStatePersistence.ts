/**
 * ScanStatePersistence — saves and restores in-progress scan state to localStorage.
 *
 * If the user closes the window during a scan, the scan progress is persisted.
 * On next startup, the app detects the interrupted scan and offers to resume or discard.
 *
 * Persisted state includes:
 *   - Current phase (scanning, optimizing, verifying)
 *   - Progress percentage
 *   - Current module being processed
 *   - Current operation
 *   - Elapsed time
 *   - Scan profile
 *   - Modules scanned so far (with results)
 *   - Before report (if available)
 */

import { idbGetOne, idbPut, idbClear } from '../../services/avsWithIDB';

const SCAN_STATE_KEY = 'current';

export interface PersistedScanState {
  /** Whether a scan was in progress when the app was closed. */
  active: boolean;
  /** The scan profile that was running. */
  profile: string;
  /** The current step: 'scanning' | 'optimizing' | 'verifying' | 'complete'. */
  step: string;
  /** Overall progress 0-100. */
  progress: number;
  /** Current module being processed. */
  currentModule: string | null;
  /** Current operation description. */
  currentOperation: string | null;
  /** Scan start timestamp (ms since epoch). */
  startedAt: number;
  /** When the state was saved (ms since epoch). */
  savedAt: number;
  /** Modules that have been scanned with their results. */
  scannedModules: Array<{
    moduleId: string;
    moduleName: string;
    status: string;
    score: number;
    issuesFound: number;
    recoverableSpace: number;
  }>;
  /** Whether the scan was cancelled by the user. */
  cancelled: boolean;
  /** Live stats at time of save. */
  liveStats: {
    filesScanned: number;
    registryEntries: number;
    startupItems: number;
    privacyItems: number;
    storageRecovered: number;
    memoryRecovered: number;
    startupOptimized: number;
    recommendationsFound: number;
  } | null;
}

export function saveScanState(state: PersistedScanState): void {
  idbPut('scanState', { ...state, key: SCAN_STATE_KEY });
}

export async function loadScanState(): Promise<PersistedScanState | null> {
  const state = await idbGetOne<PersistedScanState & { key: string }>('scanState', SCAN_STATE_KEY);
  if (!state || !state.savedAt) return null;
  return state;
}

export function clearScanState(): void {
  idbClear('scanState');
}

/**
 * Check if there was an interrupted scan on startup.
 * Returns the persisted state if the scan was active and not cancelled.
 */
export async function detectInterruptedScan(): Promise<PersistedScanState | null> {
  const state = await loadScanState();
  if (!state) return null;
  if (!state.active || state.cancelled) return null;
  if (state.step === 'complete') return null;
  const ageMs = Date.now() - state.savedAt;
  if (ageMs > 24 * 60 * 60 * 1000) {
    clearScanState();
    return null;
  }
  return state;
}
