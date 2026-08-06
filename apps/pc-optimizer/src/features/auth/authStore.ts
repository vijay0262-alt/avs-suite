/**
 * Auth store — Zustand store for customer authentication state.
 *
 * Tracks: isAuthenticated, customer info, loading/error states.
 * Bridges the authService (async) with React components.
 */
import { create } from 'zustand';
import { authService, type AuthResultError, type CustomerProfile } from './authService';
import { tokenStorage, type StoredSession } from './tokenStorage';
import { useSyncStore, stopPeriodicSync } from '../sync/syncStore';

export type AuthPhase = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  phase: AuthPhase;
  customer: CustomerProfile | null;
  session: StoredSession | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;

  login: (identifier: string, password: string) => Promise<boolean>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  phase: 'checking',
  customer: null,
  session: null,
  loading: false,
  error: null,
  errorCode: null,

  login: async (identifier: string, password: string): Promise<boolean> => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const session = await authService.login(identifier, password);
      // Login response already contains full customer profile —
      // skip the extra validate() round-trip to speed up login.
      const profile = authService.getProfileFromSession(session);
      set({
        phase: 'authenticated',
        session,
        customer: profile,
        loading: false,
      });
      return true;
    } catch (err) {
      const authErr = err as AuthResultError;
      set({
        loading: false,
        error: authErr.message ?? 'Login failed.',
        errorCode: authErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  logout: () => {
    authService.logout();
    stopPeriodicSync();
    useSyncStore.getState().clear();
    set({
      phase: 'unauthenticated',
      customer: null,
      session: null,
      error: null,
      errorCode: null,
    });
  },

  restoreSession: async () => {
    const session = tokenStorage.load();
    if (!session) {
      set({ phase: 'unauthenticated' });
      return;
    }

    // If expired, try refresh
    if (tokenStorage.isExpired(session)) {
      try {
        const refreshed = await authService.refresh();
        const profile = authService.getProfileFromSession(refreshed);
        set({
          phase: 'authenticated',
          session: refreshed,
          customer: profile,
        });
        return;
      } catch {
        tokenStorage.clear();
        set({ phase: 'unauthenticated' });
        return;
      }
    }

    // Token is still valid — set authenticated immediately from cached
    // session data, then validate in background for fresh profile data.
    const cachedProfile = authService.getProfileFromSession(session);
    set({
      phase: 'authenticated',
      session,
      customer: cachedProfile,
    });

    // Background validation — non-blocking, updates profile if server
    // returns fresher data. Falls back gracefully on network error.
    try {
      const profile = await authService.validate();
      if (profile) {
        set({ customer: profile });
      }
    } catch {
      // Network error — keep cached session, app works offline
    }
  },

  clearError: () => set({ error: null, errorCode: null }),
}));

/**
 * Convenience hook for components that just need auth status.
 */
export function useAuth(): AuthState {
  return useAuthStore();
}
