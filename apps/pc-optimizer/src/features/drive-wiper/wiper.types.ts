/**
 * Drive Wiper / Secure File Shredder types.
 */

export interface DriveInfo {
  letter: string;
  label: string;
  fileSystem: string;
  totalBytes: number;
  freeBytes: number;
}

export interface ShredResult {
  path: string;
  success: boolean;
  message: string;
}

export interface ShredResponse {
  success: boolean;
  message: string;
  results: ShredResult[];
}

export interface WipeFreeSpaceResponse {
  success: boolean;
  message: string;
  drive: string;
  bytesProcessed: number;
}

export interface WiperState {
  drives: DriveInfo[];
  paths: string[];
  passes: number;
  zeros: boolean;
  selectedDrive: string;
  loading: boolean;
  busy: boolean;
  message: string | null;
  error: string | null;
  lastResults: ShredResult[] | null;
  lastWipe: WipeFreeSpaceResponse | null;
}
