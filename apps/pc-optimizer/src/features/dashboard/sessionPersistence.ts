/**
 * SessionPersistence — saves and restores dashboard session state to IndexedDB.
 *
 * After restarting the application, the last optimization summary, health score,
 * and recommendations are restored until a new scan is performed.
 */
import { idbGetOne, idbPut, idbClear } from '../../services/avsWithIDB';

const SESSION_KEY = 'current';

export interface PersistedSession {
  optimizationSummary: unknown | null;
  healthScore: number | null;
  healthZone: string | null;
  recommendations: unknown[] | null;
  lastOptimizationAt: string | null;
  savedAt: string;
}

export function saveSession(session: PersistedSession): void {
  idbPut('dashboardSession', { ...session, key: SESSION_KEY });
}

export async function loadSession(): Promise<PersistedSession | null> {
  const session = await idbGetOne<PersistedSession & { key: string }>('dashboardSession', SESSION_KEY);
  if (!session || !session.savedAt) return null;
  return session;
}

export function clearSession(): void {
  idbClear('dashboardSession');
}
