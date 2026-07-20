/**
 * Uninstaller types.
 */

export interface Program {
  id: string;
  name: string;
  publisher: string;
  version: string;
  installDate: string;
  sizeBytes: number;
  installLocation: string;
  uninstallString: string;
  quietUninstallString: string;
  source: string;
  systemComponent: boolean;
}

export interface ProgramList {
  programs: Program[];
  total: number;
  totalSizeBytes: number;
}

export interface UninstallResult {
  success: boolean;
  message: string;
  launched?: boolean;
}

export interface LeftoverResult {
  leftovers: string[];
}
