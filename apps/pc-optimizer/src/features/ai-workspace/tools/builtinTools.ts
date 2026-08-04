/**
 * AI Tool Framework — Initial Tools
 *
 * EPIC 5 PHASE A PART 2
 *
 * 12 built-in tools that expose AI capabilities through the tool framework.
 * Each tool orchestrates existing AI module outputs without duplicating logic.
 */
import type { Tool, ToolDefinition, ToolInput, ToolResult, AIAssistantEvidence } from './types';
import { BaseTool } from './baseTool';

// ── 1. ExplainHealthTool ─────────────────────────────────────

export class ExplainHealthTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'explain_health',
    name: 'Explain Health Score',
    description: 'Explains the current system health score with evidence and reasoning',
    category: 'explanation',
    supportedIntents: ['explanation', 'question'],
    requiredCapabilities: ['explain_health_score'],
    requiredPermissions: 'free',
    requiredContext: ['health_score'],
    estimatedDuration: 50,
    riskLevel: 'none',
    outputType: 'explanation',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const score = input.context.healthScore;

    if (score === null) {
      return this._createFailureResult(this.definition.id, 'Health score not available', Date.now() - start);
    }

    const level = score >= 80 ? 'good' : score >= 60 ? 'fair' : score >= 40 ? 'poor' : 'critical';
    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('health_score', 'score', score, 'Current health score'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      0.9,
      `Your health score is ${score}, which is considered "${level}".`,
      { score, level },
      evidence,
      [{
        actionType: 'view_recommendations',
        title: 'View Recommendations',
        description: score < 60 ? 'Review recommendations to improve your health score' : 'Continue monitoring your health score',
        priority: score < 60 ? 'high' : 'low',
        parameters: {},
        futureMetadata: {},
      }],
      ['HealthScore'],
      Date.now() - start,
    );
  }
}

// ── 2. ExplainRecommendationTool ─────────────────────────────

export class ExplainRecommendationTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'explain_recommendation',
    name: 'Explain Recommendation',
    description: 'Explains a specific recommendation with evidence and reasoning',
    category: 'explanation',
    supportedIntents: ['explanation', 'question'],
    requiredCapabilities: ['explain_recommendations'],
    requiredPermissions: 'free',
    requiredContext: ['recommendations'],
    estimatedDuration: 50,
    riskLevel: 'none',
    outputType: 'explanation',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const recs = input.context.activeRecommendations;
    const targetId = input.parameters.recommendationId as string | undefined;
    const rec = targetId ? recs.find((r) => r.id === targetId) : recs[0];

    if (!rec) {
      return this._createFailureResult(this.definition.id, 'No recommendation found', Date.now() - start);
    }

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('recommendation', 'id', rec.id, 'Recommendation ID'),
      this._createEvidence('recommendation', 'category', rec.category, 'Recommendation category'),
      this._createEvidence('recommendation', 'priority', rec.priority, 'Recommendation priority'),
      this._createEvidence('recommendation', 'confidence', rec.confidence, 'Recommendation confidence'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      rec.confidence,
      `Recommendation: ${rec.title} (Category: ${rec.category}, Priority: ${rec.priority}, Confidence: ${(rec.confidence * 100).toFixed(0)}%)`,
      { recommendation: rec },
      evidence,
      [{
        actionType: 'apply_recommendation',
        title: 'Apply Recommendation',
        description: `Apply "${rec.title}" to improve system performance`,
        priority: rec.priority === 'critical' || rec.priority === 'high' ? 'high' : 'medium',
        parameters: { recommendationId: rec.id },
        futureMetadata: {},
      }],
      ['RecommendationEngine'],
      Date.now() - start,
    );
  }
}

// ── 3. ExplainPredictionTool ─────────────────────────────────

export class ExplainPredictionTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'explain_prediction',
    name: 'Explain Prediction',
    description: 'Explains a specific prediction with evidence and risk assessment',
    category: 'predictions',
    supportedIntents: ['explanation', 'question'],
    requiredCapabilities: ['explain_predictions'],
    requiredPermissions: 'free',
    requiredContext: ['predictions'],
    estimatedDuration: 50,
    riskLevel: 'none',
    outputType: 'explanation',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const preds = input.context.activePredictions;
    const targetId = input.parameters.predictionId as string | undefined;
    const pred = targetId ? preds.find((p) => p.id === targetId) : preds[0];

    if (!pred) {
      return this._createFailureResult(this.definition.id, 'No prediction found', Date.now() - start);
    }

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('prediction', 'id', pred.id, 'Prediction ID'),
      this._createEvidence('prediction', 'category', pred.category, 'Prediction category'),
      this._createEvidence('prediction', 'riskLevel', pred.riskLevel, 'Predicted risk level'),
      this._createEvidence('prediction', 'confidence', pred.confidence, 'Prediction confidence'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      pred.confidence,
      `Prediction: ${pred.title} (Category: ${pred.category}, Risk: ${pred.riskLevel}, Confidence: ${(pred.confidence * 100).toFixed(0)}%)`,
      { prediction: pred },
      evidence,
      [{
        actionType: 'mitigate_risk',
        title: 'Mitigate Risk',
        description: pred.riskLevel === 'critical' || pred.riskLevel === 'high'
          ? 'Take proactive measures to mitigate this predicted risk'
          : 'Monitor the situation and address if conditions worsen',
        priority: pred.riskLevel === 'critical' || pred.riskLevel === 'high' ? 'high' : 'low',
        parameters: { predictionId: pred.id },
        futureMetadata: {},
      }],
      ['PredictionEngine'],
      Date.now() - start,
    );
  }
}

// ── 4. ExplainTimelineTool ───────────────────────────────────

export class ExplainTimelineTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'explain_timeline',
    name: 'Explain Timeline Event',
    description: 'Explains a specific timeline event with context',
    category: 'timeline',
    supportedIntents: ['explanation', 'question'],
    requiredCapabilities: ['explain_timeline_events'],
    requiredPermissions: 'free',
    requiredContext: ['timeline'],
    estimatedDuration: 50,
    riskLevel: 'none',
    outputType: 'explanation',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const events = input.context.recentTimelineEvents;
    const targetId = input.parameters.eventId as string | undefined;
    const event = targetId ? events.find((e) => e.id === targetId) : events[0];

    if (!event) {
      return this._createFailureResult(this.definition.id, 'No timeline event found', Date.now() - start);
    }

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('timeline', 'id', event.id, 'Event ID'),
      this._createEvidence('timeline', 'title', event.title, 'Event title'),
      this._createEvidence('timeline', 'category', event.category, 'Event category'),
      this._createEvidence('timeline', 'severity', event.severity, 'Event severity'),
      this._createEvidence('timeline', 'timestamp', event.timestamp, 'Event timestamp'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      0.9,
      `Timeline Event: ${event.title} (Category: ${event.category}, Severity: ${event.severity}, Time: ${event.timestamp})`,
      { event },
      evidence,
      [{
        actionType: 'investigate_event',
        title: 'Investigate Event',
        description: event.severity === 'critical' || event.severity === 'high'
          ? 'This event requires investigation'
          : 'No immediate action required',
        priority: event.severity === 'critical' || event.severity === 'high' ? 'high' : 'low',
        parameters: { eventId: event.id },
        futureMetadata: {},
      }],
      ['TimelineEngine'],
      Date.now() - start,
    );
  }
}

// ── 5. ExplainGoalTool ───────────────────────────────────────

export class ExplainGoalTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'explain_goal',
    name: 'Explain Goal',
    description: 'Explains a specific goal with progress and status',
    category: 'goals',
    supportedIntents: ['explanation', 'question', 'goal_management'],
    requiredCapabilities: [],
    requiredPermissions: 'free',
    requiredContext: ['goals'],
    estimatedDuration: 50,
    riskLevel: 'none',
    outputType: 'explanation',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const goals = input.context.activeGoals;
    const targetId = input.parameters.goalId as string | undefined;
    const goal = targetId ? goals.find((g) => g.id === targetId) : goals[0];

    if (!goal) {
      return this._createFailureResult(this.definition.id, 'No goal found', Date.now() - start);
    }

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('goal', 'id', goal.id, 'Goal ID'),
      this._createEvidence('goal', 'name', goal.name, 'Goal name'),
      this._createEvidence('goal', 'status', goal.status, 'Goal status'),
      this._createEvidence('goal', 'priority', goal.priority, 'Goal priority'),
      this._createEvidence('goal', 'progress', goal.progress, 'Goal progress'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      0.8 + goal.progress * 0.2,
      `Goal: ${goal.name} (Status: ${goal.status}, Priority: ${goal.priority}, Progress: ${(goal.progress * 100).toFixed(0)}%)`,
      { goal },
      evidence,
      [{
        actionType: 'continue_goal',
        title: 'Continue Goal',
        description: goal.status === 'blocked'
          ? 'Resolve blocking issues to resume progress'
          : 'Continue with current strategies',
        priority: goal.status === 'blocked' ? 'high' : 'medium',
        parameters: { goalId: goal.id },
        futureMetadata: {},
      }],
      ['GoalsEngine'],
      Date.now() - start,
    );
  }
}

// ── 6. ShowRecoveryTool ──────────────────────────────────────

export class ShowRecoveryTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'show_recovery',
    name: 'Show Recovery Options',
    description: 'Shows available recovery and rollback options',
    category: 'recovery',
    supportedIntents: ['recovery', 'question'],
    requiredCapabilities: ['explain_recovery_options'],
    requiredPermissions: 'free',
    requiredContext: ['recovery_history'],
    estimatedDuration: 100,
    riskLevel: 'low',
    outputType: 'data',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const history = input.context.recoveryHistory;

    if (history.length === 0) {
      return this._createSuccessResult(
        this.definition.id,
        0.5,
        'No recovery history available. Recovery options will appear after optimizations.',
        { recoveryCount: 0 },
        [this._createEvidence('recovery_history', 'count', 0, 'No recovery history')],
        [],
        ['RecoveryCenter'],
        Date.now() - start,
      );
    }

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('recovery_history', 'count', history.length, 'Recovery records count'),
    ];

    const successful = history.filter((r) => r.success).length;

    return this._createSuccessResult(
      this.definition.id,
      0.85,
      `You have ${history.length} recovery records (${successful} successful). Recovery options are available for rollback.`,
      { recoveryCount: history.length, successful, records: history },
      evidence,
      [{
        actionType: 'view_recovery',
        title: 'View Recovery Options',
        description: 'Review available recovery and rollback options',
        priority: 'medium',
        parameters: {},
        futureMetadata: {},
      }],
      ['RecoveryCenter'],
      Date.now() - start,
    );
  }
}

// ── 7. ComparePlansTool ──────────────────────────────────────

export class ComparePlansTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'compare_plans',
    name: 'Compare Plans',
    description: 'Compares different optimization strategies based on recommendations',
    category: 'optimization',
    supportedIntents: ['comparison', 'planning'],
    requiredCapabilities: ['compare_strategies'],
    requiredPermissions: 'free',
    requiredContext: ['recommendations'],
    estimatedDuration: 200,
    riskLevel: 'none',
    outputType: 'comparison',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const recs = input.context.activeRecommendations;

    if (recs.length < 2) {
      return this._createFailureResult(this.definition.id, 'Need at least 2 recommendations for comparison', Date.now() - start);
    }

    const byPriority: Record<string, number> = {};
    for (const rec of recs) {
      byPriority[rec.priority] = (byPriority[rec.priority] ?? 0) + 1;
    }

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('recommendations', 'count', recs.length, 'Total recommendations'),
      this._createEvidence('recommendations', 'priorities', JSON.stringify(byPriority), 'Priority distribution'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      0.8,
      `Comparison of ${recs.length} recommendations across ${Object.keys(byPriority).length} priority levels.`,
      { recommendationCount: recs.length, byPriority, recommendations: recs },
      evidence,
      [{
        actionType: 'select_plan',
        title: 'Select Plan',
        description: 'Choose the best optimization strategy based on the comparison',
        priority: 'medium',
        parameters: {},
        futureMetadata: {},
      }],
      ['RecommendationEngine', 'OptimizationPlanner'],
      Date.now() - start,
    );
  }
}

// ── 8. SimulationTool ────────────────────────────────────────

export class SimulationTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'run_simulation',
    name: 'Run Simulation',
    description: 'Runs a simulation of optimization strategies (does not execute)',
    category: 'optimization',
    supportedIntents: ['planning', 'comparison'],
    requiredCapabilities: [],
    requiredPermissions: 'pro',
    requiredContext: ['recommendations', 'health_score'],
    estimatedDuration: 500,
    riskLevel: 'none',
    outputType: 'data',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const recs = input.context.activeRecommendations;
    const score = input.context.healthScore;

    if (recs.length === 0 || score === null) {
      return this._createFailureResult(this.definition.id, 'Insufficient data for simulation', Date.now() - start);
    }

    const projectedScore = Math.min(100, score + recs.length * 3);
    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('simulation', 'currentScore', score, 'Current health score'),
      this._createEvidence('simulation', 'projectedScore', projectedScore, 'Projected health score after optimization'),
      this._createEvidence('simulation', 'recommendationCount', recs.length, 'Recommendations applied in simulation'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      0.75,
      `Simulation: Applying ${recs.length} recommendations could improve health score from ${score} to ${projectedScore}.`,
      { currentScore: score, projectedScore, recommendationCount: recs.length },
      evidence,
      [{
        actionType: 'create_optimization_session',
        title: 'Create Optimization Session',
        description: 'Create an optimization session based on simulation results',
        priority: 'medium',
        parameters: { projectedScore },
        futureMetadata: {},
      }],
      ['SimulationEngine', 'RecommendationEngine'],
      Date.now() - start,
    );
  }
}

// ── 9. OptimizationSessionTool ───────────────────────────────

export class OptimizationSessionTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'create_optimization_session',
    name: 'Create Optimization Session',
    description: 'Creates an optimization session plan (does not execute optimizations)',
    category: 'optimization',
    supportedIntents: ['optimization', 'planning'],
    requiredCapabilities: ['generate_optimization_session'],
    requiredPermissions: 'pro',
    requiredContext: ['recommendations'],
    estimatedDuration: 300,
    riskLevel: 'medium',
    outputType: 'plan',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const recs = input.context.activeRecommendations;

    if (recs.length === 0) {
      return this._createFailureResult(this.definition.id, 'No recommendations available for session', Date.now() - start);
    }

    const sorted = [...recs].sort((a, b) => {
      const order = ['critical', 'high', 'medium', 'low'];
      return order.indexOf(a.priority) - order.indexOf(b.priority);
    });

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('optimization_session', 'recommendationCount', recs.length, 'Recommendations in session'),
      this._createEvidence('optimization_session', 'topPriority', sorted[0]!.priority, 'Highest priority'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      0.85,
      `Optimization session plan created with ${recs.length} recommendations. Top priority: ${sorted[0]!.priority}.`,
      { plan: sorted, recommendationCount: recs.length },
      evidence,
      [{
        actionType: 'confirm_session',
        title: 'Confirm Session',
        description: 'Confirm and start the optimization session',
        priority: 'high',
        parameters: { plan: sorted },
        futureMetadata: {},
      }],
      ['OptimizationPlanner', 'RecommendationEngine'],
      Date.now() - start,
    );
  }
}

// ── 10. MaintenanceTool ──────────────────────────────────────

export class MaintenanceTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'start_maintenance',
    name: 'Start Maintenance',
    description: 'Plans a maintenance session (does not execute)',
    category: 'maintenance',
    supportedIntents: ['maintenance'],
    requiredCapabilities: [],
    requiredPermissions: 'free',
    requiredContext: [],
    estimatedDuration: 100,
    riskLevel: 'low',
    outputType: 'plan',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const history = input.context.maintenanceHistory;
    const lastMaintenance = history[0];

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('maintenance', 'historyCount', history.length, 'Maintenance history count'),
    ];

    if (lastMaintenance) {
      evidence.push(this._createEvidence('maintenance', 'lastType', lastMaintenance.type, 'Last maintenance type'));
    }

    return this._createSuccessResult(
      this.definition.id,
      0.8,
      `Maintenance plan ready. ${history.length > 0 ? `Last maintenance: ${lastMaintenance!.type} on ${lastMaintenance!.timestamp}` : 'No previous maintenance.'}`,
      { historyCount: history.length, lastMaintenance },
      evidence,
      [{
        actionType: 'confirm_maintenance',
        title: 'Confirm Maintenance',
        description: 'Confirm and start the maintenance session',
        priority: 'medium',
        parameters: {},
        futureMetadata: {},
      }],
      ['Maintenance'],
      Date.now() - start,
    );
  }
}

// ── 11. GoalCreationTool ─────────────────────────────────────

export class GoalCreationTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'create_goal',
    name: 'Create Goal',
    description: 'Plans a new optimization goal (does not execute)',
    category: 'goals',
    supportedIntents: ['goal_management', 'planning'],
    requiredCapabilities: [],
    requiredPermissions: 'pro',
    requiredContext: [],
    estimatedDuration: 100,
    riskLevel: 'none',
    outputType: 'plan',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const goalName = (input.parameters.name as string) || 'New Optimization Goal';
    const goalType = (input.parameters.type as string) || 'performance';

    const evidence: AIAssistantEvidence[] = [
      this._createEvidence('goal_creation', 'name', goalName, 'Proposed goal name'),
      this._createEvidence('goal_creation', 'type', goalType, 'Proposed goal type'),
    ];

    return this._createSuccessResult(
      this.definition.id,
      0.7,
      `Goal creation plan: "${goalName}" (Type: ${goalType}). This will create a new optimization goal to track progress.`,
      { name: goalName, type: goalType },
      evidence,
      [{
        actionType: 'confirm_goal',
        title: 'Confirm Goal Creation',
        description: `Confirm creation of goal "${goalName}"`,
        priority: 'medium',
        parameters: { name: goalName, type: goalType },
        futureMetadata: {},
      }],
      ['GoalsEngine'],
      Date.now() - start,
    );
  }
}

// ── 12. ReportGenerationTool ─────────────────────────────────

export class ReportGenerationTool extends BaseTool {
  readonly definition: ToolDefinition = {
    id: 'generate_report',
    name: 'Generate Report',
    description: 'Generates a comprehensive system status report',
    category: 'reporting',
    supportedIntents: ['reporting'],
    requiredCapabilities: ['generate_reports'],
    requiredPermissions: 'free',
    requiredContext: [],
    estimatedDuration: 200,
    riskLevel: 'none',
    outputType: 'report',
    status: 'active',
    futureMetadata: {},
  };

  async execute(input: ToolInput): Promise<ToolResult> {
    const start = Date.now();
    const ctx = input.context;

    const evidence: AIAssistantEvidence[] = [];
    const sections: string[] = [];

    if (ctx.healthScore !== null) {
      sections.push(`Health Score: ${ctx.healthScore}`);
      evidence.push(this._createEvidence('report', 'healthScore', ctx.healthScore, 'Current health score'));
    }
    if (ctx.activeGoals.length > 0) {
      sections.push(`Active Goals: ${ctx.activeGoals.length}`);
      evidence.push(this._createEvidence('report', 'goalCount', ctx.activeGoals.length, 'Active goals'));
    }
    if (ctx.activeRecommendations.length > 0) {
      sections.push(`Active Recommendations: ${ctx.activeRecommendations.length}`);
      evidence.push(this._createEvidence('report', 'recommendationCount', ctx.activeRecommendations.length, 'Active recommendations'));
    }
    if (ctx.activePredictions.length > 0) {
      sections.push(`Active Predictions: ${ctx.activePredictions.length}`);
      evidence.push(this._createEvidence('report', 'predictionCount', ctx.activePredictions.length, 'Active predictions'));
    }
    if (ctx.recentTimelineEvents.length > 0) {
      sections.push(`Recent Events: ${ctx.recentTimelineEvents.length}`);
      evidence.push(this._createEvidence('report', 'eventCount', ctx.recentTimelineEvents.length, 'Recent timeline events'));
    }

    return this._createSuccessResult(
      this.definition.id,
      0.85,
      `System Report:\n${sections.map((s) => `- ${s}`).join('\n')}`,
      { sections },
      evidence,
      [],
      ['HealthScore', 'GoalsEngine', 'RecommendationEngine', 'PredictionEngine', 'TimelineEngine'],
      Date.now() - start,
    );
  }
}

// ── Factory ──────────────────────────────────────────────────

export function createDefaultTools(): Tool[] {
  return [
    new ExplainHealthTool(),
    new ExplainRecommendationTool(),
    new ExplainPredictionTool(),
    new ExplainTimelineTool(),
    new ExplainGoalTool(),
    new ShowRecoveryTool(),
    new ComparePlansTool(),
    new SimulationTool(),
    new OptimizationSessionTool(),
    new MaintenanceTool(),
    new GoalCreationTool(),
    new ReportGenerationTool(),
  ];
}
