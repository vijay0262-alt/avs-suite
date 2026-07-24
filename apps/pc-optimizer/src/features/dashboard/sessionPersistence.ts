/**
 * SessionPersistence — saves and restores dashboard session state to localStorage.
 *
 * After restarting the application, the last optimization summary, health score,
 * and recommendations are restored until a new scan is performed.
 */

const STORAGE_KEY = 'avs:dashboard:session';

export interface PersistedSession {
  optimizationSummary: unknown | null;
  healthScore: number | null;
  healthZone: string | null;
  recommendations: unknown[] | null;
  lastOptimizationAt: string | null;
  savedAt: string;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function saveSession(session: PersistedSession): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage might be full or disabled — fail silently
  }
}

export function loadSession(): PersistedSession | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    if (!parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // fail silently
  }
}
