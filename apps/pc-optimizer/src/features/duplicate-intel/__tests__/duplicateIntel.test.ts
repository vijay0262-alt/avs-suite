/**
 * Tests for the Duplicate Intelligence service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    DUP_INTEL_SCAN: 'duplicate_intel.scan',
    DUP_INTEL_STATUS: 'duplicate_intel.status',
    DUP_INTEL_LIST_GROUPS: 'duplicate_intel.listGroups',
    DUP_INTEL_DISMISS_GROUP: 'duplicate_intel.dismissGroup',
    DUP_INTEL_DELETE_FILE: 'duplicate_intel.deleteFile',
    DUP_INTEL_DELETE_RECOMMENDED: 'duplicate_intel.deleteRecommended',
    DUP_INTEL_CLEAR_ALL: 'duplicate_intel.clearAll',
    DUP_INTEL_CONFIGURE: 'duplicate_intel.configure',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { duplicateIntelService } from '../duplicateIntel.service';

describe('duplicateIntelService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('scans for duplicates', async () => {
    mockCall.mockResolvedValue({
      success: true,
      groups: [
        {
          id: 'dup_abc123def456',
          hash: 'abc123def456789',
          fileType: 'jpg',
          fileCount: 3,
          fileSize: 2500000,
          wastedBytes: 5000000,
          keepFile: {
            path: 'C:\\Users\\test\\Pictures\\photo.jpg',
            name: 'photo.jpg',
            score: 4,
            reasons: ['Located in Pictures', 'Descriptive name', 'Less than 1 year old'],
          },
          deleteFiles: [
            {
              path: 'C:\\Users\\test\\Downloads\\photo (1).jpg',
              name: 'photo (1).jpg',
              score: 12,
              reasons: ['Located in Downloads', "Name contains '(1)' (likely a copy)", 'Less than 1 year old'],
            },
            {
              path: 'C:\\Users\\test\\AppData\\Local\\Temp\\photo.jpg',
              name: 'photo.jpg',
              score: 15,
              reasons: ['Located in AppData', 'Descriptive name', 'Less than 1 year old'],
            },
          ],
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
        },
      ],
      count: 1,
      totalFilesScanned: 500,
      totalDuplicateBytes: 7500000,
      totalWastedBytes: 5000000,
      message: 'Found 1 duplicate group(s) across 500 files',
    });

    const result = await duplicateIntelService.scan();
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.groups[0].keepFile.name).toBe('photo.jpg');
    expect(result.groups[0].deleteFiles).toHaveLength(2);
  });

  it('gets status', async () => {
    mockCall.mockResolvedValue({
      enabled: true,
      config: {
        enabled: true,
        minFileSizeKB: 1,
        maxFileSizeMB: 500,
        scanPaths: [],
        excludePaths: ['\\AppData\\', '\\Windows\\'],
        hashAlgorithm: 'md5',
        maxGroups: 500,
      },
      stats: {
        totalScans: 5,
        totalGroups: 12,
        totalFilesDeleted: 8,
        totalBytesFreed: 25000000,
        activeGroups: 4,
        totalWastedBytes: 15000000,
        byFileType: { jpg: 2, pdf: 1, docx: 1 },
      },
      supported: true,
    });

    const result = await duplicateIntelService.getStatus();
    expect(result.enabled).toBe(true);
    expect(result.stats.activeGroups).toBe(4);
    expect(result.stats.byFileType.jpg).toBe(2);
  });

  it('lists groups', async () => {
    mockCall.mockResolvedValue({
      groups: [
        {
          id: 'dup_abc123',
          hash: 'abc123',
          fileType: 'pdf',
          fileCount: 2,
          fileSize: 500000,
          wastedBytes: 500000,
          keepFile: { path: 'C:\\Docs\\file.pdf', name: 'file.pdf', score: 3, reasons: ['Located in Documents'] },
          deleteFiles: [{ path: 'C:\\Downloads\\file.pdf', name: 'file.pdf', score: 8, reasons: ['Located in Downloads'] }],
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
        },
      ],
      count: 1,
      totalActive: 1,
    });

    const result = await duplicateIntelService.listGroups({ limit: 50 });
    expect(result.count).toBe(1);
    expect(result.groups[0].fileType).toBe('pdf');
  });

  it('dismisses a group', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Group dismissed',
    });

    const result = await duplicateIntelService.dismissGroup('dup_abc123');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('duplicate_intel.dismissGroup', { id: 'dup_abc123' });
  });

  it('deletes a specific file', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: "Deleted 'photo (1).jpg'",
      bytesFreed: 2500000,
    });

    const result = await duplicateIntelService.deleteFile('C:\\Downloads\\photo (1).jpg');
    expect(result.success).toBe(true);
    expect(result.bytesFreed).toBe(2500000);
  });

  it('deletes all recommended files', async () => {
    mockCall.mockResolvedValue({
      success: true,
      deletedCount: 5,
      failedCount: 1,
      bytesFreed: 15000000,
      message: 'Deleted 5 file(s), 1 failed',
    });

    const result = await duplicateIntelService.deleteRecommended();
    expect(result.success).toBe(true);
    expect(result.deletedCount).toBe(5);
    expect(result.bytesFreed).toBe(15000000);
  });

  it('clears all results', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'All results cleared',
    });

    const result = await duplicateIntelService.clearAll();
    expect(result.success).toBe(true);
  });

  it('configures duplicate intelligence', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        minFileSizeKB: 10,
        maxFileSizeMB: 1000,
        scanPaths: ['C:\\Users\\test\\Documents'],
        excludePaths: ['\\AppData\\'],
        hashAlgorithm: 'sha256',
        maxGroups: 200,
      },
      message: 'Duplicate intelligence configuration updated',
    });

    const result = await duplicateIntelService.configure({ hashAlgorithm: 'sha256', minFileSizeKB: 10 });
    expect(result.success).toBe(true);
    expect(result.config.hashAlgorithm).toBe('sha256');
  });

  it('handles scan with no duplicates', async () => {
    mockCall.mockResolvedValue({
      success: true,
      groups: [],
      count: 0,
      totalFilesScanned: 100,
      totalDuplicateBytes: 0,
      totalWastedBytes: 0,
      message: 'Found 0 duplicate group(s) across 100 files',
    });

    const result = await duplicateIntelService.scan();
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(result.groups).toHaveLength(0);
  });

  it('handles empty group list', async () => {
    mockCall.mockResolvedValue({
      groups: [],
      count: 0,
      totalActive: 0,
    });

    const result = await duplicateIntelService.listGroups();
    expect(result.count).toBe(0);
    expect(result.totalActive).toBe(0);
  });

  it('handles delete of non-existent file', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'File not found',
    });

    const result = await duplicateIntelService.deleteFile('C:\\nonexistent.txt');
    expect(result.success).toBe(false);
  });

  it('handles dismiss of non-existent group', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Group not found',
    });

    const result = await duplicateIntelService.dismissGroup('nonexistent');
    expect(result.success).toBe(false);
  });
});
