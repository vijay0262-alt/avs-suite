/**
 * useScanHistory — manages scan history entries in localStorage.
 *
 * Free edition: last 10 scans.
 * Pro: unlimited (caller controls maxEntries).
 */
import { useState, useCallback, useEffect } from 'react';
import type { UnifiedScanHistoryEntry } from './unifiedResultsTypes';
import { idbGetAll, idbPut, idbClear, idbCleanup } from '../../services/avsWithIDB';

const FREE_MAX_ENTRIES = 10;

export function useScanHistory(isPro = false) {
  const [history, setHistory] = useState<UnifiedScanHistoryEntry[]>([]);

  useEffect(() => {
    idbGetAll<UnifiedScanHistoryEntry>('scanHistory').then((entries) => {
      entries.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      setHistory(entries);
    });
  }, []);

  const addEntry = useCallback((entry: UnifiedScanHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev];
      const limited = isPro ? next : next.slice(0, FREE_MAX_ENTRIES);
      idbPut('scanHistory', entry);
      idbCleanup('scanHistory');
      return limited;
    });
  }, [isPro]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    idbClear('scanHistory');
  }, []);

  return { history, addEntry, clearHistory };
}
