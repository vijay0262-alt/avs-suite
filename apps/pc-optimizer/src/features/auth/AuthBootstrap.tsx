/**
 * AuthBootstrap — wraps the app and handles session restore on startup.
 *
 * Thin-client flow:
 * 1. Check for stored session
 * 2. If session exists and valid → restore
 * 3. If session expired → attempt refresh
 * 4. If refresh fails → show login
 * 5. If no session → show login
 *
 * When authenticated:
 *   - Restore cached sync data (for instant offline startup)
 *   - Call GET /api/customer/sync to get everything from the backend
 *   - Start periodic background sync
 * When unauthenticated, renders LoginDialog.
 *
 * @vitest-environment happy-dom
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuthStore } from './authStore';
import { tokenStorage } from './tokenStorage';
import { LoginDialog } from './LoginDialog';
import { useSyncStore, startPeriodicSync, stopPeriodicSync } from '../sync/syncStore';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const { phase, restoreSession, logout } = useAuthStore();
  const { sync, restoreFromCache, clear: clearSync } = useSyncStore();
  // Check for cached session synchronously — if we have one, render
  // children immediately instead of blocking with a loading spinner.
  // restoreSession() will validate in the background.
  const [restored, setRestored] = useState(() => {
    const session = tokenStorage.load();
    return !session; // restored=true if no session (skip waiting)
  });
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!restored) {
      void restoreSession().finally(() => setRestored(true));
    }
  }, [restoreSession, restored]);

  // Register logout callback with authService for session expiry
  useEffect(() => {
    import('./authService').then(({ authService }) => {
      authService.onExpired(() => {
        clearSync();
        stopPeriodicSync();
        logout();
      });
    });
  }, [logout, clearSync]);

  // Restore sync cache immediately on mount — gives the UI data
  // to render with, even before auth phase transitions.
  useEffect(() => {
    restoreFromCache();
  }, [restoreFromCache]);

  // Sync with backend after authentication
  useEffect(() => {
    if (phase === 'authenticated' && !syncedRef.current) {
      syncedRef.current = true;
      // Sync from backend (non-blocking — UI renders with cache first)
      void sync().then(() => {
        startPeriodicSync();
      }).catch(() => {
        // Sync failure is non-fatal — cached data (if any) is already loaded
      });
    }
    if (phase !== 'authenticated') {
      syncedRef.current = false;
      stopPeriodicSync();
    }
  }, [phase, sync, restoreFromCache]);

  if (phase === 'checking') {
    return (
      <div
        className="flex h-full items-center justify-center bg-bg"
        data-testid="auth-bootstrap-loading"
      >
        <div className="text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto" />
          <p className="text-small text-text-muted">Loading AVS Shield…</p>
        </div>
      </div>
    );
  }

  if (phase === 'unauthenticated') {
    return <LoginDialog />;
  }

  return <>{children}</>;
}
