import { useEffect, useMemo } from 'react';
import { Card } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { DiagnosticsViewModel } from './DiagnosticsViewModel';
import { diagnosticsService } from './diagnostics.service';

/**
 * Developer Diagnostics Page - hidden developer tool for debugging.
 * 
 * This page provides real-time visibility into:
 * - Electron version
 * - Backend status
 * - JSON-RPC latency
 * - Active scan/cleaning state
 * - Performance metrics
 * - Recent log entries
 * 
 * Access via: /diagnostics (hidden from normal navigation)
 */
export default function DiagnosticsPage() {
  const vm = useMemo(() => new DiagnosticsViewModel(diagnosticsService), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  return (
    <div className="p-6 space-y-6" data-testid="page-diagnostics">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Developer Diagnostics</h1>
          <p className="text-sm text-text-secondary mt-1">Real-time debugging information (dev-only)</p>
        </div>
        <button
          onClick={() => vm.refresh()}
          className="px-4 py-2 bg-brand-primary hover:bg-brand-primary/90 text-white font-medium rounded-lg transition-colors"
          data-testid="refresh-button"
        >
          Refresh
        </button>
      </div>

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="py-6 text-sm text-text-muted">Loading diagnostics...</div>
        </Card>
      )}

      {state.bootstrap === 'error' && (
        <Card>
          <div className="py-6 text-sm text-semantic-danger">
            {state.bootstrapError || 'Failed to load diagnostics'}
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <div className="space-y-6">
          {/* System Info */}
          <Card title="System Information">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-text-secondary">Electron Version</div>
                <div className="text-text-primary font-medium">{state.electronVersion || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Platform</div>
                <div className="text-text-primary font-medium">{state.platform || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Node Version</div>
                <div className="text-text-primary font-medium">{state.nodeVersion || 'Unknown'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Chrome Version</div>
                <div className="text-text-primary font-medium">{state.chromeVersion || 'Unknown'}</div>
              </div>
            </div>
          </Card>

          {/* Backend Status */}
          <Card title="Backend Status">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-text-secondary">Status</div>
                <div className={`font-medium ${state.backendConnected ? 'text-semantic-success' : 'text-semantic-danger'}`}>
                  {state.backendConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              <div>
                <div className="text-text-secondary">RPC Latency</div>
                <div className="text-text-primary font-medium">{state.rpcLatency !== null ? `${state.rpcLatency}ms` : 'Unknown'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Last Ping</div>
                <div className="text-text-primary font-medium">{state.lastPing || 'Never'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Backend Uptime</div>
                <div className="text-text-primary font-medium">{state.backendUptime || 'Unknown'}</div>
              </div>
            </div>
          </Card>

          {/* Scan State */}
          <Card title="Scan State">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-text-secondary">Active Scan</div>
                <div className={`font-medium ${state.scanRunning ? 'text-semantic-warning' : 'text-text-secondary'}`}>
                  {state.scanRunning ? 'Running' : 'Idle'}
                </div>
              </div>
              <div>
                <div className="text-text-secondary">Scan Progress</div>
                <div className="text-text-primary font-medium">{state.scanProgress !== null ? `${state.scanProgress}%` : 'N/A'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Current Cleaner</div>
                <div className="text-text-primary font-medium">{state.currentScanCleaner || 'None'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Files/sec</div>
                <div className="text-text-primary font-medium">{state.scanFilesPerSec !== null ? state.scanFilesPerSec.toFixed(1) : 'N/A'}</div>
              </div>
            </div>
          </Card>

          {/* Cleaning State */}
          <Card title="Cleaning State">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-text-secondary">Active Cleaning</div>
                <div className={`font-medium ${state.cleaningRunning ? 'text-semantic-warning' : 'text-text-secondary'}`}>
                  {state.cleaningRunning ? 'Running' : 'Idle'}
                </div>
              </div>
              <div>
                <div className="text-text-secondary">Cleaning Progress</div>
                <div className="text-text-primary font-medium">{state.cleaningProgress !== null ? `${state.cleaningProgress}%` : 'N/A'}</div>
              </div>
              <div>
                <div className="text-text-secondary">Current File</div>
                <div className="text-text-primary font-medium truncate max-w-xs">{state.currentCleaningFile || 'None'}</div>
              </div>
              <div>
                <div className="text-text-secondary">MB/sec</div>
                <div className="text-text-primary font-medium">{state.cleaningMBPerSec !== null ? state.cleaningMBPerSec.toFixed(2) : 'N/A'}</div>
              </div>
            </div>
          </Card>

          {/* RPC Test Buttons */}
          <Card title="RPC Test Buttons">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => vm.testPing()}
                className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors"
                data-testid="test-ping"
              >
                Test system.ping
              </button>
              <button
                onClick={() => vm.testScanStart()}
                className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors"
                data-testid="test-scan-start"
              >
                Test scan.start
              </button>
              <button
                onClick={() => vm.testPreview()}
                className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors"
                data-testid="test-preview"
              >
                Test cleaner.delete.preview
              </button>
              <button
                onClick={() => vm.testExecute()}
                className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border rounded-lg text-sm transition-colors"
                data-testid="test-execute"
              >
                Test cleaner.delete.execute
              </button>
            </div>
            {state.lastRpcTest && (
              <div className="mt-4 p-3 bg-surface-muted rounded text-xs font-mono">
                <div className="text-text-secondary mb-1">Last RPC Test Result:</div>
                <div className="text-text-primary">{state.lastRpcTest}</div>
              </div>
            )}
          </Card>

          {/* Recent Logs */}
          <Card title="Recent Log Entries (Last 100)">
            <div className="bg-surface-muted rounded p-3 max-h-96 overflow-y-auto">
              {state.logs.length === 0 ? (
                <div className="text-sm text-text-muted">No logs available</div>
              ) : (
                <div className="space-y-1">
                  {state.logs.map((log, idx) => (
                    <div key={idx} className="text-xs font-mono text-text-secondary">
                      <span className="text-text-muted">[{log.timestamp}]</span>{' '}
                      <span className={log.level === 'error' ? 'text-semantic-danger' : log.level === 'warn' ? 'text-semantic-warning' : 'text-text-primary'}>
                        [{log.level.toUpperCase()}]
                      </span>{' '}
                      {log.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
