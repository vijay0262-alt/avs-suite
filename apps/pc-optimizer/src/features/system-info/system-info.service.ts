/**
 * System Information service
 */

import type { ComprehensiveSystemInfo, StaticSystemInfo, DynamicSystemInfo } from './system-info.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface ISystemInfoService {
  getComprehensiveInfo(): Promise<ComprehensiveSystemInfo>;
  getStaticInfo(): Promise<StaticSystemInfo>;
  getDynamicInfo(): Promise<DynamicSystemInfo>;
}

class SystemInfoService implements ISystemInfoService {
  async getComprehensiveInfo(): Promise<ComprehensiveSystemInfo> {
    return await client().call('system.comprehensive');
  }

  async getStaticInfo(): Promise<StaticSystemInfo> {
    return await client().call('system.static');
  }

  async getDynamicInfo(): Promise<DynamicSystemInfo> {
    return await client().call('system.dynamic');
  }
}

export const systemInfoService = new SystemInfoService();
