/**
 * useJunkMonitor — hook that polls the backend junk monitor and
 * provides the current junk accumulation status to the Dashboard.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  scheduledCleanupService,
  type JunkMonitorStatus,
} from './scheduledCleanup.service';

const POLL_INTERVAL = 60_000; // 60 seconds

export function useJunkMonitor() {
  const [status, setStatus] = useState<JunkMonitorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await scheduledCleanupService.getJunkStatus();
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to get junk status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { status, loading, error, refresh };
}
