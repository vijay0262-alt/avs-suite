/**
 * ProviderHealthPanel — displays all security providers with their health
 * status, latency, and last run time.
 */
import { useState } from 'react';
import { Card, Badge, ProgressBar } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import type { ProviderHealthInfo, ProtectionHealthReport, ProtectionDiagnosticsReport } from './SecurityDashboardViewModel';

interface ProviderHealthPanelProps {
  providers: ProviderHealthInfo[];
  health: ProtectionHealthReport | null;
  diagnostics: ProtectionDiagnosticsReport | null;
}

function statusTone(status: ProviderHealthInfo['status']): BadgeTone {
  switch (status) {
    case 'healthy': return 'success';
    case 'degraded': return 'warning';
    case 'error': return 'danger';
    default: return 'neutral';
  }
}

function StatusIcon({ status }: { status: ProviderHealthInfo['status'] }) {
  switch (status) {
    case 'healthy': return <CheckCircleIcon className="h-5 w-5 text-semantic-success" aria-hidden />;
    case 'degraded': return <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" aria-hidden />;
    case 'error': return <XCircleIcon className="h-5 w-5 text-semantic-danger" aria-hidden />;
    default: return <ClockIcon className="h-5 w-5 text-text-muted" aria-hidden />;
  }
}

export function ProviderHealthPanel({ providers, health, diagnostics }: ProviderHealthPanelProps) {
  const [filter, setFilter] = useState<'all' | 'healthy' | 'degraded' | 'error' | 'inactive'>('all');

  const filtered = providers.filter((p) => filter === 'all' || p.status === filter);
  const healthyCount = providers.filter((p) => p.status === 'healthy').length;
  const degradedCount = providers.filter((p) => p.status === 'degraded').length;
  const errorCount = providers.filter((p) => p.status === 'error').length;

  return (
    <div className="space-y-4" data-testid="provider-health-panel">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="provider-summary-total">
          <div className="text-center">
            <div className="text-2xl font-bold text-text-primary">{providers.length}</div>
            <div className="text-xs text-text-muted">Total Providers</div>
          </div>
        </Card>
        <Card data-testid="provider-summary-healthy">
          <div className="text-center">
            <div className="text-2xl font-bold text-semantic-success">{healthyCount}</div>
            <div className="text-xs text-text-muted">Healthy</div>
          </div>
        </Card>
        <Card data-testid="provider-summary-degraded">
          <div className="text-center">
            <div className="text-2xl font-bold text-semantic-warning">{degradedCount}</div>
            <div className="text-xs text-text-muted">Degraded</div>
          </div>
        </Card>
        <Card data-testid="provider-summary-error">
          <div className="text-center">
            <div className="text-2xl font-bold text-semantic-danger">{errorCount}</div>
            <div className="text-xs text-text-muted">Error</div>
          </div>
        </Card>
      </div>

      {/* Overall health */}
      {health && (
        <Card title="Overall Health" data-testid="provider-overall-health">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Status</span>
              <Badge tone={health.status === 'healthy' ? 'success' : health.status === 'degraded' ? 'warning' : 'danger'}>
                {health.status}
              </Badge>
            </div>
            <ProgressBar
              value={health.issues.length === 0 ? 100 : Math.max(0, 100 - health.issues.length * 15)}
              tone={health.issues.length === 0 ? 'success' : health.issues.length <= 3 ? 'warning' : 'danger'}
            />
            {health.issues.length > 0 && (
              <div className="space-y-1">
                {health.issues.map((issue, i) => (
                  <div key={i} className="text-xs text-text-secondary">
                    <span className={`font-medium ${issue.severity === 'critical' ? 'text-semantic-danger' : issue.severity === 'high' ? 'text-semantic-warning' : ''}`}>
                      [{issue.severity}]
                    </span>{' '}
                    {issue.component}: {issue.description}
                    {issue.recommendation && (
                      <span className="text-text-muted"> — {issue.recommendation}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-1">
        {(['all', 'healthy', 'degraded', 'error', 'inactive'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              filter === f
                ? 'rounded-md bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary capitalize'
                : 'rounded-md px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-muted capitalize'
            }
            data-testid={`provider-filter-${f}`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Provider list */}
      <div className="space-y-2" data-testid="provider-list">
        {filtered.map((provider) => (
          <Card key={provider.id} data-testid={`provider-${provider.id}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusIcon status={provider.status} />
                <div>
                  <div className="text-sm font-medium text-text-primary">{provider.name}</div>
                  <div className="text-xs text-text-muted">{provider.description}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {provider.latency > 0 && (
                  <span className="text-xs text-text-muted">{provider.latency}ms</span>
                )}
                {provider.lastRun && (
                  <span className="text-xs text-text-muted">
                    {new Date(provider.lastRun).toLocaleTimeString()}
                  </span>
                )}
                <Badge tone={statusTone(provider.status)}>{provider.status}</Badge>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Diagnostics */}
      {diagnostics && (
        <Card title="Diagnostics" data-testid="provider-diagnostics">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Overall</span>
              <Badge tone={diagnostics.overallStatus === 'pass' ? 'success' : diagnostics.overallStatus === 'warn' ? 'warning' : 'danger'}>
                {diagnostics.overallStatus}
              </Badge>
            </div>
            {diagnostics.results.map((result, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{result.component}: {result.message}</span>
                <Badge tone={result.status === 'pass' ? 'success' : result.status === 'warn' ? 'warning' : 'danger'}>
                  {result.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
