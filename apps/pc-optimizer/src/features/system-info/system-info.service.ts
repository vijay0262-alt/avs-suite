/**
 * System Information service
 */

import type { ComprehensiveSystemInfo } from './system-info.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ISystemInfoService {
  getComprehensiveInfo(): Promise<ComprehensiveSystemInfo>;
}

class SystemInfoService implements ISystemInfoService {
  async getComprehensiveInfo(): Promise<ComprehensiveSystemInfo> {
    return await client().call('system.comprehensive');
  }
}

export const systemInfoService = new SystemInfoService();
