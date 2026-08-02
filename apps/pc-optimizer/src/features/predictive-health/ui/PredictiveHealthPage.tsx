import { useEffect, useMemo, useCallback } from 'react';
import { Card, Badge, Button, StatCard, DashboardSection } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../../components/PageHeader';
import { HelpButton } from '../../../components/HelpButton';
import { ModuleErrorState, ModuleLoadingState } from '../../../components/ModuleStates';
import { PredictiveHealthViewModel } from './PredictiveHealthViewModel';
import type { Prediction, PredictionNotification } from '../types';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  HeartIcon,
  ChartBarIcon,
  CheckCircleIcon,
  BoltIcon,
} from '@heroicons/react/24/outline';

export default function PredictiveHealthPage() {
  const vm = useMemo(() => new PredictiveHealthViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleRefresh = useCallback(() => { void vm.refresh(); }, [vm]);

  if (state.bootstrap === 'loading') {
    return (
      <div data-testid="page-predictive-health">
        <PageHeader
          title="Predictive Health"
          description="AI-powered forecasting of future system health"
          actions={<HelpButton text="Predictive Health analyzes historical trends and forecasts future system health issues before they become visible." />}
        />
        <ModuleLoadingState message="Analyzing trends and generating forecasts…" testId="predictive-health-loading" />
      </div>
    );
  }

  if (state.bootstrap === 'error') {
    return (
      <div data-testid="page-predictive-health">
        <PageHeader
          title="Predictive Health"
          description="AI-powered forecasting of future system health"
          actions={<HelpButton text="Predictive Health analyzes historical trends and forecasts future system health issues before they become visible." />}
        />
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="predictive-health-error"
        />
      </div>
    );
  }

  const dashboard = state.dashboard;
  const predictions = state.predictions;
  const notifications = state.notifications;

  return (
    <div data-testid="page-predictive-health" className="space-y-6">
      <PageHeader
        title="Predictive Health"
        description="AI-powered forecasting of future system health"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              leftIcon={<ArrowPathIcon className="h-4 w-4" />}
              data-testid="btn-predictive-refresh"
            >
              Refresh
            </Button>
            <HelpButton text="Predictive Health analyzes historical trends and forecasts future system health issues before they become visible." />
          </div>
        }
      />

      {dashboard && (
        <>
          <DashboardSection>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="predictive-summary-bar">
              <StatCard
                label="Total Predictions"
                value={dashboard.summary.totalPredictions}
                icon={<ChartBarIcon className="h-5 w-5" />}
                tone="brand"
                description={`${dashboard.summary.highRiskPredictions} high-risk`}
                progress={Math.min(dashboard.summary.totalPredictions / 20 * 100, 100)}
                data-testid="stat-total-predictions"
              />
              <StatCard
                label="Average Confidence"
                value={`${(dashboard.summary.averageConfidence * 100).toFixed(0)}%`}
                icon={<CheckCircleIcon className="h-5 w-5" />}
                tone={dashboard.summary.averageConfidence >= 0.8 ? 'success' : dashboard.summary.averageConfidence >= 0.5 ? 'warning' : 'danger'}
                description="Based on evidence strength"
                progress={dashboard.summary.averageConfidence * 100}
                data-testid="stat-avg-confidence"
              />
              <StatCard
                label="System Trajectory"
                value={dashboard.summary.systemTrajectory.replace(/_/g, ' ')}
                icon={<HeartIcon className="h-5 w-5" />}
                tone={trajectoryTone(dashboard.summary.systemTrajectory) as 'success' | 'warning' | 'danger' | 'neutral' | 'brand'}
                description={`${dashboard.summary.degradingTrendCount} degrading · ${dashboard.summary.improvingTrendCount} improving`}
                progress={dashboard.summary.improvingTrendCount > 0 ? 75 : 40}
                data-testid="stat-trajectory"
              />
              <StatCard
                label="Next Action"
                value={dashboard.summary.nextActionNeeded ?? 'None'}
                icon={<BoltIcon className="h-5 w-5" />}
                tone="warning"
                description="Recommended preventive action"
                progress={50}
                data-testid="stat-next-action"
              />
            </div>
          </DashboardSection>

          {notifications.length > 0 && (
            <Card title="Active Notifications" variant="glass" data-testid="predictive-notifications">
              <div className="space-y-3">
                {notifications.map((notif) => (
                  <NotificationRow
                    key={notif.id}
                    notification={notif}
                    onDismiss={() => vm.dismissNotification(notif.id)}
                  />
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dashboard.upcomingRisks.length > 0 && (
              <Card title="Upcoming Risks" variant="glass" data-testid="predictive-upcoming-risks">
                <div className="space-y-4">
                  {dashboard.upcomingRisks.slice(0, 8).map((entry) => (
                    <div key={entry.id} className="border-l-2 border-semantic-danger pl-4 py-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-text-primary">{entry.title}</span>
                        <div className="flex items-center gap-2">
                          <Badge tone={riskTone(entry.risk)}>{entry.risk}</Badge>
                          <Badge tone={urgencyTone(entry.urgency)}>{entry.urgency}</Badge>
                        </div>
                      </div>
                      <p className="text-sm text-text-secondary">{entry.summary}</p>
                      <div className="flex items-center gap-4 text-xs text-text-muted mt-1">
                        <span>Projected: {entry.projectedValue}</span>
                        {entry.timeToEvent && (
                          <span className="flex items-center gap-1"><ClockIcon className="h-3 w-3" />{entry.timeToEvent}</span>
                        )}
                        <span>Confidence: {(entry.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {dashboard.improvingTrends.length > 0 && (
              <Card title="Improving Trends" variant="glass" data-testid="predictive-improving-trends">
                <div className="space-y-4">
                  {dashboard.improvingTrends.slice(0, 8).map((entry) => (
                    <div key={entry.id} className="border-l-2 border-semantic-success pl-4 py-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-text-primary">{entry.title}</span>
                        <Badge tone="success">{entry.behavior.replace(/_/g, ' ')}</Badge>
                      </div>
                      <p className="text-sm text-text-secondary">{entry.summary}</p>
                      <div className="flex items-center gap-4 text-xs text-text-muted mt-1">
                        <span>Projected: {entry.projectedValue}</span>
                        <span>Confidence: {(entry.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {predictions.length > 0 && (
            <Card title="All Predictions" variant="glass" data-testid="predictive-all-predictions">
              <div className="space-y-4">
                {predictions.slice(0, 15).map((pred) => (
                  <PredictionRow key={pred.id} prediction={pred} />
                ))}
              </div>
            </Card>
          )}

          {dashboard.healthForecast && (
            <Card title="Health Score Forecast" variant="glass" data-testid="predictive-health-forecast">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Projected Health Score</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">{dashboard.healthForecast.projectedHealthScore.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Trend</p>
                  <p className="text-sm text-text-primary mt-1">
                    <Badge tone={trajectoryTone(dashboard.healthForecast.healthScoreTrend)}>
                      {dashboard.healthForecast.healthScoreTrend.replace(/_/g, ' ')}
                    </Badge>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Time to Threshold</p>
                  <p className="text-sm text-text-primary mt-1">
                    {dashboard.healthForecast.estimatedTimeToThreshold
                      ? `${Math.round(dashboard.healthForecast.estimatedTimeToThreshold / (24 * 60 * 60 * 1000))} days`
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {dashboard.storageForecast && (
            <Card title="Storage Forecast" variant="glass" data-testid="predictive-storage-forecast">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-text-muted">Projected Free Space</p>
                  <p className="text-2xl font-bold text-text-primary mt-1">
                    {(dashboard.storageForecast.projectedFreeSpaceMB / 1024).toFixed(1)} GB
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Growth Rate</p>
                  <p className="text-sm text-text-primary mt-1">
                    {dashboard.storageForecast.growthRateMBPerDay.toFixed(0)} MB/day
                  </p>
                </div>
                <div>
                  <p className="text-xs text-text-muted">Time to Full</p>
                  <p className="text-sm text-text-primary mt-1">
                    {dashboard.storageForecast.estimatedTimeToFull
                      ? `${Math.round(dashboard.storageForecast.estimatedTimeToFull / (24 * 60 * 60 * 1000))} days`
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {!dashboard && (
        <Card variant="glass">
          <div className="py-8 text-center text-sm text-text-secondary">
            No predictions available. Click &quot;Refresh&quot; to generate forecasts.
          </div>
        </Card>
      )}
    </div>
  );
}

function NotificationRow({ notification, onDismiss }: { notification: PredictionNotification; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3">
      <ExclamationTriangleIcon className={`h-5 w-5 shrink-0 ${notification.risk === 'severe' || notification.risk === 'high' ? 'text-semantic-danger' : 'text-semantic-warning'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary">{notification.title}</span>
          <div className="flex items-center gap-2">
            <Badge tone={riskTone(notification.risk)}>{notification.risk}</Badge>
            <button
              onClick={onDismiss}
              className="text-xs text-text-muted hover:text-text-primary"
              data-testid={`btn-dismiss-${notification.id}`}
            >
              Dismiss
            </button>
          </div>
        </div>
        <p className="text-xs text-text-secondary mt-0.5">{notification.message}</p>
      </div>
    </div>
  );
}

function PredictionRow({ prediction }: { prediction: Prediction }) {
  return (
    <div className="border-l-2 border-[var(--avs-border)] pl-4 py-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-text-primary">{prediction.title}</span>
        <div className="flex items-center gap-2">
          <Badge tone={riskTone(prediction.risk)}>{prediction.risk}</Badge>
          <Badge tone={confidenceTone(prediction.confidenceLabel)}>{prediction.confidenceLabel.replace(/_/g, ' ')}</Badge>
        </div>
      </div>
      <p className="text-sm text-text-secondary mb-1">{prediction.summary}</p>
      {prediction.explanation && (
        <div className="text-xs text-text-muted mt-2 space-y-1">
          <p><strong>Why:</strong> {prediction.explanation.why}</p>
          <p><strong>What to do:</strong> {prediction.explanation.whatUserShouldDo}</p>
          <p><strong>If ignored:</strong> {prediction.explanation.whatHappensIfIgnored}</p>
        </div>
      )}
      {prediction.recommendation && (
        <p className="text-xs text-brand-primary mt-1 font-medium">→ {prediction.recommendation.action}</p>
      )}
    </div>
  );
}

function riskTone(risk: string): BadgeTone {
  switch (risk) {
    case 'severe': return 'danger';
    case 'high': return 'danger';
    case 'moderate': return 'warning';
    case 'low': return 'brand';
    default: return 'success';
  }
}

function urgencyTone(urgency: string): BadgeTone {
  switch (urgency) {
    case 'immediate': return 'danger';
    case 'soon': return 'warning';
    case 'scheduled': return 'brand';
    case 'monitoring': return 'neutral';
    default: return 'neutral';
  }
}

function trajectoryTone(behavior: string): BadgeTone {
  switch (behavior) {
    case 'improving': return 'success';
    case 'stable': return 'success';
    case 'gradual_degradation': return 'warning';
    case 'rapid_degradation': return 'danger';
    case 'resource_exhaustion': return 'danger';
    case 'storage_growth': return 'warning';
    case 'battery_wear': return 'warning';
    case 'temperature_increase': return 'warning';
    case 'abnormal': return 'danger';
    case 'repeated_failures': return 'danger';
    default: return 'neutral';
  }
}

function confidenceTone(label: string): BadgeTone {
  switch (label) {
    case 'very_high': return 'success';
    case 'high': return 'success';
    case 'medium': return 'brand';
    case 'low': return 'warning';
    default: return 'neutral';
  }
}
