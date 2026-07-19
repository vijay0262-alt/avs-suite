import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { DiagnosticsState } from './diagnostics.types';
import type { DiagnosticsService } from './diagnostics.service';

export class DiagnosticsViewModel extends ViewModel<DiagnosticsState> {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly service: DiagnosticsService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      electronVersion: null,
      platform: null,
      nodeVersion: null,
      chromeVersion: null,
      backendConnected: false,
      rpcLatency: null,
      lastPing: null,
      backendUptime: null,
      scanRunning: false,
      scanProgress: null,
      currentScanCleaner: null,
      scanFilesPerSec: null,
      cleaningRunning: false,
      cleaningProgress: null,
      currentCleaningFile: null,
      cleaningMBPerSec: null,
      lastRpcTest: null,
      logs: [],
    });
  }

  override dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  async bootstrap(): Promise<void> {
    this.setState({ bootstrap: 'loading' });
    try {
      await this.refresh();
      this.setState({ bootstrap: 'ready' });
      // Auto-refresh every 5 seconds
      this.refreshTimer = setInterval(() => void this.refresh(), 5000);
    } catch (error) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async refresh(): Promise<void> {
    try {
      const systemInfo = await this.service.getSystemInfo();
      const backendStatus = await this.service.getBackendStatus();
      const scanState = await this.service.getScanState();
      const cleaningState = await this.service.getCleaningState();
      const logs = await this.service.getRecentLogs();

      this.setState({
        electronVersion: systemInfo.electronVersion,
        platform: systemInfo.platform,
        nodeVersion: systemInfo.nodeVersion,
        chromeVersion: systemInfo.chromeVersion,
        backendConnected: backendStatus.connected,
        rpcLatency: backendStatus.latency,
        lastPing: backendStatus.lastPing,
        backendUptime: backendStatus.uptime,
        scanRunning: scanState.running,
        scanProgress: scanState.progress,
        currentScanCleaner: scanState.currentCleaner,
        scanFilesPerSec: scanState.filesPerSec,
        cleaningRunning: cleaningState.running,
        cleaningProgress: cleaningState.progress,
        currentCleaningFile: cleaningState.currentFile,
        cleaningMBPerSec: cleaningState.mbPerSec,
        logs,
      });
    } catch (error) {
      console.error('Failed to refresh diagnostics:', error);
    }
  }

  async testPing(): Promise<void> {
    try {
      const start = Date.now();
      const result = await this.service.ping();
      const latency = Date.now() - start;
      this.setState({
        lastRpcTest: `Ping: ${result} (${latency}ms)`,
        rpcLatency: latency,
      });
    } catch (error) {
      this.setState({
        lastRpcTest: `Ping failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  async testScanStart(): Promise<void> {
    try {
      const result = await this.service.startScan();
      this.setState({
        lastRpcTest: `Scan started: ${result.taskId}`,
      });
    } catch (error) {
      this.setState({
        lastRpcTest: `Scan start failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  async testPreview(): Promise<void> {
    try {
      const result = await this.service.preview();
      this.setState({
        lastRpcTest: `Preview: ${result.length} cleaners`,
      });
    } catch (error) {
      this.setState({
        lastRpcTest: `Preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  async testExecute(): Promise<void> {
    try {
      const result = await this.service.execute();
      this.setState({
        lastRpcTest: `Execute started: ${result.taskId}`,
      });
    } catch (error) {
      this.setState({
        lastRpcTest: `Execute failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
}
