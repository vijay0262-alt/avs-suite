/**
 * Tests for the Context Menu Manager service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    CONTEXT_MENU_LIST: 'context_menu.list',
    CONTEXT_MENU_SUMMARY: 'context_menu.summary',
    CONTEXT_MENU_DISABLE: 'context_menu.disable',
    CONTEXT_MENU_ENABLE: 'context_menu.enable',
    CONTEXT_MENU_REMOVE: 'context_menu.remove',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { contextMenuService } from '../contextMenu.service';

describe('contextMenuService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('lists context menu entries', async () => {
    mockCall.mockResolvedValue({
      entries: [
        {
          id: 'HKCR\\*\\shell\\OpenWithMyApp',
          name: 'Open with My App',
          subkey: 'OpenWithMyApp',
          context: 'All Files',
          command: '"C:\\Program Files\\MyApp\\app.exe" "%1"',
          icon: 'C:\\Program Files\\MyApp\\app.exe,0',
          enabled: true,
          regPath: '*\\shell\\OpenWithMyApp',
          hive: 'HKCR',
          hasCommand: true,
        },
        {
          id: 'HKCR\\Directory\\shell\\CmdHere',
          name: 'Open Command Window Here',
          subkey: 'CmdHere',
          context: 'Directories',
          command: 'cmd.exe /k cd "%1"',
          icon: '',
          enabled: false,
          regPath: 'Directory\\shell\\CmdHere',
          hive: 'HKCR',
          hasCommand: true,
        },
      ],
      count: 2,
      enabledCount: 1,
      disabledCount: 1,
      byContext: { 'All Files': 1, Directories: 1 },
      supported: true,
      capturedAt: '2024-06-01T12:00:00',
    });

    const result = await contextMenuService.list();
    expect(result.count).toBe(2);
    expect(result.enabledCount).toBe(1);
    expect(result.entries[0].name).toBe('Open with My App');
    expect(result.entries[1].enabled).toBe(false);
  });

  it('gets summary', async () => {
    mockCall.mockResolvedValue({
      count: 15,
      enabledCount: 12,
      disabledCount: 3,
      byContext: { 'All Files': 5, Directories: 4, 'Desktop / Folder Background': 3, Drives: 3 },
      supported: true,
      capturedAt: '2024-06-01T12:00:00',
    });

    const result = await contextMenuService.getSummary();
    expect(result.count).toBe(15);
    expect(result.enabledCount).toBe(12);
  });

  it('disables an entry', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Disabled context menu entry: *\\shell\\OpenWithMyApp',
    });

    const result = await contextMenuService.disable('HKCR', '*\\shell\\OpenWithMyApp');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('context_menu.disable', {
      hive: 'HKCR',
      regPath: '*\\shell\\OpenWithMyApp',
    });
  });

  it('enables an entry', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Enabled context menu entry: Directory\\shell\\CmdHere',
    });

    const result = await contextMenuService.enable('HKCR', 'Directory\\shell\\CmdHere');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('context_menu.enable', {
      hive: 'HKCR',
      regPath: 'Directory\\shell\\CmdHere',
    });
  });

  it('removes an entry', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Removed context menu entry: *\\shell\\UnwantedApp',
    });

    const result = await contextMenuService.remove('HKCR', '*\\shell\\UnwantedApp');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('context_menu.remove', {
      hive: 'HKCR',
      regPath: '*\\shell\\UnwantedApp',
    });
  });

  it('handles disable failure', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Failed to disable entry: access denied',
    });

    const result = await contextMenuService.disable('HKCU', 'Software\\Classes\\*\\shell\\Test');
    expect(result.success).toBe(false);
  });

  it('handles empty entry list', async () => {
    mockCall.mockResolvedValue({
      entries: [],
      count: 0,
      enabledCount: 0,
      disabledCount: 0,
      byContext: {},
      supported: true,
      capturedAt: '2024-06-01T12:00:00',
    });

    const result = await contextMenuService.list();
    expect(result.count).toBe(0);
    expect(result.entries).toHaveLength(0);
  });
});
