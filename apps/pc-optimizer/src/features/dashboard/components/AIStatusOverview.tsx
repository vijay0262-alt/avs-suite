/**
 * AIStatusOverview — consolidated AI subsystem status for the Dashboard.
 *
 * Shows a compact grid of AI feature statuses with quick navigation links.
 * Replaces the orphan AIOverview component with live integration data.
 */
import { useEffect, useState } from 'react';
import { Card } from '@avs/ui';
import { useNavigate } from 'react-router-dom';
import {
  ShieldExclamationIcon,
  BoltIcon,
  AcademicCapIcon,
  CpuChipIcon,
  ClockIcon,
  ArrowsRightLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import { aiIntegrationService, type IntegrationStatus } from '../../ai-integration/aiIntegration.service';

interface AISubsystem {
  id: string;
  label: string;
  path: string;
  icon: typeof BoltIcon;
  connected: boolean;
  detail?: string;
}

export function AIStatusOverview() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await aiIntegrationService.getStatus();
        if (!cancelled) setStatus(result);
      } catch {
        // Silent fail — dashboard should still work without AI integration
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const subsystems: AISubsystem[] = [
    {
      id: 'self-learning',
      label: 'Self-Learning',
      path: '/self-learning',
      icon: AcademicCapIcon,
      connected: status?.selfLearningConnected ?? false,
      detail: status?.selfLearningHasData ? 'Has data' : 'Learning...',
    },
    {
      id: 'workload',
      label: 'Workload',
      path: '/workload',
      icon: CpuChipIcon,
      connected: status?.workloadConnected ?? false,
      detail: status?.workloadMode ? status.workloadMode : undefined,
    },
    {
      id: 'auto-care',
      label: 'Auto-Care',
      path: '/auto-care',
      icon: ClockIcon,
      connected: status?.autoCareConnected ?? false,
    },
    {
      id: 'anomaly',
      label: 'Anomaly Detection',
      path: '/anomaly',
      icon: ShieldExclamationIcon,
      connected: status?.anomalyConnected ?? false,
      detail: status?.anomalyActiveCount && status.anomalyActiveCount > 0
        ? `${status.anomalyActiveCount} active`
        : undefined,
    },
    {
      id: 'smart-notif',
      label: 'Smart Alerts',
      path: '/smart-notifications',
      icon: BoltIcon,
      connected: status?.smartNotificationsConnected ?? false,
    },
    {
      id: 'integration',
      label: 'AI Hub',
      path: '/ai-integration',
      icon: ArrowsRightLeftIcon,
      connected: (status?.activeIntegrations ?? 0) > 0,
      detail: status ? `${status.activeIntegrations}/${status.totalIntegrations}` : undefined,
    },
  ];

  return (
    <Card variant="glass" className="p-4" data-testid="dashboard-ai-overview">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BoltIcon className="h-5 w-5 text-brand-primary" />
          <span className="text-small font-semibold text-text-primary">AI Subsystems</span>
        </div>
        <button
          onClick={() => navigate('/ai-integration')}
          className="flex items-center gap-1 text-caption text-brand-primary hover:text-brand-primary/80 transition-colors"
          data-testid="dashboard-ai-hub-link"
        >
          View Hub
          <ArrowRightIcon className="h-3 w-3" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {subsystems.map((sub) => {
          const Icon = sub.icon;
          return (
            <button
              key={sub.id}
              onClick={() => navigate(sub.path)}
              className="flex items-center gap-2 rounded-[var(--avs-radius-sm)] bg-surface-muted p-2 hover:bg-surface hover:border-brand-primary/30 border border-transparent transition-all text-left"
              data-testid={`dashboard-ai-${sub.id}`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${sub.connected ? 'text-semantic-success' : 'text-text-muted'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-caption font-medium text-text-primary truncate">{sub.label}</div>
                {sub.detail && (
                  <div className="text-xs text-text-muted truncate">{sub.detail}</div>
                )}
              </div>
              {sub.connected ? (
                <CheckCircleIcon className="h-3 w-3 text-semantic-success shrink-0" />
              ) : (
                <XCircleIcon className="h-3 w-3 text-text-muted shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
