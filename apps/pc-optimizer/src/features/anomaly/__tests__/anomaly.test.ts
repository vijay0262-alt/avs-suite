/**
 * Tests for the Anomaly Detection service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    ANOMALY_SCAN: 'anomaly.scan',
    ANOMALY_STATUS: 'anomaly.status',
    ANOMALY_LIST: 'anomaly.listAnomalies',
    ANOMALY_DISMISS: 'anomaly.dismiss',
    ANOMALY_CLEAR_ALL: 'anomaly.clearAll',
    ANOMALY_HISTORY: 'anomaly.history',
    ANOMALY_CONFIGURE: 'anomaly.configure',
    ANOMALY_GET_BASELINE: 'anomaly.getBaseline',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { anomalyService } from '../anomaly.service';

describe('anomalyService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('scans for anomalies', async () => {
    mockCall.mockResolvedValue({
      success: true,
      anomalies: [
        {
          id: 'anomaly_1234_1700000000',
          pid: 1234,
          name: 'xk7m2f.exe',
          exe: 'C:\\Users\\test\\AppData\\Local\\Temp\\xk7m2f.exe',
          score: 65,
          severity: 'high',
          indicators: ['Name appears to be randomly generated', 'Running from suspicious location (temp)'],
          cpuPercent: 75.5,
          memoryMB: 850.0,
          childCount: 0,
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
        },
        {
          id: 'anomaly_5678_1700000000',
          pid: 5678,
          name: 'svch0st.exe',
          exe: 'C:\\Windows\\Temp\\svch0st.exe',
          score: 50,
          severity: 'high',
          indicators: ["Name mimics system process 'svchost.exe' (typosquatting)", 'Running from suspicious location (temp)'],
          cpuPercent: 45.0,
          memoryMB: 120.0,
          childCount: 5,
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
        },
      ],
      count: 2,
      scannedProcesses: 150,
      supported: true,
    });

    const result = await anomalyService.scan();
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(result.scannedProcesses).toBe(150);
    expect(result.anomalies[0].name).toBe('xk7m2f.exe');
    expect(result.anomalies[0].severity).toBe('high');
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      enabled: true,
      sensitivity: 'normal',
      config: {
        enabled: true,
        sensitivity: 'normal',
        maxAnomalies: 100,
        minScoreToReport: 30,
        baselineDays: 7,
      },
      stats: {
        totalScans: 15,
        totalAnomalies: 8,
        totalDismissed: 3,
        activeCount: 5,
        bySeverity: { critical: 1, high: 2, normal: 1, low: 1 },
      },
      supported: true,
    });

    const result = await anomalyService.getStatus();
    expect(result.enabled).toBe(true);
    expect(result.stats.activeCount).toBe(5);
    expect(result.stats.bySeverity.critical).toBe(1);
  });

  it('lists anomalies', async () => {
    mockCall.mockResolvedValue({
      anomalies: [
        {
          id: 'anomaly_1234_1700000000',
          pid: 1234,
          name: 'suspicious.exe',
          exe: 'C:\\Temp\\suspicious.exe',
          score: 45,
          severity: 'normal',
          indicators: ['Running from suspicious location'],
          cpuPercent: 30.0,
          memoryMB: 200.0,
          childCount: 0,
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
        },
      ],
      count: 1,
      totalActive: 1,
    });

    const result = await anomalyService.listAnomalies({ limit: 50 });
    expect(result.count).toBe(1);
    expect(result.anomalies[0].name).toBe('suspicious.exe');
  });

  it('dismisses an anomaly', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Anomaly dismissed',
    });

    const result = await anomalyService.dismiss('anomaly_1234_1700000000');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('anomaly.dismiss', { id: 'anomaly_1234_1700000000' });
  });

  it('clears all anomalies', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'All anomalies cleared',
    });

    const result = await anomalyService.clearAll();
    expect(result.success).toBe(true);
  });

  it('gets history', async () => {
    mockCall.mockResolvedValue({
      anomalies: [
        {
          id: 'anomaly_1234_1700000000',
          pid: 1234,
          name: 'old.exe',
          exe: 'C:\\Temp\\old.exe',
          score: 40,
          severity: 'normal',
          indicators: ['Old anomaly'],
          cpuPercent: 20.0,
          memoryMB: 100.0,
          childCount: 0,
          timestamp: '2024-05-01T12:00:00',
          dismissed: true,
        },
      ],
      count: 1,
      supported: true,
    });

    const result = await anomalyService.getHistory(20);
    expect(result.count).toBe(1);
    expect(result.anomalies[0].dismissed).toBe(true);
  });

  it('configures anomaly detection', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        sensitivity: 'high',
        maxAnomalies: 100,
        minScoreToReport: 20,
        baselineDays: 7,
      },
      message: 'Anomaly detection configuration updated',
    });

    const result = await anomalyService.configure({ sensitivity: 'high' });
    expect(result.success).toBe(true);
    expect(result.config.sensitivity).toBe('high');
  });

  it('gets baseline', async () => {
    mockCall.mockResolvedValue({
      baseline: {
        'chrome.exe': { avgCpu: 5.2, avgMem: 850, firstSeen: '2024-05-01T00:00:00' },
        'explorer.exe': { avgCpu: 1.0, avgMem: 120, firstSeen: '2024-05-01T00:00:00' },
      },
      hasBaseline: true,
      baselineDays: 7,
      supported: true,
    });

    const result = await anomalyService.getBaseline();
    expect(result.hasBaseline).toBe(true);
    expect(result.baselineDays).toBe(7);
  });

  it('handles scan with no anomalies', async () => {
    mockCall.mockResolvedValue({
      success: true,
      anomalies: [],
      count: 0,
      scannedProcesses: 150,
      supported: true,
    });

    const result = await anomalyService.scan();
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.anomalies).toHaveLength(0);
  });

  it('handles empty anomaly list', async () => {
    mockCall.mockResolvedValue({
      anomalies: [],
      count: 0,
      totalActive: 0,
    });

    const result = await anomalyService.listAnomalies();
    expect(result.count).toBe(0);
    expect(result.totalActive).toBe(0);
  });

  it('handles dismiss of non-existent anomaly', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Anomaly not found',
    });

    const result = await anomalyService.dismiss('nonexistent');
    expect(result.success).toBe(false);
  });

  it('handles scan on unsupported platform', async () => {
    mockCall.mockResolvedValue({
      success: false,
      anomalies: [],
      count: 0,
      supported: false,
    });

    const result = await anomalyService.scan();
    expect(result.success).toBe(false);
    expect(result.supported).toBe(false);
  });
});
