/**
 * Smart Notifications service — wraps backend smart_notifications.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface SmartNotifAction {
  label: string;
  rpcMethod: string;
  params: Record<string, unknown>;
}

export interface SmartNotification {
  id: string;
  category: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  title: string;
  message: string;
  action: SmartNotifAction | null;
  context: Record<string, unknown>;
  timestamp: string;
  dismissed: boolean;
  acted: boolean;
}

export interface SmartNotifConfig {
  enabled: boolean;
  maxNotifications: number;
  rateLimitMinutes: number;
  categories: {
    performance: boolean;
    security: boolean;
    maintenance: boolean;
    optimization: boolean;
    predictive: boolean;
  };
}

export interface SmartNotifListResponse {
  notifications: SmartNotification[];
  count: number;
  totalActive: number;
  lastGenerationAt: string | null;
}

export interface SmartNotifGenerateResult {
  success: boolean;
  generated: number;
  notifications: SmartNotification[];
  totalActive: number;
}

export interface SmartNotifStats {
  total: number;
  active: number;
  dismissed: number;
  acted: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  totalGenerated: number;
  totalDismissed: number;
  totalActed: number;
  lastGenerationAt: string | null;
}

export interface SmartNotifConfigResult {
  success: boolean;
  config: SmartNotifConfig;
  message: string;
}

export interface SmartNotifActionResult {
  success: boolean;
  message: string;
  action: SmartNotifAction;
  rpcMethod: string;
  params: Record<string, unknown>;
}

export const smartNotificationsService = {
  async generate(): Promise<SmartNotifGenerateResult> {
    return client().call(RPC_METHODS.SMART_NOTIF_GENERATE);
  },

  async list(params?: { limit?: number; dismissed?: boolean; category?: string }): Promise<SmartNotifListResponse> {
    return client().call(RPC_METHODS.SMART_NOTIF_LIST, params);
  },

  async dismiss(id: string): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.SMART_NOTIF_DISMISS, { id });
  },

  async action(id: string): Promise<SmartNotifActionResult> {
    return client().call(RPC_METHODS.SMART_NOTIF_ACTION, { id });
  },

  async clearAll(): Promise<{ success: boolean; message: string }> {
    return client().call(RPC_METHODS.SMART_NOTIF_CLEAR_ALL);
  },

  async getStats(): Promise<SmartNotifStats> {
    return client().call(RPC_METHODS.SMART_NOTIF_STATS);
  },

  async configure(config: Partial<SmartNotifConfig>): Promise<SmartNotifConfigResult> {
    return client().call(RPC_METHODS.SMART_NOTIF_CONFIGURE, config);
  },
};
