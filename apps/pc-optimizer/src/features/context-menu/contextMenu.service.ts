/**
 * Context Menu Manager service — wraps backend context_menu.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ContextMenuEntry {
  id: string;
  name: string;
  subkey: string;
  context: string;
  command: string;
  icon: string;
  enabled: boolean;
  regPath: string;
  hive: string;
  hasCommand: boolean;
}

export interface ContextMenuListResponse {
  entries: ContextMenuEntry[];
  count: number;
  enabledCount: number;
  disabledCount: number;
  byContext: Record<string, number>;
  supported: boolean;
  capturedAt: string;
}

export interface ContextMenuSummaryResponse {
  count: number;
  enabledCount: number;
  disabledCount: number;
  byContext: Record<string, number>;
  supported: boolean;
  capturedAt: string;
}

export interface ContextMenuActionResult {
  success: boolean;
  message: string;
}

export const contextMenuService = {
  async list(): Promise<ContextMenuListResponse> {
    return client().call(RPC_METHODS.CONTEXT_MENU_LIST);
  },

  async getSummary(): Promise<ContextMenuSummaryResponse> {
    return client().call(RPC_METHODS.CONTEXT_MENU_SUMMARY);
  },

  async disable(hive: string, regPath: string): Promise<ContextMenuActionResult> {
    return client().call(RPC_METHODS.CONTEXT_MENU_DISABLE, { hive, regPath });
  },

  async enable(hive: string, regPath: string): Promise<ContextMenuActionResult> {
    return client().call(RPC_METHODS.CONTEXT_MENU_ENABLE, { hive, regPath });
  },

  async remove(hive: string, regPath: string): Promise<ContextMenuActionResult> {
    return client().call(RPC_METHODS.CONTEXT_MENU_REMOVE, { hive, regPath });
  },
};
