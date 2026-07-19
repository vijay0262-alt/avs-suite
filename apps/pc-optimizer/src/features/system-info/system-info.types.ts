/**
 * System Information types
 */

export interface CpuInfo {
  name: string;
  architecture: string;
  cores: number;
  logicalCores: number;
  maxFrequency: number;
  currentFrequency: number;
}

export interface MemoryInfo {
  total: number;
  available: number;
  used: number;
  free: number;
  percent: number;
}

export interface DiskInfo {
  device: string;
  mountpoint: string;
  fstype: string;
  total: number;
  used: number;
  free: number;
  percent: number;
}

export interface NetworkInfo {
  interfaces: string[];
  io: {
    bytes_sent: number;
    bytes_recv: number;
    packets_sent: number;
    packets_recv: number;
    errin: number;
    errout: number;
    dropin: number;
    dropout: number;
  };
}

export interface OsInfo {
  system: string;
  release: string;
  version: string;
  machine: string;
  processor: string;
  hostname: string;
  bootTime: number;
}

export interface ProcessInfo {
  total: number;
  running: number;
}

export interface ComprehensiveSystemInfo {
  cpu: CpuInfo;
  memory: MemoryInfo;
  disk: DiskInfo[];
  network: NetworkInfo;
  os: OsInfo;
  processes: ProcessInfo;
  capturedAt: string;
}

export interface SystemInfoState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  systemInfo: ComprehensiveSystemInfo | null;
  loading: boolean;
}
