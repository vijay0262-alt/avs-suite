/**
 * AI Threat Investigation — barrel exports
 *
 * Version 1.2 — EPIC 1 — Part 3 — AI Threat Investigation & Explainable Security
 *
 * Public API for the AI Threat Investigation Engine.
 * Every detected threat becomes an understandable investigation.
 */

// Types
export * from './types';

// Events
export { threatEventBus } from './ThreatEvents';

// Configuration
export { ThreatConfigurationManager } from './ThreatConfiguration';

// Knowledge Base
export { ThreatKnowledgeBase } from './ThreatKnowledgeBase';

// Engines
export { ThreatSeverityEngine } from './ThreatSeverityEngine';
export { ThreatConfidenceEngine } from './ThreatConfidenceEngine';
export { ThreatEvidenceCollector } from './ThreatEvidenceCollector';
export { ThreatTimelineBuilder } from './ThreatTimelineBuilder';
export { ThreatCorrelationEngine } from './ThreatCorrelationEngine';
export type { CorrelationGroup } from './ThreatCorrelationEngine';
export { ThreatRelationshipGraphBuilder } from './ThreatRelationshipGraph';
export { ThreatExplanationEngine } from './ThreatExplanationEngine';
export { ThreatSummaryBuilder } from './ThreatSummaryBuilder';
export { ThreatRecommendationEngine } from './ThreatRecommendationEngine';
export { ThreatContextBuilder } from './ThreatContextBuilder';
export { ThreatReportGenerator } from './ThreatReportGenerator';

// History & Dashboard
export { ThreatHistory } from './ThreatHistory';
export { ThreatDashboardProvider } from './ThreatDashboardProvider';

// Main Engine
export { ThreatInvestigationEngine } from './ThreatInvestigationEngine';
