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
import { useIsPro } from '../../sync/syncStore';

interface AISubsystem {
  id: string;
  label: string;
  path: string;
  icon: typeof BoltIcon;
  connected: boolean;
  detail?: string;
  /** True when the subsystem requires the Professional edition. */
  proOnly?: boolean;
}

export function AIStatusOverview() {
  const navigate = useNavigate();
  const isPro = useIsPro();
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

  // Free edition: pro-gated subsystems are shown as off. Workload detection
  // stays live (view-only in free); the AI Hub count only reflects the
  // subsystems actually available in this edition.
  const freeActive = (status?.workloadConnected ?? false) ? 1 : 0;

  const subsystems: AISubsystem[] = [
    {
      id: 'self-learning',
      label: 'Self-Learning',
      path: '/self-learning',
      icon: AcademicCapIcon,
      connected: status?.selfLearningConnected ?? false,
      detail: status?.selfLearningHasData ? 'Has data' : 'Learning...',
      proOnly: true,
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
      proOnly: true,
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
      proOnly: true,
    },
    {
      id: 'smart-notif',
      label: 'Smart Alerts',
      path: '/smart-notifications',
      icon: BoltIcon,
      connected: status?.smartNotificationsConnected ?? false,
      proOnly: true,
    },
    {
      id: 'integration',
      label: 'AI Hub',
      path: '/ai-integration',
      icon: ArrowsRightLeftIcon,
      connected: isPro ? (status?.activeIntegrations ?? 0) > 0 : freeActive > 0,
      detail: status
        ? isPro
          ? `${status.activeIntegrations}/${status.totalIntegrations}`
          : `${freeActive}/${status.totalIntegrations}`
        : undefined,
    },
  ];

  // In the free edition, pro-only subsystems render as off with a "Pro" hint.
  const visible = subsystems.map((sub) =>
    !isPro && sub.proOnly
      ? { ...sub, connected: false, detail: 'Pro' }
      : sub,
  );

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
        {visible.map((sub) => {
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
