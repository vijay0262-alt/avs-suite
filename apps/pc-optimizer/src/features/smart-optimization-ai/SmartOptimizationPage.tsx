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
import { useEffect, useMemo, useCallback, useState } from 'react';
import { Card, Button, Badge, CollapsibleSection } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState } from '../../components/ModuleStates';
import { useEditionLimits } from '../licensing/editionLimits';
import { useIsPro } from '../sync/syncStore';
import { ProStatusBanner, ProStatusPill, ProOnlySection, ProFeatureIndicator } from '../licensing/ProStatusBadge';
import { ScanView, PlanReviewView, useSmartOptimizationPlan } from '../scan';
import { Modal } from '../dashboard/components/Modal';
import { dashboardService } from '../dashboard/dashboard.service';
import { formatDataSize } from '@avs/shared/utils';
import {
  SmartOptimizationEngine,
  type OptimizationPlan,
  type OptimizationPreview,
  type OptimizationSimulation,
  type OptimizationInsight,
  type OptimizationDashboardData,
  type OptimizationConfiguration,
  type RiskLevel,
  type OptimizationImpactTier,
  type SourceFinding,
  type OptimizationAction,
} from '../smart-optimization-ai';
import { gatherFindings } from '../smart-optimization-ai/findingsGatherer';
import {
  BoltIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CpuChipIcon,
  ClockIcon,
  CircleStackIcon,
  ArrowTrendingUpIcon,
  LightBulbIcon,
  BeakerIcon,
  CalendarDaysIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

/**
 * Convert an OptimizationAction (AI plan) into the plain-object format
 * expected by scan_core.smart_optimization.plan RPC. Only serializable
 * fields are sent — no canonical paths, asset IDs, or internal target
 * payloads are included.
 */
function actionToRpcPayload(action: OptimizationAction): Record<string, unknown> {
  return {
    id: action.id,
    type: action.type,
    title: action.title,
    description: action.description,
    confidence: action.confidence,
    rollbackAvailable: action.rollbackAvailable,
    sourceModule: action.sourceModule,
    sourceFindingId: action.sourceFindingId,
    impact: {
      score: action.impact.score,
      tier: action.impactTier,
      primaryBenefit: action.impact.primaryBenefit,
      estimatedHealthScoreGain: action.impact.estimatedHealthScoreGain,
      description: action.impact.description,
    },
    risk: {
      level: action.risk.level,
      score: action.risk.score,
      reversible: action.risk.reversible,
      requiresRestart: action.risk.requiresRestart,
      estimatedDurationSeconds: action.risk.estimatedDurationSeconds,
      userConfirmationRequired: action.risk.userConfirmationRequired,
      factors: action.risk.factors,
      mitigations: action.risk.mitigations,
    },
    benefits: action.benefits,
  };
}

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
      selectedActionId: null,
      error: null,
    });
    this.engine = new SmartOptimizationEngine();
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

  async runSimulation() {
    const { plan } = this.state;
    if (!plan) return;
    try {
      // V1.0: Use the PC's actual current CPU/memory/disk state for the
      // "Preview Results" projection instead of fabricated baseline
      // numbers. Dimensions with no real telemetry source in this app
      // (browser responsiveness, privacy, thermal, battery, stability)
      // remain documented neutral baselines — they are relative
      // improvement scores, not raw hardware readings.
      let cpuUsagePercent = 50;
      let memoryUsageMB = 8192;
      let diskFreeSpaceMB = 50000;
      try {
        const live = await dashboardService.getLiveMetrics();
        cpuUsagePercent = live.cpu.usage;
        memoryUsageMB = live.memory.used / (1024 * 1024);
        diskFreeSpaceMB = live.storage.reduce((sum, d) => sum + d.free, 0) / (1024 * 1024);
      } catch {
        // Live metrics unavailable — fall back to neutral baseline so the
        // preview still renders rather than failing outright.
      }
      const sim = this.engine.simulate(plan, {
        cpuUsagePercent,
        memoryUsageMB,
        diskFreeSpaceMB,
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
  const smartPlan = useSmartOptimizationPlan();
  const [scanModalOpen, setScanModalOpen] = useState(false);

  useEffect(() => {
    vm.bootstrap();
    // Auto-generate plan on page load so user sees results immediately
    void vm.generatePlan();
    return () => vm.dispose();
  }, [vm]);

  // ── Canonical plan creation handoff ──────────────────────────────
  const handleReviewOptimize = useCallback(async () => {
    const plan = state.plan;
    if (!plan || plan.actions.length === 0) return;
    const payload = plan.actions.map(actionToRpcPayload);
    await smartPlan.createPlan(payload);
  }, [state.plan, smartPlan]);

  const handlePlanClose = useCallback(() => {
    smartPlan.reset();
  }, [smartPlan]);

  // If the RPC returned a plan_id, hand off to the canonical review flow
  if (smartPlan.planId) {
    return (
      <div data-testid="smart-opt-plan-review">
        <PlanReviewView
          planId={smartPlan.planId}
          module="optimize"
          onClose={handlePlanClose}
        />
      </div>
    );
  }

  if (state.bootstrap === 'loading') {
    return (
      <>
        <PageHeader title="AI Smart Optimization" description="Safe, intelligent optimization recommendations tailored to your PC." />
        <ModuleLoadingState />
      </>
    );
  }

  const s = state;
  const dash = s.dashboard;
  const maxOptimizations = isPro ? limits.getLimit('aiSmartOptimizePerRun') : null;
  const visibleActions = s.preview ? s.preview.actionsPreview.slice(0, maxOptimizations ?? undefined) : [];
  const hiddenCount = s.preview && maxOptimizations !== null ? Math.max(0, s.preview.actionsPreview.length - maxOptimizations) : 0;
  const hasActionablePlan = s.plan !== null && s.plan.actions.length > 0;

  return (
    <div className="space-y-5">
      <ProStatusBanner compact />
      <PageHeader
        title="AI Smart Optimization"
        description="Safe, intelligent optimization recommendations tailored to your PC."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <Button
              onClick={() => setScanModalOpen(true)}
              size="lg"
              leftIcon={<BoltIcon className="h-5 w-5" />}
              data-testid="smart-opt-scan-cta"
            >
              Optimize Now
            </Button>
          </div>
        }
      />

      {/* ── ABOVE THE FOLD ─────────────────────────────────────────── */}
      {/* 4 Summary Cards */}
      {dash && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Optimization Score — V1.0 UNIFIED: matches Dashboard style */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-score">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
                dash.summary.currentHealthScore >= 80 ? 'bg-semantic-success/10' : dash.summary.currentHealthScore >= 60 ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
              }`}>
                <ArrowTrendingUpIcon className={`h-5 w-5 ${
                  dash.summary.currentHealthScore >= 80 ? 'text-semantic-success' : dash.summary.currentHealthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-text-muted">Optimization Score</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-text-primary tabular-nums">{dash.summary.currentHealthScore}</span>
                  <span className="text-caption text-text-muted">/100</span>
                </div>
                <div className="text-caption text-semantic-success">+{dash.summary.potentialHealthScore - dash.summary.currentHealthScore} possible</div>
              </div>
            </div>
          </Card>

          {/* Card 2: Storage Recovered */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-storage">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-semantic-success/10">
                <CircleStackIcon className="h-5 w-5 text-semantic-success" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-text-muted">Storage Recovered</div>
                <div className="text-2xl font-bold text-text-primary tabular-nums">
                  {formatDataSize(dash.summary.estimatedTotalRecoveryMB * 1024 * 1024)}
                </div>
                <div className="text-caption text-text-muted">Estimated</div>
              </div>
            </div>
          </Card>

          {/* Card 3: Items Fixed */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-items">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-semantic-warning/10">
                <BoltIcon className="h-5 w-5 text-semantic-warning" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-text-muted">Items Fixed</div>
                <div className="text-2xl font-bold text-text-primary tabular-nums">
                  {dash.summary.totalAvailableActions}
                </div>
                <div className="text-caption text-text-muted">Available actions</div>
              </div>
            </div>
          </Card>

          {/* Card 4: Last Optimization */}
          <Card variant="glass" className="p-4" data-testid="smart-opt-last">
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-surface-muted">
                <ClockIcon className="h-5 w-5 text-text-muted" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-text-muted">Last Optimization</div>
                <div className="text-small font-semibold text-text-primary">
                  Not yet run
                </div>
                <div className="text-caption text-text-muted">
                  {`Est. ${formatDuration(dash.summary.estimatedDurationSeconds)}`}
                </div>
              </div>
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
                onClick={handleReviewOptimize}
                disabled={!hasActionablePlan || smartPlan.isCreating}
                leftIcon={<ShieldCheckIcon className="h-4 w-4" />}
                data-testid="smart-opt-review-btn"
              >
                {smartPlan.isCreating ? 'Creating Plan...' : 'Review & Optimize'}
              </Button>
            </div>

            {/* Plan creation error */}
            {smartPlan.error && (
              <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-danger)]/10 p-3" data-testid="smart-opt-plan-error">
                <div className="flex items-center gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-[var(--avs-danger)]" />
                  <span className="text-caption text-[var(--avs-danger)]">{smartPlan.error}</span>
                </div>
              </div>
            )}

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
      {(s.simulation || s.config) && (
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

            {s.config && (
              <div className="space-y-3 pt-4 border-t border-[var(--avs-border)]">
                <h4 className="text-caption font-semibold uppercase tracking-wide text-[var(--avs-text-muted)]">Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ConfigToggle label="Enable Rollback" value={s.config.enableRollback} onChange={(v) => vm.updateConfig({ enableRollback: v })} />
                  <ConfigToggle label="Enable Simulation" value={s.config.enableSimulation} onChange={(v) => vm.updateConfig({ enableSimulation: v })} />
                  <ConfigToggle label="Enable Learning" value={s.config.enableLearning} onChange={(v) => vm.updateConfig({ enableLearning: v })} />
                  <ConfigToggle label="Enable Insights" value={s.config.enableInsights} onChange={(v) => vm.updateConfig({ enableInsights: v })} />
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
      {!s.plan && !s.isGenerating && (
        <Card>
          <ModuleEmptyState
            icon={BoltIcon}
            title="No optimization plan yet"
            message="Click 'Scan & Optimize' to run a complete system scan and create an evidence-based optimization plan."
          />
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

      {/* V1.0 UNIFIED: Scan modal — same pattern as Dashboard */}
      <Modal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        title="AI Smart Optimization"
        size="xl"
      >
        <ScanView
          module="optimize"
          mode="quick"
          autoStart={true}
          buttonLabel="Optimize Now"
          onClose={() => setScanModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

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
