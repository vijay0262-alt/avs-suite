/**
 * System Information service
 */

import type { ComprehensiveSystemInfo, StaticSystemInfo, DynamicSystemInfo } from './system-info.types';
import { RPC_METHODS } from '@avs/shared/rpc';

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
    return await client().call(RPC_METHODS.SYSTEM_COMPREHENSIVE);
  }

  async getStaticInfo(): Promise<StaticSystemInfo> {
    return await client().call(RPC_METHODS.SYSTEM_STATIC);
  }

  async getDynamicInfo(): Promise<DynamicSystemInfo> {
    return await client().call(RPC_METHODS.SYSTEM_DYNAMIC);
  }
}

export const systemInfoService = new SystemInfoService();
