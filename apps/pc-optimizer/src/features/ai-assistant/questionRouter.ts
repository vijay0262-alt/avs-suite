/**
 * Question Router — classifies user questions and routes
 * them to the appropriate handler.
 *
 * Uses keyword matching to classify questions into predefined
 * types. Future LLM providers can plug in through an adapter
 * for more sophisticated classification.
 *
 * This module does NOT modify any existing architecture.
 */
import type { QuestionType, QuestionClassification, ConversationTopic } from './types';
import { QUESTION_KEYWORDS } from './types';

const TOPIC_MAP: Record<QuestionType, ConversationTopic> = {
  why_score_low: 'health_score',
  why_score_improved: 'health_score',
  what_changed: 'general',
  what_optimize_first: 'optimization',
  why_startup_poor: 'startup',
  why_duplicates: 'duplicates',
  how_much_recover: 'storage',
  what_smart_optimize: 'optimization',
  why_browser_privacy_low: 'browser',
  why_windows_fair: 'windows',
  which_safest: 'recommendations',
  what_happened_after: 'history',
  unknown: 'general',
};

export class QuestionRouter {
  classify(question: string): QuestionClassification {
    const lower = question.toLowerCase();
    const scores: { type: QuestionType; score: number; matched: string[] }[] = [];

    for (const [type, keywords] of Object.entries(QUESTION_KEYWORDS)) {
      if (type === 'unknown') continue;
      const matched: string[] = [];
      let score = 0;
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          matched.push(keyword);
          score += 1;
        }
      }
      if (score > 0) {
        scores.push({ type: type as QuestionType, score, matched });
      }
    }

    if (scores.length === 0) {
      return {
        type: 'unknown',
        topic: 'general',
        keywords: [],
        confidence: 0,
      };
    }

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0]!;
    const maxPossible = QUESTION_KEYWORDS[best.type].length;
    const confidence = Math.min(1, best.score / Math.max(1, maxPossible));

    return {
      type: best.type,
      topic: TOPIC_MAP[best.type],
      keywords: best.matched,
      confidence,
    };
  }

  routeToTopic(type: QuestionType): ConversationTopic {
    return TOPIC_MAP[type] ?? 'general';
  }

  isFollowUp(question: string, lastTopic: ConversationTopic | null): boolean {
    const lower = question.toLowerCase();
    const followUpIndicators = [
      'why', 'how', 'what about', 'what if', 'can you', 'could you',
      'tell me more', 'explain', 'elaborate', 'and', 'also', 'but',
      'then', 'so', 'because', 'since',
    ];
    return lastTopic !== null && followUpIndicators.some((ind) => lower.startsWith(ind));
  }

  getQuickQuestions(): { label: string; type: QuestionType }[] {
    return [...QUICK_QUESTIONS_INTERNAL];
  }

  suggestFollowUps(type: QuestionType): string[] {
    const suggestions: Record<QuestionType, string[]> = {
      why_score_low: ['What should I optimize first?', 'Which recommendations are safest?'],
      why_score_improved: ['What changed today?', 'What happened after my last optimization?'],
      what_changed: ['Why is my health score low?', 'What should I optimize first?'],
      what_optimize_first: ['How much space can I recover?', 'Which recommendations are safest?'],
      why_startup_poor: ['What should I optimize first?', 'What does Smart Optimize do?'],
      why_duplicates: ['How much space can I recover?', 'Which recommendations are safest?'],
      how_much_recover: ['What should I optimize first?', 'Why do I have duplicate files?'],
      what_smart_optimize: ['What should I optimize first?', 'Which recommendations are safest?'],
      why_browser_privacy_low: ['What should I optimize first?', 'Which recommendations are safest?'],
      why_windows_fair: ['What should I optimize first?', 'What changed today?'],
      which_safest: ['What should I optimize first?', 'How much space can I recover?'],
      what_happened_after: ['Why did my score improve?', 'What should I optimize first?'],
      unknown: ['Why is my health score low?', 'What should I optimize first?'],
    };
    return suggestions[type] ?? suggestions.unknown;
  }
}

const QUICK_QUESTIONS_INTERNAL: { label: string; type: QuestionType }[] = [
  { label: 'Why is my health score low?', type: 'why_score_low' },
  { label: 'What should I optimize first?', type: 'what_optimize_first' },
  { label: 'How much space can I recover?', type: 'how_much_recover' },
  { label: 'What changed today?', type: 'what_changed' },
  { label: 'Which recommendations are safest?', type: 'which_safest' },
  { label: 'What happened after my last optimization?', type: 'what_happened_after' },
];

export const questionRouter = new QuestionRouter();
