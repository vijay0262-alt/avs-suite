/**
 * Performance Monitor types
 */

export interface CpuMetrics {
  usage: number;
  perCoreUsage: number[];
  clockSpeed: number;
  temperatureCelsius: number;
  processorName: string;
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  cached: number;
  committed: number;
  usage: number;
}

export interface DiskMetrics {
  readSpeed: number;
  writeSpeed: number;
  activeTime: number;
  freeSpace: number;
  usedSpace: number;
  healthStatus: string;
}

export interface NetworkMetrics {
  uploadSpeed: number;
  downloadSpeed: number;
  totalBytesSent: number;
  totalBytesReceived: number;
}

export interface SystemMetrics {
  uptime: number;
  runningProcesses: number;
  threads: number;
  handles: number;
  loggedInUser: string;
  windowsVersion: string;
}

export interface PerformanceMetrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  system: SystemMetrics;
}

export interface GraphHistory {
  cpu: number[];
  memory: number[];
  diskRead: number[];
  diskWrite: number[];
  networkUpload: number[];
  networkDownload: number[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  status: string;
}

export interface Alert {
  type: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
}

export interface PerformanceState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  metrics: PerformanceMetrics | null;
  graphHistory: GraphHistory | null;
  topProcesses: ProcessInfo[];
  alerts: Alert[];
  loading: boolean;
}
