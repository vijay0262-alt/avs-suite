/**
 * Tests for the Quarantine service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    QUARANTINE_LIST: 'quarantine.list',
    QUARANTINE_SUMMARY: 'quarantine.summary',
    QUARANTINE_ADD: 'quarantine.add',
    QUARANTINE_RESTORE: 'quarantine.restore',
    QUARANTINE_DELETE: 'quarantine.delete',
    QUARANTINE_CLEAR: 'quarantine.clear',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { quarantineService } from '../quarantine.service';

describe('quarantineService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('lists quarantined items', async () => {
    mockCall.mockResolvedValue({
      items: [
        {
          id: 'item-1',
          originalPath: 'C:\\Users\\test\\Downloads\\suspicious.exe',
          threatName: 'Trojan.Generic',
          threatType: 'trojan',
          source: 'defender',
          fileSize: 1024000,
          fileHash: 'abc123def456',
          quarantinedAt: '2024-06-01T12:00:00',
          quarantinedPath: 'C:\\Users\\test\\.avs\\quarantine\\items\\item-1.quarantined',
        },
        {
          id: 'item-2',
          originalPath: 'C:\\Users\\test\\AppData\\adware.dll',
          threatName: 'Adware.BrowserHijacker',
          threatType: 'adware',
          source: 'heuristic',
          fileSize: 512000,
          fileHash: 'def789ghi012',
          quarantinedAt: '2024-06-02T12:00:00',
          quarantinedPath: 'C:\\Users\\test\\.avs\\quarantine\\items\\item-2.quarantined',
        },
      ],
      count: 2,
      totalSize: 1536000,
      supported: true,
      vaultPath: 'C:\\Users\\test\\.avs\\quarantine',
    });

    const result = await quarantineService.list();
    expect(result.count).toBe(2);
    expect(result.totalSize).toBe(1536000);
    expect(result.items[0].threatName).toBe('Trojan.Generic');
    expect(result.items[1].threatType).toBe('adware');
  });

  it('gets summary', async () => {
    mockCall.mockResolvedValue({
      count: 5,
      totalSize: 5000000,
      byType: { trojan: 2, adware: 2, pup: 1 },
      supported: true,
    });

    const result = await quarantineService.getSummary();
    expect(result.count).toBe(5);
    expect(result.byType.trojan).toBe(2);
  });

  it('adds a file to quarantine', async () => {
    mockCall.mockResolvedValue({
      success: true,
      item: {
        id: 'item-3',
        originalPath: 'C:\\temp\\malware.exe',
        threatName: 'Malware.Test',
        threatType: 'malware',
        source: 'manual',
        fileSize: 2048,
        fileHash: 'hash123',
        quarantinedAt: '2024-06-01T12:00:00',
        quarantinedPath: 'C:\\Users\\.avs\\quarantine\\items\\item-3.quarantined',
      },
    });

    const result = await quarantineService.add('C:\\temp\\malware.exe', 'Malware.Test', 'malware', 'manual');
    expect(result.success).toBe(true);
    expect(result.item?.threatName).toBe('Malware.Test');
    expect(mockCall).toHaveBeenCalledWith('quarantine.add', {
      filePath: 'C:\\temp\\malware.exe',
      threatName: 'Malware.Test',
      threatType: 'malware',
      source: 'manual',
    });
  });

  it('restores a quarantined item', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Restored to C:\\temp\\file.exe',
    });

    const result = await quarantineService.restore('item-1');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('quarantine.restore', { itemId: 'item-1' });
  });

  it('deletes a quarantined item', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Permanently deleted item item-1',
    });

    const result = await quarantineService.delete('item-1');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('quarantine.delete', { itemId: 'item-1' });
  });

  it('clears all quarantined items', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Cleared 5 item(s)',
      deletedCount: 5,
      failedCount: 0,
    });

    const result = await quarantineService.clear();
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(5);
  });

  it('handles empty quarantine', async () => {
    mockCall.mockResolvedValue({
      items: [],
      count: 0,
      totalSize: 0,
      supported: true,
      vaultPath: 'C:\\Users\\.avs\\quarantine',
    });

    const result = await quarantineService.list();
    expect(result.count).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('handles restore failure', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Quarantined file is missing from vault',
    });

    const result = await quarantineService.restore('nonexistent');
    expect(result.success).toBe(false);
  });

  it('handles clear with failures', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Cleared 3 item(s), 1 failed',
      deletedCount: 3,
      failedCount: 1,
    });

    const result = await quarantineService.clear();
    expect(result.success).toBe(false);
    expect(result.failedCount).toBe(1);
  });
});
