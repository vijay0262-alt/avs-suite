/**
 * Tests for the PUP Scanner service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    PUP_SCAN: 'pup.scan',
    PUP_SUMMARY: 'pup.summary',
    PUP_IGNORE: 'pup.ignore',
    PUP_UNIGNORE: 'pup.unignore',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { pupScannerService } from '../pupScanner.service';

describe('pupScannerService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('scans for PUPs', async () => {
    mockCall.mockResolvedValue({
      pups: [
        {
          name: 'PC Optimizer Pro',
          publisher: 'IObit',
          version: '1.0',
          installLocation: 'C:\\Program Files\\PC Optimizer Pro',
          installDate: '20240101',
          uninstallString: 'C:\\Program Files\\PC Optimizer Pro\\uninstall.exe',
          pupType: 'optimizer_scam',
          severity: 'medium',
          confidence: 0.75,
          indicators: [
            { type: 'optimizer_scam', description: 'Program name matches known optimizer_scam pattern' },
            { type: 'known_pup_publisher', description: 'Publisher is a known PUP publisher' },
          ],
          indicatorCount: 2,
          isStrong: false,
        },
      ],
      totalPrograms: 150,
      pupCount: 1,
      supported: true,
      scannedAt: '2024-06-01T12:00:00',
      summary: {
        byType: { optimizer_scam: 1 },
        bySeverity: { medium: 1 },
        strongIndicators: 0,
      },
    });

    const result = await pupScannerService.scan();
    expect(result.pupCount).toBe(1);
    expect(result.totalPrograms).toBe(150);
    expect(result.pups[0].pupType).toBe('optimizer_scam');
    expect(result.pups[0].severity).toBe('medium');
  });

  it('gets PUP summary', async () => {
    mockCall.mockResolvedValue({
      pupCount: 3,
      totalPrograms: 150,
      supported: true,
      summary: {
        byType: { optimizer_scam: 2, browser_hijacker: 1 },
        bySeverity: { medium: 2, low: 1 },
        strongIndicators: 0,
      },
      scannedAt: '2024-06-01T12:00:00',
    });

    const result = await pupScannerService.getSummary();
    expect(result.pupCount).toBe(3);
    expect(result.summary.byType.optimizer_scam).toBe(2);
  });

  it('ignores a PUP', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "'PC Optimizer Pro' added to ignore list",
    });

    const result = await pupScannerService.ignore('PC Optimizer Pro');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('pup.ignore', { name: 'PC Optimizer Pro' });
  });

  it('unignores a PUP', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "'PC Optimizer Pro' removed from ignore list",
    });

    const result = await pupScannerService.unignore('PC Optimizer Pro');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('pup.unignore', { name: 'PC Optimizer Pro' });
  });

  it('handles scan with no PUPs', async () => {
    mockCall.mockResolvedValue({
      pups: [],
      totalPrograms: 100,
      pupCount: 0,
      supported: true,
      scannedAt: '2024-06-01T12:00:00',
      summary: {
        byType: {},
        bySeverity: {},
        strongIndicators: 0,
      },
    });

    const result = await pupScannerService.scan();
    expect(result.pupCount).toBe(0);
    expect(result.pups).toHaveLength(0);
  });

  it('handles scan with strong indicators (fake antivirus)', async () => {
    mockCall.mockResolvedValue({
      pups: [
        {
          name: 'Total Security 2010',
          publisher: 'Unknown',
          version: '1.0',
          installLocation: '',
          installDate: '',
          uninstallString: '',
          pupType: 'fake_antivirus',
          severity: 'high',
          confidence: 0.85,
          indicators: [
            { type: 'fake_antivirus', description: 'Program name matches known fake_antivirus pattern' },
          ],
          indicatorCount: 1,
          isStrong: true,
        },
      ],
      totalPrograms: 100,
      pupCount: 1,
      supported: true,
      scannedAt: '2024-06-01T12:00:00',
      summary: {
        byType: { fake_antivirus: 1 },
        bySeverity: { high: 1 },
        strongIndicators: 1,
      },
    });

    const result = await pupScannerService.scan();
    expect(result.pups[0].isStrong).toBe(true);
    expect(result.pups[0].severity).toBe('high');
    expect(result.summary.strongIndicators).toBe(1);
  });
});
