/**
 * Tests for the Browser Extensions service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    BROWSER_EXT_LIST: 'browser_ext.list',
    BROWSER_EXT_SUMMARY: 'browser_ext.summary',
    BROWSER_EXT_REMOVE: 'browser_ext.remove',
    BROWSER_EXT_DISABLE: 'browser_ext.disable',
    BROWSER_EXT_ENABLE: 'browser_ext.enable',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { browserExtensionsService } from '../browserExtensions.service';

describe('browserExtensionsService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('lists extensions', async () => {
    mockCall.mockResolvedValue({
      extensions: [
        {
          browser: 'Chrome',
          extensionId: 'abcdef123456',
          version: '1.0.0',
          name: 'AdBlock Plus',
          description: 'Blocks ads',
          permissions: ['tabs', 'http://*/*'],
          hostPermissions: [],
          manifestVersion: 2,
          path: 'C:\\Extensions\\abcdef123456\\1.0.0',
          enabled: true,
          canDisable: true,
          canRemove: true,
        },
        {
          browser: 'Firefox',
          extensionId: 'uBlock0@raymondhill.net',
          version: '1.45.0',
          name: 'uBlock Origin',
          description: 'Efficient blocker',
          permissions: ['webRequest', 'tabs'],
          hostPermissions: [],
          manifestVersion: 2,
          path: '/path/to/ublock',
          enabled: false,
          canDisable: true,
          canRemove: true,
        },
      ],
      count: 2,
      byBrowser: { Chrome: 1, Firefox: 1 },
      supported: true,
      capturedAt: '2024-06-01T12:00:00',
    });

    const result = await browserExtensionsService.list();
    expect(result.count).toBe(2);
    expect(result.byBrowser.Chrome).toBe(1);
    expect(result.extensions[0].name).toBe('AdBlock Plus');
    expect(result.extensions[1].enabled).toBe(false);
  });

  it('gets summary', async () => {
    mockCall.mockResolvedValue({
      count: 10,
      enabledCount: 8,
      disabledCount: 2,
      byBrowser: { Chrome: 5, Edge: 3, Firefox: 2 },
      supported: true,
      capturedAt: '2024-06-01T12:00:00',
    });

    const result = await browserExtensionsService.getSummary();
    expect(result.count).toBe(10);
    expect(result.enabledCount).toBe(8);
    expect(result.disabledCount).toBe(2);
  });

  it('removes an extension', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Removed extension abc123 from Chrome',
    });

    const result = await browserExtensionsService.remove('Chrome', 'abc123');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('browser_ext.remove', { browser: 'Chrome', extensionId: 'abc123' });
  });

  it('disables an extension', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Firefox extension uBlock0 disabled',
    });

    const result = await browserExtensionsService.disable('Firefox', 'uBlock0@raymondhill.net');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('browser_ext.disable', {
      browser: 'Firefox',
      extensionId: 'uBlock0@raymondhill.net',
    });
  });

  it('enables an extension', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Firefox extension uBlock0 enabled',
    });

    const result = await browserExtensionsService.enable('Firefox', 'uBlock0@raymondhill.net');
    expect(result.success).toBe(true);
  });

  it('handles remove failure', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Extension not found',
    });

    const result = await browserExtensionsService.remove('Chrome', 'nonexistent');
    expect(result.success).toBe(false);
  });

  it('handles empty extension list', async () => {
    mockCall.mockResolvedValue({
      extensions: [],
      count: 0,
      byBrowser: {},
      supported: true,
      capturedAt: '2024-06-01T12:00:00',
    });

    const result = await browserExtensionsService.list();
    expect(result.count).toBe(0);
    expect(result.extensions).toHaveLength(0);
  });
});
