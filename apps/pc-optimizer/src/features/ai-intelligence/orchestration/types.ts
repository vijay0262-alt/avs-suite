/**
 * AI Orchestration Engine — Type Definitions.
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every response must be
 *    evidence-based, traceable back to AI modules, with confidence."
 *
 * The Orchestration Engine is the single gateway between LLMs and the
 * AVS Shield Intelligence Platform. It:
 *   - Collects structured information from AI modules
 *   - Builds explainable responses
 *   - Coordinates multiple AI engines
 *   - Prepares context for LLMs
 *   - Never exposes raw internal services directly
 *   - Never executes actions (only suggests)
 *
 * Pipeline:
 *   User → AI Orchestrator → Intent Resolver → Task Planner →
 *   AI Engines (Context, Knowledge, Recommendations, Insights,
 *   Predictions, Device Profile) → Structured Response →
 *   LLM → Formatted Response
 */
import type { AIContext } from '../context/types';
import type { KnowledgeObject } from '../knowledge/types';
import type { RecommendationList } from '../recommendations/types';
import type { InsightList } from '../insights/types';
import type { PredictionList } from '../predictions/types';
import type { DeviceProfile } from '../device-profile/types';

// Re-export for convenience
export type { AIContext } from '../context/types';
export type { KnowledgeObject } from '../knowledge/types';
export type { RecommendationList, Recommendation } from '../recommendations/types';
export type { InsightList, Insight } from '../insights/types';
export type { PredictionList, Prediction } from '../predictions/types';
export type { DeviceProfile } from '../device-profile/types';

// ── Intent Types ─────────────────────────────────────────────

export type ConversationIntentType =
  | 'ask_health'
  | 'ask_storage'
  | 'ask_performance'
  | 'ask_startup'
  | 'ask_privacy'
  | 'ask_browser'
  | 'ask_windows'
  | 'ask_predictions'
  | 'ask_recommendations'
  | 'ask_device_profile'
  | 'optimization_history'
  | 'achievements'
  | 'milestones'
  | 'explain_recommendation'
  | 'explain_prediction'
  | 'general_question'
  | 'unknown';

export interface IntentDefinition {
  type: ConversationIntentType;
  label: string;
  description: string;
  keywords: string[];
  requiredModules: AIModuleName[];
  suggestedTools: string[];
  suggestedFollowUps: string[];
}

export interface IntentResolutionResult {
  intent: ConversationIntentType;
  confidence: number;
  matchedKeywords: string[];
  alternativeIntents: { intent: ConversationIntentType; confidence: number }[];
  metadata: Record<string, unknown>;
}

// ── AI Module Names ──────────────────────────────────────────

export type AIModuleName =
  | 'context'
  | 'knowledge'
  | 'recommendations'
  | 'insights'
  | 'predictions'
  | 'device_profile'
  | 'history'
  | 'future';

// ── Task Plan ────────────────────────────────────────────────

export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskStep {
  id: string;
  stepNumber: number;
  module: AIModuleName;
  toolName: string;
  description: string;
  status: TaskStepStatus;
  result: unknown;
  error: string | null;
  durationMs: number;
}

export interface TaskPlan {
  id: string;
  intent: ConversationIntentType;
  steps: TaskStep[];
  createdAt: string;
  estimatedDurationMs: number;
}

// ── Tool Types ───────────────────────────────────────────────

export interface OrchestratorTool {
  name: string;
  description: string;
  module: AIModuleName;
  isAvailable: () => boolean;
  execute: (params: ToolParams) => ToolResult;
}

export interface ToolParams {
  context: AIContext | null;
  knowledge: KnowledgeObject | null;
  recommendations: RecommendationList | null;
  insights: InsightList | null;
  predictions: PredictionList | null;
  deviceProfile: DeviceProfile | null;
  options: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error: string | null;
  metadata: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  module: AIModuleName;
  parameters: string[];
}

// ── Conversation Context ─────────────────────────────────────

export type ContextDetailLevel = 'summary' | 'detailed';

export interface ConversationContext {
  contextId: string;
  timestamp: string;
  detailLevel: ContextDetailLevel;
  systemSummary: SystemSummary | null;
  healthSummary: HealthSummary | null;
  storageSummary: StorageSummary | null;
  performanceSummary: PerformanceSummary | null;
  startupSummary: StartupSummary | null;
  browserSummary: BrowserSummary | null;
  privacySummary: PrivacySummary | null;
  knowledgeSummary: KnowledgeSummaryInfo | null;
  recommendationSummary: RecommendationSummaryInfo | null;
  insightSummary: InsightSummaryInfo | null;
  predictionSummary: PredictionSummaryInfo | null;
  deviceProfileSummary: DeviceProfileSummaryInfo | null;
  historySummary: HistorySummaryInfo | null;
  metadata: ConversationContextMetadata;
}

export interface SystemSummary {
  osVersion: string;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  gpuModel: string | null;
  uptime: number;
}

export interface HealthSummary {
  overallScore: number;
  cpuScore: number;
  ramScore: number;
  diskScore: number;
  stabilityScore: number;
  securityScore: number;
  issueCount: number;
  topIssues: { severity: string; description: string }[];
}

export interface StorageSummary {
  totalCapacityMB: number;
  usedMB: number;
  freeMB: number;
  driveType: string;
  driveHealth: string;
  usagePercent: number;
}

export interface PerformanceSummary {
  cpuUsage: number;
  ramUsage: number;
  diskUsage: number;
  activeProcesses: number;
}

export interface StartupSummary {
  totalItems: number;
  enabledItems: number;
  estimatedBootTimeSec: number;
  highImpactCount: number;
}

export interface BrowserSummary {
  installedBrowsers: string[];
  totalCacheMB: number;
  extensionCount: number;
}

export interface PrivacySummary {
  trackingCookies: number;
  historyEntries: number;
  tempFilesMB: number;
  recycleBinMB: number;
}

export interface KnowledgeSummaryInfo {
  totalFacts: number;
  totalRelationships: number;
  totalTrends: number;
  averageConfidence: number;
  topCategories: string[];
}

export interface RecommendationSummaryInfo {
  totalRecommendations: number;
  byPriority: Record<string, number>;
  topRecommendations: { id: string; title: string; priority: string; confidence: number }[];
}

export interface InsightSummaryInfo {
  totalInsights: number;
  byPriority: Record<string, number>;
  topInsights: { id: string; title: string; priority: string }[];
}

export interface PredictionSummaryInfo {
  totalPredictions: number;
  byRisk: Record<string, number>;
  topPredictions: { id: string; title: string; riskLevel: string; confidence: number }[];
}

export interface DeviceProfileSummaryInfo {
  primaryProfile: string;
  confidenceScore: number;
  performanceTier: string;
  primaryWorkload: string;
}

export interface HistorySummaryInfo {
  totalOptimizations: number;
  totalCleanedMB: number;
  totalIssuesFixed: number;
  lastOptimizationAt: string | null;
}

export interface ConversationContextMetadata {
  intent: ConversationIntentType;
  modulesUsed: AIModuleName[];
  evidenceCount: number;
  generationTimeMs: number;
}

// ── Explanation ──────────────────────────────────────────────

export interface Explanation {
  whatHappened: string;
  whyItHappened: string;
  evidence: ExplanationEvidence[];
  confidence: number;
  suggestedNextStep: string;
  futureImpact: string;
  assumptions: string[];
}

export interface ExplanationEvidence {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
}

// ── Response ─────────────────────────────────────────────────

export interface ConversationResponse {
  id: string;
  conversationId: string;
  timestamp: string;
  intent: ConversationIntentType;
  summary: string;
  detailedExplanation: string;
  supportingFacts: SupportingFact[];
  supportingEvidence: ExplanationEvidence[];
  confidence: number;
  relatedRecommendations: { id: string; title: string; priority: string }[];
  relatedPredictions: { id: string; title: string; riskLevel: string }[];
  relatedInsights: { id: string; title: string; priority: string }[];
  suggestedFollowUpQuestions: string[];
  taskPlan: TaskPlan | null;
  explanation: Explanation | null;
  futureMetadata: Record<string, unknown>;
}

export interface SupportingFact {
  fact: string;
  source: string;
  confidence: number;
}

// ── Conversation Memory ──────────────────────────────────────

export interface ConversationMemoryData {
  sessionId: string;
  createdAt: string;
  lastActivityAt: string;
  previousQuestions: string[];
  referencedRecommendations: string[];
  referencedPredictions: string[];
  referencedInsights: string[];
  selectedCategories: string[];
  conversationPreferences: ConversationPreferences;
  turnCount: number;
}

export interface ConversationPreferences {
  detailLevel: ContextDetailLevel;
  language: string;
  includeTechnicalDetails: boolean;
  maxFollowUpSuggestions: number;
}

// ── LLM Provider Abstraction ─────────────────────────────────

export type LLMProviderType =
  | 'openai'
  | 'anthropic'
  | 'google_gemini'
  | 'azure_openai'
  | 'local_llm'
  | 'openrouter'
  | 'mock'
  | 'future';

export interface LLMProvider {
  getProviderName(): string;
  getProviderType(): LLMProviderType;
  isAvailable(): boolean;
  generateCompletion(request: LLMRequest): Promise<LLMResponse>;
  validate(): { valid: boolean; issues: string[] };
}

export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
  conversationContext: ConversationContext;
  structuredResponse: ConversationResponse;
  options: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  finishReason: string;
  metadata: Record<string, unknown>;
}

// ── Validation ───────────────────────────────────────────────

export interface ConversationValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ConversationValidationResult {
  valid: boolean;
  issues: ConversationValidationIssue[];
}

// ── Statistics ───────────────────────────────────────────────

export interface ConversationStatistics {
  totalConversations: number;
  totalTurns: number;
  byIntent: Record<string, number>;
  averageConfidence: number;
  averageResponseTimeMs: number;
  toolInvocations: number;
  failedConversations: number;
  lastConversationAt: string | null;
}

// ── Events ───────────────────────────────────────────────────

export type ConversationEventType =
  | 'conversation_started'
  | 'intent_resolved'
  | 'task_planned'
  | 'response_generated'
  | 'tool_invoked'
  | 'conversation_completed'
  | 'conversation_failed';

export type ConversationEventListener = (payload: unknown) => void;

// ── Configuration ────────────────────────────────────────────

export interface IntentRules {
  minConfidence: number;
  maxAlternativeIntents: number;
  fallbackIntent: ConversationIntentType;
  keywordMatchingEnabled: boolean;
}

export interface PlannerRules {
  maxSteps: number;
  timeoutMs: number;
  parallelExecution: boolean;
  skipUnavailableModules: boolean;
}

export interface MemoryRules {
  maxPreviousQuestions: number;
  maxReferencedItems: number;
  sessionTimeoutMs: number;
  persistAcrossSessions: boolean;
}

export interface ProviderSettings {
  defaultProvider: LLMProviderType;
  fallbackProvider: LLMProviderType | null;
  timeoutMs: number;
  maxRetries: number;
  enableStreaming: boolean;
}

export interface ContextLimits {
  maxFacts: number;
  maxRecommendations: number;
  maxInsights: number;
  maxPredictions: number;
  maxEvidencePieces: number;
  summaryModeThreshold: number;
}

export interface ConversationConfiguration {
  orchestratorVersion: string;
  intentDefinitions: IntentDefinition[];
  toolDefinitions: ToolDefinition[];
  intentRules: IntentRules;
  plannerRules: PlannerRules;
  memoryRules: MemoryRules;
  providerSettings: ProviderSettings;
  contextLimits: ContextLimits;
  enableHistory: boolean;
  maxHistoryEntries: number;
  minConfidenceThreshold: number;
}

// ── Engine Provider Plugin (Extensibility) ───────────────────

/**
 * Future AI engines register themselves without changing the orchestrator.
 * No switch statements. No module-specific logic.
 */
export interface EngineProviderPlugin {
  getPluginName(): string;
  getModuleName(): AIModuleName;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getData(): unknown;
}

// ── Conversation Request ─────────────────────────────────────

export interface ConversationRequest {
  message: string;
  conversationId?: string;
  options?: Record<string, unknown>;
}

// ── Helper Functions ─────────────────────────────────────────

export function generateConversationId(): string {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateResponseId(): string {
  return `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateTaskPlanId(): string {
  return `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateTaskStepId(): string {
  return `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateContextId(): string {
  return `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function getIntentLabel(type: ConversationIntentType): string {
  const labels: Record<ConversationIntentType, string> = {
    ask_health: 'Ask About Health',
    ask_storage: 'Ask About Storage',
    ask_performance: 'Ask About Performance',
    ask_startup: 'Ask About Startup',
    ask_privacy: 'Ask About Privacy',
    ask_browser: 'Ask About Browser',
    ask_windows: 'Ask About Windows',
    ask_predictions: 'Ask About Predictions',
    ask_recommendations: 'Ask About Recommendations',
    ask_device_profile: 'Ask About Device Profile',
    optimization_history: 'Optimization History',
    achievements: 'Achievements',
    milestones: 'Milestones',
    explain_recommendation: 'Explain Recommendation',
    explain_prediction: 'Explain Prediction',
    general_question: 'General Question',
    unknown: 'Unknown',
  };
  return labels[type] ?? 'Unknown';
}

export function getAIModuleLabel(module: AIModuleName): string {
  const labels: Record<AIModuleName, string> = {
    context: 'Context Engine',
    knowledge: 'Knowledge Engine',
    recommendations: 'Recommendation Engine',
    insights: 'Insight Engine',
    predictions: 'Prediction Engine',
    device_profile: 'Device Profile Engine',
    history: 'History',
    future: 'Future Module',
  };
  return labels[module] ?? 'Unknown';
}

export function getDefaultPreferences(): ConversationPreferences {
  return {
    detailLevel: 'summary',
    language: 'en-US',
    includeTechnicalDetails: true,
    maxFollowUpSuggestions: 4,
  };
}
