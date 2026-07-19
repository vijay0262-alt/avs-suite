/**
 * Thin RPC wrapper for Diagnostics methods.
 */
function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface SystemInfo {
  electronVersion: string;
  platform: string;
  nodeVersion: string;
  chromeVersion: string;
}

export interface BackendStatus {
  connected: boolean;
  latency: number | null;
  lastPing: string | null;
  uptime: string | null;
}

export interface ScanState {
  running: boolean;
  progress: number | null;
  currentCleaner: string | null;
  filesPerSec: number | null;
}

export interface CleaningState {
  running: boolean;
  progress: number | null;
  currentFile: string | null;
  mbPerSec: number | null;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export class DiagnosticsService {
  async getSystemInfo(): Promise<SystemInfo> {
    // Get Electron version from process
    const electronVersion = (window as any).electron?.getVersion?.() || 'Unknown';
    const platform = navigator.platform;
    const nodeVersion = process?.versions?.node || 'Unknown';
    const chromeVersion = process?.versions?.chrome || 'Unknown';
    
    return {
      electronVersion,
      platform,
      nodeVersion,
      chromeVersion,
    };
  }

  async getBackendStatus(): Promise<BackendStatus> {
    try {
      const start = Date.now();
      const result = await client().call('system.ping') as any;
      const latency = Date.now() - start;
      
      return {
        connected: true,
        latency,
        lastPing: new Date().toISOString(),
        uptime: result.uptime || 'Unknown',
      };
    } catch (error) {
      return {
        connected: false,
        latency: null,
        lastPing: null,
        uptime: null,
      };
    }
  }

  async getScanState(): Promise<ScanState> {
    try {
      const result = await client().call('cleaner.scan.status') as any;
      return {
        running: result.status === 'running',
        progress: result.progress || null,
        currentCleaner: result.current_cleaner || null,
        filesPerSec: result.files_per_sec || null,
      };
    } catch (error) {
      return {
        running: false,
        progress: null,
        currentCleaner: null,
        filesPerSec: null,
      };
    }
  }

  async getCleaningState(): Promise<CleaningState> {
    try {
      const result = await client().call('cleaner.clean.status') as any;
      return {
        running: result.status === 'running',
        progress: result.progress || null,
        currentFile: result.current_file || null,
        mbPerSec: result.mb_per_sec || null,
      };
    } catch (error) {
      return {
        running: false,
        progress: null,
        currentFile: null,
        mbPerSec: null,
      };
    }
  }

  async getRecentLogs(): Promise<LogEntry[]> {
    try {
      const result = await client().call('system.logs', { limit: 100 }) as any;
      return result.logs || [];
    } catch (error) {
      return [];
    }
  }

  async ping(): Promise<string> {
    return await client().call('system.ping');
  }

  async startScan(): Promise<{ taskId: string }> {
    return await client().call('cleaner.scan.start');
  }

  async preview(): Promise<any[]> {
    return await client().call('cleaner.clean.preview');
  }

  async execute(): Promise<{ taskId: string }> {
    return await client().call('cleaner.clean.execute');
  }
}

export const diagnosticsService = new DiagnosticsService();
