/**
 * Natural Language Action Engine — Action Planner
 *
 * EPIC 5 PHASE A PART 4
 *
 * Generates structured action plans from intents, entities, context, and tools.
 * Does NOT execute anything — only creates plans.
 * Every plan includes full explainability.
 */
import type {
  ClassifiedIntent,
  ExtractedEntity,
  CopilotContext,
  CopilotCapability,
  ActionPlan,
  ActionStep,
  ToolDefinition,
  ActionRiskLevel,
  ActionExplanation,
  CopilotEvidence,
  ActionPlanStatus,
} from './types';
import { generateActionPlanId, generateActionStepId } from './types';

export class ActionPlanner {
  plan(
    intent: ClassifiedIntent,
    entities: ExtractedEntity[],
    context: CopilotContext,
    tools: ToolDefinition[],
  ): ActionPlan {
    const steps = this._generateSteps(intent, entities, tools);
    const risk = this._assessRisk(intent, steps);
    const benefit = this._estimateBenefit(intent, context, entities);
    const duration = steps.reduce((sum, s) => sum + s.estimatedDurationMs, 0);
    const requiresApproval = this._requiresApproval(risk, intent);
    const rollbackAvailable = this._checkRollback(intent, context);
    const explanation = this._generateExplanation(intent, context, entities, tools, risk, benefit, rollbackAvailable);
    const alternatives = this._generateAlternatives(intent, entities, context, tools);

    return {
      id: generateActionPlanId(),
      intent: intent.intent,
      steps,
      selectedTools: tools,
      estimatedDuration: duration,
      estimatedBenefit: benefit,
      estimatedRisk: risk,
      requiresApproval,
      requiredCapabilities: this._extractCapabilities(tools),
      rollbackAvailable,
      explanation,
      alternatives,
      status: requiresApproval ? 'pending_approval' : 'draft',
      createdAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _generateSteps(intent: ClassifiedIntent, entities: ExtractedEntity[], tools: ToolDefinition[]): ActionStep[] {
    const steps: ActionStep[] = [];

    for (let i = 0; i < tools.length; i++) {
      const tool = tools[i]!;
      steps.push({
        id: generateActionStepId(),
        order: i,
        toolId: tool.id,
        description: `Execute ${tool.name}: ${tool.description}`,
        parameters: this._extractParameters(intent, entities, tool),
        riskLevel: tool.riskLevel as ActionRiskLevel,
        estimatedDurationMs: tool.estimatedDuration,
        futureMetadata: {},
      });
    }

    return steps;
  }

  private _extractParameters(intent: ClassifiedIntent, entities: ExtractedEntity[], tool: ToolDefinition): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    for (const entity of entities) {
      params[entity.type] = entity.value;
    }

    if (intent.intent === 'goal_management') {
      params['name'] = entities.find((e) => e.type === 'goal')?.value ?? 'New Goal';
      params['type'] = 'performance';
    }

    if (intent.intent === 'report_generation') {
      params['reportType'] = entities.find((e) => e.type === 'report_type')?.value ?? 'system';
    }

    return params;
  }

  private _assessRisk(intent: ClassifiedIntent, steps: ActionStep[]): ActionRiskLevel {
    const riskScores: Record<ActionRiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    let maxRisk: ActionRiskLevel = 'none';

    for (const step of steps) {
      if (riskScores[step.riskLevel] > riskScores[maxRisk]) {
        maxRisk = step.riskLevel;
      }
    }

    // Intent-level risk can override
    if (riskScores[intent.riskLevel] > riskScores[maxRisk]) {
      maxRisk = intent.riskLevel;
    }

    return maxRisk;
  }

  private _estimateBenefit(intent: ClassifiedIntent, context: CopilotContext, entities: ExtractedEntity[]): string {
    switch (intent.intent) {
      case 'optimization':
        const score = context.healthScore ?? 50;
        const projected = Math.min(100, score + 10);
        return `Expected health score improvement from ${score} to ~${projected}`;
      case 'maintenance':
        return 'Improved system stability and cleanliness';
      case 'recovery':
        return 'System restored to previous state';
      case 'simulation':
        return 'Understanding of potential outcomes without changes';
      case 'goal_management':
        return 'New goal created for tracking optimization progress';
      case 'health_analysis':
        return 'Detailed understanding of current system health';
      case 'report_generation':
        return 'Comprehensive system report for review';
      case 'recommendation_management':
        return 'Clear list of actionable recommendations';
      default:
        return 'Action completed successfully';
    }
  }

  private _requiresApproval(risk: ActionRiskLevel, intent: ClassifiedIntent): boolean {
    const riskScores: Record<ActionRiskLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
    return riskScores[risk] >= riskScores['medium'];
  }

  private _checkRollback(intent: ClassifiedIntent, context: CopilotContext): boolean {
    if (intent.intent === 'optimization') return true;
    if (intent.intent === 'maintenance') return context.recoveryHistory.length > 0;
    if (intent.intent === 'recovery') return true;
    return false;
  }

  private _generateExplanation(
    intent: ClassifiedIntent,
    context: CopilotContext,
    entities: ExtractedEntity[],
    tools: ToolDefinition[],
    risk: ActionRiskLevel,
    benefit: string,
    rollbackAvailable: boolean,
  ): ActionExplanation {
    const evidence: CopilotEvidence[] = [];

    if (context.healthScore !== null) {
      evidence.push({
        source: 'health_score', metric: 'score', value: context.healthScore,
        timestamp: new Date().toISOString(), description: 'Current health score',
        confidence: 0.9, futureMetadata: {},
      });
    }

    if (context.activeRecommendations.length > 0) {
      evidence.push({
        source: 'recommendations', metric: 'count', value: context.activeRecommendations.length,
        timestamp: new Date().toISOString(), description: 'Active recommendations available',
        confidence: 0.85, futureMetadata: {},
      });
    }

    const potentialRisks: string[] = [];
    if (risk === 'medium') potentialRisks.push('Moderate system changes may require a reboot');
    if (risk === 'high') potentialRisks.push('Significant system modifications — ensure data is backed up');
    if (risk === 'critical') potentialRisks.push('Critical changes — rollback strongly recommended before proceeding');
    if (potentialRisks.length === 0) potentialRisks.push('No significant risks identified');

    return {
      summary: `Action plan for "${intent.intent}" with ${tools.length} tool(s)`,
      reasoning: `Based on your request "${intent.rawRequest}", I identified the intent as ${intent.intent} with ${(intent.confidence * 100).toFixed(0)}% confidence. ${entities.length > 0 ? `Extracted entities: ${entities.map((e) => e.value).join(', ')}.` : ''} Selected ${tools.length} tool(s) to accomplish this action.`,
      evidence,
      expectedOutcome: benefit,
      potentialRisks,
      rollbackAvailable,
      alternativeCount: 0,
      futureMetadata: {},
    };
  }

  private _generateAlternatives(
    intent: ClassifiedIntent,
    entities: ExtractedEntity[],
    context: CopilotContext,
    tools: ToolDefinition[],
  ): ActionPlan[] {
    // Generate a simpler alternative if multiple tools are selected
    if (tools.length > 1) {
      const simplerTools = tools.slice(0, 1);
      const altPlan = this.plan(intent, entities, context, simplerTools);
      altPlan.id = generateActionPlanId();
      altPlan.explanation.summary = `Simplified plan: only use ${simplerTools[0]!.name}`;
      altPlan.explanation.alternativeCount = 0;
      return [altPlan];
    }
    return [];
  }

  private _extractCapabilities(tools: ToolDefinition[]): CopilotCapability[] {
    const caps = new Set<CopilotCapability>();
    for (const tool of tools) {
      for (const cap of tool.requiredCapabilities) {
        caps.add(cap);
      }
    }
    return Array.from(caps);
  }
}
