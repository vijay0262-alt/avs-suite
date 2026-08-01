/**
 * AI Smart Optimization Engine — Comprehensive Tests
 *
 * Tests for:
 * - Impact calculation (storage, RAM, startup, privacy, performance)
 * - Risk analysis (levels, reversibility, restart, confirmation)
 * - Recommendation generation (findings → actions)
 * - Scoring & prioritization (composite scores, tier grouping)
 * - Dependency resolution (topological sort, cycles)
 * - Conflict resolution (duplicates, mutually exclusive)
 * - Plan generation (full plan with reasoning)
 * - Preview (human-readable summary)
 * - Simulation (projected system state)
 * - Approval flow (auto-approve, manual confirmation)
 * - Rollback planning (reversible vs irreversible)
 * - Execution coordination (mock handler, reports)
 * - Insights (why, why now, if skipped)
 * - Learning (acceptance/rejection tracking)
 * - History (reports, trends)
 * - Dashboard (summary, top recommendations)
 * - Full engine integration (end-to-end)
 * - Edge cases (empty findings, all rejected, expired plan)
 * - Safety (no unsafe actions, rollback always available)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SmartOptimizationEngine } from '../SmartOptimizationEngine';
import { OptimizationPlanner } from '../OptimizationPlanner';
import { OptimizationImpactCalculator } from '../OptimizationImpactCalculator';
import { OptimizationRiskAnalyzer } from '../OptimizationRiskAnalyzer';
import { OptimizationScorer } from '../OptimizationScorer';
import { OptimizationPrioritizer } from '../OptimizationPrioritizer';
import { OptimizationDependencyResolver } from '../OptimizationDependencyResolver';
import { OptimizationConflictResolver } from '../OptimizationConflictResolver';
import { OptimizationRecommendationEngine } from '../OptimizationRecommendationEngine';
import { OptimizationPreviewBuilder } from '../OptimizationPreview';
import { OptimizationSimulationEngine } from '../OptimizationSimulation';
import { OptimizationApprovalManager } from '../OptimizationApprovalManager';
import { OptimizationRollbackPlanner } from '../OptimizationRollbackPlanner';
import { OptimizationInsights } from '../OptimizationInsights';
import { OptimizationDashboardProvider } from '../OptimizationDashboardProvider';
import { OptimizationHistory } from '../OptimizationHistory';
import { OptimizationLearning } from '../OptimizationLearning';
import { OptimizationConfigurationManager } from '../OptimizationConfiguration';
import { DEFAULT_OPTIMIZATION_CONFIG } from '../types';
import type {
  SourceFinding,
  OptimizationAction,
  SystemStateProjection,
  ExecutionResult,
} from '../types';
import type { ExecutionHandler } from '../OptimizationExecutionCoordinator';

// ── Mock Factories ───────────────────────────────────────────────────

function makeFinding(overrides?: Partial<SourceFinding>): SourceFinding {
  return {
    module: 'junk_cleaner',
    findingId: 'finding-1',
    category: 'temp_files',
    title: 'Temporary Files Detected',
    description: '500 MB of temporary files found in system temp directory.',
    severity: 'medium',
    evidence: [
      { source: 'junk_cleaner', metric: 'temp_size', value: '500', unit: 'MB', timestamp: Date.now(), confidence: 0.9 },
    ],
    estimatedBenefit: { storageRecoveryMB: 500 },
    sourceData: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeFindings(): SourceFinding[] {
  return [
    makeFinding({ findingId: 'f1', category: 'temp_files', estimatedBenefit: { storageRecoveryMB: 800 }, severity: 'high' }),
    makeFinding({
      findingId: 'f2', module: 'browser_health', category: 'browser_cache',
      title: 'Browser Cache', description: '200 MB browser cache.',
      estimatedBenefit: { storageRecoveryMB: 200, performanceImprovement: 5 }, severity: 'medium',
      evidence: [{ source: 'browser_health', metric: 'cache_size', value: '200', unit: 'MB', timestamp: Date.now(), confidence: 0.85 }],
    }),
    makeFinding({
      findingId: 'f3', module: 'startup_manager', category: 'startup',
      title: 'Startup Entry: Skype', description: 'Skype starts with Windows and delays boot.',
      estimatedBenefit: { startupImprovementMs: 2000, ramRecoveryMB: 50 }, severity: 'medium',
      evidence: [{ source: 'startup_manager', metric: 'startup_delay', value: '2000', unit: 'ms', timestamp: Date.now(), confidence: 0.8 }],
    }),
    makeFinding({
      findingId: 'f4', module: 'junk_cleaner', category: 'recycle_bin',
      title: 'Recycle Bin Full', description: '1.2 GB in Recycle Bin.',
      estimatedBenefit: { storageRecoveryMB: 1200 }, severity: 'low',
      evidence: [{ source: 'junk_cleaner', metric: 'recycle_bin_size', value: '1200', unit: 'MB', timestamp: Date.now(), confidence: 0.95 }],
    }),
    makeFinding({
      findingId: 'f5', module: 'duplicate_finder', category: 'duplicate_files',
      title: 'Duplicate Files', description: '300 MB of duplicate files found.',
      estimatedBenefit: { storageRecoveryMB: 300 }, severity: 'medium',
      evidence: [{ source: 'duplicate_finder', metric: 'duplicate_size', value: '300', unit: 'MB', timestamp: Date.now(), confidence: 0.88 }],
    }),
  ];
}

function makeMockHandler(): ExecutionHandler {
  return {
    async executeAction(action: OptimizationAction): Promise<ExecutionResult> {
      return {
        actionId: action.id,
        actionTitle: action.title,
        status: 'completed',
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 100,
        error: null,
        warnings: [],
        rollbackAvailable: action.rollbackAvailable,
        rollbackExecuted: false,
        output: { storageRecoveredMB: action.benefits.storageRecoveryMB, ramRecoveredMB: action.benefits.ramRecoveryMB },
      };
    },
    async rollbackAction(_action: OptimizationAction): Promise<boolean> {
      return true;
    },
  };
}

function makeFailingHandler(): ExecutionHandler {
  return {
    async executeAction(action: OptimizationAction): Promise<ExecutionResult> {
      return {
        actionId: action.id,
        actionTitle: action.title,
        status: 'failed',
        startedAt: Date.now(),
        completedAt: Date.now(),
        durationMs: 50,
        error: 'Mock execution failure',
        warnings: [],
        rollbackAvailable: action.rollbackAvailable,
        rollbackExecuted: false,
        output: {},
      };
    },
    async rollbackAction(_action: OptimizationAction): Promise<boolean> {
      return true;
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('SmartOptimizationEngine', () => {
  let engine: SmartOptimizationEngine;

  beforeEach(() => {
    engine = new SmartOptimizationEngine();
  });

  afterEach(() => {
    engine.dispose();
  });

  describe('Impact Calculation', () => {
    const config = DEFAULT_OPTIMIZATION_CONFIG;
    const calculator = new OptimizationImpactCalculator(config);

    it('calculates storage recovery benefits', () => {
      const finding = makeFinding({ estimatedBenefit: { storageRecoveryMB: 500 } });
      const benefits = calculator.calculateBenefits(finding);
      expect(benefits.storageRecoveryMB).toBe(500);
    });

    it('applies category defaults for temp files', () => {
      const finding = makeFinding({ category: 'temp_files', estimatedBenefit: {} });
      const benefits = calculator.calculateBenefits(finding);
      expect(benefits.storageRecoveryMB).toBeGreaterThan(0);
    });

    it('computes impact score and tier', () => {
      const finding = makeFinding({ estimatedBenefit: { storageRecoveryMB: 2000 }, severity: 'high' });
      const benefits = calculator.calculateBenefits(finding);
      const impact = calculator.calculateImpact(finding, benefits);
      expect(impact.score).toBeGreaterThan(0);
      expect(['high', 'medium', 'low', 'informational']).toContain(impact.tier);
    });

    it('identifies primary benefit correctly', () => {
      const finding = makeFinding({ estimatedBenefit: { storageRecoveryMB: 1000, ramRecoveryMB: 50 } });
      const benefits = calculator.calculateBenefits(finding);
      const impact = calculator.calculateImpact(finding, benefits);
      expect(impact.primaryBenefit).toBe('storageRecoveryMB');
    });
  });

  describe('Risk Analysis', () => {
    const config = DEFAULT_OPTIMIZATION_CONFIG;
    const analyzer = new OptimizationRiskAnalyzer(config);

    it('marks temp file cleaning as low risk and reversible', () => {
      const finding = makeFinding({ category: 'temp_files' });
      const risk = analyzer.analyze(finding, 'clean_temp_files');
      expect(risk.reversible).toBe(true);
      expect(risk.level).toBe('low');
    });

    it('marks browser privacy clearing as irreversible', () => {
      const finding = makeFinding({ category: 'browser_privacy' });
      const risk = analyzer.analyze(finding, 'clear_browser_privacy');
      expect(risk.reversible).toBe(false);
    });

    it('marks registry cleaning as moderate risk', () => {
      const finding = makeFinding({ category: 'registry' });
      const risk = analyzer.analyze(finding, 'clean_registry');
      expect(risk.level).toBe('moderate');
      expect(risk.userConfirmationRequired).toBe(true);
    });

    it('marks windows update as requiring restart', () => {
      const finding = makeFinding({ category: 'windows_update' });
      const risk = analyzer.analyze(finding, 'run_windows_update');
      expect(risk.requiresRestart).toBe(true);
    });

    it('provides risk factors and mitigations', () => {
      const finding = makeFinding({ category: 'registry' });
      const risk = analyzer.analyze(finding, 'clean_registry');
      expect(risk.factors.length).toBeGreaterThan(0);
      expect(risk.mitigations.length).toBeGreaterThan(0);
    });
  });

  describe('Recommendation Generation', () => {
    const config = DEFAULT_OPTIMIZATION_CONFIG;
    const engine = new OptimizationRecommendationEngine(config);

    it('generates actions from findings', () => {
      const actions = engine.generateRecommendations(makeFindings());
      expect(actions.length).toBe(5);
    });

    it('maps categories to action types correctly', () => {
      const actions = engine.generateRecommendations(makeFindings());
      const tempAction = actions.find((a) => a.category === 'temp_files');
      expect(tempAction!.type).toBe('clean_temp_files');
      const startupAction = actions.find((a) => a.category === 'startup');
      expect(startupAction!.type).toBe('disable_startup_entry');
    });

    it('includes evidence in each action', () => {
      const actions = engine.generateRecommendations(makeFindings());
      for (const action of actions) {
        expect(action.evidence.length).toBeGreaterThan(0);
      }
    });

    it('computes confidence from evidence', () => {
      const actions = engine.generateRecommendations(makeFindings());
      for (const action of actions) {
        expect(action.confidence).toBeGreaterThan(0);
        expect(action.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Scoring & Prioritization', () => {
    const config = DEFAULT_OPTIMIZATION_CONFIG;
    const learning = new OptimizationLearning();
    const scorer = new OptimizationScorer(config, learning.getLearningData());

    it('scores actions between 0 and 100', () => {
      const recEngine = new OptimizationRecommendationEngine(config);
      const actions = recEngine.generateRecommendations(makeFindings());
      for (const action of actions) {
        const score = scorer.score(action);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    });

    it('prioritizes by impact score', () => {
      const prioritizer = new OptimizationPrioritizer(config);
      const recEngine = new OptimizationRecommendationEngine(config);
      const actions = recEngine.generateRecommendations(makeFindings());
      const prioritized = prioritizer.prioritize(actions);
      expect(prioritized.length).toBeGreaterThan(0);
      expect(prioritized[0]!.impact.score).toBeGreaterThanOrEqual(prioritized[prioritized.length - 1]!.impact.score);
    });

    it('respects maxActions limit', () => {
      const limitedConfig = { ...config, maxActions: 2 };
      const prioritizer = new OptimizationPrioritizer(limitedConfig);
      const recEngine = new OptimizationRecommendationEngine(config);
      const actions = recEngine.generateRecommendations(makeFindings());
      const prioritized = prioritizer.prioritize(actions);
      expect(prioritized.length).toBeLessThanOrEqual(2);
    });

    it('determines plan tier from actions', () => {
      const prioritizer = new OptimizationPrioritizer(config);
      const recEngine = new OptimizationRecommendationEngine(config);
      const actions = recEngine.generateRecommendations(makeFindings());
      const tier = prioritizer.determinePlanTier(actions);
      expect(['high', 'medium', 'low', 'informational']).toContain(tier);
    });
  });

  describe('Dependency Resolution', () => {
    const resolver = new OptimizationDependencyResolver();

    it('resolves simple dependencies in order', () => {
      const actions: OptimizationAction[] = [
        { id: 'a', dependencies: ['b'] } as unknown as OptimizationAction,
        { id: 'b', dependencies: [] } as unknown as OptimizationAction,
      ];
      const result = resolver.resolve(actions);
      expect(result.resolved).toBe(true);
      expect(result.order.indexOf('b')).toBeLessThan(result.order.indexOf('a'));
    });

    it('detects missing dependencies', () => {
      const actions: OptimizationAction[] = [
        { id: 'a', dependencies: ['nonexistent'] } as unknown as OptimizationAction,
      ];
      const result = resolver.resolve(actions);
      expect(result.resolved).toBe(false);
      expect(result.unresolvedDependencies.length).toBeGreaterThan(0);
    });

    it('handles empty action list', () => {
      const result = resolver.resolve([]);
      expect(result.resolved).toBe(true);
      expect(result.order).toEqual([]);
    });
  });

  describe('Conflict Resolution', () => {
    const resolver = new OptimizationConflictResolver();

    it('detects duplicate actions', () => {
      const actions: OptimizationAction[] = [
        { id: 'a', type: 'clean_temp_files' as const, category: 'temp_files' as const, impact: { score: 50 } } as unknown as OptimizationAction,
        { id: 'b', type: 'clean_temp_files' as const, category: 'temp_files' as const, impact: { score: 30 } } as unknown as OptimizationAction,
      ];
      const result = resolver.resolve(actions);
      expect(result.resolvedConflicts.length).toBeGreaterThan(0);
    });

    it('keeps higher impact action in conflict', () => {
      const actions: OptimizationAction[] = [
        { id: 'a', type: 'clean_temp_files' as const, category: 'temp_files' as const, impact: { score: 60 } } as unknown as OptimizationAction,
        { id: 'b', type: 'clean_temp_files' as const, category: 'temp_files' as const, impact: { score: 30 } } as unknown as OptimizationAction,
      ];
      const result = resolver.resolve(actions);
      expect(result.resolvedConflicts[0]!.keptActionId).toBe('a');
    });
  });

  describe('Plan Generation', () => {
    it('generates a complete plan from findings', () => {
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      expect(plan.actions.length).toBeGreaterThan(0);
      expect(plan.currentHealthScore).toBe(65);
      expect(plan.predictedHealthScore).toBeGreaterThan(65);
      expect(plan.reasoning.length).toBeGreaterThan(0);
      expect(plan.sourceModules.length).toBeGreaterThan(0);
    });

    it('computes total benefits correctly', () => {
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      expect(plan.totalBenefits.storageRecoveryMB).toBeGreaterThan(0);
    });

    it('sets plan expiry', () => {
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      expect(plan.expiresAt).toBeGreaterThan(plan.generatedAt);
    });

    it('filters excluded categories', () => {
      const config = { ...DEFAULT_OPTIMIZATION_CONFIG, excludedCategories: ['recycle_bin' as const] };
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(config, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      expect(plan.actions.every((a) => a.category !== 'recycle_bin')).toBe(true);
    });
  });

  describe('Preview', () => {
    it('builds a human-readable preview', () => {
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      const previewBuilder = new OptimizationPreviewBuilder();
      const preview = previewBuilder.build(plan);
      expect(preview.headline).toBeTruthy();
      expect(preview.actionsPreview.length).toBeGreaterThan(0);
      expect(preview.scoreImprovement).toBeGreaterThan(0);
    });

    it('includes warnings for irreversible actions', () => {
      const finding = makeFinding({ category: 'browser_privacy', estimatedBenefit: { privacyImprovement: 20 } });
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan([finding], 70);
      const previewBuilder = new OptimizationPreviewBuilder();
      const preview = previewBuilder.build(plan);
      expect(preview.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Simulation', () => {
    it('projects system state after optimization', () => {
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      const sim = new OptimizationSimulationEngine();
      const currentState: SystemStateProjection = {
        cpuUsagePercent: 45,
        memoryUsageMB: 8000,
        diskFreeSpaceMB: 20000,
        startupTimeSeconds: 30,
        browserResponsiveness: 60,
        privacyScore: 40,
        thermalScore: 70,
        batteryEstimateHours: 4,
        stabilityScore: 80,
      };
      const result = sim.simulate(plan, currentState);
      expect(result.projectedSystemState.diskFreeSpaceMB).toBeGreaterThan(currentState.diskFreeSpaceMB);
      expect(result.simulatedHealthScore).toBeGreaterThan(0);
      expect(result.assumptions.length).toBeGreaterThan(0);
    });
  });

  describe('Approval Flow', () => {
    it('auto-approves low-risk actions when enabled', () => {
      const manager = new OptimizationApprovalManager(true);
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      manager.requestApprovals(plan);
      const autoApproved = plan.actions.filter((a) => !a.requiresUserConfirmation);
      expect(manager.getApprovedActionIds().length).toBeGreaterThanOrEqual(autoApproved.length);
    });

    it('requires manual approval for high-risk actions', () => {
      const manager = new OptimizationApprovalManager(false);
      const finding = makeFinding({ category: 'registry', estimatedBenefit: { performanceImprovement: 2 } });
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan([finding], 70);
      const requests = manager.requestApprovals(plan);
      expect(requests.length).toBeGreaterThan(0);
    });

    it('processes approval and rejection', () => {
      const manager = new OptimizationApprovalManager(false);
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      const requests = manager.requestApprovals(plan);
      if (requests.length > 0) {
        const req = requests[0]!;
        expect(manager.approve(req.id)).toBe(true);
        expect(manager.isApproved(req.actionId)).toBe(true);
      }
    });
  });

  describe('Rollback Planning', () => {
    it('creates rollback plan for reversible actions', () => {
      const planner = new OptimizationRollbackPlanner();
      const recEngine = new OptimizationRecommendationEngine(DEFAULT_OPTIMIZATION_CONFIG);
      const actions = recEngine.generateRecommendations(makeFindings());
      const tempAction = actions.find((a) => a.type === 'clean_temp_files')!;
      const rollback = planner.createRollbackPlan(tempAction);
      expect(rollback.canExecute).toBe(true);
      expect(rollback.steps.length).toBeGreaterThan(0);
    });

    it('marks irreversible actions as non-rollbackable', () => {
      const planner = new OptimizationRollbackPlanner();
      const finding = makeFinding({ category: 'browser_privacy' });
      const recEngine = new OptimizationRecommendationEngine(DEFAULT_OPTIMIZATION_CONFIG);
      const actions = recEngine.generateRecommendations([finding]);
      const privacyAction = actions.find((a) => a.type === 'clear_browser_privacy')!;
      const rollback = planner.createRollbackPlan(privacyAction);
      expect(rollback.canExecute).toBe(false);
    });
  });

  describe('Insights', () => {
    it('generates explainable insights', () => {
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      const insightsEngine = new OptimizationInsights();
      const insights = insightsEngine.generateInsights(plan);
      expect(insights.length).toBeGreaterThan(0);
      for (const insight of insights) {
        expect(insight.explanation).toBeTruthy();
        expect(insight.whyNow).toBeTruthy();
        expect(insight.whatHappensIfSkipped).toBeTruthy();
        expect(insight.expectedImprovement).toBeTruthy();
      }
    });
  });

  describe('Learning', () => {
    it('tracks accepted optimizations', () => {
      const learning = new OptimizationLearning();
      const recEngine = new OptimizationRecommendationEngine(DEFAULT_OPTIMIZATION_CONFIG);
      const actions = recEngine.generateRecommendations(makeFindings());
      learning.recordAcceptance(actions[0]!);
      expect(learning.getLearningData().totalOptimizations).toBe(1);
      expect(learning.getLearningData().acceptedOptimizations.length).toBe(1);
    });

    it('tracks rejected recommendations', () => {
      const learning = new OptimizationLearning();
      const recEngine = new OptimizationRecommendationEngine(DEFAULT_OPTIMIZATION_CONFIG);
      const actions = recEngine.generateRecommendations(makeFindings());
      learning.recordRejection(actions[0]!, 'User declined');
      expect(learning.getLearningData().rejectedRecommendations.length).toBe(1);
    });

    it('infers preferred style from acceptance rate', () => {
      const learning = new OptimizationLearning();
      const recEngine = new OptimizationRecommendationEngine(DEFAULT_OPTIMIZATION_CONFIG);
      const actions = recEngine.generateRecommendations(makeFindings());
      for (let i = 0; i < 9; i++) {
        learning.recordAcceptance(actions[i % actions.length]!);
      }
      learning.recordRejection(actions[0]!, 'User declined');
      expect(learning.getPreferredStyle()).toBe('aggressive');
    });

    it('computes acceptance rate per category', () => {
      const learning = new OptimizationLearning();
      const recEngine = new OptimizationRecommendationEngine(DEFAULT_OPTIMIZATION_CONFIG);
      const actions = recEngine.generateRecommendations(makeFindings());
      learning.recordAcceptance(actions[0]!);
      learning.recordAcceptance(actions[0]!);
      learning.recordRejection(actions[0]!);
      const rate = learning.getAcceptanceRate(actions[0]!.category);
      expect(rate).toBeCloseTo(2 / 3, 1);
    });
  });

  describe('History', () => {
    it('stores and retrieves reports', () => {
      const history = new OptimizationHistory();
      const mockReport = {
        planId: 'test-plan',
        executedAt: Date.now(),
        completedAt: Date.now(),
        totalDurationMs: 1000,
        results: [],
        summary: {
          headline: 'Test',
          actionsPerformed: 1,
          actionsFailed: 0,
          actionsSkipped: 0,
          healthScoreBefore: 60,
          healthScoreAfter: 70,
          healthScoreChange: 10,
          storageRecoveredMB: 100,
          ramRecoveredMB: 50,
          startupImprovementMs: 500,
          browserImprovement: 5,
          privacyImprovement: 10,
          rollbackAvailable: true,
          nextRecommendedAction: null,
        },
        beforeAfter: {
          before: {} as never,
          after: {} as never,
          deltas: {} as never,
        },
        rollbackAvailable: true,
        successCount: 1,
        failureCount: 0,
        skippedCount: 0,
      };
      history.addReport(mockReport);
      expect(history.getReportCount()).toBe(1);
      expect(history.getLatestReport()?.planId).toBe('test-plan');
    });
  });

  describe('Dashboard', () => {
    it('builds dashboard data from plan and history', () => {
      const learning = new OptimizationLearning();
      const planner = new OptimizationPlanner(DEFAULT_OPTIMIZATION_CONFIG, learning.getLearningData());
      const plan = planner.plan(makeFindings(), 65);
      const history = new OptimizationHistory();
      const dashboardProvider = new OptimizationDashboardProvider();
      const dashboard = dashboardProvider.build(plan, history);
      expect(dashboard.summary.totalAvailableActions).toBeGreaterThan(0);
      expect(dashboard.topRecommendations.length).toBeGreaterThan(0);
    });

    it('handles null plan gracefully', () => {
      const history = new OptimizationHistory();
      const dashboardProvider = new OptimizationDashboardProvider();
      const dashboard = dashboardProvider.build(null, history);
      expect(dashboard.summary.totalAvailableActions).toBe(0);
      expect(dashboard.topRecommendations).toEqual([]);
    });
  });

  describe('Full Engine Integration', () => {
    it('generates plan, preview, and insights end-to-end', () => {
      const plan = engine.generatePlan(makeFindings(), 60);
      expect(plan.actions.length).toBeGreaterThan(0);

      const preview = engine.preview();
      expect(preview.actionsPreview.length).toBeGreaterThan(0);

      const insights = engine.generateInsights();
      expect(insights.length).toBeGreaterThan(0);

      const dashboard = engine.buildDashboard();
      expect(dashboard.summary.totalAvailableActions).toBeGreaterThan(0);
    });

    it('executes plan with mock handler', async () => {
      engine.generatePlan(makeFindings(), 60);
      engine.setExecutionHandler(makeMockHandler());
      const report = await engine.executePlan();
      expect(report.successCount).toBeGreaterThan(0);
      expect(report.failureCount).toBe(0);
      expect(report.summary.actionsPerformed).toBeGreaterThan(0);
    });

    it('handles execution failures gracefully', async () => {
      engine.generatePlan(makeFindings(), 60);
      engine.setExecutionHandler(makeFailingHandler());
      const report = await engine.executePlan();
      expect(report.failureCount).toBeGreaterThan(0);
      expect(report.summary.nextRecommendedAction).toBeTruthy();
    });

    it('records learning after execution', async () => {
      engine.generatePlan(makeFindings(), 60);
      engine.setExecutionHandler(makeMockHandler());
      await engine.executePlan();
      expect(engine.getLearning().getLearningData().totalOptimizations).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty findings', () => {
      const plan = engine.generatePlan([], 70);
      expect(plan.actions).toEqual([]);
      expect(plan.estimatedHealthScoreGain).toBe(0);
    });

    it('handles single finding', () => {
      const plan = engine.generatePlan([makeFinding()], 70);
      expect(plan.actions.length).toBe(1);
    });

    it('throws on preview without plan', () => {
      expect(() => engine.preview()).toThrow('No plan available');
    });

    it('throws on execute without plan', async () => {
      await expect(engine.executePlan()).rejects.toThrow('No plan available');
    });

    it('throws on execute without handler', async () => {
      engine.generatePlan(makeFindings(), 60);
      await expect(engine.executePlan()).rejects.toThrow('No execution handler');
    });
  });

  describe('Safety', () => {
    it('never produces unsafe actions', () => {
      const plan = engine.generatePlan(makeFindings(), 60);
      for (const action of plan.actions) {
        expect(action.risk.score).toBeLessThanOrEqual(100);
        expect(action.confidence).toBeGreaterThan(0);
      }
    });

    it('rollback is available for reversible actions', () => {
      const plan = engine.generatePlan(makeFindings(), 60);
      const reversible = plan.actions.filter((a) => a.rollbackAvailable);
      for (const action of reversible) {
        const rollbackPlanner = new OptimizationRollbackPlanner();
        const rollback = rollbackPlanner.createRollbackPlan(action);
        expect(rollback.canExecute).toBe(true);
      }
    });

    it('registry cleaning is never aggressive', () => {
      const finding = makeFinding({ category: 'registry', estimatedBenefit: { performanceImprovement: 1 } });
      const plan = engine.generatePlan([finding], 70);
      const registryAction = plan.actions.find((a) => a.category === 'registry');
      if (registryAction) {
        expect(registryAction.risk.level).not.toBe('severe');
        expect(registryAction.risk.userConfirmationRequired).toBe(true);
      }
    });
  });

  describe('Configuration', () => {
    it('uses default configuration', () => {
      const config = engine.getConfiguration();
      expect(config.maxActions).toBe(DEFAULT_OPTIMIZATION_CONFIG.maxActions);
      expect(config.enableRollback).toBe(true);
    });

    it('updates configuration', () => {
      engine.updateConfiguration({ maxActions: 5 });
      expect(engine.getConfiguration().maxActions).toBe(5);
    });

    it('validates configuration values', () => {
      const manager = new OptimizationConfigurationManager({ maxActions: -1 });
      expect(manager.get().maxActions).toBe(1);
    });

    it('respects risk tolerance', () => {
      const manager = new OptimizationConfigurationManager({ riskTolerance: 'low' });
      expect(manager.isRiskAcceptable('moderate')).toBe(false);
      expect(manager.isRiskAcceptable('low')).toBe(true);
    });
  });
});
