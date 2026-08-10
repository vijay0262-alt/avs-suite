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

const STORAGE_KEY = 'avs:scan:state';

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

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveScanState(state: PersistedScanState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage might be full or disabled — fail silently
  }
}

export function loadScanState(): PersistedScanState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedScanState;
    if (!parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearScanState(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // fail silently
  }
}

/**
 * Check if there was an interrupted scan on startup.
 * Returns the persisted state if the scan was active and not cancelled.
 */
export function detectInterruptedScan(): PersistedScanState | null {
  const state = loadScanState();
  if (!state) return null;
  if (!state.active || state.cancelled) return null;
  if (state.step === 'complete') return null;
  // Only consider it interrupted if it was saved within the last 24 hours
  const ageMs = Date.now() - state.savedAt;
  if (ageMs > 24 * 60 * 60 * 1000) {
    clearScanState();
    return null;
  }
  return state;
}
