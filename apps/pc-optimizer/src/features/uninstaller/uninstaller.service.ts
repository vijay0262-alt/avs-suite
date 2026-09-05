/**
 * Uninstaller service — RPC wrapper.
 */
import type { ProgramList, Program, UninstallResult, LeftoverResult } from './uninstaller.types';
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface IUninstallerService {
  list(includeSystem?: boolean): Promise<ProgramList>;
  uninstall(program: Program, quiet?: boolean): Promise<UninstallResult>;
  scanLeftovers(program: Program): Promise<LeftoverResult>;
}

class UninstallerService implements IUninstallerService {
  async list(includeSystem = false): Promise<ProgramList> {
    return await client().call(RPC_METHODS.UNINSTALLER_LIST, { includeSystem });
  }

  async uninstall(program: Program, quiet = false): Promise<UninstallResult> {
    return await client().call(RPC_METHODS.UNINSTALLER_UNINSTALL, { program, quiet });
  }

  async scanLeftovers(program: Program): Promise<LeftoverResult> {
    return await client().call(RPC_METHODS.UNINSTALLER_SCAN_LEFTOVERS, { program });
  }
}

export const uninstallerService = new UninstallerService();
