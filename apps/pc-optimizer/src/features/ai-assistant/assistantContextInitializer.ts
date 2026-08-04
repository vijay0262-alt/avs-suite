/**
 * Assistant Context Initializer — builds a real AssistantContext
 * from live system data so the AI Copilot and Daily Briefing
 * have meaningful data to generate explanations and insights.
 *
 * Fetches dashboard metrics, runs the AI Health Engine analysis,
 * generates an optimization plan, and sets the context on the
 * ConversationEngine.
 */
import { conversationEngine, assistantContextBuilder } from './index';
import { dashboardService } from '../dashboard/dashboard.service';
import { healthAnalyzer } from '../ai-health-engine';
import { optimizationPlanner } from '../optimization-planner';
import { executionHistoryRepository, executionStatisticsService } from '../maintenance-history';
import type { AssistantContext } from './types';
import type { DashboardMetrics } from '../dashboard/dashboard.types';
import type { HealthReport } from '../ai-health-engine/types';
import type { OptimizationPlan } from '../optimization-planner/types';
import type { ExecutionRecord, ExecutionStatistics } from '../maintenance-history/types';

let _lastContext: AssistantContext | null = null;
let _lastBuildTime = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Build a real AssistantContext from live system data.
 * Caches for CACHE_TTL_MS to avoid repeated heavy computations.
 */
export async function buildAssistantContext(): Promise<AssistantContext> {
  // Return cached context if fresh
  if (_lastContext && Date.now() - _lastBuildTime < CACHE_TTL_MS) {
    return _lastContext;
  }

  // Fetch dashboard metrics (needed for health analysis)
  let metrics: DashboardMetrics | null = null;
  try {
    metrics = await dashboardService.getMetrics();
  } catch {
    // Metrics might not be available yet; continue with null
  }

  // Fetch execution history
  let executionHistory: ExecutionRecord[] = [];
  try {
    executionHistory = await executionHistoryRepository.getAll();
  } catch {
    // History might not be available
  }

  // Compute execution statistics
  let executionStatistics: ExecutionStatistics | null = null;
  try {
    executionStatistics = executionStatisticsService.computeStatistics(executionHistory);
  } catch {
    // Statistics might not be available
  }

  // Run AI Health Engine analysis
  let healthReport: HealthReport | null = null;
  if (metrics) {
    try {
      healthReport = await healthAnalyzer.analyze({
        metrics,
        executionHistory,
        executionStatistics: executionStatistics ?? {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          partialExecutions: 0,
          cancelledExecutions: 0,
          successRate: 0,
          averageDurationMs: 0,
          averageSpaceRecovered: 0,
          largestCleanupBytes: 0,
          largestCleanupExecutionId: null,
          mostFrequentTaskId: null,
          mostFrequentTaskName: null,
          mostFrequentTaskCount: 0,
          lastRunAt: null,
          longestRunMs: 0,
          longestRunExecutionId: null,
          totalFilesRemoved: 0,
          totalSpaceRecovered: 0,
        },
      });
    } catch {
      // Health analysis might fail; continue with null
    }
  }

  // Generate optimization plan from health report
  let optimizationPlan: OptimizationPlan | null = null;
  if (healthReport) {
    try {
      optimizationPlan = optimizationPlanner.generatePlan({
        healthReport,
        capabilities: { available: [], locked: [] },
        executionHistory,
        executionStatistics: executionStatistics ?? {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          partialExecutions: 0,
          cancelledExecutions: 0,
          successRate: 0,
          averageDurationMs: 0,
          averageSpaceRecovered: 0,
          largestCleanupBytes: 0,
          largestCleanupExecutionId: null,
          mostFrequentTaskId: null,
          mostFrequentTaskName: null,
          mostFrequentTaskCount: 0,
          lastRunAt: null,
          longestRunMs: 0,
          longestRunExecutionId: null,
          totalFilesRemoved: 0,
          totalSpaceRecovered: 0,
        },
      });
    } catch {
      // Plan generation might fail; continue with null
    }
  }

  // Build the context
  const context = assistantContextBuilder.build({
    healthReport,
    optimizationPlan,
    executionHistory,
    executionStatistics,
    capabilities: { available: [], locked: [] },
    trends: healthReport?.trends ?? null,
  });

  _lastContext = context;
  _lastBuildTime = Date.now();

  return context;
}

/**
 * Initialize the conversation engine with a real context.
 * Call this before starting a session or asking questions.
 */
export async function initAssistantContext(): Promise<AssistantContext> {
  const context = await buildAssistantContext();
  conversationEngine.setContext(context);
  return context;
}

/**
 * Force a fresh rebuild of the context (bypasses cache).
 */
export async function refreshAssistantContext(): Promise<AssistantContext> {
  _lastContext = null;
  _lastBuildTime = 0;
  return initAssistantContext();
}
