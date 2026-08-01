import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { DiagnosticsState } from './diagnostics.types';
import type { DiagnosticsService } from './diagnostics.service';

export class DiagnosticsViewModel extends ViewModel<DiagnosticsState> {
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pollActive = false;
  private visibilityHandler: (() => void) | null = null;

  private static readonly POLL_INTERVAL_MS = 5000;
  private static readonly POLL_HIDDEN_INTERVAL_MS = 30000;

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
    this.stopPolling();
  }

  async bootstrap(): Promise<void> {
    this.setState({ bootstrap: 'loading' });
    try {
      await this.refresh();
      this.setState({ bootstrap: 'ready' });
      this.startPolling();
    } catch (error) {
      this.setState({
        bootstrap: 'error',
        bootstrapError: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async refresh(): Promise<void> {
    try {
      const [systemInfo, backendStatus, scanState, cleaningState, logs] = await Promise.all([
        this.service.getSystemInfo(),
        this.service.getBackendStatus(),
        this.service.getScanState(),
        this.service.getCleaningState(),
        this.service.getRecentLogs(),
      ]);

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

  private getPollInterval(): number {
    if (typeof document !== 'undefined' && document.hidden) {
      return DiagnosticsViewModel.POLL_HIDDEN_INTERVAL_MS;
    }
    return DiagnosticsViewModel.POLL_INTERVAL_MS;
  }

  private startPolling(): void {
    this.pollActive = true;
    const scheduleNext = () => {
      if (!this.pollActive) return;
      const interval = this.getPollInterval();
      this.refreshTimer = setTimeout(() => {
        void this.refresh().finally(() => scheduleNext());
      }, interval);
    };
    scheduleNext();

    if (typeof document !== 'undefined') {
      this.visibilityHandler = () => {
        if (!this.pollActive) return;
        if (this.refreshTimer) {
          clearTimeout(this.refreshTimer);
          this.refreshTimer = null;
        }
        if (!document.hidden) {
          void this.refresh();
        }
        scheduleNext();
      };
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private stopPolling(): void {
    this.pollActive = false;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }
}
