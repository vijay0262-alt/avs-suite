/**
 * Auth store — Zustand store for customer authentication state.
 * Bridges authService (async) with React components.
 */
import { create } from 'zustand';
import { authService, AuthResultError } from './auth-service';
import { tokenStorage } from './token-storage';
import type { Customer } from './types';

export type AuthPhase = 'checking' | 'authenticated' | 'unauthenticated' | 'unverified';

interface AuthState {
  phase: AuthPhase;
  customer: Customer | null;
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  returnUrl: string | null;

  login: (identifier: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  register: (data: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    password: string;
  }) => Promise<{ success: boolean; verificationRequired: boolean }>;
  verifyEmail: (token: string) => Promise<boolean>;
  resendVerification: (email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<void>;
  updateProfile: (data: Partial<Customer>) => void;
  clearError: () => void;
  setReturnUrl: (url: string | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  phase: 'checking',
  customer: null,
  loading: false,
  error: null,
  errorCode: null,
  returnUrl: null,

  login: async (identifier, password, rememberMe = false) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const session = await authService.login(identifier, password, rememberMe);
      const profile = await authService.getProfile();
      set({
        phase: 'authenticated',
        customer: profile ?? {
          id: session.customerId,
          email: session.customerEmail,
          first_name: session.customerName.split(' ')[0] ?? '',
          last_name: session.customerName.split(' ').slice(1).join(' ') ?? '',
          email_verified: session.emailVerified,
          account_status: session.accountStatus,
          phone_number: '',
          phone_verified: false,
        } as Customer,
        loading: false,
      });
      return true;
    } catch (err) {
      const error = err instanceof AuthResultError ? err.message : 'Login failed. Please try again.';
      const errorCode = err instanceof AuthResultError ? err.code : 'UNKNOWN';
      set({ loading: false, error, errorCode });
      return false;
    }
  },

  register: async (data) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const result = await authService.register(data);
      if (result.verificationRequired) {
        set({
          phase: 'unverified',
          customer: result.customer,
          loading: false,
        });
        return { success: true, verificationRequired: true };
      }
      // If no verification required (legacy mode), auto-login
      set({
        phase: 'authenticated',
        customer: result.customer,
        loading: false,
      });
      return { success: true, verificationRequired: false };
    } catch (err) {
      const error = err instanceof AuthResultError ? err.message : 'Registration failed. Please try again.';
      const errorCode = err instanceof AuthResultError ? err.code : 'UNKNOWN';
      set({ loading: false, error, errorCode });
      return { success: false, verificationRequired: false };
    }
  },

  verifyEmail: async (token) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      const session = await authService.verifyEmail(token);
      if (session) {
        const profile = await authService.getProfile();
        set({
          phase: 'authenticated',
          customer: profile,
          loading: false,
        });
        return true;
      }
      set({ loading: false, error: 'Verification failed. The link may have expired.' });
      return false;
    } catch (err) {
      const error = err instanceof AuthResultError ? err.message : 'Verification failed.';
      set({ loading: false, error });
      return false;
    }
  },

  resendVerification: async (email) => {
    set({ loading: true, error: null, errorCode: null });
    try {
      await authService.resendVerification(email);
      set({ loading: false });
      return true;
    } catch (err) {
      const error = err instanceof AuthResultError ? err.message : 'Failed to resend verification email.';
      set({ loading: false, error });
      return false;
    }
  },

  logout: async () => {
    await authService.logout();
    set({ phase: 'unauthenticated', customer: null, returnUrl: null });
  },

  restoreSession: async () => {
    const mirror = tokenStorage.loadMirror();
    if (!mirror || tokenStorage.isExpired(mirror)) {
      // Try to refresh via cookie
      try {
        await authService.refresh();
        const profile = await authService.getProfile();
        set({ phase: 'authenticated', customer: profile });
        return;
      } catch {
        tokenStorage.clearMirror();
        set({ phase: 'unauthenticated', customer: null });
        return;
      }
    }
    // Session mirror exists and is not expired — restore profile
    try {
      const profile = await authService.getProfile();
      if (profile) {
        set({ phase: 'authenticated', customer: profile });
      } else {
        // Cookie may be invalid — try refresh
        try {
          await authService.refresh();
          const refreshedProfile = await authService.getProfile();
          set({ phase: 'authenticated', customer: refreshedProfile });
        } catch {
          tokenStorage.clearMirror();
          set({ phase: 'unauthenticated', customer: null });
        }
      }
    } catch {
      // Network error — use mirror data for offline session
      set({
        phase: 'authenticated',
        customer: {
          id: mirror.customerId,
          email: mirror.customerEmail,
          first_name: mirror.customerName.split(' ')[0] ?? '',
          last_name: mirror.customerName.split(' ').slice(1).join(' ') ?? '',
          email_verified: mirror.emailVerified,
          account_status: mirror.accountStatus,
          phone_number: '',
          phone_verified: false,
        } as Customer,
      });
    }
  },

  clearError: () => set({ error: null, errorCode: null }),

  updateProfile: (data) => {
    const current = get().customer;
    if (current) {
      set({ customer: { ...current, ...data } });
    }
  },

  setReturnUrl: (url) => set({ returnUrl: url }),
}));
