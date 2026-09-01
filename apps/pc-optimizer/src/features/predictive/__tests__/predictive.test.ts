/**
 * Tests for the Predictive Maintenance service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    PREDICTIVE_SAMPLE: 'predictive.sample',
    PREDICTIVE_STATUS: 'predictive.status',
    PREDICTIVE_HISTORY: 'predictive.history',
    PREDICTIVE_CONFIGURE: 'predictive.configure',
    PREDICTIVE_CLEAR_DATA: 'predictive.clearData',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { predictiveService } from '../predictive.service';

describe('predictiveService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('takes a sample', async () => {
    mockCall.mockResolvedValue({
      success: true,
      sample: {
        timestamp: '2024-06-01T12:00:00',
        junkBytes: 500000000,
        tempBytes: 400000000,
        cacheBytes: 100000000,
        totalBytes: 500000000,
      },
      prediction: {
        predictedDate: '2024-06-05T12:00:00',
        daysUntilCleanup: 4.0,
        confidence: 0.85,
        currentJunkBytes: 500000000,
        accumulationRateBytesPerDay: 100000000,
        recommendedAction: 'Cleanup suggested within 4 days',
      },
      sampleCount: 10,
    });

    const result = await predictiveService.sample();
    expect(result.success).toBe(true);
    expect(result.sample.totalBytes).toBe(500000000);
    expect(result.prediction.daysUntilCleanup).toBe(4.0);
    expect(result.sampleCount).toBe(10);
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      prediction: {
        predictedDate: '2024-06-04T12:00:00',
        daysUntilCleanup: 3.0,
        confidence: 0.78,
        currentJunkBytes: 800000000,
        accumulationRateBytesPerDay: 150000000,
        recommendedAction: 'Cleanup suggested within 3 days',
      },
      config: {
        enabled: true,
        thresholdGB: 5.0,
        sampleIntervalMinutes: 60,
        maxSamples: 168,
        notificationThresholdHours: 24,
      },
      sampleCount: 24,
      lastSampleAt: '2024-06-01T11:00:00',
      supported: true,
    });

    const result = await predictiveService.getStatus();
    expect(result.prediction.daysUntilCleanup).toBe(3.0);
    expect(result.config.thresholdGB).toBe(5.0);
    expect(result.sampleCount).toBe(24);
  });

  it('gets history', async () => {
    mockCall.mockResolvedValue({
      samples: [
        { timestamp: '2024-06-01T10:00:00', junkBytes: 300000000, tempBytes: 250000000, cacheBytes: 50000000, totalBytes: 300000000 },
        { timestamp: '2024-06-01T11:00:00', junkBytes: 400000000, tempBytes: 350000000, cacheBytes: 50000000, totalBytes: 400000000 },
        { timestamp: '2024-06-01T12:00:00', junkBytes: 500000000, tempBytes: 400000000, cacheBytes: 100000000, totalBytes: 500000000 },
      ],
      predictions: [
        { timestamp: '2024-06-01T12:00:00', predictedDate: '2024-06-05T12:00:00', daysUntilCleanup: 4.0, confidence: 0.85, currentJunkBytes: 500000000, accumulationRateBytesPerDay: 100000000, recommendedAction: 'Cleanup suggested within 4 days' },
      ],
      sampleCount: 3,
      predictionCount: 1,
      supported: true,
    });

    const result = await predictiveService.getHistory(50);
    expect(result.sampleCount).toBe(3);
    expect(result.samples).toHaveLength(3);
    expect(result.predictions).toHaveLength(1);
  });

  it('configures predictive maintenance', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        thresholdGB: 10.0,
        sampleIntervalMinutes: 30,
        maxSamples: 336,
        notificationThresholdHours: 48,
      },
      message: 'Predictive maintenance configuration updated',
    });

    const result = await predictiveService.configure({ thresholdGB: 10.0 });
    expect(result.success).toBe(true);
    expect(result.config.thresholdGB).toBe(10.0);
  });

  it('clears data', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'All prediction data cleared',
    });

    const result = await predictiveService.clearData();
    expect(result.success).toBe(true);
  });

  it('handles no prediction (insufficient data)', async () => {
    mockCall.mockResolvedValue({
      prediction: {
        predictedDate: null,
        daysUntilCleanup: null,
        confidence: 0.0,
        currentJunkBytes: 0,
        accumulationRateBytesPerDay: 0,
        recommendedAction: 'Collecting data — need more samples for prediction',
      },
      config: {
        enabled: true,
        thresholdGB: 5.0,
        sampleIntervalMinutes: 60,
        maxSamples: 168,
        notificationThresholdHours: 24,
      },
      sampleCount: 0,
      lastSampleAt: null,
      supported: true,
    });

    const result = await predictiveService.getStatus();
    expect(result.prediction.predictedDate).toBeNull();
    expect(result.sampleCount).toBe(0);
  });

  it('handles cleanup needed now', async () => {
    mockCall.mockResolvedValue({
      success: true,
      sample: {
        timestamp: '2024-06-01T12:00:00',
        junkBytes: 6000000000,
        tempBytes: 5500000000,
        cacheBytes: 500000000,
        totalBytes: 6000000000,
      },
      prediction: {
        predictedDate: '2024-06-01T12:00:00',
        daysUntilCleanup: 0,
        confidence: 0.92,
        currentJunkBytes: 6000000000,
        accumulationRateBytesPerDay: 200000000,
        recommendedAction: 'Cleanup recommended now — junk threshold exceeded',
      },
      sampleCount: 50,
    });

    const result = await predictiveService.sample();
    expect(result.prediction.daysUntilCleanup).toBe(0);
    expect(result.prediction.recommendedAction).toContain('now');
  });

  it('handles no accumulation (junk not growing)', async () => {
    mockCall.mockResolvedValue({
      prediction: {
        predictedDate: null,
        daysUntilCleanup: null,
        confidence: 0.95,
        currentJunkBytes: 1000000000,
        accumulationRateBytesPerDay: 0,
        recommendedAction: 'No cleanup needed — junk is not accumulating',
      },
      config: {
        enabled: true,
        thresholdGB: 5.0,
        sampleIntervalMinutes: 60,
        maxSamples: 168,
        notificationThresholdHours: 24,
      },
      sampleCount: 30,
      lastSampleAt: '2024-06-01T12:00:00',
      supported: true,
    });

    const result = await predictiveService.getStatus();
    expect(result.prediction.accumulationRateBytesPerDay).toBe(0);
    expect(result.prediction.recommendedAction).toContain('not accumulating');
  });
});
