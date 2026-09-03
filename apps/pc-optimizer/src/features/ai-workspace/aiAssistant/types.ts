/**
 * AVS AI Assistant Platform — Type Definitions
 *
 * EPIC 5 PHASE A PART 1
 *
 * The AVS AI Assistant is the primary AI interface for AVS AI Shield.
 * It orchestrates all existing AI modules to answer questions,
 * explain system behavior, recommend actions, create optimization
 * sessions, and navigate the platform using natural language.
 *
 * Architecture:
 *   User Prompt → Intent Engine → AI Context → Knowledge Engine →
 *   Recommendation Engine → Goal Engine → AIAssistant → Structured Response
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every answer, suggestion,
 *    and action plan must be traceable back to AI modules, with
 *    supporting evidence and a confidence score."
 *
 * The AIAssistant MUST NOT execute optimizations directly.
 * The AIAssistant MUST NOT duplicate existing business logic.
 * The AIAssistant ONLY orchestrates and presents existing AI module outputs.
 */

// ── AIAssistant Intent Types ──────────────────────────────────────

export type AIAssistantIntentType =
  | 'question'
  | 'recommendation'
  | 'explanation'
  | 'comparison'
  | 'planning'
  | 'optimization'
  | 'maintenance'
  | 'recovery'
  | 'goal_management'
  | 'navigation'
  | 'reporting'
  | 'conversation'
  | 'future_intent';

export type AIAssistantCapability =
  | 'answer_questions'
  | 'explain_recommendations'
  | 'explain_health_score'
  | 'explain_predictions'
  | 'explain_device_profile'
  | 'suggest_optimizations'
  | 'generate_optimization_session'
  | 'compare_strategies'
  | 'explain_timeline_events'
  | 'explain_recovery_options'
  | 'navigate_features'
  | 'generate_reports'
  | 'future_capability';

// ── Intent Resolution ─────────────────────────────────────────

export interface IntentDefinition {
  type: AIAssistantIntentType;
  label: string;
  description: string;
  keywords: string[];
  capabilities: AIAssistantCapability[];
  minConfidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface IntentResolutionResult {
  intent: AIAssistantIntentType;
  confidence: number;
  matchedKeywords: string[];
  capabilities: AIAssistantCapability[];
  alternativeIntents: AlternativeIntent[];
  futureMetadata: Record<string, unknown>;
}

export interface AlternativeIntent {
  intent: AIAssistantIntentType;
  confidence: number;
  reason: string;
}

// ── AIAssistant Entity ────────────────────────────────────────────

export type EntityType =
  | 'recommendation'
  | 'prediction'
  | 'goal'
  | 'timeline_event'
  | 'device_profile'
  | 'health_score'
  | 'optimization_plan'
  | 'simulation'
  | 'recovery'
  | 'maintenance'
  | 'module'
  | 'feature'
  | 'future_entity';

export interface AIAssistantEntity {
  type: EntityType;
  id: string;
  name: string;
  value: string | number | boolean | null;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── Context Resolution ────────────────────────────────────────

export type ContextSourceType =
  | 'health_score'
  | 'device_profile'
  | 'goals'
  | 'timeline'
  | 'recommendations'
  | 'predictions'
  | 'maintenance'
  | 'automation'
  | 'optimization_history'
  | 'recovery_history'
  | 'user_preferences'
  | 'future_source';

export interface AIAssistantContextSource {
  type: ContextSourceType;
  available: boolean;
  data: unknown;
  confidence: number;
  evidence: AIAssistantEvidence[];
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantContext {
  sources: AIAssistantContextSource[];
  healthScore: number | null;
  deviceProfile: DeviceProfileSummary | null;
  activeGoals: GoalSummary[];
  recentTimelineEvents: TimelineEventSummary[];
  activeRecommendations: RecommendationSummary[];
  activePredictions: PredictionSummary[];
  maintenanceHistory: MaintenanceSummary[];
  optimizationHistory: OptimizationHistorySummary[];
  recoveryHistory: RecoverySummary[];
  userPreferences: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Context Summaries (lightweight references to existing module data) ────

export interface DeviceProfileSummary {
  profileType: string;
  performanceTier: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface GoalSummary {
  id: string;
  name: string;
  status: string;
  priority: string;
  progress: number;
  futureMetadata: Record<string, unknown>;
}

export interface TimelineEventSummary {
  id: string;
  title: string;
  timestamp: string;
  category: string;
  severity: string;
  futureMetadata: Record<string, unknown>;
}

export interface RecommendationSummary {
  id: string;
  title: string;
  category: string;
  priority: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface PredictionSummary {
  id: string;
  title: string;
  category: string;
  riskLevel: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

export interface MaintenanceSummary {
  id: string;
  type: string;
  timestamp: string;
  success: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface OptimizationHistorySummary {
  id: string;
  timestamp: string;
  goal: string;
  success: boolean;
  healthDelta: number;
  futureMetadata: Record<string, unknown>;
}

export interface RecoverySummary {
  id: string;
  timestamp: string;
  type: string;
  success: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── AIAssistant Evidence ──────────────────────────────────────────

export interface AIAssistantEvidence {
  source: string;
  metric: string;
  value: string | number | boolean;
  timestamp: string;
  description: string;
  confidence: number;
  futureMetadata: Record<string, unknown>;
}

// ── AIAssistant Response ──────────────────────────────────────────

export interface AIAssistantResponse {
  id: string;
  conversationId: string;
  answer: string;
  reasoningSummary: string;
  supportingEvidence: AIAssistantEvidence[];
  confidence: number;
  relatedRecommendations: RecommendationSummary[];
  suggestedNextActions: AIAssistantSuggestion[];
  relevantModules: string[];
  intent: AIAssistantIntentType;
  capabilities: AIAssistantCapability[];
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

// ── AIAssistant Suggestion ────────────────────────────────────────

export type SuggestionType =
  | 'optimize_now'
  | 'create_goal'
  | 'view_timeline'
  | 'view_recovery'
  | 'compare_plans'
  | 'generate_report'
  | 'start_maintenance'
  | 'schedule_optimization'
  | 'view_prediction'
  | 'view_recommendation'
  | 'navigate_to'
  | 'future_suggestion';

export interface AIAssistantSuggestion {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  confidence: number;
  priority: SuggestionPriority;
  actionId: string | null;
  evidence: AIAssistantEvidence[];
  futureMetadata: Record<string, unknown>;
}

export type SuggestionPriority = 'critical' | 'high' | 'medium' | 'low' | 'informational';

// ── AIAssistant Explanation ───────────────────────────────────────

export type ExplanationSubject =
  | 'recommendation'
  | 'health_score'
  | 'prediction'
  | 'device_profile'
  | 'timeline_event'
  | 'recovery_option'
  | 'optimization_plan'
  | 'goal'
  | 'simulation'
  | 'future_subject';

export interface AIAssistantExplanation {
  subject: ExplanationSubject;
  subjectId: string | null;
  title: string;
  why: string;
  evidence: AIAssistantEvidence[];
  confidence: number;
  relatedContext: string[];
  alternativeView: string;
  nextBestAction: string;
  futureMetadata: Record<string, unknown>;
}

// ── Action Planning ───────────────────────────────────────────

export type ActionType =
  | 'generate_optimization_session'
  | 'open_timeline'
  | 'view_recovery'
  | 'create_goal'
  | 'compare_plans'
  | 'generate_report'
  | 'start_maintenance'
  | 'schedule_optimization'
  | 'navigate_to'
  | 'future_action';

export interface AIAssistantActionPlan {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation: boolean;
  allowed: boolean;
  permissionReason: string | null;
  estimatedBenefit: string;
  evidence: AIAssistantEvidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Conversation Model ────────────────────────────────────────

export interface AIAssistantConversation {
  id: string;
  createdAt: string;
  updatedAt: string;
  intent: AIAssistantIntentType;
  confidence: number;
  context: AIAssistantContext;
  entities: AIAssistantEntity[];
  selectedModules: string[];
  generatedActions: AIAssistantActionPlan[];
  suggestions: AIAssistantSuggestion[];
  references: AIAssistantReference[];
  messages: AIAssistantMessage[];
  status: ConversationStatus;
  futureMetadata: Record<string, unknown>;
}

export type ConversationStatus = 'active' | 'completed' | 'expired' | 'cancelled';

export interface AIAssistantMessage {
  id: string;
  role: 'user' | 'AIAssistant';
  content: string;
  timestamp: string;
  intent: AIAssistantIntentType | null;
  responseId: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantReference {
  type: EntityType;
  id: string;
  title: string;
  source: string;
  futureMetadata: Record<string, unknown>;
}

// ── Memory ────────────────────────────────────────────────────

export interface AIAssistantMemory {
  conversationContext: AIAssistantContext | null;
  activeSessionId: string | null;
  recentTopics: string[];
  pendingSuggestions: AIAssistantSuggestion[];
  recentEntities: AIAssistantEntity[];
  futureContextProviders: string[];
  futureMetadata: Record<string, unknown>;
}

// ── Session ───────────────────────────────────────────────────

export interface AIAssistantSession {
  id: string;
  createdAt: string;
  lastActivityAt: string;
  conversationCount: number;
  activeConversationId: string | null;
  status: SessionStatus;
  futureMetadata: Record<string, unknown>;
}

export type SessionStatus = 'active' | 'idle' | 'closed';

// ── Permission ────────────────────────────────────────────────

export type PermissionLevel = 'guest' | 'free' | 'pro' | 'enterprise' | 'future_level';

export interface PermissionRule {
  action: ActionType;
  requiredLevel: PermissionLevel;
  description: string;
  futureMetadata: Record<string, unknown>;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string | null;
  requiredLevel: PermissionLevel;
  currentLevel: PermissionLevel;
  futureMetadata: Record<string, unknown>;
}

// ── Analytics ─────────────────────────────────────────────────

export interface AIAssistantAnalytics {
  totalConversations: number;
  totalMessages: number;
  byIntent: Record<string, number>;
  byCapability: Record<string, number>;
  averageConfidence: number;
  averageResponseTimeMs: number;
  suggestionAcceptanceRate: number;
  actionPlanRate: number;
  topTopics: TopicCount[];
  topEntities: EntityCount[];
  generatedAt: string;
  futureMetadata: Record<string, unknown>;
}

export interface TopicCount {
  topic: string;
  count: number;
}

export interface EntityCount {
  type: EntityType;
  count: number;
}

// ── Validation ────────────────────────────────────────────────

export interface AIAssistantValidationResult {
  valid: boolean;
  errors: AIAssistantValidationError[];
  warnings: AIAssistantValidationWarning[];
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface AIAssistantValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Prompt Input ──────────────────────────────────────────────

export interface AIAssistantPromptInput {
  prompt: string;
  conversationId: string | null;
  userPermissionLevel: PermissionLevel;
  userPreferences: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantPromptResult {
  conversation: AIAssistantConversation;
  response: AIAssistantResponse;
  suggestions: AIAssistantSuggestion[];
  actionPlans: AIAssistantActionPlan[];
  processingTimeMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Configuration ─────────────────────────────────────────────

export interface IntentDefinitions {
  definitions: IntentDefinition[];
  minConfidenceThreshold: number;
  futureMetadata: Record<string, unknown>;
}

export interface ResponseTemplates {
  templates: ResponseTemplate[];
  futureMetadata: Record<string, unknown>;
}

export interface ResponseTemplate {
  intent: AIAssistantIntentType;
  capability: AIAssistantCapability;
  template: string;
  futureMetadata: Record<string, unknown>;
}

export interface SuggestionRules {
  maxSuggestions: number;
  minConfidence: number;
  priorityOrder: SuggestionPriority[];
  futureMetadata: Record<string, unknown>;
}

export interface PermissionRules {
  rules: PermissionRule[];
  defaultLevel: PermissionLevel;
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantFeatureFlags {
  enableAIAssistant: boolean;
  enableIntentResolution: boolean;
  enableContextResolution: boolean;
  enableResponseGeneration: boolean;
  enableSuggestions: boolean;
  enableExplanations: boolean;
  enableActionPlanning: boolean;
  enableMemory: boolean;
  enableAnalytics: boolean;
  enableEvents: boolean;
  enablePermissions: boolean;
  enableValidation: boolean;
  enableExplainability: boolean;
  futureFlags: Record<string, boolean>;
}

export interface ProviderConfiguration {
  providerName: string;
  providerVersion: string;
  enabled: boolean;
  config: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantConfiguration {
  configVersion: string;
  intentDefinitions: IntentDefinitions;
  responseTemplates: ResponseTemplates;
  suggestionRules: SuggestionRules;
  permissionRules: PermissionRules;
  featureFlags: AIAssistantFeatureFlags;
  providers: ProviderConfiguration[];
  performanceTargetMs: number;
  intentResolutionTargetMs: number;
  responseOrchestrationTargetMs: number;
  maxConversations: number;
  maxMessagesPerConversation: number;
  enableEvents: boolean;
  futureMetadata: Record<string, unknown>;
}

// ── Events ────────────────────────────────────────────────────

export type AIAssistantEventType =
  | 'conversation_started'
  | 'intent_resolved'
  | 'response_generated'
  | 'suggestion_created'
  | 'action_planned'
  | 'conversation_completed';

export interface AIAssistantEvent {
  type: AIAssistantEventType;
  conversationId: string | null;
  timestamp: string;
  data: unknown;
}

export type AIAssistantEventListener = (event: AIAssistantEvent) => void;

// ── Provider Plugin (Extensibility) ───────────────────────────

export interface AIAssistantProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  resolveIntent?(prompt: string): IntentResolutionResult | null;
  generateResponse?(input: AIAssistantResponseInput): AIAssistantResponse | null;
  generateSuggestions?(input: AIAssistantSuggestionInput): AIAssistantSuggestion[] | null;
}

export interface AIAssistantResponseInput {
  intent: AIAssistantIntentType;
  context: AIAssistantContext;
  entities: AIAssistantEntity[];
  prompt: string;
  conversationId: string;
  futureMetadata: Record<string, unknown>;
}

export interface AIAssistantSuggestionInput {
  intent: AIAssistantIntentType;
  context: AIAssistantContext;
  conversationId: string;
  futureMetadata: Record<string, unknown>;
}

// ── Helper Functions ──────────────────────────────────────────

export function generateAIAssistantId(): string {
  return `ai_assistant_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateConversationId(): string {
  return `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateResponseId(): string {
  return `resp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateSuggestionId(): string {
  return `sug_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateActionPlanId(): string {
  return `action_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateSessionId(): string {
  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateExplanationId(): string {
  return `expl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function generateReferenceId(): string {
  return `ref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function getIntentLabel(intent: AIAssistantIntentType): string {
  const labels: Record<AIAssistantIntentType, string> = {
    question: 'Question',
    recommendation: 'Recommendation',
    explanation: 'Explanation',
    comparison: 'Comparison',
    planning: 'Planning',
    optimization: 'Optimization',
    maintenance: 'Maintenance',
    recovery: 'Recovery',
    goal_management: 'Goal Management',
    navigation: 'Navigation',
    reporting: 'Reporting',
    conversation: 'Conversation',
    future_intent: 'Future Intent',
  };
  return labels[intent] ?? 'Unknown';
}

export function getCapabilityLabel(capability: AIAssistantCapability): string {
  const labels: Record<AIAssistantCapability, string> = {
    answer_questions: 'Answer Questions',
    explain_recommendations: 'Explain Recommendations',
    explain_health_score: 'Explain Health Score',
    explain_predictions: 'Explain Predictions',
    explain_device_profile: 'Explain Device Profile',
    suggest_optimizations: 'Suggest Optimizations',
    generate_optimization_session: 'Generate Optimization Session',
    compare_strategies: 'Compare Strategies',
    explain_timeline_events: 'Explain Timeline Events',
    explain_recovery_options: 'Explain Recovery Options',
    navigate_features: 'Navigate Features',
    generate_reports: 'Generate Reports',
    future_capability: 'Future Capability',
  };
  return labels[capability] ?? 'Unknown';
}

export function getActionTypeLabel(action: ActionType): string {
  const labels: Record<ActionType, string> = {
    generate_optimization_session: 'Generate Optimization Session',
    open_timeline: 'Open Timeline',
    view_recovery: 'View Recovery',
    create_goal: 'Create Goal',
    compare_plans: 'Compare Plans',
    generate_report: 'Generate Report',
    start_maintenance: 'Start Maintenance',
    schedule_optimization: 'Schedule Optimization',
    navigate_to: 'Navigate To',
    future_action: 'Future Action',
  };
  return labels[action] ?? 'Unknown';
}

export function getEventTypeLabel(event: AIAssistantEventType): string {
  const labels: Record<AIAssistantEventType, string> = {
    conversation_started: 'Conversation Started',
    intent_resolved: 'Intent Resolved',
    response_generated: 'Response Generated',
    suggestion_created: 'Suggestion Created',
    action_planned: 'Action Planned',
    conversation_completed: 'Conversation Completed',
  };
  return labels[event] ?? 'Unknown';
}

export function getSuggestionTypeLabel(type: SuggestionType): string {
  const labels: Record<SuggestionType, string> = {
    optimize_now: 'Optimize Now',
    create_goal: 'Create Goal',
    view_timeline: 'View Timeline',
    view_recovery: 'View Recovery',
    compare_plans: 'Compare Plans',
    generate_report: 'Generate Report',
    start_maintenance: 'Start Maintenance',
    schedule_optimization: 'Schedule Optimization',
    view_prediction: 'View Prediction',
    view_recommendation: 'View Recommendation',
    navigate_to: 'Navigate To',
    future_suggestion: 'Future Suggestion',
  };
  return labels[type] ?? 'Unknown';
}

export function getExplanationSubjectLabel(subject: ExplanationSubject): string {
  const labels: Record<ExplanationSubject, string> = {
    recommendation: 'Recommendation',
    health_score: 'Health Score',
    prediction: 'Prediction',
    device_profile: 'Device Profile',
    timeline_event: 'Timeline Event',
    recovery_option: 'Recovery Option',
    optimization_plan: 'Optimization Plan',
    goal: 'Goal',
    simulation: 'Simulation',
    future_subject: 'Future Subject',
  };
  return labels[subject] ?? 'Unknown';
}

export function getPermissionLevelLabel(level: PermissionLevel): string {
  const labels: Record<PermissionLevel, string> = {
    guest: 'Guest',
    free: 'Free',
    pro: 'Pro',
    enterprise: 'Enterprise',
    future_level: 'Future Level',
  };
  return labels[level] ?? 'Unknown';
}

export function getConversationStatusLabel(status: ConversationStatus): string {
  const labels: Record<ConversationStatus, string> = {
    active: 'Active',
    completed: 'Completed',
    expired: 'Expired',
    cancelled: 'Cancelled',
  };
  return labels[status] ?? 'Unknown';
}

export function getSessionStatusLabel(status: SessionStatus): string {
  const labels: Record<SessionStatus, string> = {
    active: 'Active',
    idle: 'Idle',
    closed: 'Closed',
  };
  return labels[status] ?? 'Unknown';
}

export function createDefaultIntentDefinitions(): IntentDefinitions {
  return {
    definitions: [
      { type: 'question', label: 'Question', description: 'User asks a question about the system', keywords: ['what', 'why', 'how', 'when', 'where', 'which', 'who'], capabilities: ['answer_questions'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'recommendation', label: 'Recommendation', description: 'User asks for recommendations', keywords: ['recommend', 'suggest', 'best', 'should', 'improve', 'optimize'], capabilities: ['suggest_optimizations', 'explain_recommendations'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'explanation', label: 'Explanation', description: 'User asks for an explanation', keywords: ['explain', 'understand', 'meaning', 'detail', 'elaborate'], capabilities: ['explain_recommendations', 'explain_health_score', 'explain_predictions', 'explain_device_profile', 'explain_timeline_events', 'explain_recovery_options'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'comparison', label: 'Comparison', description: 'User asks to compare options', keywords: ['compare', 'versus', 'vs', 'difference', 'better', 'alternative'], capabilities: ['compare_strategies'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'planning', label: 'Planning', description: 'User asks about planning', keywords: ['plan', 'schedule', 'strategy', 'approach', 'roadmap'], capabilities: ['generate_optimization_session', 'suggest_optimizations'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'optimization', label: 'Optimization', description: 'User asks about optimization', keywords: ['optimize', 'boost', 'speed', 'performance', 'clean', 'fix'], capabilities: ['suggest_optimizations', 'generate_optimization_session'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'maintenance', label: 'Maintenance', description: 'User asks about maintenance', keywords: ['maintain', 'update', 'check', 'scan', 'service', 'diagnostic'], capabilities: ['suggest_optimizations'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'recovery', label: 'Recovery', description: 'User asks about recovery', keywords: ['recover', 'rollback', 'undo', 'restore', 'revert'], capabilities: ['explain_recovery_options'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'goal_management', label: 'Goal Management', description: 'User asks about goals', keywords: ['goal', 'target', 'objective', 'aim'], capabilities: ['answer_questions'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'navigation', label: 'Navigation', description: 'User asks to navigate', keywords: ['open', 'go', 'show', 'view', 'navigate', 'take me'], capabilities: ['navigate_features'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'reporting', label: 'Reporting', description: 'User asks for a report', keywords: ['report', 'summary', 'overview', 'status', 'digest'], capabilities: ['generate_reports'], minConfidence: 0.5, futureMetadata: {} },
      { type: 'conversation', label: 'Conversation', description: 'General conversation', keywords: ['hello', 'hi', 'thanks', 'help', 'ok'], capabilities: ['answer_questions'], minConfidence: 0.3, futureMetadata: {} },
    ],
    minConfidenceThreshold: 0.3,
    futureMetadata: {},
  };
}

export function createDefaultResponseTemplates(): ResponseTemplates {
  return {
    templates: [
      { intent: 'question', capability: 'answer_questions', template: 'Based on the available data, {answer}', futureMetadata: {} },
      { intent: 'recommendation', capability: 'suggest_optimizations', template: 'I recommend: {answer}', futureMetadata: {} },
      { intent: 'explanation', capability: 'explain_health_score', template: 'Your health score is {answer}', futureMetadata: {} },
      { intent: 'comparison', capability: 'compare_strategies', template: 'Comparison: {answer}', futureMetadata: {} },
      { intent: 'planning', capability: 'generate_optimization_session', template: 'Here is a plan: {answer}', futureMetadata: {} },
    ],
    futureMetadata: {},
  };
}

export function createDefaultSuggestionRules(): SuggestionRules {
  return {
    maxSuggestions: 5,
    minConfidence: 0.4,
    priorityOrder: ['critical', 'high', 'medium', 'low', 'informational'],
    futureMetadata: {},
  };
}

export function createDefaultPermissionRules(): PermissionRules {
  return {
    rules: [
      { action: 'generate_optimization_session', requiredLevel: 'free', description: 'Generate optimization sessions', futureMetadata: {} },
      { action: 'open_timeline', requiredLevel: 'free', description: 'View timeline', futureMetadata: {} },
      { action: 'view_recovery', requiredLevel: 'free', description: 'View recovery options', futureMetadata: {} },
      { action: 'create_goal', requiredLevel: 'pro', description: 'Create goals', futureMetadata: {} },
      { action: 'compare_plans', requiredLevel: 'free', description: 'Compare plans', futureMetadata: {} },
      { action: 'generate_report', requiredLevel: 'pro', description: 'Generate reports', futureMetadata: {} },
      { action: 'start_maintenance', requiredLevel: 'free', description: 'Start maintenance', futureMetadata: {} },
      { action: 'schedule_optimization', requiredLevel: 'pro', description: 'Schedule optimization', futureMetadata: {} },
      { action: 'navigate_to', requiredLevel: 'guest', description: 'Navigate to features', futureMetadata: {} },
    ],
    defaultLevel: 'free',
    futureMetadata: {},
  };
}

export function createDefaultAIAssistantFeatureFlags(): AIAssistantFeatureFlags {
  return {
    enableAIAssistant: true,
    enableIntentResolution: true,
    enableContextResolution: true,
    enableResponseGeneration: true,
    enableSuggestions: true,
    enableExplanations: true,
    enableActionPlanning: true,
    enableMemory: true,
    enableAnalytics: true,
    enableEvents: true,
    enablePermissions: true,
    enableValidation: true,
    enableExplainability: true,
    futureFlags: {},
  };
}

export function createDefaultProviders(): ProviderConfiguration[] {
  return [
    {
      providerName: 'builtin',
      providerVersion: '1.0.0',
      enabled: true,
      config: {},
      futureMetadata: {},
    },
  ];
}
