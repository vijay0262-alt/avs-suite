/**
 * Drive Wiper service — RPC wrapper.
 */
import type { DriveInfo, ShredResponse, WipeFreeSpaceResponse } from './wiper.types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IWiperService {
  drives(): Promise<{ drives: DriveInfo[] }>;
  shred(paths: string[], passes: number, zeros: boolean): Promise<ShredResponse>;
  wipeFreeSpace(drive: string, passes: number, zeros: boolean): Promise<WipeFreeSpaceResponse>;
}

class WiperService implements IWiperService {
  async drives(): Promise<{ drives: DriveInfo[] }> {
    return await client().call('wiper.drives');
  }

  async shred(paths: string[], passes: number, zeros: boolean): Promise<ShredResponse> {
    return await client().call('wiper.shred', { paths, passes, zeros });
  }

  async wipeFreeSpace(drive: string, passes: number, zeros: boolean): Promise<WipeFreeSpaceResponse> {
    return await client().call('wiper.wipeFreeSpace', { drive, passes, zeros });
  }
}

export const wiperService = new WiperService();
