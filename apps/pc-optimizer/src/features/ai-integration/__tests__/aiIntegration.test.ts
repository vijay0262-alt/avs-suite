/**
 * Tests for the AI Integration Hub service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    AI_INTEGRATION_GET_RECOMMENDED_CLEANERS: 'ai_integration.getRecommendedCleaners',
    AI_INTEGRATION_APPLY_WORKLOAD_PRIORITY: 'ai_integration.applyWorkloadPriority',
    AI_INTEGRATION_GET_AUTOCARE_SUGGESTIONS: 'ai_integration.getAutoCareSuggestions',
    AI_INTEGRATION_GET_STATUS: 'ai_integration.getStatus',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { aiIntegrationService } from '../aiIntegration.service';

describe('aiIntegrationService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('gets recommended cleaners', async () => {
    mockCall.mockResolvedValue({
      recommendedSelect: ['temp', 'cache', 'logs'],
      recommendedDeselect: ['browser_history'],
      hasData: true,
      confidence: 'high',
      totalEvents: 15,
    });

    const result = await aiIntegrationService.getRecommendedCleaners();
    expect(result.hasData).toBe(true);
    expect(result.confidence).toBe('high');
    expect(result.recommendedSelect).toContain('temp');
    expect(result.recommendedDeselect).toContain('browser_history');
  });

  it('handles no learning data', async () => {
    mockCall.mockResolvedValue({
      recommendedSelect: [],
      recommendedDeselect: [],
      hasData: false,
      confidence: 'low',
    });

    const result = await aiIntegrationService.getRecommendedCleaners();
    expect(result.hasData).toBe(false);
    expect(result.recommendedSelect).toHaveLength(0);
  });

  it('applies workload priority', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Switched to game priority mode for gaming workload',
      workloadMode: 'gaming',
      confidence: 0.85,
      priorityMode: 'game',
      applied: true,
      boostedCount: 3,
      loweredCount: 5,
    });

    const result = await aiIntegrationService.applyWorkloadPriority();
    expect(result.success).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.priorityMode).toBe('game');
    expect(result.boostedCount).toBe(3);
  });

  it('handles low confidence workload', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Workload confidence too low (30%) — keeping current priority mode',
      workloadMode: 'mixed',
      confidence: 0.3,
      priorityMode: null,
      applied: false,
    });

    const result = await aiIntegrationService.applyWorkloadPriority();
    expect(result.success).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.priorityMode).toBeNull();
  });

  it('gets auto-care suggestions', async () => {
    mockCall.mockResolvedValue({
      hasData: true,
      suggestedIdleThreshold: 180,
      suggestedTasks: { junkClean: true, memoryOptimize: true, tempClean: false },
      preferredCleanupTime: '14:00',
      averageFrequencyHours: 8.5,
      totalEvents: 12,
    });

    const result = await aiIntegrationService.getAutoCareSuggestions();
    expect(result.hasData).toBe(true);
    expect(result.suggestedIdleThreshold).toBe(180);
    expect(result.suggestedTasks.tempClean).toBe(false);
    expect(result.preferredCleanupTime).toBe('14:00');
  });

  it('handles no auto-care data', async () => {
    mockCall.mockResolvedValue({
      hasData: false,
      suggestedIdleThreshold: 300,
      suggestedTasks: {},
    });

    const result = await aiIntegrationService.getAutoCareSuggestions();
    expect(result.hasData).toBe(false);
    expect(result.suggestedIdleThreshold).toBe(300);
  });

  it('gets integration status', async () => {
    mockCall.mockResolvedValue({
      selfLearningConnected: true,
      selfLearningHasData: true,
      workloadConnected: true,
      workloadMode: 'gaming',
      autoCareConnected: false,
      anomalyConnected: true,
      anomalyActiveCount: 2,
      smartNotificationsConnected: true,
      activeIntegrations: 4,
      totalIntegrations: 5,
    });

    const result = await aiIntegrationService.getStatus();
    expect(result.selfLearningConnected).toBe(true);
    expect(result.workloadMode).toBe('gaming');
    expect(result.anomalyActiveCount).toBe(2);
    expect(result.activeIntegrations).toBe(4);
    expect(result.totalIntegrations).toBe(5);
  });

  it('handles all disconnected', async () => {
    mockCall.mockResolvedValue({
      selfLearningConnected: false,
      workloadConnected: false,
      autoCareConnected: false,
      anomalyConnected: false,
      smartNotificationsConnected: false,
      activeIntegrations: 0,
      totalIntegrations: 5,
    });

    const result = await aiIntegrationService.getStatus();
    expect(result.activeIntegrations).toBe(0);
  });
});
