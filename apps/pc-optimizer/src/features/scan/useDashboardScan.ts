/**
 * useDashboardScan.ts — read-only hook that exposes the latest unified
 * scan/remediation state to the dashboard.
 *
 * Precedence rule:
 *   active in-memory session (unifiedScanState) > persisted scan_core history
 *
 * The hook does NOT start a scan. It only reads from `unifiedScanState` and,
 * when no active session exists, calls the read-only `scan_core.scan.latest`
 * RPC once to hydrate the dashboard after application restart.
 */
import { useEffect, useState, useMemo, useRef } from 'react';
import { unifiedScanState, type AppScanSession } from './unifiedScanState';
import { scanService, type PersistedScanRecord } from './scan.service';
import { toDashboardSnapshot, type DashboardScanSnapshot } from './dashboardAdapter';

export interface UseDashboardScanReturn {
  session: AppScanSession | null;
  persisted: PersistedScanRecord | null;
  snapshot: DashboardScanSnapshot;
  isLoading: boolean;
}

export function useDashboardScan(): UseDashboardScanReturn {
  const [session, setSession] = useState<AppScanSession | null>(() =>
    unifiedScanState.getLatest(),
  );
  const [persisted, setPersisted] = useState<PersistedScanRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);
  const loadedRef = useRef(false);

  useEffect(() => {
    return unifiedScanState.subscribe(setSession);
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    if (session?.status === 'scanning' || session?.status === 'preparing') {
      return;
    }
    if (session && session.status !== 'idle') {
      loadedRef.current = true;
      return;
    }

    setIsLoading(true);
    loadedRef.current = true;
    scanService
      .latest()
      .then((response) => {
        if (!mountedRef.current) return;
        if (response.ok === true && response.latest) {
          setPersisted(response.latest);
        }
      })
      .catch(() => {
        // Read-only history failure is non-fatal; dashboard falls back to idle.
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsLoading(false);
        }
      });
  }, [session]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const snapshot = useMemo(() => {
    if (session && session.status !== 'idle') {
      return toDashboardSnapshot(session);
    }
    return toDashboardSnapshot(persisted);
  }, [session, persisted]);

  return { session, persisted, snapshot, isLoading };
}
