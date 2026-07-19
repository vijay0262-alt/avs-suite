export interface DiagnosticsState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  
  // System info
  electronVersion: string | null;
  platform: string | null;
  nodeVersion: string | null;
  chromeVersion: string | null;
  
  // Backend status
  backendConnected: boolean;
  rpcLatency: number | null;
  lastPing: string | null;
  backendUptime: string | null;
  
  // Scan state
  scanRunning: boolean;
  scanProgress: number | null;
  currentScanCleaner: string | null;
  scanFilesPerSec: number | null;
  
  // Cleaning state
  cleaningRunning: boolean;
  cleaningProgress: number | null;
  currentCleaningFile: string | null;
  cleaningMBPerSec: number | null;
  
  // RPC test results
  lastRpcTest: string | null;
  
  // Logs
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
  }>;
}
