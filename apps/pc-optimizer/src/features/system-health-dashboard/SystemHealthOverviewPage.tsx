/**
 * SystemHealthOverviewPage — standalone system health overview.
 *
 * Uses the HealthDashboardService to show:
 *   - Overall health score with letter grade
 *   - Category cards (CPU, Memory, Storage, Startup, Privacy, etc.)
 *   - Real-time status (CPU, memory, processes, startup programs)
 *   - Active alerts
 *   - Health timeline
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleLoadingState, ModuleEmptyState } from '../../components/ModuleStates';
import { HealthDashboardService } from '../system-health-dashboard/healthDashboardService';
import type { DashboardState, DashboardAlert } from '../system-health-dashboard/types';
import {
  HeartIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CpuChipIcon,
  CircleStackIcon,
  RocketLaunchIcon,
  ClockIcon,
  ShieldCheckIcon,
  FireIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

interface SystemHealthState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  dashboardState: DashboardState | null;
  error: string | null;
}

class SystemHealthViewModel extends ViewModel<SystemHealthState> {
  private service: HealthDashboardService;

  constructor() {
    super({
      bootstrap: 'idle',
      dashboardState: null,
      error: null,
    });
    this.service = new HealthDashboardService();
  }

  async bootstrap() {
    this.setState({ bootstrap: 'loading', error: null });
    try {
      this.service.init();
      await this.service.refreshHealth();
      this.setState({ bootstrap: 'ready', dashboardState: this.service.getState() });
    } catch (e) {
      this.setState({
        bootstrap: 'error',
        error: e instanceof Error ? e.message : 'Failed to load system health',
      });
    }
  }

  async refresh() {
    try {
      await this.service.refreshHealth();
      this.setState({ dashboardState: this.service.getState() });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Refresh failed' });
    }
  }

  dismissAlert(alertId: string) {
    this.service.dismissAlert(alertId);
    this.setState({ dashboardState: this.service.getState() });
  }

  setTimelineRange(range: 'today' | '7days' | '30days') {
    this.service.setTimelineRange(range);
    this.setState({ dashboardState: this.service.getState() });
  }

  override dispose() {
    this.service.shutdown();
    super.dispose();
  }
}

export default function SystemHealthOverviewPage() {
  const vm = useMemo(() => new SystemHealthViewModel(), []);
  const state = useViewModel(vm);
  const navigate = useNavigate();
  const [range, setRange] = useState<'today' | '7days' | '30days'>('7days');

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  useEffect(() => {
    vm.setTimelineRange(range);
  }, [range, vm]);

  const ds = state.dashboardState;

  if (state.bootstrap === 'loading') {
    return (
      <div className="p-6">
        <PageHeader title="System Health Overview" description="Complete system health at a glance" />
        <ModuleLoadingState message="Analyzing system health..." />
      </div>
    );
  }

  if (state.bootstrap === 'error') {
    return (
      <div className="p-6">
        <PageHeader title="System Health Overview" description="Complete system health at a glance" />
        <Card variant="glass">
          <div className="flex items-center gap-2 text-sm text-[var(--avs-danger)]">
            <ExclamationTriangleIcon className="h-4 w-4" />
            {state.error}
          </div>
          <Button className="mt-3" size="sm" onClick={() => vm.bootstrap()}>Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Health Overview"
        description="Complete system health at a glance — AI-powered analysis with evidence-based recommendations"
        actions={
          <Button size="sm" variant="secondary" onClick={() => vm.refresh()} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
            Refresh
          </Button>
        }
      />

      {/* Health Score */}
      {ds?.healthScorePanel && (
        <Card variant="glass">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <div className="relative h-24 w-24">
                <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="var(--avs-surface-muted)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="45" fill="none"
                    stroke={ds.healthScorePanel.overallScore >= 80 ? 'var(--avs-success)' : ds.healthScorePanel.overallScore >= 60 ? 'var(--avs-warning)' : 'var(--avs-danger)'}
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(ds.healthScorePanel.overallScore / 100) * 283} 283`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-[var(--avs-text-primary)]">{ds.healthScorePanel.overallScore}</span>
                  <span className="text-xs text-[var(--avs-text-muted)]">{ds.healthScorePanel.letterGrade}</span>
                </div>
              </div>
              <span className="mt-1 text-xs text-[var(--avs-text-muted)]">{ds.healthScorePanel.healthLevel}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <HeartIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
                <span className="text-sm font-semibold text-[var(--avs-text-primary)]">Overall Health</span>
                {ds.healthScorePanel.scoreChange !== null && (
                  <div className="flex items-center gap-1">
                    {ds.healthScorePanel.scoreChange > 0 ? (
                      <ArrowTrendingUpIcon className="h-4 w-4 text-[var(--avs-success)]" />
                    ) : (
                      <ArrowTrendingDownIcon className="h-4 w-4 text-[var(--avs-danger)]" />
                    )}
                    <span className={`text-xs font-medium ${ds.healthScorePanel.scoreChange > 0 ? 'text-[var(--avs-success)]' : 'text-[var(--avs-danger)]'}`}>
                      {ds.healthScorePanel.scoreChange > 0 ? '+' : ''}{ds.healthScorePanel.scoreChange}
                    </span>
                  </div>
                )}
              </div>
              {ds.healthScorePanel.lastAnalysisTime && (
                <p className="mt-1 text-xs text-[var(--avs-text-muted)]">
                  Last analyzed: {new Date(ds.healthScorePanel.lastAnalysisTime).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Category Cards */}
      {ds?.categoryCards && ds.categoryCards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ds.categoryCards.map((card) => {
            const icon = card.categoryId === 'startup' ? RocketLaunchIcon
              : card.categoryId === 'storage' ? CircleStackIcon
              : card.categoryId === 'privacy' ? ShieldCheckIcon
              : card.categoryId === 'temp_files' ? FireIcon
              : CpuChipIcon;
            const Icon = icon;
            const tone = card.score >= 80 ? 'success' : card.score >= 60 ? 'warning' : 'danger';
            return (
              <Card key={card.categoryId} variant="glass">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-[var(--avs-text-secondary)]" />
                    <span className="text-sm font-medium text-[var(--avs-text-primary)]">{card.categoryName}</span>
                  </div>
                  <Badge tone={tone}>{card.score}/100</Badge>
                </div>
                {card.issues.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {card.issues.slice(0, 3).map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-[var(--avs-text-secondary)]">
                        <ExclamationTriangleIcon className="h-3 w-3 text-[var(--avs-warning)]" />
                        {issue.title}
                        {issue.autoFixable && <Badge tone="brand">Auto-fixable</Badge>}
                      </div>
                    ))}
                  </div>
                )}
                {card.quickRecommendation && (
                  <p className="mt-3 text-xs text-[var(--avs-text-muted)]">{card.quickRecommendation}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Real-time Status */}
      {ds?.realTimeStatus && (
        <Card title="Real-Time Status" variant="glass">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[var(--avs-text-muted)]">CPU Usage</p>
              <p className="text-xl font-bold text-[var(--avs-text-primary)]">{ds.realTimeStatus.cpuUsage.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-[var(--avs-text-muted)]">Memory Usage</p>
              <p className="text-xl font-bold text-[var(--avs-text-primary)]">{ds.realTimeStatus.memoryUsage.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-[var(--avs-text-muted)]">Processes</p>
              <p className="text-xl font-bold text-[var(--avs-text-primary)]">{ds.realTimeStatus.backgroundProcesses}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--avs-text-muted)]">Startup Programs</p>
              <p className="text-xl font-bold text-[var(--avs-text-primary)]">{ds.realTimeStatus.startupPrograms}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Active Alerts */}
      {ds?.alerts && ds.alerts.length > 0 && (
        <Card title="Active Alerts" variant="glass">
          <div className="space-y-2">
            {ds.alerts.filter((a: DashboardAlert) => !a.dismissed).map((alert: DashboardAlert) => (
              <div key={alert.id} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3">
                <ExclamationTriangleIcon className={`h-5 w-5 ${alert.severity === 'critical' ? 'text-[var(--avs-danger)]' : alert.severity === 'warning' ? 'text-[var(--avs-warning)]' : 'text-[var(--avs-info)]'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--avs-text-primary)]">{alert.title}</p>
                  <p className="text-xs text-[var(--avs-text-secondary)]">{alert.description}</p>
                </div>
                {alert.actionPath && alert.actionLabel && (
                  <Button size="sm" variant="secondary" onClick={() => navigate(alert.actionPath!)}>{alert.actionLabel}</Button>
                )}
                <button onClick={() => vm.dismissAlert(alert.id)} className="text-[var(--avs-text-muted)] hover:text-[var(--avs-text-primary)]">
                  <ClockIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Timeline */}
      {ds?.timeline && ds.timeline.length > 0 && (
        <Card title="Health Timeline" variant="glass">
          <div className="flex gap-2 mb-3">
            {(['today', '7days', '30days'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-[var(--avs-radius-sm)] px-3 py-1 text-xs font-medium ${range === r ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)]' : 'text-[var(--avs-text-secondary)]'}`}
              >
                {r === 'today' ? '24 Hours' : r === '7days' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {ds.timeline.slice(0, 10).map((entry, i) => (
              <div key={i} className="flex items-center gap-3 text-xs text-[var(--avs-text-secondary)]">
                <ClockIcon className="h-3 w-3 text-[var(--avs-text-muted)]" />
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
                <span className="font-medium text-[var(--avs-text-primary)]">{entry.title}</span>
                {entry.score !== null && <Badge tone="neutral">Score: {entry.score}</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {(!ds || (!ds.healthScorePanel && !ds.categoryCards.length)) && (
        <ModuleEmptyState icon={HeartIcon} title="No health data available" message="Run a health scan to see your system health overview." />
      )}
    </div>
  );
}
