/**
 * AuthBootstrap — wraps the app and handles session restore on startup.
 *
 * Flow:
 * 1. Check for stored session
 * 2. If session exists and valid → restore
 * 3. If session expired → attempt refresh
 * 4. If refresh fails → show login
 * 5. If no session → show login
 *
 * When authenticated, silently syncs the Optimizer entitlement.
 * When unauthenticated, renders LoginDialog.
 *
 * @vitest-environment happy-dom
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuthStore } from './authStore';
import { LoginDialog } from './LoginDialog';
import { useEntitlementStore } from '../entitlement/entitlementStore';
import { useLicenseStore } from '../license/licenseStore';

export function AuthBootstrap({ children }: { children: ReactNode }) {
  const { phase, restoreSession, logout } = useAuthStore();
  const { syncEntitlement, clearEntitlement } = useEntitlementStore();
  const { activate: activateLicense, clear: clearLicense } = useLicenseStore();
  const [restored, setRestored] = useState(false);
  const syncedRef = useRef(false);
  const licenseActivatedRef = useRef(false);

  useEffect(() => {
    if (!restored) {
      void restoreSession().finally(() => setRestored(true));
    }
  }, [restoreSession, restored]);

  // Register logout callback with authService for session expiry
  useEffect(() => {
    import('./authService').then(({ authService }) => {
      authService.onExpired(() => {
        clearEntitlement();
        clearLicense();
        logout();
      });
    });
  }, [logout, clearEntitlement, clearLicense]);

  // Silently sync entitlement after authentication, then activate license
  useEffect(() => {
    if (phase === 'authenticated' && !syncedRef.current) {
      syncedRef.current = true;
      void syncEntitlement('optimizer').then(async (ok) => {
        // After entitlement sync, activate the license
        if (ok && !licenseActivatedRef.current) {
          licenseActivatedRef.current = true;
          await activateLicense('optimizer').catch(() => {
            // License activation failure is non-fatal — app continues.
            // The store records the error; user can retry from Settings.
          });
        }
      }).catch(() => {
        // Entitlement sync failure is non-fatal — auth remains valid.
        // The store records the error; user can retry from Settings.
      });
    }
    if (phase !== 'authenticated') {
      syncedRef.current = false;
      licenseActivatedRef.current = false;
    }
  }, [phase, syncEntitlement, activateLicense]);

  if (!restored || phase === 'checking') {
    return (
      <div
        className="flex h-full items-center justify-center bg-bg"
        data-testid="auth-bootstrap-loading"
      >
        <div className="text-center space-y-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary border-t-transparent mx-auto" />
          <p className="text-sm text-text-muted">Checking session…</p>
        </div>
      </div>
    );
  }

  if (phase === 'unauthenticated') {
    return <LoginDialog />;
  }

  return <>{children}</>;
}
