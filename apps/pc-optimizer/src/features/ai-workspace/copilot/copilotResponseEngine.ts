/**
 * AI Copilot Platform — Response Engine
 *
 * EPIC 5 PHASE A PART 1
 *
 * Generates structured, evidence-based, explainable responses.
 * Orchestrates existing AI module outputs without duplicating logic.
 * Every response carries answer, reasoning, evidence, confidence,
 * recommendations, next actions, and relevant modules.
 */
import type {
  CopilotConfiguration,
  CopilotResponse,
  CopilotContext,
  CopilotEntity,
  CopilotIntentType,
  CopilotCapability,
  CopilotEvidence,
  CopilotSuggestion,
  RecommendationSummary,
  CopilotProviderPlugin,
  CopilotResponseInput,
} from './types';
import { generateResponseId, clampConfidence } from './types';

export class CopilotResponseEngine {
  private _config: CopilotConfiguration;
  private _plugins: CopilotProviderPlugin[] = [];

  constructor(config: CopilotConfiguration) {
    this._config = config;
  }

  updateConfig(config: CopilotConfiguration): void {
    this._config = config;
  }

  registerPlugin(plugin: CopilotProviderPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  generate(
    intent: CopilotIntentType,
    context: CopilotContext,
    entities: CopilotEntity[],
    prompt: string,
    conversationId: string,
    suggestions: CopilotSuggestion[],
    capabilities: CopilotCapability[],
  ): CopilotResponse {
    const responseInput: CopilotResponseInput = {
      intent,
      context,
      entities,
      prompt,
      conversationId,
      futureMetadata: {},
    };

    // Try plugins first
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.generateResponse) {
        const result = plugin.generateResponse(responseInput);
        if (result) {
          return {
            ...result,
            suggestedNextActions: suggestions,
          };
        }
      }
    }

    return this._generateBuiltin(intent, context, entities, prompt, conversationId, suggestions, capabilities);
  }

  private _generateBuiltin(
    intent: CopilotIntentType,
    context: CopilotContext,
    entities: CopilotEntity[],
    prompt: string,
    conversationId: string,
    suggestions: CopilotSuggestion[],
    capabilities: CopilotCapability[],
  ): CopilotResponse {
    const evidence = this._collectEvidence(context, entities);
    const relevantModules = this._identifyRelevantModules(intent, context);
    const relatedRecommendations = this._extractRecommendations(context);
    const answer = this._composeAnswer(intent, context, entities, prompt);
    const reasoningSummary = this._composeReasoning(intent, context, evidence);
    const confidence = this._computeConfidence(context, evidence);

    return {
      id: generateResponseId(),
      conversationId,
      answer,
      reasoningSummary,
      supportingEvidence: evidence,
      confidence,
      relatedRecommendations,
      suggestedNextActions: suggestions,
      relevantModules,
      intent,
      capabilities,
      generatedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _collectEvidence(context: CopilotContext, entities: CopilotEntity[]): CopilotEvidence[] {
    const evidence: CopilotEvidence[] = [];

    for (const source of context.sources) {
      evidence.push(...source.evidence);
    }

    for (const entity of entities) {
      evidence.push({
        source: `entity:${entity.type}`,
        metric: entity.name,
        value: entity.value ?? 'N/A',
        timestamp: new Date().toISOString(),
        description: `Entity: ${entity.name}`,
        confidence: entity.confidence,
        futureMetadata: {},
      });
    }

    return evidence;
  }

  private _identifyRelevantModules(intent: CopilotIntentType, context: CopilotContext): string[] {
    const modules: string[] = [];

    if (context.healthScore !== null) modules.push('HealthScore');
    if (context.deviceProfile) modules.push('DeviceProfile');
    if (context.activeGoals.length > 0) modules.push('GoalsEngine');
    if (context.recentTimelineEvents.length > 0) modules.push('TimelineEngine');
    if (context.activeRecommendations.length > 0) modules.push('RecommendationEngine');
    if (context.activePredictions.length > 0) modules.push('PredictionEngine');
    if (context.maintenanceHistory.length > 0) modules.push('Maintenance');
    if (context.optimizationHistory.length > 0) modules.push('OptimizationPlanner');
    if (context.recoveryHistory.length > 0) modules.push('RecoveryCenter');

    switch (intent) {
      case 'recovery':
        if (!modules.includes('RecoveryCenter')) modules.push('RecoveryCenter');
        break;
      case 'goal_management':
        if (!modules.includes('GoalsEngine')) modules.push('GoalsEngine');
        break;
      case 'navigation':
        modules.push('Navigation');
        break;
      case 'reporting':
        modules.push('TimelineEngine');
        break;
    }

    return modules;
  }

  private _extractRecommendations(context: CopilotContext): RecommendationSummary[] {
    return context.activeRecommendations.slice(0, 5);
  }

  private _composeAnswer(
    intent: CopilotIntentType,
    context: CopilotContext,
    _entities: CopilotEntity[],
    _prompt: string,
  ): string {
    const parts: string[] = [];

    switch (intent) {
      case 'question': {
        if (context.healthScore !== null) {
          parts.push(`Your current health score is ${context.healthScore}.`);
        }
        if (context.deviceProfile) {
          parts.push(`Your device profile is ${context.deviceProfile.profileType} (${context.deviceProfile.performanceTier} tier).`);
        }
        if (context.activeRecommendations.length > 0) {
          parts.push(`There are ${context.activeRecommendations.length} active recommendations.`);
        }
        if (context.activeGoals.length > 0) {
          parts.push(`You have ${context.activeGoals.length} active goals.`);
        }
        if (parts.length === 0) {
          parts.push('I don\'t have enough context to answer that question. Please ensure system data is available.');
        }
        break;
      }
      case 'recommendation': {
        if (context.activeRecommendations.length > 0) {
          const top = context.activeRecommendations.slice(0, 3);
          parts.push(`Based on your current system state, here are the top recommendations:`);
          for (const rec of top) {
            parts.push(`- ${rec.title} (Priority: ${rec.priority}, Confidence: ${(rec.confidence * 100).toFixed(0)}%)`);
          }
        } else {
          parts.push('No recommendations are currently available. Run a system scan to generate recommendations.');
        }
        break;
      }
      case 'explanation': {
        if (context.healthScore !== null) {
          parts.push(`Your health score of ${context.healthScore} is based on multiple system metrics.`);
        }
        if (context.activePredictions.length > 0) {
          parts.push(`There are ${context.activePredictions.length} active predictions that may impact your system.`);
        }
        if (parts.length === 0) {
          parts.push('I need more specific context to provide an explanation. Could you specify what you\'d like me to explain?');
        }
        break;
      }
      case 'comparison': {
        if (context.activeRecommendations.length > 1) {
          parts.push('I can compare different optimization strategies based on your recommendations.');
        } else {
          parts.push('Not enough data for comparison. Need at least two options to compare.');
        }
        break;
      }
      case 'planning':
      case 'optimization': {
        if (context.activeRecommendations.length > 0) {
          parts.push(`Based on ${context.activeRecommendations.length} recommendations, I can help you create an optimization plan.`);
        } else {
          parts.push('No recommendations available for planning. Run a system scan first.');
        }
        break;
      }
      case 'maintenance': {
        if (context.maintenanceHistory.length > 0) {
          const lastMaintenance = context.maintenanceHistory[0]!;
          parts.push(`Last maintenance was ${lastMaintenance.type} on ${lastMaintenance.timestamp}. Success: ${lastMaintenance.success}.`);
        } else {
          parts.push('No maintenance history available.');
        }
        break;
      }
      case 'recovery': {
        if (context.recoveryHistory.length > 0) {
          parts.push(`There are ${context.recoveryHistory.length} recovery records available.`);
        } else {
          parts.push('No recovery history available. Recovery options will appear after optimizations.');
        }
        break;
      }
      case 'goal_management': {
        if (context.activeGoals.length > 0) {
          parts.push(`You have ${context.activeGoals.length} active goals:`);
          for (const goal of context.activeGoals) {
            parts.push(`- ${goal.name} (Status: ${goal.status}, Progress: ${(goal.progress * 100).toFixed(0)}%)`);
          }
        } else {
          parts.push('No active goals. You can create a goal to track your optimization objectives.');
        }
        break;
      }
      case 'navigation': {
        parts.push('I can help you navigate to different features. Available modules: Timeline, Recovery, Goals, Recommendations, Predictions, Maintenance.');
        break;
      }
      case 'reporting': {
        parts.push('Here is a summary of your system status:');
        if (context.healthScore !== null) parts.push(`- Health Score: ${context.healthScore}`);
        if (context.activeGoals.length > 0) parts.push(`- Active Goals: ${context.activeGoals.length}`);
        if (context.activeRecommendations.length > 0) parts.push(`- Active Recommendations: ${context.activeRecommendations.length}`);
        if (context.activePredictions.length > 0) parts.push(`- Active Predictions: ${context.activePredictions.length}`);
        if (context.recentTimelineEvents.length > 0) parts.push(`- Recent Events: ${context.recentTimelineEvents.length}`);
        break;
      }
      case 'conversation': {
        parts.push('Hello! I\'m your AVS Shield AI Copilot. I can help you with questions, recommendations, explanations, planning, and navigation. How can I assist you?');
        break;
      }
      default: {
        parts.push('I\'m not sure how to help with that. Try asking about your health score, recommendations, goals, or system status.');
        break;
      }
    }

    return parts.join(' ');
  }

  private _composeReasoning(
    intent: CopilotIntentType,
    context: CopilotContext,
    evidence: CopilotEvidence[],
  ): string {
    const sources = context.sources.map((s) => s.type).join(', ');
    const evidenceCount = evidence.length;
    return `This response was generated using ${context.sources.length} context sources (${sources}) and ${evidenceCount} pieces of evidence. The intent was resolved as "${intent}".`;
  }

  private _computeConfidence(context: CopilotContext, evidence: CopilotEvidence[]): number {
    if (context.sources.length === 0) return 0.3;
    const avgSourceConfidence = context.sources.reduce((acc, s) => acc + s.confidence, 0) / context.sources.length;
    const avgEvidenceConfidence = evidence.length > 0
      ? evidence.reduce((acc, e) => acc + e.confidence, 0) / evidence.length
      : 0.5;
    return clampConfidence((avgSourceConfidence + avgEvidenceConfidence) / 2);
  }
}
