/**
 * AI Tool Framework — Result Formatter
 *
 * EPIC 5 PHASE A PART 2
 *
 * Formats tool results for AIAssistant consumption.
 * Converts structured ToolResult into AIAssistant-friendly formats.
 */
import type { ToolResult, AIAssistantEvidence } from './types';

export interface FormattedToolResult {
  text: string;
  confidence: number;
  evidence: AIAssistantEvidence[];
  recommendedActions: ToolResult['recommendedActions'];
  relatedModules: string[];
  status: string;
}

export class ToolResultFormatter {
  format(result: ToolResult): FormattedToolResult {
    if (result.status === 'failed') {
      return {
        text: `Tool execution failed: ${result.errorMessage ?? 'Unknown error'}`,
        confidence: 0,
        evidence: [],
        recommendedActions: [],
        relatedModules: [],
        status: result.status,
      };
    }

    if (result.status === 'timeout') {
      return {
        text: `Tool execution timed out. Please try again.`,
        confidence: 0,
        evidence: [],
        recommendedActions: [],
        relatedModules: [],
        status: result.status,
      };
    }

    const parts: string[] = [result.summary];

    if (result.supportingEvidence.length > 0) {
      parts.push(`\nEvidence (${result.supportingEvidence.length} pieces):`);
      for (const evidence of result.supportingEvidence.slice(0, 5)) {
        parts.push(`  - ${evidence.source}: ${evidence.description} (${(evidence.confidence * 100).toFixed(0)}% confidence)`);
      }
    }

    if (result.recommendedActions.length > 0) {
      parts.push(`\nRecommended actions:`);
      for (const action of result.recommendedActions.slice(0, 3)) {
        parts.push(`  - [${action.priority.toUpperCase()}] ${action.title}: ${action.description}`);
      }
    }

    if (result.relatedModules.length > 0) {
      parts.push(`\nRelated modules: ${result.relatedModules.join(', ')}`);
    }

    return {
      text: parts.join('\n'),
      confidence: result.confidence,
      evidence: result.supportingEvidence,
      recommendedActions: result.recommendedActions,
      relatedModules: result.relatedModules,
      status: result.status,
    };
  }

  formatSummary(result: ToolResult): string {
    return result.summary;
  }

  formatEvidence(result: ToolResult): AIAssistantEvidence[] {
    return result.supportingEvidence;
  }

  formatActions(result: ToolResult): ToolResult['recommendedActions'] {
    return result.recommendedActions;
  }
}
