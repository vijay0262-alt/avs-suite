/**
 * useScanHistory — manages scan history entries in localStorage.
 *
 * Free edition: last 10 scans.
 * Pro: unlimited (caller controls maxEntries).
 */
import { useState, useCallback, useEffect } from 'react';
import type { UnifiedScanHistoryEntry } from './unifiedResultsTypes';

const STORAGE_KEY = 'avs-scan-history';
const FREE_MAX_ENTRIES = 10;

function loadHistory(): UnifiedScanHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveHistory(entries: UnifiedScanHistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

export function useScanHistory(isPro = false) {
  const [history, setHistory] = useState<UnifiedScanHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const addEntry = useCallback((entry: UnifiedScanHistoryEntry) => {
    setHistory((prev) => {
      const next = [entry, ...prev];
      const limited = isPro ? next : next.slice(0, FREE_MAX_ENTRIES);
      saveHistory(limited);
      return limited;
    });
  }, [isPro]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory([]);
  }, []);

  return { history, addEntry, clearHistory };
}
