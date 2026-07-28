/**
 * Prompt Template Registry — structured prompt templates for
 * each question type.
 *
 * Templates use variable placeholders ({variable}) that are
 * filled with data from the AssistantContext.
 *
 * Future LLM providers plug in through an adapter — templates
 * are provider-agnostic.
 *
 * This module does NOT modify any existing architecture.
 */
import type { PromptTemplate, PromptTemplateId, QuestionType } from './types';

const TEMPLATES: Record<PromptTemplateId, PromptTemplate> = {
  why_score_low: {
    id: 'why_score_low',
    questionType: 'why_score_low',
    systemPrompt: 'You are AVS AI Assistant. Explain why the user\'s health score is low using only data from the health report. Never fabricate information.',
    contextFormat: 'Health Score: {overallScore}\nHealth Level: {healthLevel}\nCategory Scores: {categoryScores}\nIssues: {issues}',
    responseFormat: 'Summary: {summary}\nCurrent Data: {currentData}\nReasoning: {reasoning}\nEvidence: {evidence}\nRecommended Action: {recommendedAction}\nExpected Benefit: {expectedBenefit}\nConfidence: {confidence}',
    variables: ['overallScore', 'healthLevel', 'categoryScores', 'issues'],
  },
  why_score_improved: {
    id: 'why_score_improved',
    questionType: 'why_score_improved',
    systemPrompt: 'You are AVS AI Assistant. Explain why the health score improved using trend data and execution history.',
    contextFormat: 'Current Score: {overallScore}\nPrevious Score: {previousScore}\nTrend: {trendDirection}\nRecent Executions: {recentExecutions}',
    responseFormat: 'Summary: {summary}\nReasoning: {reasoning}\nEvidence: {evidence}\nConfidence: {confidence}',
    variables: ['overallScore', 'previousScore', 'trendDirection', 'recentExecutions'],
  },
  what_changed: {
    id: 'what_changed',
    questionType: 'what_changed',
    systemPrompt: 'You are AVS AI Assistant. Summarize what changed recently using execution history and trend data.',
    contextFormat: 'Recent Executions: {recentExecutions}\nTrend: {trend}\nCategory Changes: {categoryChanges}',
    responseFormat: 'Summary: {summary}\nChanges: {changes}\nEvidence: {evidence}\nConfidence: {confidence}',
    variables: ['recentExecutions', 'trend', 'categoryChanges'],
  },
  what_optimize_first: {
    id: 'what_optimize_first',
    questionType: 'what_optimize_first',
    systemPrompt: 'You are AVS AI Assistant. Recommend what to optimize first based on the optimization plan and health report.',
    contextFormat: 'Health Score: {overallScore}\nOptimization Plan: {planSummary}\nTop Recommendations: {recommendations}',
    responseFormat: 'Summary: {summary}\nRecommended Action: {recommendedAction}\nExpected Benefit: {expectedBenefit}\nConfidence: {confidence}',
    variables: ['overallScore', 'planSummary', 'recommendations'],
  },
  why_startup_poor: {
    id: 'why_startup_poor',
    questionType: 'why_startup_poor',
    systemPrompt: 'You are AVS AI Assistant. Explain why the startup category is rated poorly using startup optimizer data.',
    contextFormat: 'Startup Score: {startupScore}\nStartup Issues: {startupIssues}\nStartup Items: {startupItems}',
    responseFormat: 'Summary: {summary}\nReasoning: {reasoning}\nEvidence: {evidence}\nRecommended Action: {recommendedAction}\nConfidence: {confidence}',
    variables: ['startupScore', 'startupIssues', 'startupItems'],
  },
  why_duplicates: {
    id: 'why_duplicates',
    questionType: 'why_duplicates',
    systemPrompt: 'You are AVS AI Assistant. Explain why duplicate files exist and how much space they waste.',
    contextFormat: 'Duplicate Groups: {duplicateGroups}\nWasted Space: {wastedSpace}\nLargest Groups: {largestGroups}',
    responseFormat: 'Summary: {summary}\nReasoning: {reasoning}\nEvidence: {evidence}\nRecommended Action: {recommendedAction}\nExpected Benefit: {expectedBenefit}\nConfidence: {confidence}',
    variables: ['duplicateGroups', 'wastedSpace', 'largestGroups'],
  },
  how_much_recover: {
    id: 'how_much_recover',
    questionType: 'how_much_recover',
    systemPrompt: 'You are AVS AI Assistant. Calculate how much space can be recovered from optimization plan and storage data.',
    contextFormat: 'Estimated Space Recovery: {estimatedSpaceRecovery}\nDuplicate Wasted Space: {duplicateWastedSpace}\nTemp Files: {tempFiles}\nRecycle Bin: {recycleBin}',
    responseFormat: 'Summary: {summary}\nRecoverable Space: {recoverableSpace}\nBreakdown: {breakdown}\nRecommended Action: {recommendedAction}\nConfidence: {confidence}',
    variables: ['estimatedSpaceRecovery', 'duplicateWastedSpace', 'tempFiles', 'recycleBin'],
  },
  what_smart_optimize: {
    id: 'what_smart_optimize',
    questionType: 'what_smart_optimize',
    systemPrompt: 'You are AVS AI Assistant. Explain what Smart Optimize does based on the optimization planner architecture.',
    contextFormat: 'Plan Types: {planTypes}\nCurrent Plan: {currentPlan}\nAvailable Tasks: {availableTasks}',
    responseFormat: 'Summary: {summary}\nExplanation: {explanation}\nRecommended Action: {recommendedAction}\nConfidence: {confidence}',
    variables: ['planTypes', 'currentPlan', 'availableTasks'],
  },
  why_browser_privacy_low: {
    id: 'why_browser_privacy_low',
    questionType: 'why_browser_privacy_low',
    systemPrompt: 'You are AVS AI Assistant. Explain why browser privacy is low using browser health data.',
    contextFormat: 'Browser Score: {browserScore}\nPrivacy Score: {privacyScore}\nBrowser Issues: {browserIssues}\nPrivacy Issues: {privacyIssues}',
    responseFormat: 'Summary: {summary}\nReasoning: {reasoning}\nEvidence: {evidence}\nRecommended Action: {recommendedAction}\nConfidence: {confidence}',
    variables: ['browserScore', 'privacyScore', 'browserIssues', 'privacyIssues'],
  },
  why_windows_fair: {
    id: 'why_windows_fair',
    questionType: 'why_windows_fair',
    systemPrompt: 'You are AVS AI Assistant. Explain why Windows health is rated Fair using Windows health data.',
    contextFormat: 'Windows Update Score: {updateScore}\nSecurity Score: {securityScore}\nDriver Score: {driverScore}\nWindows Issues: {windowsIssues}',
    responseFormat: 'Summary: {summary}\nReasoning: {reasoning}\nEvidence: {evidence}\nRecommended Action: {recommendedAction}\nConfidence: {confidence}',
    variables: ['updateScore', 'securityScore', 'driverScore', 'windowsIssues'],
  },
  which_safest: {
    id: 'which_safest',
    questionType: 'which_safest',
    systemPrompt: 'You are AVS AI Assistant. Identify the safest recommendations from the health report and optimization plan.',
    contextFormat: 'Recommendations: {recommendations}\nRisk Levels: {riskLevels}\nOptimization Items: {optimizationItems}',
    responseFormat: 'Summary: {summary}\nSafest Actions: {safestActions}\nEvidence: {evidence}\nConfidence: {confidence}',
    variables: ['recommendations', 'riskLevels', 'optimizationItems'],
  },
  what_happened_after: {
    id: 'what_happened_after',
    questionType: 'what_happened_after',
    systemPrompt: 'You are AVS AI Assistant. Summarize what happened after the last optimization using execution history.',
    contextFormat: 'Last Execution: {lastExecution}\nFiles Removed: {filesRemoved}\nSpace Recovered: {spaceRecovered}\nScore Change: {scoreChange}',
    responseFormat: 'Summary: {summary}\nDetails: {details}\nEvidence: {evidence}\nConfidence: {confidence}',
    variables: ['lastExecution', 'filesRemoved', 'spaceRecovered', 'scoreChange'],
  },
  recommendation_explain: {
    id: 'recommendation_explain',
    questionType: null,
    systemPrompt: 'You are AVS AI Assistant. Explain a specific recommendation in detail.',
    contextFormat: 'Recommendation: {recommendation}\nCategory: {category}\nRisk: {risk}\nBenefit: {benefit}',
    responseFormat: 'Why: {why}\nRisk: {risk}\nBenefit: {benefit}\nEstimated Time: {estimatedTime}\nEstimated Recovery: {estimatedRecovery}\nRequired Capability: {requiredCapability}\nAlternatives: {alternatives}',
    variables: ['recommendation', 'category', 'risk', 'benefit'],
  },
  insight_template: {
    id: 'insight_template',
    questionType: null,
    systemPrompt: 'You are AVS AI Assistant. Generate a proactive insight from platform data.',
    contextFormat: 'Data Source: {dataSource}\nMetric: {metric}\nChange: {change}',
    responseFormat: 'Title: {title}\nDescription: {description}\nSeverity: {severity}\nSuggested Action: {suggestedAction}\nConfidence: {confidence}',
    variables: ['dataSource', 'metric', 'change'],
  },
  fallback: {
    id: 'fallback',
    questionType: 'unknown',
    systemPrompt: 'You are AVS AI Assistant. The question could not be classified. Provide a helpful response using available context.',
    contextFormat: 'Health Score: {overallScore}\nAvailable Data: {availableData}',
    responseFormat: 'Summary: {summary}\nSuggestion: {suggestion}\nConfidence: {confidence}',
    variables: ['overallScore', 'availableData'],
  },
};

export class PromptTemplateRegistry {
  private _templates: Map<PromptTemplateId, PromptTemplate> = new Map();

  constructor() {
    for (const [id, template] of Object.entries(TEMPLATES)) {
      this._templates.set(id as PromptTemplateId, template);
    }
  }

  get(id: PromptTemplateId): PromptTemplate | null {
    return this._templates.get(id) ?? null;
  }

  getByQuestionType(questionType: QuestionType): PromptTemplate {
    const template = Array.from(this._templates.values()).find(
      (t) => t.questionType === questionType,
    );
    return template ?? this._templates.get('fallback')!;
  }

  register(id: PromptTemplateId, template: PromptTemplate): void {
    this._templates.set(id, template);
  }

  getAll(): PromptTemplate[] {
    return Array.from(this._templates.values());
  }

  has(id: PromptTemplateId): boolean {
    return this._templates.has(id);
  }

  fillTemplate(template: PromptTemplate, variables: Record<string, string>): string {
    let result = template.contextFormat;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }
}

export const promptTemplateRegistry = new PromptTemplateRegistry();
