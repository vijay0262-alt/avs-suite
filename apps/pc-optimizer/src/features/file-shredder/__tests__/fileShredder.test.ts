/**
 * Tests for the File Shredder service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    WIPER_DRIVES: 'wiper.drives',
    WIPER_SHRED: 'wiper.shred',
    WIPER_WIPE_FREE_SPACE: 'wiper.wipeFreeSpace',
  },
}));

// Mock window.avs.rpc
beforeEach(() => {
  (globalThis as any).window = {
    avs: {
      rpc: {
        call: mockCall,
      },
    },
  };
});

import { fileShredderService } from '../fileShredder.service';

describe('fileShredderService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('shreds files with DoD method', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Shredded 2 item(s)',
      method: 'dod',
      results: [
        { path: 'C:/test/file1.txt', success: true, message: 'Shredded with dod (3 pass(es))', passes: 3, bytesShredded: 1024 },
        { path: 'C:/test/file2.txt', success: true, message: 'Shredded with dod (3 pass(es))', passes: 3, bytesShredded: 2048 },
      ],
      edition: 'professional',
      totalShredded: 2,
      totalFailed: 0,
    });

    const result = await fileShredderService.shred(['C:/test/file1.txt', 'C:/test/file2.txt'], 'dod');

    expect(result.success).toBe(true);
    expect(result.totalShredded).toBe(2);
    expect(result.method).toBe('dod');
    expect(mockCall).toHaveBeenCalledWith('wiper.shred', {
      paths: ['C:/test/file1.txt', 'C:/test/file2.txt'],
      method: 'dod',
      passes: undefined,
      zeros: undefined,
    });
  });

  it('lists drives', async () => {
    mockCall.mockResolvedValue({
      drives: [
        { letter: 'C:', label: 'System', fileSystem: 'NTFS', totalBytes: 500107862016, freeBytes: 250053931008 },
      ],
    });

    const result = await fileShredderService.listDrives();
    expect(result.drives).toHaveLength(1);
    expect(result.drives[0].letter).toBe('C:');
  });

  it('wipes free space', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Wrote and removed 1000000 bytes',
      bytesProcessed: 1000000,
      drive: 'C:',
    });

    const result = await fileShredderService.wipeFreeSpace('C:');
    expect(result.success).toBe(true);
    expect(result.bytesProcessed).toBe(1000000);
  });

  it('handles free edition limit error', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Free edition limits shredding to 3 files.',
      error_code: 'EDITION_LIMIT',
      required_edition: 'professional',
      current_edition: 'free',
      file_limit: 3,
      files_requested: 10,
      results: [],
    });

    const result = await fileShredderService.shred(['f1', 'f2', 'f3', 'f4', 'f5'], 'quick');

    expect(result.success).toBe(false);
    expect(result.error_code).toBe('EDITION_LIMIT');
    expect(result.file_limit).toBe(3);
  });
});
