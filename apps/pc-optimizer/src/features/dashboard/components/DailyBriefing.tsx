import React from 'react';
import { Card } from '@avs/ui';
import { useNavigate } from 'react-router-dom';
import {
  SparklesIcon,
  ShieldExclamationIcon,
  CircleStackIcon,
  HeartIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export interface DailyBriefingProps {
  healthScore: number | null;
  issuesCount: number;
  securityStatus: string | null;
  processCount: number | null;
  predictionRisk: string | null;
}

interface BriefingItem {
  icon: typeof SparklesIcon;
  iconColor: string;
  title: string;
  detail: string;
  actionPath?: string;
  actionLabel?: string;
  severity: 'success' | 'warning' | 'info';
}

export const DailyBriefing = React.memo(function DailyBriefing({
  healthScore,
  issuesCount,
  securityStatus,
  processCount,
  predictionRisk,
}: DailyBriefingProps) {
  const navigate = useNavigate();

  const items: BriefingItem[] = [];

  if (healthScore !== null) {
    if (healthScore >= 80) {
      items.push({
        icon: CheckCircleIcon,
        iconColor: 'text-semantic-success',
        title: 'System Health is Excellent',
        detail: `Your PC health score is ${healthScore}/100. No critical issues detected.`,
        severity: 'success',
      });
    } else if (healthScore >= 60) {
      items.push({
        icon: ExclamationTriangleIcon,
        iconColor: 'text-semantic-warning',
        title: 'System Health is Good',
        detail: `Health score is ${healthScore}/100. ${issuesCount} issue${issuesCount !== 1 ? 's' : ''} found that could be optimized.`,
        actionPath: '/dashboard',
        actionLabel: 'Optimize Now',
        severity: 'warning',
      });
    } else {
      items.push({
        icon: ExclamationTriangleIcon,
        iconColor: 'text-semantic-danger',
        title: 'System Health Needs Attention',
        detail: `Health score is ${healthScore}/100. ${issuesCount} issue${issuesCount !== 1 ? 's' : ''} detected. AI Smart Optimize recommended.`,
        actionPath: '/dashboard',
        actionLabel: 'Run AI Smart Optimize',
        severity: 'warning',
      });
    }
  }

  if (securityStatus) {
    items.push({
      icon: ShieldExclamationIcon,
      iconColor: 'text-semantic-success',
      title: 'AI Active Protection is Running',
      detail: `Real-time protection: ${securityStatus}. Your system is being monitored.`,
      actionPath: '/security-dashboard',
      actionLabel: 'View Dashboard',
      severity: 'success',
    });
  }

  if (processCount !== null) {
    items.push({
      icon: CircleStackIcon,
      iconColor: 'text-semantic-info',
      title: `${processCount} Processes Analyzed`,
      detail: 'AI Process Intelligence is monitoring all running processes for resource impact and security risks.',
      actionPath: '/process-intelligence',
      actionLabel: 'View Insights',
      severity: 'info',
    });
  }

  if (predictionRisk) {
    const isRisk = predictionRisk !== 'none' && predictionRisk !== 'low';
    items.push({
      icon: isRisk ? ExclamationTriangleIcon : HeartIcon,
      iconColor: isRisk ? 'text-semantic-warning' : 'text-semantic-success',
      title: isRisk ? 'Predictive Health: Trends Detected' : 'Predictive Health: All Clear',
      detail: isRisk
        ? `AI Predictive Health detected ${predictionRisk} risk trends. Preventive action recommended.`
        : 'No degrading trends detected. Your system health trajectory is stable.',
      actionPath: '/predictive-health',
      actionLabel: 'View Forecasts',
      severity: isRisk ? 'warning' : 'success',
    });
  }

  if (items.length === 0) {
    items.push({
      icon: SparklesIcon,
      iconColor: 'text-brand-primary',
      title: 'Welcome to AVS Shield',
      detail: 'AI-powered PC health and security monitoring is initializing. Your dashboard will populate shortly.',
      severity: 'info',
    });
  }

  return (
    <Card title="AI Daily Briefing" data-testid="daily-briefing">
      <div className="space-y-3">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-3 p-3 rounded-lg bg-surface-muted/50 hover:bg-surface-muted transition-colors"
            data-testid={`briefing-item-${i}`}
          >
            <div className="shrink-0">
              <item.icon className={`h-5 w-5 ${item.iconColor}`} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary">{item.title}</div>
              <div className="text-xs text-text-secondary mt-0.5">{item.detail}</div>
            </div>
            {item.actionPath && item.actionLabel && (
              <button
                onClick={() => navigate(item.actionPath!)}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:text-brand-primary/80 transition-colors"
                data-testid={`briefing-action-${i}`}
              >
                {item.actionLabel}
                <ArrowRightIcon className="h-3 w-3" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
});
