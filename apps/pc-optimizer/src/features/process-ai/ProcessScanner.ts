/**
 * ProcessScanner — collects process data from the operating system.
 *
 * In production, the RpcProcessProvider implements this interface to
 * enumerate real system processes via the backend
 * `process_intelligence.scan` RPC (psutil). The provider interface
 * allows alternative implementations for testing.
 */
import type { ProcessEntry, ProcessSnapshot, ProcessSystemTotals } from './types';

export interface ProcessProvider {
  readonly id: string;
  readonly source: string;
  initialize(): Promise<void>;
  dispose(): void;
  scan(): Promise<ProcessEntry[]>;
  isAvailable(): boolean;
}

export class ProcessScanner {
  private provider: ProcessProvider | null = null;
  private initialized = false;

  registerProvider(provider: ProcessProvider): void {
    this.provider = provider;
  }

  async initialize(): Promise<void> {
    if (!this.provider) throw new Error('No process provider registered');
    await this.provider.initialize();
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async scan(): Promise<ProcessSnapshot> {
    if (!this.provider || !this.initialized) {
      throw new Error('ProcessScanner not initialized');
    }

    const startTime = Date.now();
    const entries = await this.provider.scan();
    const scanDurationMs = Date.now() - startTime;
    const totals = this.computeTotals(entries);

    return {
      id: `proc-snap-${startTime}`,
      timestamp: startTime,
      scanDurationMs,
      processCount: entries.length,
      entries,
      systemTotals: totals,
      metadata: {
        source: this.provider.source,
        version: '1.0.0',
        partial: false,
      },
    };
  }

  private computeTotals(entries: ProcessEntry[]): ProcessSystemTotals {
    let totalCpu = 0;
    let totalMem = 0;
    let totalDiskRead = 0;
    let totalDiskWrite = 0;
    let totalGpu = 0;
    let totalNetDown = 0;
    let totalNetUp = 0;
    let totalThreads = 0;
    let totalHandles = 0;

    for (const entry of entries) {
      totalCpu += entry.sensors.cpuUsagePercent;
      totalMem += entry.sensors.memoryMB;
      totalDiskRead += entry.sensors.diskReadMBps;
      totalDiskWrite += entry.sensors.diskWriteMBps;
      totalGpu += entry.sensors.gpuUsagePercent;
      totalNetDown += entry.sensors.networkDownloadMbps;
      totalNetUp += entry.sensors.networkUploadMbps;
      totalThreads += entry.info.threadCount;
      totalHandles += entry.info.handleCount;
    }

    return {
      totalCpuUsagePercent: Math.min(100, totalCpu),
      totalMemoryMB: totalMem,
      totalDiskReadMBps: totalDiskRead,
      totalDiskWriteMBps: totalDiskWrite,
      totalGpuUsagePercent: Math.min(100, totalGpu),
      totalNetworkDownloadMbps: totalNetDown,
      totalNetworkUploadMbps: totalNetUp,
      totalProcessCount: entries.length,
      totalThreadCount: totalThreads,
      totalHandleCount: totalHandles,
    };
  }

  dispose(): void {
    this.provider?.dispose();
    this.provider = null;
    this.initialized = false;
  }
}
