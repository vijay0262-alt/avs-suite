/**
 * Auth store — Zustand store for customer authentication state.
 * Bridges authService (async) with React components.
 */
import { create } from 'zustand';
import { authService, type AuthResultError } from './auth-service';
import { tokenStorage } from './token-storage';
import type { Customer } from './types';

export type AuthPhase = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthState {
  phase: AuthPhase;
  customer: Customer | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;

  login: (identifier: string, password: string) => Promise<boolean>;
  register: (data: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    password: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  updateProfile: (data: Partial<Customer>) => Promise<boolean>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  phase: 'checking',
  customer: null,
  loading: false,
  error: null,
  errorCode: null,

  login: async (identifier, password): Promise<boolean> => {
    set({ loading: true, error: null, errorCode: null });
    try {
      await authService.login(identifier, password);
      const profile = await authService.getProfile();
      set({ phase: 'authenticated', customer: profile, loading: false });
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

  register: async (data): Promise<boolean> => {
    set({ loading: true, error: null, errorCode: null });
    try {
      await authService.register(data);
      const profile = await authService.getProfile();
      set({ phase: 'authenticated', customer: profile, loading: false });
      return true;
    } catch (err) {
      const authErr = err as AuthResultError;
      set({
        loading: false,
        error: authErr.message ?? 'Registration failed.',
        errorCode: authErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  logout: async (): Promise<void> => {
    await authService.logout();
    set({ phase: 'unauthenticated', customer: null, error: null, errorCode: null });
  },

  restoreSession: async (): Promise<void> => {
    const session = tokenStorage.load();
    if (!session) {
      set({ phase: 'unauthenticated' });
      return;
    }

    if (tokenStorage.isExpired(session)) {
      try {
        await authService.refresh();
      } catch {
        tokenStorage.clear();
        set({ phase: 'unauthenticated' });
        return;
      }
    }

    try {
      const profile = await authService.getProfile();
      if (profile) {
        set({ phase: 'authenticated', customer: profile });
      } else {
        set({ phase: 'unauthenticated' });
      }
    } catch {
      set({ phase: 'authenticated', customer: null });
    }
  },

  updateProfile: async (data): Promise<boolean> => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const updated = await authService.updateProfile(data);
      set({ customer: updated, loading: false });
      return true;
    } catch (err) {
      const authErr = err as AuthResultError;
      set({
        loading: false,
        error: authErr.message ?? 'Profile update failed.',
        errorCode: authErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  clearError: () => set({ error: null, errorCode: null }),
}));
