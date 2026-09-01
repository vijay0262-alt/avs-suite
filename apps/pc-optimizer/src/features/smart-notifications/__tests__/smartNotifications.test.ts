/**
 * Tests for the Smart Notifications service.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCall } = vi.hoisted(() => ({ mockCall: vi.fn() }));

vi.mock('@avs/shared/rpc', () => ({
  RPC_METHODS: {
    SMART_NOTIF_GENERATE: 'smart_notifications.generate',
    SMART_NOTIF_LIST: 'smart_notifications.list',
    SMART_NOTIF_DISMISS: 'smart_notifications.dismiss',
    SMART_NOTIF_ACTION: 'smart_notifications.action',
    SMART_NOTIF_CLEAR_ALL: 'smart_notifications.clearAll',
    SMART_NOTIF_STATS: 'smart_notifications.stats',
    SMART_NOTIF_CONFIGURE: 'smart_notifications.configure',
  },
}));

beforeEach(() => {
  (globalThis as Record<string, unknown>).window = {
    avs: { rpc: { call: mockCall } },
  };
});

import { smartNotificationsService } from '../smartNotifications.service';

describe('smartNotificationsService', () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it('generates notifications', async () => {
    mockCall.mockResolvedValue({
      success: true,
      generated: 3,
      notifications: [
        {
          id: 'smart_1_performance',
          category: 'performance',
          priority: 'high',
          title: 'High CPU Usage Detected',
          message: 'CPU usage is at 90%.',
          action: { label: 'View Processes', rpcMethod: 'performance.memory.getProcesses', params: {} },
          context: { cpuPercent: 90 },
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
          acted: false,
        },
        {
          id: 'smart_2_maintenance',
          category: 'maintenance',
          priority: 'high',
          title: 'Junk Files Need Cleanup',
          message: 'You have 5.2 GB of junk files.',
          action: { label: 'Clean Now', rpcMethod: 'cleaner.scan.start', params: {} },
          context: { junkBytes: 5200000000 },
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
          acted: false,
        },
      ],
      totalActive: 2,
    });

    const result = await smartNotificationsService.generate();
    expect(result.success).toBe(true);
    expect(result.generated).toBe(3);
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications[0].priority).toBe('high');
  });

  it('lists notifications', async () => {
    mockCall.mockResolvedValue({
      notifications: [
        {
          id: 'smart_1',
          category: 'security',
          priority: 'critical',
          title: 'Real-Time Protection is Off',
          message: 'Enable real-time protection.',
          action: { label: 'Enable Protection', rpcMethod: 'realtime.enable', params: {} },
          context: {},
          timestamp: '2024-06-01T12:00:00',
          dismissed: false,
          acted: false,
        },
      ],
      count: 1,
      totalActive: 1,
      lastGenerationAt: '2024-06-01T11:30:00',
    });

    const result = await smartNotificationsService.list({ limit: 20 });
    expect(result.count).toBe(1);
    expect(result.notifications[0].category).toBe('security');
    expect(result.notifications[0].priority).toBe('critical');
  });

  it('dismisses a notification', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Notification dismissed',
    });

    const result = await smartNotificationsService.dismiss('smart_1');
    expect(result.success).toBe(true);
    expect(mockCall).toHaveBeenCalledWith('smart_notifications.dismiss', { id: 'smart_1' });
  });

  it('executes an action', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'Action triggered',
      action: { label: 'Clean Now', rpcMethod: 'cleaner.scan.start', params: {} },
      rpcMethod: 'cleaner.scan.start',
      params: {},
    });

    const result = await smartNotificationsService.action('smart_2');
    expect(result.success).toBe(true);
    expect(result.action.label).toBe('Clean Now');
    expect(result.rpcMethod).toBe('cleaner.scan.start');
  });

  it('clears all notifications', async () => {
    mockCall.mockResolvedValue({
      success: true,
      message: 'All notifications cleared',
    });

    const result = await smartNotificationsService.clearAll();
    expect(result.success).toBe(true);
  });

  it('gets stats', async () => {
    mockCall.mockResolvedValue({
      total: 10,
      active: 5,
      dismissed: 4,
      acted: 1,
      byCategory: { performance: 4, security: 2, maintenance: 3, optimization: 1 },
      byPriority: { critical: 1, high: 4, normal: 4, low: 1 },
      totalGenerated: 25,
      totalDismissed: 20,
      totalActed: 5,
      lastGenerationAt: '2024-06-01T12:00:00',
    });

    const result = await smartNotificationsService.getStats();
    expect(result.total).toBe(10);
    expect(result.active).toBe(5);
    expect(result.byCategory.performance).toBe(4);
    expect(result.byPriority.critical).toBe(1);
  });

  it('configures smart notifications', async () => {
    mockCall.mockResolvedValue({
      success: true,
      config: {
        enabled: true,
        maxNotifications: 50,
        rateLimitMinutes: 30,
        categories: {
          performance: true,
          security: true,
          maintenance: false,
          optimization: true,
          predictive: true,
        },
      },
      message: 'Smart notification configuration updated',
    });

    const result = await smartNotificationsService.configure({ categories: { maintenance: false } });
    expect(result.success).toBe(true);
    expect(result.config.categories.maintenance).toBe(false);
  });

  it('handles empty notification list', async () => {
    mockCall.mockResolvedValue({
      notifications: [],
      count: 0,
      totalActive: 0,
      lastGenerationAt: null,
    });

    const result = await smartNotificationsService.list();
    expect(result.count).toBe(0);
    expect(result.notifications).toHaveLength(0);
  });

  it('handles generate with no issues found', async () => {
    mockCall.mockResolvedValue({
      success: true,
      generated: 0,
      notifications: [],
      totalActive: 0,
    });

    const result = await smartNotificationsService.generate();
    expect(result.success).toBe(true);
    expect(result.generated).toBe(0);
  });

  it('handles dismiss of non-existent notification', async () => {
    mockCall.mockResolvedValue({
      success: false,
      message: 'Notification not found',
    });

    const result = await smartNotificationsService.dismiss('nonexistent');
    expect(result.success).toBe(false);
  });
});
