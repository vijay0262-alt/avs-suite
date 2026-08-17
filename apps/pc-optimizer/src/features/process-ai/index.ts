/**
 * Process AI Engine — barrel exports
 *
 * Public API for the AI Process Intelligence Engine.
 * Analyzes running processes, explains their impact, and recommends
 * evidence-based optimizations. No automatic termination.
 */

// Types
export * from './types';

// Events
export { processEventBus } from './ProcessEvents';

// Core engine
export { ProcessAIEngine } from './ProcessAIEngine';

// Process management
export { ProcessManager } from './ProcessManager';
export { ProcessScanner } from './ProcessScanner';
export type { ProcessProvider } from './ProcessScanner';
export { RpcProcessProvider } from './RpcProcessProvider';
export { ProcessRepository } from './ProcessRepository';
export { ProcessHistory } from './ProcessHistory';

// Analyzers
export { ProcessAnalyzer } from './ProcessAnalyzer';
export {
  CPUImpactAnalyzer,
  MemoryImpactAnalyzer,
  DiskImpactAnalyzer,
  GPUImpactAnalyzer,
  NetworkImpactAnalyzer,
  PowerImpactAnalyzer,
  StartupImpactAnalyzer,
  BackgroundImpactAnalyzer,
  computeOverallImpact,
} from './ProcessImpactAnalyzers';

// Trends, explanations, risk, recommendations, dashboard
export { ProcessTrendAnalyzer } from './ProcessTrendAnalyzer';
export { ProcessExplanationEngine } from './ProcessExplanationEngine';
export { ProcessRiskAssessmentEngine } from './ProcessRiskAssessment';
export { ProcessRecommendationEngine } from './ProcessRecommendationEngine';
export { ProcessDashboardProvider } from './ProcessDashboardProvider';
