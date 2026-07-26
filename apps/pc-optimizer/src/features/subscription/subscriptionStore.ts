/**
 * Subscription store — Zustand store for subscription state from the backend.
 *
 * The backend is the single source of truth. The desktop app displays
 * exactly what the backend returns. Never infers plans locally.
 */
import { create } from 'zustand';
import {
  fetchSubscription,
  fetchServerHealth,
  type SubscriptionResponse,
} from './subscriptionService';
import { getBaseUrl } from '../auth/apiClient';

export type ConnectionStatus = 'connected' | 'disconnected' | 'checking';

export interface SubscriptionState {
  subscription: SubscriptionResponse | null;
  loading: boolean;
  error: string | null;
  lastSyncAt: string | null;

  connectionStatus: ConnectionStatus;
  serverVersion: string | null;
  serverUrl: string;

  sync: () => Promise<void>;
  checkConnection: () => Promise<void>;
  clear: () => void;
}

const API_BASE_URL = getBaseUrl();

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  subscription: null,
  loading: false,
  error: null,
  lastSyncAt: null,
  connectionStatus: 'checking',
  serverVersion: null,
  serverUrl: extractHostname(API_BASE_URL),

  sync: async () => {
    set({ loading: true, error: null });
    try {
      const sub = await fetchSubscription();
      set({
        subscription: sub,
        loading: false,
        lastSyncAt: new Date().toISOString(),
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch subscription',
      });
    }
  },

  checkConnection: async () => {
    set({ connectionStatus: 'checking' });
    try {
      const health = await fetchServerHealth();
      set({
        connectionStatus: health.status === 'healthy' ? 'connected' : 'disconnected',
        serverVersion: health.version,
      });
    } catch {
      set({ connectionStatus: 'disconnected' });
    }
  },

  clear: () => {
    set({
      subscription: null,
      loading: false,
      error: null,
      lastSyncAt: null,
    });
  },
}));
