/**
 * AVS AI Assistant Platform — Type Definitions
 *
 * Complete type system for the explainable AI assistant that
 * understands PC health using existing AVS platform data.
 *
 * This is NOT a general chatbot. It only reasons over existing
 * AVS platform data and never fabricates information.
 *
 * This module does NOT modify any existing architecture.
 */
import type { HealthReport, HealthCategoryId, HealthLevel, TrendAnalysis } from '../ai-health-engine/types';
import type { OptimizationPlan } from '../optimization-planner/types';
import type { ExecutionRecord, ExecutionStatistics, ExecutionReport } from '../maintenance-history/types';
import type { CapabilityInfo } from '../config-sync/types';

// ── Conversation ──────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  questionType: QuestionType | null;
  explanation: AssistantExplanation | null;
  metadata: Record<string, unknown> | null;
}

export interface Conversation {
  id: string;
  messages: ConversationMessage[];
  startedAt: string;
  lastActivityAt: string;
  topic: ConversationTopic | null;
  contextSnapshot: AssistantContext | null;
}

export type ConversationTopic =
  | 'health_score'
  | 'optimization'
  | 'startup'
  | 'storage'
  | 'browser'
  | 'privacy'
  | 'windows'
  | 'duplicates'
  | 'history'
  | 'recommendations'
  | 'general';

// ── Questions ─────────────────────────────────────────────────

export type QuestionType =
  | 'why_score_low'
  | 'why_score_improved'
  | 'what_changed'
  | 'what_optimize_first'
  | 'why_startup_poor'
  | 'why_duplicates'
  | 'how_much_recover'
  | 'what_smart_optimize'
  | 'why_browser_privacy_low'
  | 'why_windows_fair'
  | 'which_safest'
  | 'what_happened_after'
  | 'unknown';

export interface QuestionClassification {
  type: QuestionType;
  topic: ConversationTopic;
  keywords: string[];
  confidence: number;
}

export const QUICK_QUESTIONS: readonly { label: string; type: QuestionType }[] = [
  { label: 'Why is my health score low?', type: 'why_score_low' },
  { label: 'What should I optimize first?', type: 'what_optimize_first' },
  { label: 'How much space can I recover?', type: 'how_much_recover' },
  { label: 'What changed today?', type: 'what_changed' },
  { label: 'Why is Startup rated Poor?', type: 'why_startup_poor' },
  { label: 'Why do I have duplicate files?', type: 'why_duplicates' },
  { label: 'What does Smart Optimize do?', type: 'what_smart_optimize' },
  { label: 'Why is Browser Privacy low?', type: 'why_browser_privacy_low' },
  { label: 'Why is Windows Health Fair?', type: 'why_windows_fair' },
  { label: 'Which recommendations are safest?', type: 'which_safest' },
  { label: 'What happened after my last optimization?', type: 'what_happened_after' },
  { label: 'Why did my score improve?', type: 'why_score_improved' },
];

// ── Explanations ──────────────────────────────────────────────

export interface ExplanationEvidence {
  source: string;
  data: string;
  category: HealthCategoryId | null;
}

export interface RecommendedAction {
  title: string;
  description: string;
  category: HealthCategoryId | null;
  estimatedBenefit: number;
  riskLevel: string;
  requiredCapability: string | null;
}

export interface AssistantExplanation {
  questionType: QuestionType;
  summary: string;
  currentData: string;
  reasoning: string;
  evidence: ExplanationEvidence[];
  recommendedAction: RecommendedAction | null;
  expectedBenefit: string;
  confidence: number;
  followUpSuggestions: string[];
}

// ── Insights ──────────────────────────────────────────────────

export type InsightType =
  | 'storage_increase'
  | 'startup_improvement'
  | 'browser_cache_growth'
  | 'windows_update_overdue'
  | 'duplicate_space'
  | 'score_improvement'
  | 'score_decline'
  | 'maintenance_due'
  | 'privacy_concern'
  | 'performance_bottleneck';

export type InsightSeverity = 'info' | 'low' | 'medium' | 'high';

export interface AssistantInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  severity: InsightSeverity;
  category: HealthCategoryId | null;
  evidence: string;
  suggestedAction: string;
  confidence: number;
  generatedAt: string;
}

// ── Recommendation Explanation ────────────────────────────────

export interface RecommendationExplanation {
  recommendationId: string;
  title: string;
  whyRecommended: string;
  risk: string;
  benefit: string;
  estimatedTime: string;
  estimatedRecovery: string;
  requiredCapability: string | null;
  alternativeActions: string[];
  category: HealthCategoryId;
}

// ── Assistant Context ─────────────────────────────────────────

export interface AssistantContext {
  healthReport: HealthReport | null;
  optimizationPlan: OptimizationPlan | null;
  executionHistory: ExecutionRecord[];
  executionStatistics: ExecutionStatistics | null;
  executionReport: ExecutionReport | null;
  capabilities: {
    available: CapabilityInfo[];
    locked: CapabilityInfo[];
  };
  trends: TrendAnalysis | null;
  timestamp: string;
}

// ── Prompt Templates ──────────────────────────────────────────

export type PromptTemplateId =
  | 'why_score_low'
  | 'why_score_improved'
  | 'what_changed'
  | 'what_optimize_first'
  | 'why_startup_poor'
  | 'why_duplicates'
  | 'how_much_recover'
  | 'what_smart_optimize'
  | 'why_browser_privacy_low'
  | 'why_windows_fair'
  | 'which_safest'
  | 'what_happened_after'
  | 'recommendation_explain'
  | 'insight_template'
  | 'fallback';

export interface PromptTemplate {
  id: PromptTemplateId;
  questionType: QuestionType | null;
  systemPrompt: string;
  contextFormat: string;
  responseFormat: string;
  variables: string[];
}

// ── Dashboard Integration ─────────────────────────────────────

export interface AssistantDashboardData {
  quickQuestions: { label: string; type: QuestionType }[];
  suggestedInsights: AssistantInsight[];
  recommendedActions: { label: string; description: string; benefit: string }[];
  healthScore: number | null;
  healthLevel: HealthLevel | null;
  isAvailable: boolean;
}

// ── LLM Adapter (Future) ──────────────────────────────────────

export interface LLMAdapter {
  name: string;
  generate(prompt: string, context: AssistantContext): Promise<string>;
  isAvailable(): boolean;
}

// ── Events ────────────────────────────────────────────────────

export type AssistantEventType =
  | 'assistant_started'
  | 'assistant_response_generated'
  | 'assistant_insight_generated'
  | 'assistant_history_updated'
  | 'assistant_failed';

export interface AssistantEventPayloads {
  assistant_started: { sessionId: string; timestamp: string };
  assistant_response_generated: { message: ConversationMessage; sessionId: string };
  assistant_insight_generated: { insight: AssistantInsight };
  assistant_history_updated: { sessionId: string; messageCount: number };
  assistant_failed: { error: string; sessionId: string | null; timestamp: string };
}

export type AssistantEventListener = (payload: unknown) => void;

// ── Safety ────────────────────────────────────────────────────

export const FORBIDDEN_PATTERNS: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'api_key',
  'apikey',
  'token',
  'credential',
  'private_key',
  'hash',
  'sha256',
  'md5',
  'blake3',
];

export function sanitizeContent(content: string): string {
  let sanitized = content;
  for (const pattern of FORBIDDEN_PATTERNS) {
    const regex = new RegExp(pattern, 'gi');
    sanitized = sanitized.replace(regex, '[redacted]');
  }
  return sanitized;
}

export function isSafeContent(content: string): boolean {
  const lower = content.toLowerCase();
  return !FORBIDDEN_PATTERNS.some((p) => lower.includes(p));
}

// ── Helpers ───────────────────────────────────────────────────

export function generateMessageId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

export function generateConversationId(): string {
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

export function generateInsightId(): string {
  return `insight-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

export function scoreToLevel(score: number): HealthLevel {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'poor';
  return 'critical';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `~${Math.round(seconds)} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (remaining === 0) return `~${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `~${minutes} min ${remaining} sec`;
}

// ── Question Keywords ─────────────────────────────────────────

export const QUESTION_KEYWORDS: Record<QuestionType, string[]> = {
  why_score_low: ['why', 'score', 'low', 'health', 'bad', 'poor'],
  why_score_improved: ['why', 'score', 'improved', 'improve', 'increased', 'better', 'went up'],
  what_changed: ['what', 'changed', 'today', 'recent', 'different'],
  what_optimize_first: ['what', 'optimize', 'first', 'should', 'priority', 'start'],
  why_startup_poor: ['why', 'startup', 'poor', 'slow', 'boot'],
  why_duplicates: ['why', 'duplicate', 'duplicates', 'files', 'copies'],
  how_much_recover: ['how', 'much', 'space', 'recover', 'reclaim', 'free'],
  what_smart_optimize: ['what', 'smart', 'optimize', 'do', 'does'],
  why_browser_privacy_low: ['why', 'browser', 'privacy', 'low', 'cookies', 'tracking'],
  why_windows_fair: ['why', 'windows', 'health', 'fair', 'update', 'security'],
  which_safest: ['which', 'safest', 'safe', 'risk', 'recommendation', 'secure'],
  what_happened_after: ['what', 'happened', 'after', 'last', 'optimization', 'cleanup'],
  unknown: [],
};
