/**
 * Conversation Configuration — default configuration and factory.
 *
 * No hardcoded logic in the orchestrator. All rules, thresholds,
 * intent definitions, and tool definitions are configurable.
 */
import type {
  ConversationConfiguration,
  IntentDefinition,
  ToolDefinition,
} from './types';

export const DEFAULT_INTENT_DEFINITIONS: IntentDefinition[] = [
  {
    type: 'ask_health',
    label: 'Ask About Health',
    description: 'User asks about system health',
    keywords: ['health', 'score', 'status', 'how is my pc', 'how is my computer', 'system health'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['What can I do to improve my health score?', 'Show me recommendations'],
  },
  {
    type: 'ask_storage',
    label: 'Ask About Storage',
    description: 'User asks about storage usage',
    keywords: ['storage', 'disk', 'space', 'drive', 'full', 'capacity', 'ssd', 'hdd'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetStorageSummary'],
    suggestedFollowUps: ['What is taking up the most space?', 'Show me storage predictions'],
  },
  {
    type: 'ask_performance',
    label: 'Ask About Performance',
    description: 'User asks about system performance',
    keywords: ['performance', 'slow', 'fast', 'speed', 'cpu', 'ram', 'memory', 'lag', 'freeze'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['Why is my PC slow?', 'Show me performance recommendations'],
  },
  {
    type: 'ask_startup',
    label: 'Ask About Startup',
    description: 'User asks about startup items',
    keywords: ['startup', 'boot', 'startup items', 'boot time', 'startup programs'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['Which startup items should I disable?', 'Show me startup recommendations'],
  },
  {
    type: 'ask_privacy',
    label: 'Ask About Privacy',
    description: 'User asks about privacy',
    keywords: ['privacy', 'cookies', 'tracking', 'history', 'temp files', 'recycle bin'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['How can I improve my privacy?', 'Show me privacy recommendations'],
  },
  {
    type: 'ask_browser',
    label: 'Ask About Browser',
    description: 'User asks about browser data',
    keywords: ['browser', 'chrome', 'firefox', 'edge', 'cache', 'cookies', 'extensions'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['How can I clean my browser?', 'Show me browser recommendations'],
  },
  {
    type: 'ask_windows',
    label: 'Ask About Windows',
    description: 'User asks about Windows system',
    keywords: ['windows', 'update', 'services', 'os', 'system', 'build'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['Are there pending updates?', 'Show me Windows recommendations'],
  },
  {
    type: 'ask_predictions',
    label: 'Ask About Predictions',
    description: 'User asks about predictions',
    keywords: ['predict', 'prediction', 'forecast', 'future', 'will', 'expect', 'upcoming'],
    requiredModules: ['predictions'],
    suggestedTools: ['GetPredictions'],
    suggestedFollowUps: ['How accurate are these predictions?', 'What should I do about these predictions?'],
  },
  {
    type: 'ask_recommendations',
    label: 'Ask About Recommendations',
    description: 'User asks about recommendations',
    keywords: ['recommend', 'recommendation', 'suggest', 'suggestion', 'what should i do', 'optimize', 'improve'],
    requiredModules: ['recommendations'],
    suggestedTools: ['GetRecommendations'],
    suggestedFollowUps: ['Explain this recommendation', 'Show me more recommendations'],
  },
  {
    type: 'ask_device_profile',
    label: 'Ask About Device Profile',
    description: 'User asks about device profile',
    keywords: ['device profile', 'profile', 'what kind of pc', 'classification', 'workload', 'usage pattern'],
    requiredModules: ['device_profile'],
    suggestedTools: ['GetDeviceProfile'],
    suggestedFollowUps: ['How does my profile affect recommendations?', 'What does my profile mean?'],
  },
  {
    type: 'optimization_history',
    label: 'Optimization History',
    description: 'User asks about optimization history',
    keywords: ['history', 'optimization', 'past', 'previous', 'cleaned', 'fixed', 'last optimization'],
    requiredModules: ['context', 'history'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['How often should I optimize?', 'Show me recommendations'],
  },
  {
    type: 'achievements',
    label: 'Achievements',
    description: 'User asks about achievements',
    keywords: ['achievement', 'achievements', 'badge', 'reward', 'unlock'],
    requiredModules: ['insights'],
    suggestedTools: ['GetInsights'],
    suggestedFollowUps: ['How do I unlock more achievements?', 'Show me milestones'],
  },
  {
    type: 'milestones',
    label: 'Milestones',
    description: 'User asks about milestones',
    keywords: ['milestone', 'milestones', 'progress', 'goal', 'target'],
    requiredModules: ['insights'],
    suggestedTools: ['GetInsights'],
    suggestedFollowUps: ['What milestones are next?', 'Show me achievements'],
  },
  {
    type: 'explain_recommendation',
    label: 'Explain Recommendation',
    description: 'User asks to explain a specific recommendation',
    keywords: ['explain', 'why', 'detail', 'tell me about', 'elaborate'],
    requiredModules: ['recommendations', 'knowledge'],
    suggestedTools: ['ExplainRecommendation'],
    suggestedFollowUps: ['What are the benefits?', 'Are there any risks?'],
  },
  {
    type: 'explain_prediction',
    label: 'Explain Prediction',
    description: 'User asks to explain a specific prediction',
    keywords: ['explain prediction', 'why predict', 'how predict', 'prediction detail'],
    requiredModules: ['predictions', 'knowledge'],
    suggestedTools: ['ExplainPrediction'],
    suggestedFollowUps: ['What should I do about this prediction?', 'How confident is this prediction?'],
  },
  {
    type: 'general_question',
    label: 'General Question',
    description: 'General question about the system',
    keywords: ['what', 'how', 'why', 'when', 'where', 'help', 'tell me'],
    requiredModules: ['context', 'knowledge'],
    suggestedTools: ['GetHealthSummary'],
    suggestedFollowUps: ['Show me recommendations', 'What are the predictions?'],
  },
];

export const DEFAULT_TOOL_DEFINITIONS: ToolDefinition[] = [
  { name: 'GetHealthSummary', description: 'Get system health summary', module: 'context', parameters: [] },
  { name: 'GetStorageSummary', description: 'Get storage usage summary', module: 'context', parameters: [] },
  { name: 'GetRecommendations', description: 'Get AI recommendations', module: 'recommendations', parameters: [] },
  { name: 'GetInsights', description: 'Get AI insights', module: 'insights', parameters: [] },
  { name: 'GetPredictions', description: 'Get AI predictions', module: 'predictions', parameters: [] },
  { name: 'GetDeviceProfile', description: 'Get device profile', module: 'device_profile', parameters: [] },
  { name: 'ExplainRecommendation', description: 'Explain a specific recommendation', module: 'recommendations', parameters: ['recommendationId'] },
  { name: 'ExplainPrediction', description: 'Explain a specific prediction', module: 'predictions', parameters: ['predictionId'] },
];

export const DEFAULT_CONVERSATION_CONFIG: ConversationConfiguration = {
  orchestratorVersion: '1.0.0',
  intentDefinitions: [...DEFAULT_INTENT_DEFINITIONS],
  toolDefinitions: [...DEFAULT_TOOL_DEFINITIONS],
  intentRules: {
    minConfidence: 0.2,
    maxAlternativeIntents: 3,
    fallbackIntent: 'general_question',
    keywordMatchingEnabled: true,
  },
  plannerRules: {
    maxSteps: 8,
    timeoutMs: 5000,
    parallelExecution: false,
    skipUnavailableModules: true,
  },
  memoryRules: {
    maxPreviousQuestions: 20,
    maxReferencedItems: 50,
    sessionTimeoutMs: 30 * 60 * 1000,
    persistAcrossSessions: false,
  },
  providerSettings: {
    defaultProvider: 'mock',
    fallbackProvider: null,
    timeoutMs: 30000,
    maxRetries: 2,
    enableStreaming: false,
  },
  contextLimits: {
    maxFacts: 50,
    maxRecommendations: 10,
    maxInsights: 10,
    maxPredictions: 10,
    maxEvidencePieces: 30,
    summaryModeThreshold: 5,
  },
  enableHistory: true,
  maxHistoryEntries: 200,
  minConfidenceThreshold: 0.15,
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function createConversationConfig(
  overrides?: DeepPartial<ConversationConfiguration>,
): ConversationConfiguration {
  if (!overrides) return { ...DEFAULT_CONVERSATION_CONFIG };
  return {
    ...DEFAULT_CONVERSATION_CONFIG,
    ...overrides,
    intentDefinitions: overrides.intentDefinitions
      ? (overrides.intentDefinitions as IntentDefinition[])
      : DEFAULT_CONVERSATION_CONFIG.intentDefinitions,
    toolDefinitions: overrides.toolDefinitions
      ? (overrides.toolDefinitions as ToolDefinition[])
      : DEFAULT_CONVERSATION_CONFIG.toolDefinitions,
    intentRules: { ...DEFAULT_CONVERSATION_CONFIG.intentRules, ...overrides.intentRules },
    plannerRules: { ...DEFAULT_CONVERSATION_CONFIG.plannerRules, ...overrides.plannerRules },
    memoryRules: { ...DEFAULT_CONVERSATION_CONFIG.memoryRules, ...overrides.memoryRules },
    providerSettings: { ...DEFAULT_CONVERSATION_CONFIG.providerSettings, ...overrides.providerSettings },
    contextLimits: { ...DEFAULT_CONVERSATION_CONFIG.contextLimits, ...overrides.contextLimits },
  };
}
