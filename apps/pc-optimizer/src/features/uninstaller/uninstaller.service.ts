/**
 * Uninstaller service — RPC wrapper.
 */
import type { ProgramList, Program, UninstallResult, LeftoverResult } from './uninstaller.types';

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
    return await client().call('uninstaller.list', { includeSystem });
  }

  async uninstall(program: Program, quiet = false): Promise<UninstallResult> {
    return await client().call('uninstaller.uninstall', { program, quiet });
  }

  async scanLeftovers(program: Program): Promise<LeftoverResult> {
    return await client().call('uninstaller.scanLeftovers', { program });
  }
}

export const uninstallerService = new UninstallerService();
