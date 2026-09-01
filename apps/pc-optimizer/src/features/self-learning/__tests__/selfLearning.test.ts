/**
 * Tests for the Self-Learning Cleanup service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    SELF_LEARNING_RECORD_CLEANUP: 'self_learning.recordCleanup',
    SELF_LEARNING_RECORD_SELECTION: 'self_learning.recordSelection',
    SELF_LEARNING_RECORD_EXCLUSION: 'self_learning.recordExclusion',
    SELF_LEARNING_GET_HABITS: 'self_learning.getHabits',
    SELF_LEARNING_GET_RECOMMENDATIONS: 'self_learning.getRecommendations',
    SELF_LEARNING_STATUS: 'self_learning.status',
    SELF_LEARNING_RESET: 'self_learning.reset',
    SELF_LEARNING_CONFIGURE: 'self_learning.configure',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { selfLearningService } from '../selfLearning.service';

describe('selfLearningService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('records a cleanup event', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Cleanup event recorded',
      totalEvents: 5,
    });

    const result = await selfLearningService.recordCleanup({
      bytesCleaned: 500000000,
      itemsCleaned: 150,
      categories: ['temp', 'cache', 'logs'],
    });
    expect(result.success).toBe(true);
    expect(result.totalEvents).toBe(5);
  });

  it('records a category selection', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Recorded selection of 'temp'",
      category: 'temp',
      selectedCount: 4,
      deselectedCount: 1,
    });

    const result = await selfLearningService.recordSelection('temp', true);
    expect(result.success).toBe(true);
    expect(result.selectedCount).toBe(4);
    expect(mockCall).toHaveBeenCalledWith('self_learning.recordSelection', { category: 'temp', selected: true });
  });

  it('records a category deselection', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Recorded deselection of 'cache'",
      category: 'cache',
      selectedCount: 1,
      deselectedCount: 3,
    });

    const result = await selfLearningService.recordSelection('cache', false);
    expect(result.success).toBe(true);
    expect(result.deselectedCount).toBe(3);
  });

  it('records an exclusion', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Exclusion recorded for 'C:\\important\\data'",
      totalExclusions: 3,
    });

    const result = await selfLearningService.recordExclusion('C:\\important\\data', 'user data');
    expect(result.success).toBe(true);
    expect(result.totalExclusions).toBe(3);
  });

  it('gets habits', async () => {
    mockCall.mockResolvedValue({
      cleanupPatterns: {
        preferredTimes: [
          { hour: 14, label: '14:00', count: 5 },
          { hour: 10, label: '10:00', count: 3 },
        ],
        preferredDays: [
          { day: 'Sunday', count: 4 },
          { day: 'Saturday', count: 3 },
        ],
        averageFrequencyHours: 48.5,
        averageBytesCleaned: 300000000,
        averageItemsCleaned: 120,
        totalEvents: 10,
      },
      categoryPreferences: {
        temp: {
          selectedCount: 8,
          deselectedCount: 2,
          preferenceScore: 0.8,
          recommendation: 'select',
          totalObservations: 10,
        },
        cache: {
          selectedCount: 2,
          deselectedCount: 8,
          preferenceScore: 0.2,
          recommendation: 'deselect',
          totalObservations: 10,
        },
      },
      exclusionPatterns: {
        frequentExclusions: [
          { path: 'C:\\important\\data', count: 5 },
        ],
        totalExclusions: 5,
        uniquePaths: 3,
      },
      stats: {
        totalCleanups: 10,
        totalBytesCleaned: 3000000000,
        totalItemsCleaned: 1200,
      },
      learningEnabled: true,
    });

    const result = await selfLearningService.getHabits();
    expect(result.cleanupPatterns.totalEvents).toBe(10);
    expect(result.cleanupPatterns.preferredTimes[0].hour).toBe(14);
    expect(result.categoryPreferences.temp.recommendation).toBe('select');
    expect(result.categoryPreferences.cache.recommendation).toBe('deselect');
    expect(result.exclusionPatterns.frequentExclusions[0].path).toBe('C:\\important\\data');
  });

  it('gets recommendations', async () => {
    mockCall.mockResolvedValue({
      recommendations: [
        {
          id: 'rec_cleanup_time',
          type: 'schedule',
          priority: 'normal',
          title: 'Optimal Cleanup Time Detected',
          message: 'You typically run cleanup around 14:00.',
          action: { label: 'Schedule Cleanup', rpcMethod: 'scheduler.create', params: { action: 'junk_clean', schedule: 'daily', time: '14:00' } },
        },
        {
          id: 'rec_cat_temp',
          type: 'category',
          priority: 'low',
          title: 'Always Clean Temp',
          message: "You select 'temp' in 8 out of 10 cleanups.",
          action: { label: 'Auto-select', rpcMethod: 'self_learning.configure', params: { autoSelectCategories: ['temp'] } },
        },
      ],
      count: 2,
      autoApply: false,
    });

    const result = await selfLearningService.getRecommendations();
    expect(result.count).toBe(2);
    expect(result.recommendations[0].type).toBe('schedule');
    expect(result.recommendations[1].action.label).toBe('Auto-select');
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      enabled: true,
      autoApplyRecommendations: false,
      config: {
        enabled: true,
        autoApplyRecommendations: false,
        learningRate: 0.1,
        minObservations: 3,
      },
      stats: {
        totalCleanups: 10,
        totalBytesCleaned: 3000000000,
        totalItemsCleaned: 1200,
        totalEvents: 10,
        totalCategoriesTracked: 5,
        totalExclusions: 3,
      },
      hasEnoughData: true,
      supported: true,
    });

    const result = await selfLearningService.getStatus();
    expect(result.enabled).toBe(true);
    expect(result.hasEnoughData).toBe(true);
    expect(result.stats.totalCleanups).toBe(10);
  });

  it('resets learned data', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'All learned data has been reset',
    });

    const result = await selfLearningService.reset();
    expect(result.success).toBe(true);
  });

  it('configures self-learning', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        autoApplyRecommendations: true,
        learningRate: 0.2,
        minObservations: 5,
      },
      message: 'Self-learning configuration updated',
    });

    const result = await selfLearningService.configure({ autoApplyRecommendations: true });
    expect(result.success).toBe(true);
    expect(result.config.autoApplyRecommendations).toBe(true);
  });

  it('handles not enough data for recommendations', async () => {
    mockCall.mockResolvedValue({
      recommendations: [],
      count: 0,
      autoApply: false,
    });

    const result = await selfLearningService.getRecommendations();
    expect(result.count).toBe(0);
    expect(result.recommendations).toHaveLength(0);
  });

  it('handles empty habits', async () => {
    mockCall.mockResolvedValue({
      cleanupPatterns: {
        preferredTimes: [],
        preferredDays: [],
        averageFrequencyHours: null,
        averageBytesCleaned: 0,
        averageItemsCleaned: 0,
        totalEvents: 0,
      },
      categoryPreferences: {},
      exclusionPatterns: {
        frequentExclusions: [],
        totalExclusions: 0,
        uniquePaths: 0,
      },
      stats: {
        totalCleanups: 0,
        totalBytesCleaned: 0,
        totalItemsCleaned: 0,
      },
      learningEnabled: true,
    });

    const result = await selfLearningService.getHabits();
    expect(result.cleanupPatterns.totalEvents).toBe(0);
    expect(result.cleanupPatterns.preferredTimes).toHaveLength(0);
    expect(Object.keys(result.categoryPreferences)).toHaveLength(0);
  });
});
