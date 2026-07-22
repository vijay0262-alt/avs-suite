/**
 * System Information ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { ComprehensiveSystemInfo } from './system-info.types';
import type { ISystemInfoService } from './system-info.service';
import { systemInfoService } from './system-info.service';

export interface SystemInfoState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  systemInfo: ComprehensiveSystemInfo | null;
  loading: boolean;
}

const DYNAMIC_POLL_MS = 5000;

export class SystemInfoViewModel extends ViewModel<SystemInfoState> {
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private service: ISystemInfoService = systemInfoService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      systemInfo: null,
      loading: false,
    });
  }

  async bootstrap() {
    this.setState({ bootstrap: 'ready', bootstrapError: null, loading: true });
    try {
      const staticInfo = await this.service.getStaticInfo();
      this.setState({
        systemInfo: {
          ...staticInfo,
          cpuUsage: 0,
          memory: { total: 0, available: 0, used: 0, free: 0, percent: 0, currentFrequency: 0 },
          disk: [],
          network: { interfaces: [], io: { bytes_sent: 0, bytes_recv: 0, packets_sent: 0, packets_recv: 0, errin: 0, errout: 0, dropin: 0, dropout: 0 } },
          processes: { total: 0, running: 0 },
          capturedAt: new Date().toISOString(),
        },
        loading: false,
      });
      await this.refreshDynamic();
      this.startPolling();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load system information';
      this.setState({ bootstrap: 'error', bootstrapError: error, loading: false });
    }
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => { void this.refreshDynamic(); }, DYNAMIC_POLL_MS);
  }

  private stopPolling() {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async refreshDynamic() {
    try {
      const dynamic = await this.service.getDynamicInfo();
      const current = this.state.systemInfo;
      if (current) {
        this.setState({
          systemInfo: {
            ...current,
            ...dynamic,
            capturedAt: new Date().toISOString(),
          },
        });
      }
    } catch {
      // Silent — polling errors don't disrupt the UI
    }
  }

  async loadSystemInfo() {
    this.setState({ loading: true });
    try {
      const info = await this.service.getComprehensiveInfo();
      this.setState({ systemInfo: info, loading: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load system information';
      this.setState({ bootstrap: 'error', bootstrapError: error, loading: false });
      throw err;
    }
  }

  override dispose() {
    this.stopPolling();
    super.dispose();
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  formatFrequency(hz: number): string {
    if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GHz`;
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`;
    return `${hz} Hz`;
  }

  formatUptime(timestamp: number): string {
    const now = Date.now() / 1000;
    const uptime = now - timestamp;
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}
