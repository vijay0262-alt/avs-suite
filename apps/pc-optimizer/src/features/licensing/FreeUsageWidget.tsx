/**
 * FreeUsageWidget — transparent usage tracker for Free edition users.
 *
 * Shows remaining limits for AVS AI Assistant, Smart Optimize, Junk Cleaner,
 * Registry Cleaner, and Predictive Health forecast.
 *
 * In Professional edition, renders nothing — Pro has unlimited usage.
 *
 * Usage:
 *   <FreeUsageWidget />   // Place on Dashboard or Settings
 */
import { useIsPro } from '../sync/syncStore';
import { useEditionLimits } from './editionLimits';
import { Card } from '@avs/ui';
import {
  SparklesIcon,
  BoltIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import type { ComponentType } from 'react';

interface UsageRowProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  current: number;
  max: number | null;
  unit?: string;
}

function UsageRow({ icon: Icon, label, current, max, unit }: UsageRowProps) {
  if (max === null) return null; // unlimited, don't show

  const percent = Math.min(100, (current / max) * 100);
  const remaining = Math.max(0, max - current);
  const isLow = remaining <= max * 0.2;

  return (
    <div className="space-y-1.5" data-testid={`usage-row-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-text-muted" />
          <span className="text-caption font-medium text-text-secondary">{label}</span>
        </div>
        <span className={`text-caption tabular-nums ${isLow ? 'text-semantic-warning font-medium' : 'text-text-muted'}`}>
          {current} / {max}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--avs-surface-muted)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isLow ? 'bg-semantic-warning' : 'bg-brand-primary'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function FreeUsageWidget() {
  const isPro = useIsPro();
  const limits = useEditionLimits();

  // Don't render for Professional users
  if (isPro) return null;

  // Read current usage from localStorage
  const getAIAssistantUsage = (): number => {
    try {
      const raw = localStorage.getItem('avs-AIAssistant-questions');
      if (!raw) return 0;
      const data = JSON.parse(raw) as { date: string; count: number };
      const today = new Date().toISOString().split('T')[0];
      if (data.date !== today) return 0;
      return data.count;
    } catch {
      return 0;
    }
  };

  const aiAssistantUsed = getAIAssistantUsage();
  const aiAssistantMax = limits.getLimit('aiAssistantQuestionsPerDay') ?? 0;

  const smartOptMax = limits.getLimit('aiSmartOptimizePerRun') ?? 0;

  const junkMax = limits.getLimit('junkCleanerBytesPerRun') ?? 0;
  const junkMaxMB = Math.round(junkMax / (1024 * 1024));

  const registryMax = limits.getLimit('registryCleanerIssuesPerRun') ?? 0;

  const forecastMax = limits.getLimit('predictiveHealthForecastDays') ?? 0;

  return (
    <Card title="Today's Usage" variant="glass" data-testid="free-usage-widget">
      <div className="space-y-4">
        <p className="text-caption text-text-muted">
          You&apos;re using the Free edition. Here&apos;s what&apos;s remaining today.
        </p>

        <UsageRow
          icon={SparklesIcon}
          label="AVS AI Assistant"
          current={aiAssistantUsed}
          max={aiAssistantMax}
          unit="questions"
        />

        <UsageRow
          icon={BoltIcon}
          label="Smart Optimization"
          current={0}
          max={smartOptMax}
          unit="per run"
        />

        <UsageRow
          icon={TrashIcon}
          label="Junk Cleaner"
          current={0}
          max={junkMaxMB}
          unit="MB"
        />

        <UsageRow
          icon={WrenchScrewdriverIcon}
          label="Registry Repair"
          current={0}
          max={registryMax}
          unit="fixes"
        />

        {/* Forecast — not a usage counter, just a limit indicator */}
        <div className="space-y-1.5 pt-3 border-t border-[var(--avs-border)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowTrendingUpIcon className="h-4 w-4 text-text-muted" />
              <span className="text-caption font-medium text-text-secondary">Predictive Health Forecast</span>
            </div>
            <span className="text-caption text-text-muted">{forecastMax} days</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t border-[var(--avs-border)]">
          <ClockIcon className="h-3.5 w-3.5 text-text-muted" />
          <span className="text-caption text-text-muted">Limits reset daily at midnight</span>
        </div>
      </div>
    </Card>
  );
}
