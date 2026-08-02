import { useEffect, useMemo, useCallback } from 'react';
import { Card, Badge, Button, StatTile } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../../components/PageHeader';
import { HelpButton } from '../../../components/HelpButton';
import { ModuleErrorState, ModuleLoadingState } from '../../../components/ModuleStates';
import { ProcessIntelligenceViewModel } from './ProcessIntelligenceViewModel';
import type { ProcessInsight, ProcessRecommendation } from '../types';
import {
  CpuChipIcon,
  CircleStackIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

export default function ProcessIntelligencePage() {
  const vm = useMemo(() => new ProcessIntelligenceViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleScan = useCallback(() => { void vm.scan(); }, [vm]);

  if (state.bootstrap === 'loading') {
    return (
      <div data-testid="page-process-intelligence">
        <PageHeader
          title="Process Intelligence"
          description="AI-powered analysis of every running process"
          actions={<HelpButton text="Process Intelligence analyzes running processes and explains their impact on system health, performance, and security." />}
        />
        <ModuleLoadingState message="Initializing process scan…" testId="process-intelligence-loading" />
      </div>
    );
  }

  if (state.bootstrap === 'error') {
    return (
      <div data-testid="page-process-intelligence">
        <PageHeader
          title="Process Intelligence"
          description="AI-powered analysis of every running process"
          actions={<HelpButton text="Process Intelligence analyzes running processes and explains their impact on system health, performance, and security." />}
        />
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="process-intelligence-error"
        />
      </div>
    );
  }

  const report = state.report;
  const dashboard = report?.dashboard;
  const insights = report?.insights ?? [];
  const recommendations = report?.recommendations ?? [];
  const risk = report?.riskAssessment;

  return (
    <div data-testid="page-process-intelligence" className="space-y-6">
      <PageHeader
        title="Process Intelligence"
        description="AI-powered analysis of every running process"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleScan}
              disabled={state.isScanning}
              leftIcon={<ArrowPathIcon className={`h-4 w-4 ${state.isScanning ? 'animate-spin' : ''}`} />}
              data-testid="btn-process-scan"
            >
              {state.isScanning ? 'Scanning…' : 'Scan Now'}
            </Button>
            <HelpButton text="Process Intelligence analyzes running processes and explains their impact on system health, performance, and security." />
          </div>
        }
      />

      {dashboard && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="process-summary-bar">
            <StatTile
              label="Total Processes"
              value={dashboard.summary.totalProcesses}
              hint={`${dashboard.summary.userProcessCount} user · ${dashboard.summary.systemProcessCount} system`}
              data-testid="stat-total-processes"
            />
            <StatTile
              label="CPU Usage"
              value={`${dashboard.summary.totalCpuUsagePercent.toFixed(1)}%`}
              hint={`${dashboard.summary.highImpactCount} high-impact processes`}
              data-testid="stat-cpu-usage"
            />
            <StatTile
              label="Memory Usage"
              value={`${(dashboard.summary.totalMemoryMB / 1024).toFixed(1)} GB`}
              hint={`${dashboard.summary.backgroundProcessCount} background`}
              data-testid="stat-memory-usage"
            />
            <StatTile
              label="Risk Level"
              value={
                <Badge tone={riskTone(risk?.overallRisk)}>
                  {risk?.overallRisk ?? 'none'}
                </Badge>
              }
              hint={risk?.overallUrgency ? `Urgency: ${risk.overallUrgency}` : undefined}
              data-testid="stat-risk-level"
            />
          </div>

          {report.systemExplanation && (
            <Card data-testid="process-system-summary">
              <div className="flex items-start gap-3">
                <InformationCircleIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-1">System Summary</h3>
                  <p className="text-sm text-text-secondary">{report.systemExplanation}</p>
                </div>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {dashboard.topConsumers.length > 0 && (
              <Card title="Top Resource Consumers" data-testid="process-top-consumers">
                <div className="space-y-3">
                  {dashboard.topConsumers.slice(0, 8).map((entry) => (
                    <div key={entry.pid} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-text-primary truncate">{entry.displayName}</span>
                          <Badge tone={impactTone(entry.impactLevel)}>{entry.impactLevel}</Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-text-muted">
                          <span className="flex items-center gap-1"><CpuChipIcon className="h-3 w-3" />{entry.cpuUsagePercent.toFixed(1)}%</span>
                          <span className="flex items-center gap-1"><CircleStackIcon className="h-3 w-3" />{entry.memoryMB} MB</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {dashboard.alerts.length > 0 && (
              <Card title="Active Alerts" data-testid="process-alerts">
                <div className="space-y-3">
                  {dashboard.alerts.map((alert, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <ExclamationTriangleIcon className={`h-5 w-5 shrink-0 ${alert.severity === 'critical' ? 'text-semantic-danger' : alert.severity === 'high' ? 'text-semantic-warning' : 'text-text-muted'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-text-primary">{alert.name}</span>
                          <Badge tone={alert.severity === 'critical' ? 'danger' : alert.severity === 'high' ? 'warning' : 'neutral'}>{alert.severity}</Badge>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {insights.length > 0 && (
            <Card title="AI Insights" data-testid="process-insights">
              <div className="space-y-4">
                {insights.slice(0, 10).map((insight) => (
                  <ProcessInsightRow key={insight.id} insight={insight} />
                ))}
              </div>
            </Card>
          )}

          {recommendations.length > 0 && (
            <Card title="AI Recommendations" data-testid="process-recommendations">
              <div className="space-y-4">
                {recommendations.slice(0, 8).map((rec, i) => (
                  <ProcessRecommendationRow key={i} rec={rec} />
                ))}
              </div>
            </Card>
          )}

          {risk && risk.systemRiskFactors.length > 0 && (
            <Card title="Risk Assessment" data-testid="process-risk-assessment">
              <div className="space-y-3">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">System Risk Factors</h4>
                  <ul className="space-y-1">
                    {risk.systemRiskFactors.map((factor, i) => (
                      <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                        <ExclamationTriangleIcon className="h-4 w-4 text-semantic-warning shrink-0 mt-0.5" />
                        {factor}
                      </li>
                    ))}
                  </ul>
                </div>
                {risk.mitigatingFactors.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">Mitigating Factors</h4>
                    <ul className="space-y-1">
                      {risk.mitigatingFactors.map((factor, i) => (
                        <li key={i} className="text-sm text-text-secondary flex items-start gap-2">
                          <CheckCircleIcon className="h-4 w-4 text-semantic-success shrink-0 mt-0.5" />
                          {factor}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {!dashboard && (
        <Card>
          <div className="py-8 text-center text-sm text-text-secondary">
            No process data available. Click &quot;Scan Now&quot; to analyze running processes.
          </div>
        </Card>
      )}
    </div>
  );
}

function ProcessInsightRow({ insight }: { insight: ProcessInsight }) {
  return (
    <div className="border-l-2 border-border pl-4 py-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-text-primary">{insight.title}</span>
        <div className="flex items-center gap-2">
          <Badge tone={severityTone(insight.severity)}>{insight.severity}</Badge>
          <Badge tone={confidenceTone(insight.confidenceLabel)}>{insight.confidenceLabel}</Badge>
        </div>
      </div>
      <p className="text-sm text-text-secondary mb-1">{insight.summary}</p>
      {insight.explanation && (
        <p className="text-xs text-text-muted mt-1">{insight.explanation}</p>
      )}
      {insight.recommendation && (
        <p className="text-xs text-brand-primary mt-1 font-medium">→ {insight.recommendation}</p>
      )}
    </div>
  );
}

function ProcessRecommendationRow({ rec }: { rec: ProcessRecommendation }) {
  return (
    <div className="border-l-2 border-brand-primary pl-4 py-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-sm font-semibold text-text-primary">{rec.title}</span>
        <Badge tone={priorityTone(rec.priority)}>{rec.priority}</Badge>
      </div>
      <p className="text-sm text-text-secondary mb-1">{rec.reason}</p>
      <div className="flex items-center gap-4 text-xs text-text-muted mt-1">
        <span>Expected: {rec.expectedImprovement}</span>
        <span>Risk: {rec.risk}</span>
        <span>Confidence: {(rec.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function riskTone(risk?: string): BadgeTone {
  switch (risk) {
    case 'critical': return 'danger';
    case 'high': return 'danger';
    case 'moderate': return 'warning';
    case 'low': return 'brand';
    default: return 'success';
  }
}

function impactTone(level: string): BadgeTone {
  switch (level) {
    case 'critical': return 'danger';
    case 'high': return 'danger';
    case 'moderate': return 'warning';
    case 'low': return 'brand';
    case 'minimal': return 'success';
    default: return 'neutral';
  }
}

function severityTone(severity: string): BadgeTone {
  switch (severity) {
    case 'critical': return 'danger';
    case 'high': return 'danger';
    case 'medium': return 'warning';
    case 'low': return 'brand';
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

function priorityTone(priority: string): BadgeTone {
  switch (priority) {
    case 'immediate': return 'danger';
    case 'high': return 'warning';
    case 'medium': return 'brand';
    default: return 'neutral';
  }
}
