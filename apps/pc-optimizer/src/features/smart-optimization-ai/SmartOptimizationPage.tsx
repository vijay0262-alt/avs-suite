/**
 * SmartOptimizationPage — exposes the smart-optimization-ai backend.
 *
 * Shows:
 *   - Dashboard summary (current vs potential health score)
 *   - Optimization plan with actions, risk, benefits, evidence
 *   - Preview before execution
 *   - Simulation results
 *   - AI insights for each action
 *   - Execution history & learning data
 *   - Configuration controls
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState } from '../../components/ModuleStates';
import { useEditionLimits } from '../licensing/editionLimits';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { ProStatusBanner, ProStatusPill, ProOnlySection, ProFeatureIndicator } from '../licensing/ProStatusBadge';
import {
  SmartOptimizationEngine,
  type OptimizationPlan,
  type OptimizationPreview,
  type OptimizationSimulation,
  type OptimizationInsight,
  type OptimizationDashboardData,
  type OptimizationConfiguration,
  type OptimizationReport,
  type RiskLevel,
  type OptimizationImpactTier,
  type SourceFinding,
} from '../smart-optimization-ai';
import { gatherFindings } from '../smart-optimization-ai/findingsGatherer';
import { createExecutionHandler } from '../smart-optimization-ai/executionHandler';
import {
  BoltIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  CpuChipIcon,
  CircleStackIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  LightBulbIcon,
  BeakerIcon,
  CalendarDaysIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

// ── ViewModel ──────────────────────────────────────────────────

interface SmartOptState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  dashboard: OptimizationDashboardData | null;
  plan: OptimizationPlan | null;
  preview: OptimizationPreview | null;
  simulation: OptimizationSimulation | null;
  insights: OptimizationInsight[];
  config: OptimizationConfiguration | null;
  isGenerating: boolean;
  isExecuting: boolean;
  lastReport: OptimizationReport | null;
  selectedActionId: string | null;
  error: string | null;
}

class SmartOptViewModel extends ViewModel<SmartOptState> {
  private engine: SmartOptimizationEngine;

  constructor() {
    super({
      bootstrap: 'idle',
      dashboard: null,
      plan: null,
      preview: null,
      simulation: null,
      insights: [],
      config: null,
      isGenerating: false,
      isExecuting: false,
      lastReport: null,
      selectedActionId: null,
      error: null,
    });
    this.engine = new SmartOptimizationEngine();
    this.engine.setExecutionHandler(createExecutionHandler());
  }

  bootstrap() {
    this.setState({ bootstrap: 'loading' });
    try {
      this.setState({
        dashboard: this.engine.buildDashboard(),
        config: this.engine.getConfiguration(),
        bootstrap: 'ready',
      });
    } catch (e) {
      this.setState({ bootstrap: 'error', error: e instanceof Error ? e.message : 'Failed to initialize' });
    }
  }

  async generatePlan(findings?: SourceFinding[], healthScore?: number) {
    this.setState({ isGenerating: true, error: null });
    try {
      let f = findings;
      let score = healthScore;
      if (!f || f.length === 0) {
        const gathered = await gatherFindings();
        f = gathered.findings;
        score = gathered.healthScore;
      }
      const plan = this.engine.generatePlan(f, score ?? 75);
      const preview = this.engine.preview(plan);
      const insights = this.engine.generateInsights(plan);
      this.setState({ plan, preview, insights, isGenerating: false });
    } catch (e) {
      this.setState({ isGenerating: false, error: e instanceof Error ? e.message : 'Failed to generate plan' });
    }
  }

  runSimulation() {
    const { plan } = this.state;
    if (!plan) return;
    try {
      const sim = this.engine.simulate(plan, {
        cpuUsagePercent: 50,
        memoryUsageMB: 8192,
        diskFreeSpaceMB: 50000,
        startupTimeSeconds: 30,
        browserResponsiveness: 80,
        privacyScore: 70,
        thermalScore: 75,
        batteryEstimateHours: 4,
        stabilityScore: 85,
      });
      this.setState({ simulation: sim });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Simulation failed' });
    }
  }

  async executePlan() {
    const { plan } = this.state;
    if (!plan) return;
    this.setState({ isExecuting: true, error: null });
    try {
      const report = await this.engine.executePlan(plan);
      this.setState({ lastReport: report, isExecuting: false, dashboard: this.engine.buildDashboard() });
    } catch (e) {
      this.setState({ isExecuting: false, error: e instanceof Error ? e.message : 'Execution failed' });
    }
  }

  selectAction(actionId: string | null) {
    this.setState({ selectedActionId: actionId });
  }

  updateConfig(updates: Partial<OptimizationConfiguration>) {
    this.engine.updateConfiguration(updates);
    this.setState({ config: this.engine.getConfiguration() });
  }

  override dispose() {
    super.dispose();
    this.engine.dispose();
  }
}

// ── Helpers ────────────────────────────────────────────────────

const RISK_COLORS: Record<RiskLevel, string> = {
  none: 'text-[var(--avs-success)]',
  low: 'text-[var(--avs-success)]',
  moderate: 'text-[var(--avs-warning)]',
  high: 'text-[var(--avs-danger)]',
  severe: 'text-[var(--avs-danger)]',
};

const _IMPACT_COLORS: Record<OptimizationImpactTier, string> = {
  high: 'text-[var(--avs-success)]',
  medium: 'text-[var(--avs-warning)]',
  low: 'text-[var(--avs-text-muted)]',
  informational: 'text-[var(--avs-text-muted)]',
};

const IMPACT_BADGES: Record<OptimizationImpactTier, 'success' | 'warning' | 'brand' | 'neutral'> = {
  high: 'success',
  medium: 'warning',
  low: 'brand',
  informational: 'neutral',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const m = Math.floor(seconds / 60);
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

// ── Page ───────────────────────────────────────────────────────

export default function SmartOptimizationPage() {
  const vm = useMemo(() => new SmartOptViewModel(), []);
  const state = useViewModel(vm);
  const limits = useEditionLimits();
  const { guard, dialogElement } = useFeatureGuard();

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  if (state.bootstrap === 'loading') {
    return (
      <div className="px-6 py-6">
        <PageHeader title="AI Smart Optimization" description="Evidence-based optimization plans with risk analysis, simulation, and rollback." />
        <ModuleLoadingState />
      </div>
    );
  }

  const s = state;
  const dash = s.dashboard;
  const maxOptimizations = limits.getLimit('aiSmartOptimizePerRun');
  const visibleActions = s.preview ? s.preview.actionsPreview.slice(0, maxOptimizations ?? undefined) : [];
  const hiddenCount = s.preview && maxOptimizations !== null ? Math.max(0, s.preview.actionsPreview.length - maxOptimizations) : 0;

  return (
    <div className="px-6 py-6 space-y-6">
      <ProStatusBanner compact />
      <PageHeader
        title="AI Smart Optimization"
        description="Evidence-based optimization plans with risk analysis, simulation, and rollback."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <Button
              onClick={() => vm.generatePlan()}
              loading={s.isGenerating}
              leftIcon={<BoltIcon className="h-4 w-4" />}
            >
              Generate Plan
            </Button>
          </div>
        }
      />

      {/* Dashboard Summary */}
      {dash && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <StatBox label="Current Score" value={dash.summary.currentHealthScore} icon={ChartBarIcon} />
          <StatBox label="Potential Score" value={dash.summary.potentialHealthScore} icon={ArrowTrendingUpIcon} />
          <StatBox label="Available Actions" value={dash.summary.totalAvailableActions} icon={BoltIcon} />
          <StatBox label="High Impact" value={dash.summary.highImpactActions} icon={ExclamationTriangleIcon} />
          <StatBox label="Est. Recovery" value={`${(dash.summary.estimatedTotalRecoveryMB / 1024).toFixed(1)} GB`} icon={CircleStackIcon} />
          <StatBox label="Est. Duration" value={formatDuration(dash.summary.estimatedDurationSeconds)} icon={ClockIcon} />
        </div>
      )}

      {/* Insights */}
      {s.insights.length > 0 && (
        <Card title="AI Insights" variant="glass">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {s.insights.slice(0, 6).map((insight) => (
              <div key={insight.id} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4">
                <div className="flex items-start gap-2">
                  <LightBulbIcon className="h-5 w-5 text-[var(--avs-brand-primary)] shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--avs-text-primary)]">{insight.title}</p>
                    <p className="text-xs text-[var(--avs-text-secondary)] mt-1">{insight.explanation}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge tone={IMPACT_BADGES[insight.impactTier]}>{insight.impactTier}</Badge>
                      <span className="text-xs text-[var(--avs-text-muted)]">{(insight.confidence * 100).toFixed(0)}% confidence</span>
                    </div>
                    <p className="text-xs text-[var(--avs-text-muted)] mt-2">
                      <span className="font-medium">Why now:</span> {insight.whyNow}
                    </p>
                    <p className="text-xs text-[var(--avs-text-muted)] mt-1">
                      <span className="font-medium">If skipped:</span> {insight.whatHappensIfSkipped}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Plan Preview */}
      {s.preview && (
        <Card title="Plan Preview" variant="glass">
          <div className="space-y-4">
            <p className="text-sm font-medium text-[var(--avs-text-primary)]">{s.preview.headline}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricBox label="Score Improvement" value={`+${s.preview.scoreImprovement}`} icon={ArrowTrendingUpIcon} />
              <MetricBox label="Storage Recovery" value={`${s.preview.estimatedStorageRecoveryMB} MB`} icon={CircleStackIcon} />
              <MetricBox label="RAM Recovery" value={`${s.preview.estimatedRamRecoveryMB} MB`} icon={CpuChipIcon} />
              <MetricBox label="Startup Improvement" value={`${(s.preview.estimatedStartupImprovementMs / 1000).toFixed(1)}s`} icon={ClockIcon} />
            </div>

            {/* Warnings */}
            {s.preview.warnings.length > 0 && (
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-warning)]/10 p-3">
                {s.preview.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[var(--avs-warning)]">
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions Preview */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">
                Actions ({visibleActions.length}{s.preview && maxOptimizations !== null && s.preview.actionsPreview.length > maxOptimizations ? ` of ${s.preview.actionsPreview.length}` : ''})
              </h4>
              {visibleActions.map((action) => (
                <div
                  key={action.id}
                  className={`rounded-[var(--avs-radius-md)] border p-3 cursor-pointer transition-all ${
                    s.selectedActionId === action.id
                      ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]/10'
                      : 'border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)]'
                  }`}
                  onClick={() => vm.selectAction(s.selectedActionId === action.id ? null : action.id)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-[var(--avs-text-primary)]">{action.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={IMPACT_BADGES[action.impactTier]}>{action.impactTier}</Badge>
                      <span className={`text-xs ${RISK_COLORS[action.riskLevel]}`}>{action.riskLevel}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--avs-text-muted)]">
                    <span>{action.estimatedBenefit}</span>
                    <span>{formatDuration(action.estimatedDurationSeconds)}</span>
                    {action.rollbackAvailable && <ShieldCheckIcon className="h-3.5 w-3.5 text-[var(--avs-success)]" />}
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <Button onClick={() => vm.runSimulation()} leftIcon={<BeakerIcon className="h-4 w-4" />} variant="secondary">
                Simulate
              </Button>
              <Button
                onClick={() => {
                  if (limits.isPro) {
                    vm.executePlan();
                  } else if (maxOptimizations !== null && s.preview && s.preview.actionsPreview.length > maxOptimizations) {
                    guard('ai.smart_optimization', 'AI Smart Optimize', () => vm.executePlan(), {
                      limitDescription: `Free edition allows up to ${maxOptimizations} optimizations per run. This plan has ${s.preview!.actionsPreview.length} actions.`,
                      proBenefit: 'Unlimited optimizations with automatic scheduling and background execution.',
                    });
                  } else {
                    vm.executePlan();
                  }
                }}
                loading={s.isExecuting}
                leftIcon={<BoltIcon className="h-4 w-4" />}
              >
                {limits.isPro ? 'Auto Optimize' : 'Execute Plan'}
              </Button>
            </div>

            {/* Hidden actions notice for Free */}
            {hiddenCount > 0 && (
              <div className="rounded-[var(--avs-radius-md)] bg-semantic-warning/10 border border-semantic-warning/20 px-3 py-2" data-testid="smart-opt-limit-notice">
                <p className="text-xs text-text-secondary">
                  {hiddenCount} more optimization{hiddenCount > 1 ? 's' : ''} available with Professional. Showing top {maxOptimizations} of {s.preview!.actionsPreview.length} actions.
                </p>
              </div>
            )}

            {/* Pro-only automation controls */}
            <ProOnlySection>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--avs-border)]">
                <ProFeatureIndicator icon={CalendarDaysIcon} label="Schedule Weekly" />
                <ProFeatureIndicator icon={ArrowPathIcon} label="Optimize in Background" />
                <ProFeatureIndicator icon={EyeIcon} label="Rollback Available" />
                <ProFeatureIndicator icon={ClockIcon} label="Optimization History" />
              </div>
            </ProOnlySection>
          </div>
        </Card>
      )}

      {/* Simulation Results */}
      {s.simulation && (
        <Card title="Simulation Results" variant="glass">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricBox label="Simulated Score" value={s.simulation.simulatedHealthScore.toString()} icon={ChartBarIcon} />
              <MetricBox label="Confidence" value={`${(s.simulation.confidence * 100).toFixed(0)}%`} icon={CheckCircleIcon} />
              <MetricBox label="Simulated Risk" value={s.simulation.simulatedRisk} icon={ShieldCheckIcon} />
              <MetricBox label="RAM Recovery" value={`${s.simulation.simulatedBenefits.ramRecoveryMB} MB`} icon={CpuChipIcon} />
            </div>
            {s.simulation.assumptions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-1">Assumptions</h4>
                {s.simulation.assumptions.map((a, i) => (
                  <p key={i} className="text-xs text-[var(--avs-text-secondary)]">• {a}</p>
                ))}
              </div>
            )}
            {s.simulation.warnings.length > 0 && (
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-warning)]/10 p-3">
                {s.simulation.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-[var(--avs-warning)]">• {w}</p>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Execution Report */}
      {s.lastReport && (
        <Card title="Execution Report" variant="glass">
          <div className="space-y-3">
            <p className="text-sm font-medium text-[var(--avs-text-primary)]">{s.lastReport.summary.headline}</p>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricBox label="Health Change" value={`${s.lastReport.summary.healthScoreChange > 0 ? '+' : ''}${s.lastReport.summary.healthScoreChange}`} icon={ArrowTrendingUpIcon} />
              <MetricBox label="Storage Recovered" value={`${s.lastReport.summary.storageRecoveredMB} MB`} icon={CircleStackIcon} />
              <MetricBox label="Success" value={s.lastReport.successCount.toString()} icon={CheckCircleIcon} />
              <MetricBox label="Failed" value={s.lastReport.failureCount.toString()} icon={ExclamationTriangleIcon} />
            </div>
            <div className="space-y-1">
              {s.lastReport.results.map((result) => (
                <div key={result.actionId} className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                  {result.status === 'completed' ? (
                    <CheckCircleIcon className="h-4 w-4 text-[var(--avs-success)]" />
                  ) : result.status === 'failed' ? (
                    <ExclamationTriangleIcon className="h-4 w-4 text-[var(--avs-danger)]" />
                  ) : (
                    <ArrowPathIcon className="h-4 w-4 text-[var(--avs-text-muted)]" />
                  )}
                  <span className="text-xs font-medium text-[var(--avs-text-primary)]">{result.actionTitle}</span>
                  <span className="text-xs text-[var(--avs-text-muted)] ml-auto capitalize">{result.status}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Configuration */}
      {s.config && (
        <Card title="Configuration" variant="glass">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConfigToggle
              label="Enable Rollback"
              value={s.config.enableRollback}
              onChange={(v) => vm.updateConfig({ enableRollback: v })}
            />
            <ConfigToggle
              label="Enable Simulation"
              value={s.config.enableSimulation}
              onChange={(v) => vm.updateConfig({ enableSimulation: v })}
            />
            <ConfigToggle
              label="Enable Learning"
              value={s.config.enableLearning}
              onChange={(v) => vm.updateConfig({ enableLearning: v })}
            />
            <ConfigToggle
              label="Enable Insights"
              value={s.config.enableInsights}
              onChange={(v) => vm.updateConfig({ enableInsights: v })}
            />
            <ConfigToggle
              label="Auto-approve Low Risk"
              value={s.config.autoApproveLowRisk}
              onChange={(v) => vm.updateConfig({ autoApproveLowRisk: v })}
            />
            <ConfigToggle
              label="Approval Flow"
              value={s.config.enableApprovalFlow}
              onChange={(v) => vm.updateConfig({ enableApprovalFlow: v })}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--avs-text-muted)]">Risk Tolerance</label>
              <select
                value={s.config.riskTolerance}
                onChange={(e) => vm.updateConfig({ riskTolerance: e.target.value as RiskLevel })}
                className="mt-1 w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-xs text-[var(--avs-text-primary)]"
              >
                {['none', 'low', 'moderate', 'high', 'severe'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--avs-text-muted)]">Preferred Style</label>
              <select
                value={s.config.preferredStyle}
                onChange={(e) => vm.updateConfig({ preferredStyle: e.target.value as OptimizationConfiguration['preferredStyle'] })}
                className="mt-1 w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-xs text-[var(--avs-text-primary)]"
              >
                {['conservative', 'balanced', 'aggressive', 'minimal'].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {!s.plan && !s.isGenerating && (
        <Card>
          <ModuleEmptyState
            icon={BoltIcon}
            title="No optimization plan yet"
            message="Click 'Generate Plan' to analyze your system and create an evidence-based optimization plan."
          />
        </Card>
      )}

      {s.error && (
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-danger)]/10 p-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-danger)]" />
            <span className="text-sm text-[var(--avs-danger)]">{s.error}</span>
          </div>
        </div>
      )}

      {dialogElement}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function StatBox({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof ChartBarIcon }) {
  return (
    <Card variant="glass" className="p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
        <div>
          <p className="text-xs text-[var(--avs-text-muted)]">{label}</p>
          <p className="text-lg font-bold text-[var(--avs-text-primary)]">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function MetricBox({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ChartBarIcon }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--avs-text-muted)]" />
        <span className="text-xs text-[var(--avs-text-muted)]">{label}</span>
      </div>
      <p className="text-sm font-semibold text-[var(--avs-text-primary)] mt-1">{value}</p>
    </div>
  );
}

function ConfigToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <span className="text-xs font-medium text-[var(--avs-text-primary)]">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-glass-border)]'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
