/**
 * useBackendReconnect — listens for backend reconnection events from
 * the Electron main process and invokes a callback when the Python
 * backend has been automatically restarted after a crash.
 *
 * Usage:
 *   useBackendReconnect(() => {
 *     // Refresh data, invalidate caches, etc.
 *   });
 */
import { useEffect } from 'react';

export function useBackendReconnect(onReconnect: () => void): void {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.avs?.rpc?.onReconnect) return;
    const unsub = window.avs.rpc.onReconnect(() => {
      onReconnect();
    });
    return () => { unsub(); };
  }, [onReconnect]);
}
