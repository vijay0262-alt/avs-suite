/**
 * Browser Extensions service — wraps backend browser_ext.* RPC methods.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is not available (running outside Electron?)');
  }
  return window.avs.rpc;
}

export interface BrowserExtension {
  browser: string;
  extensionId: string;
  version: string;
  name: string;
  description: string;
  permissions: string[];
  hostPermissions: string[];
  manifestVersion: number;
  path: string;
  enabled: boolean;
  canDisable: boolean;
  canRemove: boolean;
  profile?: string;
}

export interface ExtensionListResponse {
  extensions: BrowserExtension[];
  count: number;
  byBrowser: Record<string, number>;
  supported: boolean;
  capturedAt: string;
}

export interface ExtensionSummaryResponse {
  count: number;
  enabledCount: number;
  disabledCount: number;
  byBrowser: Record<string, number>;
  supported: boolean;
  capturedAt: string;
}

export interface ExtensionActionResult {
  success: boolean;
  message: string;
}

export const browserExtensionsService = {
  async list(): Promise<ExtensionListResponse> {
    return client().call(RPC_METHODS.BROWSER_EXT_LIST);
  },

  async getSummary(): Promise<ExtensionSummaryResponse> {
    return client().call(RPC_METHODS.BROWSER_EXT_SUMMARY);
  },

  async remove(browser: string, extensionId: string): Promise<ExtensionActionResult> {
    return client().call(RPC_METHODS.BROWSER_EXT_REMOVE, { browser, extensionId });
  },

  async disable(browser: string, extensionId: string): Promise<ExtensionActionResult> {
    return client().call(RPC_METHODS.BROWSER_EXT_DISABLE, { browser, extensionId });
  },

  async enable(browser: string, extensionId: string): Promise<ExtensionActionResult> {
    return client().call(RPC_METHODS.BROWSER_EXT_ENABLE, { browser, extensionId });
  },
};
