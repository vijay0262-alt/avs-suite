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

export class SystemInfoViewModel extends ViewModel<SystemInfoState> {
  constructor(private service: ISystemInfoService = systemInfoService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      systemInfo: null,
      loading: false,
    });
  }

  async bootstrap() {
    // Render the shell instantly; load comprehensive data in the background.
    this.setState({ bootstrap: 'ready', bootstrapError: null, loading: true });
    try {
      await this.loadSystemInfo();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load system information';
      this.setState({ bootstrap: 'error', bootstrapError: error, loading: false });
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
