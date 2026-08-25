/**
 * useSecurityScore — fetches a real, Defender-backed security score.
 *
 * Uses the canonical scan_core.security.score RPC which computes a
 * deterministic score from authoritative Windows Defender telemetry.
 *
 * NEVER fabricates a score. When Defender is unavailable, returns
 * score=50 with label="Unknown" — NOT score=100.
 *
 * A successful scan alone does NOT increase the score.
 * Score changes only when security state changes.
 */
import { useCallback, useEffect, useState } from 'react';
import { scanService, type SecurityScoreResponse, type DefenderStatusResponse } from './scan.service';

export interface UseSecurityScoreReturn {
  score: SecurityScoreResponse | null;
  defender: DefenderStatusResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSecurityScore(autoFetch = true): UseSecurityScoreReturn {
  const [score, setScore] = useState<SecurityScoreResponse | null>(null);
  const [defender, setDefender] = useState<DefenderStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scoreRes, defenderRes] = await Promise.all([
        scanService.security_score(),
        scanService.defender_status(),
      ]);
      setScore(scoreRes);
      setDefender(defenderRes);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch security score';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      void refresh();
    }
  }, [autoFetch, refresh]);

  return { score, defender, loading, error, refresh };
}
