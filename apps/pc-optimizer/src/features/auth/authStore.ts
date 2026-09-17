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
  /** Pre-2FA token when the account requires a TOTP code to finish login. */
  pending2fa: string | null;

  login: (identifier: string, password: string) => Promise<boolean>;
  submit2fa: (code: string) => Promise<boolean>;
  cancel2fa: () => void;
  logout: () => void;
  restoreSession: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => {
  // Check for cached session synchronously at store creation time.
  // If a valid session exists, start as 'authenticated' immediately
  // to avoid a first-render loading spinner. restoreSession() will
  // still validate in the background.
  const cachedSession = tokenStorage.load();
  const initialPhase: AuthPhase = cachedSession && !tokenStorage.isExpired(cachedSession)
    ? 'authenticated'
    : 'checking';
  const initialProfile = cachedSession ? authService.getProfileFromSession(cachedSession) : null;

  return {
    phase: initialPhase,
    customer: initialProfile,
    session: cachedSession,
    loading: false,
    error: null,
    errorCode: null,
    pending2fa: null,

  login: async (identifier: string, password: string): Promise<boolean> => {
    set({ loading: true, error: null, errorCode: null, pending2fa: null });
    try {
      const result = await authService.login(identifier, password);
      // 2FA challenge — park the token, UI prompts for the code.
      if (result.kind === '2fa') {
        set({ loading: false, pending2fa: result.pre2faToken });
        return false;
      }
      // Login response already contains full customer profile —
      // skip the extra validate() round-trip to speed up login.
      const profile = authService.getProfileFromSession(result.session);
      set({
        phase: 'authenticated',
        session: result.session,
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

  submit2fa: async (code: string): Promise<boolean> => {
    const token = useAuthStore.getState().pending2fa;
    if (!token) return false;
    set({ loading: true, error: null, errorCode: null });
    try {
      const session = await authService.complete2fa(token, code);
      const profile = authService.getProfileFromSession(session);
      set({
        phase: 'authenticated',
        session,
        customer: profile,
        loading: false,
        pending2fa: null,
      });
      return true;
    } catch (err) {
      const authErr = err as AuthResultError;
      set({
        loading: false,
        error: authErr.message ?? 'Verification failed.',
        errorCode: authErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  cancel2fa: () => set({ pending2fa: null, error: null, errorCode: null }),

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
      pending2fa: null,
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
  };
});

/**
 * Convenience hook for components that just need auth status.
 */
export function useAuth(): AuthState {
  return useAuthStore();
}
