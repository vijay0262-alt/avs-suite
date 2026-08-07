import { useState } from 'react';
import { Button } from '@avs/ui';
import { MagnifyingGlassIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { ProcessOptimizeResult } from '../../performance/performance.service';

export interface ProcessOptimizerProps {
  onOptimize: (kill: boolean) => Promise<ProcessOptimizeResult | null>;
}

export function ProcessOptimizer({ onOptimize }: ProcessOptimizerProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProcessOptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDetect = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await onOptimize(false);
      setResult(r);
    } catch {
      setError('Failed to scan processes');
    } finally {
      setLoading(false);
    }
  };

  const handleKill = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await onOptimize(true);
      setResult(r);
    } catch {
      setError('Failed to terminate processes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-small text-[var(--avs-text-muted)]">
        Detect processes consuming excessive CPU, memory, or disk resources. Terminate them safely to improve performance.
      </p>

      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleDetect}
          disabled={loading}
        >
          <MagnifyingGlassIcon className="h-4 w-4 mr-1" />
          Detect
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleKill}
          disabled={loading}
        >
          <TrashIcon className="h-4 w-4 mr-1" />
          Terminate
        </Button>
      </div>

      {error && (
        <p className="text-small text-[var(--avs-danger)]">{error}</p>
      )}

      {result && (
        <div className="space-y-2">
          {result.totalDetected === 0 ? (
            <p className="text-small text-[var(--avs-success)]">
              No high-resource processes detected. Your system is running efficiently.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-small font-semibold text-[var(--avs-text-primary)]">
                  {result.totalDetected} process{result.totalDetected > 1 ? 'es' : ''} detected
                </span>
                {result.totalKilled > 0 && (
                  <span className="text-small text-[var(--avs-success)]">
                    {result.totalKilled} terminated
                  </span>
                )}
              </div>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {result.detected.map((p) => (
                  <li
                    key={`${p.pid}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--avs-border)] px-2 py-1.5"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-small font-medium text-[var(--avs-text-primary)] truncate block">
                        {p.name}
                      </span>
                      <span className="text-caption text-[var(--avs-text-muted)]">
                        PID {p.pid} · {p.reason}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-caption text-[var(--avs-text-muted)]">
                        {p.cpuPercent}% CPU · {p.memoryMB} MB
                      </span>
                      {p.critical && (
                        <span className="text-caption text-[var(--avs-warning)] font-medium">
                          System
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {result.errors.length > 0 && (
                <p className="text-caption text-[var(--avs-text-muted)]">
                  {result.errors.length} error(s) — some processes could not be terminated.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
