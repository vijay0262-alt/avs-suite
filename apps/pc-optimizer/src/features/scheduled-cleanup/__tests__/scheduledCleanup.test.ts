/**
 * Tests for the scheduled cleanup service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the RPC bridge before importing the service
const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));
vi.mock('../../../services/rpc', () => ({
  rpc: {
    raw: mockCall,
  },
}));

// Mock @avs/shared/rpc with all the methods the service needs
vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    SCHEDULER_LIST: 'scheduler.list',
    SCHEDULER_CREATE: 'scheduler.create',
    SCHEDULER_UPDATE: 'scheduler.update',
    SCHEDULER_DELETE: 'scheduler.delete',
    SCHEDULER_RUN_NOW: 'scheduler.runNow',
    SCHEDULER_STATUS: 'scheduler.status',
    SCHEDULER_CONFIGURE: 'scheduler.configureFromSettings',
    JUNK_MONITOR_STATUS: 'junk_monitor.status',
    JUNK_MONITOR_SCAN: 'junk_monitor.scanNow',
    JUNK_MONITOR_HISTORY: 'junk_monitor.history',
    SETTINGS_GET: 'settings.get',
    SETTINGS_UPDATE: 'settings.update',
    SETTINGS_RESET: 'settings.reset',
  },
}));

import { scheduledCleanupService } from '../scheduledCleanup.service';

describe('scheduledCleanupService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('lists scheduled tasks', async () => {
    mockCall.mockResolvedValue({ tasks: [], count: 0 });
    const result = await scheduledCleanupService.listTasks();
    expect(result).toEqual({ tasks: [], count: 0 });
    expect(mockCall).toHaveBeenCalledWith('scheduler.list');
  });

  it('creates a task', async () => {
    mockCall.mockResolvedValue({ created: true });
    const result = await scheduledCleanupService.createTask({
      action: 'junk_clean',
      schedule: 'daily',
      time: '03:00',
    });
    expect(result).toEqual({ created: true });
    expect(mockCall).toHaveBeenCalledWith('scheduler.create', {
      action: 'junk_clean',
      schedule: 'daily',
      time: '03:00',
    });
  });

  it('deletes a task', async () => {
    mockCall.mockResolvedValue({ deleted: true });
    const result = await scheduledCleanupService.deleteTask('junk_clean');
    expect(result).toEqual({ deleted: true });
    expect(mockCall).toHaveBeenCalledWith('scheduler.delete', { action: 'junk_clean' });
  });

  it('runs a task now', async () => {
    mockCall.mockResolvedValue({ ran: true });
    const result = await scheduledCleanupService.runNow('junk_clean');
    expect(result).toEqual({ ran: true });
  });

  it('configures from settings', async () => {
    mockCall.mockResolvedValue({ configured: true, enabled: true });
    const result = await scheduledCleanupService.configureFromSettings();
    expect(result).toEqual({ configured: true, enabled: true });
  });

  it('gets junk status', async () => {
    const mockStatus = {
      total_bytes: 1048576,
      total_files: 100,
      total_mb: 1.0,
      total_gb: 0.0,
      categories: [],
      scanned_at: '2024-01-01T00:00:00Z',
      threshold_bytes: 2147483648,
      threshold_exceeded: false,
    };
    mockCall.mockResolvedValue(mockStatus);
    const result = await scheduledCleanupService.getJunkStatus();
    expect(result.total_bytes).toBe(1048576);
    expect(result.total_files).toBe(100);
  });

  it('scans junk now', async () => {
    mockCall.mockResolvedValue({
      total_bytes: 0,
      total_files: 0,
      total_mb: 0,
      total_gb: 0,
      categories: [],
      scanned_at: '2024-01-01T00:00:00Z',
      threshold_bytes: 2147483648,
      threshold_exceeded: false,
    });
    const result = await scheduledCleanupService.scanJunkNow();
    expect(result.total_bytes).toBe(0);
  });
});
