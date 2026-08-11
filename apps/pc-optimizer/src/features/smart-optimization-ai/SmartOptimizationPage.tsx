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
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, CollapsibleSection } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState } from '../../components/ModuleStates';
import { useEditionLimits } from '../licensing/editionLimits';
import { useIsPro } from '../sync/syncStore';
import { ProStatusBanner, ProStatusPill, ProOnlySection, ProFeatureIndicator } from '../licensing/ProStatusBadge';
import { DashboardViewModel } from '../dashboard/DashboardViewModel';
import { dashboardService } from '../dashboard/dashboard.service';
import { UnifiedOptimizeFlow } from '../dashboard/components/UnifiedOptimizeFlow';
import { formatDataSize } from '@avs/shared/utils';
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
  LockClosedIcon,
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
  const isPro = useIsPro();
  const navigate = useNavigate();
  const [showUpgradeMessage, setShowUpgradeMessage] = useState(false);

  // Dashboard ViewModel for health scan (AI Smart Optimize button)
  const dashVm = useMemo(() => new DashboardViewModel(dashboardService), []);
  const dashState = useViewModel(dashVm);

  useEffect(() => {
    void dashVm.bootstrap();
    return () => dashVm.dispose();
  }, [dashVm]);

  useEffect(() => {
    vm.bootstrap();
    // Auto-generate plan on page load so user sees results immediately
    void vm.generatePlan();
    return () => vm.dispose();
  }, [vm]);

  const handleSmartOptimize = useCallback(() => {
    setShowUpgradeMessage(false);
    dashVm.startHealthScan('optimize', isPro);
  }, [dashVm, isPro]);

  const handleExecutePlan = useCallback(() => {
    if (!isPro) {
      setShowUpgradeMessage(true);
      return;
    }
    vm.executePlan();
  }, [isPro, vm]);

  const isScanning = dashState.healthScanStep !== 'idle' && dashState.healthScanStep !== 'complete';

  if (state.bootstrap === 'loading') {
    return (
      <div className="px-6 py-6">
        <PageHeader title="AI Smart Optimization" description="Safe, intelligent optimization recommendations tailored to your PC." />
        <ModuleLoadingState />
      </div>
    );
  }

  const s = state;
  const dash = s.dashboard;
  const maxOptimizations = isPro ? limits.getLimit('aiSmartOptimizePerRun') : null;
  const visibleActions = s.preview ? s.preview.actionsPreview.slice(0, maxOptimizations ?? undefined) : [];
  const hiddenCount = s.preview && maxOptimizations !== null ? Math.max(0, s.preview.actionsPreview.length - maxOptimizations) : 0;

  return (
    <div className="px-6 py-6 space-y-5">
      <ProStatusBanner compact />
      <PageHeader
        title="AI Smart Optimization"
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <Button
              onClick={handleSmartOptimize}
              disabled={isScanning}
              loading={isScanning}
              leftIcon={isScanning ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BoltIcon className="h-4 w-4" />}
              size="lg"
              data-testid="ai-smart-optimize-btn"
            >
              {isScanning ? 'Scanning...' : 'Optimize Now'}
            </Button>
          </div>
        }
      />

      {/* ── ABOVE THE FOLD ─────────────────────────────────────────── */}
      {/* 4 Summary Cards */}
      {dash && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Optimization Score */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-score">
            <div className="text-caption text-text-muted">Optimization Score</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-text-primary tabular-nums">{dash.summary.currentHealthScore}</span>
              <ArrowTrendingUpIcon className="h-4 w-4 text-semantic-success" />
              <span className="text-2xl font-bold text-semantic-success tabular-nums">{dash.summary.potentialHealthScore}</span>
            </div>
            <div className="text-caption text-text-muted mt-0.5">+{dash.summary.potentialHealthScore - dash.summary.currentHealthScore} possible</div>
          </Card>

          {/* Card 2: Storage Recovered */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-storage">
            <div className="text-caption text-text-muted">Storage Recovered</div>
            <div className="mt-1 text-2xl font-bold text-text-primary tabular-nums">
              {s.lastReport ? formatDataSize(s.lastReport.summary.storageRecoveredMB * 1024 * 1024) : formatDataSize(dash.summary.estimatedTotalRecoveryMB * 1024 * 1024)}
            </div>
            <div className="text-caption text-text-muted mt-0.5">{s.lastReport ? 'This session' : 'Estimated'}</div>
          </Card>

          {/* Card 3: Items Fixed */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-items">
            <div className="text-caption text-text-muted">Items Fixed</div>
            <div className="mt-1 text-2xl font-bold text-text-primary tabular-nums">
              {s.lastReport ? s.lastReport.successCount : dash.summary.totalAvailableActions}
            </div>
            <div className="text-caption text-text-muted mt-0.5">{s.lastReport ? `${s.lastReport.failureCount} failed` : 'Available actions'}</div>
          </Card>

          {/* Card 4: Last Optimization */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-last">
            <div className="text-caption text-text-muted">Last Optimization</div>
            <div className="mt-1 text-small font-semibold text-text-primary">
              {s.lastReport ? 'Completed' : 'Not yet run'}
            </div>
            <div className="text-caption text-text-muted mt-0.5">
              {s.lastReport ? `${s.lastReport.successCount} of ${s.lastReport.successCount + s.lastReport.failureCount} actions` : `Est. ${formatDuration(dash.summary.estimatedDurationSeconds)}`}
            </div>
          </Card>
        </div>
      )}

      {/* ── COLLAPSIBLE SECONDARY CONTENT (2 panels) ─────────────── */}

      {/* Panel 1: Plan & Insights */}
      {s.preview && (
        <CollapsibleSection title="Plan & Insights" icon={<BoltIcon className="h-5 w-5" />} storageKey="smart-opt-plan-insights">
          <div className="space-y-4">
            {/* Warnings */}
            {s.preview.warnings.length > 0 && (
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-warning)]/10 p-3">
                {s.preview.warnings.map((w, i) => (
                  <div key={i} className="flex items-center gap-2 text-caption text-[var(--avs-warning)]">
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions Preview */}
            <div className="space-y-2">
              <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">
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
                    <span className="text-small font-medium text-[var(--avs-text-primary)]">{action.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge tone={IMPACT_BADGES[action.impactTier]}>{action.impactTier}</Badge>
                      <span className={`text-caption ${RISK_COLORS[action.riskLevel]}`}>{action.riskLevel}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-caption text-[var(--avs-text-muted)]">
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
                Preview Results
              </Button>
              <Button
                onClick={handleExecutePlan}
                loading={s.isExecuting}
                leftIcon={isPro ? <BoltIcon className="h-4 w-4" /> : <LockClosedIcon className="h-4 w-4" />}
              >
                {isPro ? 'Auto Optimize' : 'Upgrade to Execute'}
              </Button>
            </div>

            {/* Hidden actions notice for Free */}
            {hiddenCount > 0 && (
              <div className="rounded-[var(--avs-radius-md)] bg-semantic-warning/10 border border-semantic-warning/20 px-3 py-2" data-testid="smart-opt-limit-notice">
                <p className="text-caption text-text-secondary">
                  {hiddenCount} more optimization{hiddenCount > 1 ? 's' : ''} available with Professional.
                </p>
              </div>
            )}

            {/* Pro-only automation controls */}
            <ProOnlySection>
              <div className="space-y-3 pt-2 border-t border-[var(--avs-border)]">
                <div className="flex flex-wrap gap-2">
                  <ProFeatureIndicator icon={EyeIcon} label="Rollback Available" />
                  <ProFeatureIndicator icon={ClockIcon} label="Optimization History" />
                </div>
                {/* Scheduled Optimization */}
                <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <div className="flex items-center gap-2">
                    <CalendarDaysIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                    <div>
                      <span className="text-caption font-medium text-[var(--avs-text-primary)]">Scheduled Optimization</span>
                      <p className="text-caption text-[var(--avs-text-muted)]">Automatically run on a schedule</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={s.config?.preferredStyle === 'aggressive' ? 'daily' : 'weekly'}
                      onChange={(e) => {
                        const style = e.target.value === 'daily' ? 'aggressive' : 'balanced';
                        vm.updateConfig({ preferredStyle: style });
                      }}
                      className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-2 py-1 text-caption text-[var(--avs-text-primary)]"
                    >
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                </div>
                {/* Background Optimization */}
                <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <div className="flex items-center gap-2">
                    <ArrowPathIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                    <div>
                      <span className="text-caption font-medium text-[var(--avs-text-primary)]">Background Optimization</span>
                      <p className="text-caption text-[var(--avs-text-muted)]">Continuously optimize in the background</p>
                    </div>
                  </div>
                  <ConfigToggle
                    label=""
                    value={s.config?.autoApproveLowRisk ?? false}
                    onChange={(v) => vm.updateConfig({ autoApproveLowRisk: v })}
                  />
                </div>
              </div>
            </ProOnlySection>
          </div>
          {s.insights.length > 0 && (
            <div className="pt-4 border-t border-[var(--avs-border)]">
              <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-3">AI Insights</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {s.insights.slice(0, 6).map((insight) => (
                  <div key={insight.id} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-4">
                    <div className="flex items-start gap-2">
                      <LightBulbIcon className="h-5 w-5 text-[var(--avs-brand-primary)] shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-small font-medium text-[var(--avs-text-primary)]">{insight.title}</p>
                        <p className="text-caption text-[var(--avs-text-secondary)] mt-1">{insight.explanation}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge tone={IMPACT_BADGES[insight.impactTier]}>{insight.impactTier}</Badge>
                          <span className="text-caption text-[var(--avs-text-muted)]">{(insight.confidence * 100).toFixed(0)}% confidence</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleSection>
      )}

      {/* Panel 2: Results & Settings */}
      {(s.simulation || s.lastReport || s.config) && (
        <CollapsibleSection title="Results & Settings" icon={<BeakerIcon className="h-5 w-5" />} storageKey="smart-opt-results-settings">
          <div className="space-y-4">
            {s.simulation && (
              <div className="space-y-3">
                <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">Preview</h4>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricBox label="Expected Score" value={s.simulation.simulatedHealthScore.toString()} icon={ChartBarIcon} />
                  <MetricBox label="Confidence" value={`${(s.simulation.confidence * 100).toFixed(0)}%`} icon={CheckCircleIcon} />
                  <MetricBox label="Risk Level" value={s.simulation.simulatedRisk} icon={ShieldCheckIcon} />
                  <MetricBox label="RAM Recovery" value={formatDataSize(s.simulation.simulatedBenefits.ramRecoveryMB * 1024 * 1024)} icon={CpuChipIcon} />
                </div>
                {s.simulation.assumptions.length > 0 && (
                  <div>
                    <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-1">Assumptions</h4>
                {/* Note: These are preview assumptions, not guarantees */}
                    {s.simulation.assumptions.map((a, i) => (
                      <p key={i} className="text-caption text-[var(--avs-text-secondary)]">• {a}</p>
                    ))}
                  </div>
                )}
                {s.simulation.warnings.length > 0 && (
                  <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-warning)]/10 p-3">
                    {s.simulation.warnings.map((w, i) => (
                      <p key={i} className="text-caption text-[var(--avs-warning)]">• {w}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {s.lastReport && (
              <div className="space-y-3 pt-4 border-t border-[var(--avs-border)]">
                <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">Optimization Results</h4>
                <p className="text-small font-medium text-[var(--avs-text-primary)]">{s.lastReport.summary.headline}</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <MetricBox label="Score Change" value={`${s.lastReport.summary.healthScoreChange > 0 ? '+' : ''}${s.lastReport.summary.healthScoreChange}`} icon={ArrowTrendingUpIcon} />
                  <MetricBox label="Storage Recovered" value={formatDataSize(s.lastReport.summary.storageRecoveredMB * 1024 * 1024)} icon={CircleStackIcon} />
                  <MetricBox label="Completed" value={s.lastReport.successCount.toString()} icon={CheckCircleIcon} />
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
                      <span className="text-caption font-medium text-[var(--avs-text-primary)]">{result.actionTitle}</span>
                      <span className="text-caption text-[var(--avs-text-muted)] ml-auto capitalize">{result.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {s.config && (
              <div className="space-y-3 pt-4 border-t border-[var(--avs-border)]">
                <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ConfigToggle label="Enable Rollback" value={s.config.enableRollback} onChange={(v) => vm.updateConfig({ enableRollback: v })} />
                  <ConfigToggle label="Enable Simulation" value={s.config.enableSimulation} onChange={(v) => vm.updateConfig({ enableSimulation: v })} />
                  <ConfigToggle label="Enable Learning" value={s.config.enableLearning} onChange={(v) => vm.updateConfig({ enableLearning: v })} />
                  <ConfigToggle label="Enable Insights" value={s.config.enableInsights} onChange={(v) => vm.updateConfig({ enableInsights: v })} />
                  <ConfigToggle label="Auto-approve Low Risk" value={s.config.autoApproveLowRisk} onChange={(v) => vm.updateConfig({ autoApproveLowRisk: v })} />
                  <ConfigToggle label="Approval Flow" value={s.config.enableApprovalFlow} onChange={(v) => vm.updateConfig({ enableApprovalFlow: v })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-caption text-[var(--avs-text-muted)]">Risk Tolerance</label>
                    <select
                      value={s.config.riskTolerance}
                      onChange={(e) => vm.updateConfig({ riskTolerance: e.target.value as RiskLevel })}
                      className="mt-1 w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-caption text-[var(--avs-text-primary)]"
                    >
                      {['none', 'low', 'moderate', 'high', 'severe'].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-caption text-[var(--avs-text-muted)]">Preferred Style</label>
                    <select
                      value={s.config.preferredStyle}
                      onChange={(e) => vm.updateConfig({ preferredStyle: e.target.value as OptimizationConfiguration['preferredStyle'] })}
                      className="mt-1 w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-caption text-[var(--avs-text-primary)]"
                    >
                      {['conservative', 'balanced', 'aggressive', 'minimal'].map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Empty State */}
      {!s.plan && !s.isGenerating && !showUpgradeMessage && (
        <Card>
          <ModuleEmptyState
            icon={BoltIcon}
            title="No optimization plan yet"
            message={isPro
              ? "Click 'AI Smart Optimize' to run a complete system scan and create an evidence-based optimization plan with one-click execution."
              : "Click 'AI Smart Optimize' to run a complete system scan and see what can be optimized. Upgrade to Professional for one-click automatic optimization."}
          />
        </Card>
      )}

      {/* Upgrade message for Free users - shown when they try to execute */}
      {showUpgradeMessage && !isPro && (
        <Card variant="glass" data-testid="smart-opt-upgrade-message">
          <div className="flex flex-col items-center text-center py-8 px-6 gap-4">
            <div className="rounded-full bg-semantic-warning/10 p-4">
              <LockClosedIcon className="h-8 w-8 text-semantic-warning" />
            </div>
            <div className="space-y-2">
              <h3 className="text-section-title font-semibold text-text-primary">Upgrade to Professional for Full Optimization</h3>
              <p className="text-small text-text-secondary max-w-md">
                You can see the optimization plan and expected improvements. Professional edition unlocks:
              </p>
              <div className="flex flex-wrap justify-center gap-2 text-caption">
                <span className="rounded-full bg-[var(--avs-surface-muted)] px-3 py-1 text-text-secondary">One-click Auto Optimize</span>
                <span className="rounded-full bg-[var(--avs-surface-muted)] px-3 py-1 text-text-secondary">Automatic sequencing</span>
                <span className="rounded-full bg-[var(--avs-surface-muted)] px-3 py-1 text-text-secondary">Risk assessment</span>
                <span className="rounded-full bg-[var(--avs-surface-muted)] px-3 py-1 text-text-secondary">Rollback support</span>
                <span className="rounded-full bg-[var(--avs-surface-muted)] px-3 py-1 text-text-secondary">Background optimization</span>
                <span className="rounded-full bg-[var(--avs-surface-muted)] px-3 py-1 text-text-secondary">Scheduled optimization</span>
              </div>
              <p className="text-small text-text-muted pt-2">
                Or use <span className="font-medium text-text-primary">Manual Optimization</span> —
                run individual scans and cleaners from the sidebar with your Free edition.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                onClick={() => navigate('/license')}
                leftIcon={<BoltIcon className="h-4 w-4" />}
                data-testid="smart-opt-upgrade-button"
              >
                Upgrade to Professional
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowUpgradeMessage(false)}
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </Card>
      )}

      {s.error && (
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-danger)]/10 p-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-danger)]" />
            <span className="text-small text-[var(--avs-danger)]">{s.error}</span>
          </div>
        </div>
      )}

      {/* Unified Optimize Flow — triggered by AI Smart Optimize button */}
      {dashState.healthScanStep !== 'idle' && (
        <UnifiedOptimizeFlow
          vm={dashVm}
          isPro={isPro}
          onClose={() => dashVm.closeHealthScan()}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function MetricBox({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ChartBarIcon }) {
  return (
    <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--avs-text-muted)]" />
        <span className="text-caption text-[var(--avs-text-muted)]">{label}</span>
      </div>
      <p className="text-small font-semibold text-[var(--avs-text-primary)] mt-1">{value}</p>
    </div>
  );
}

function ConfigToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
      <span className="text-caption font-medium text-[var(--avs-text-primary)]">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? 'bg-[var(--avs-brand-primary)]' : 'bg-[var(--avs-glass-border)]'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
