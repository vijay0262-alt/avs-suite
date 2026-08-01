/**
 * ProcessTrendAnalyzer — analyzes per-process historical trends.
 */
import type { ProcessConfiguration, ProcessTrendSummary, ProcessTrendRecord, TrendDirection, ProcessTrendDataPoint } from './types';
import type { ProcessHistory } from './ProcessHistory';

export class ProcessTrendAnalyzer {
  constructor(private config: ProcessConfiguration, private history: ProcessHistory) {}

  getTrendSummaries(pids: number[]): ProcessTrendSummary[] {
    const summaries: ProcessTrendSummary[] = [];
    for (const pid of pids) {
      const data = this.history.getTrendData(pid, this.config.maxTrendDataPoints);
      if (data.length < this.config.minTrendDataPoints) continue;
      const entry = this.history.getLatest()?.entries.find((e) => e.info.pid === pid);
      if (!entry) continue;

      const cpuTrend = this.computeTrend(data, 'cpuUsagePercent');
      const memTrend = this.computeMemoryTrend(data);
      const overall = this.worstTrend([cpuTrend, memTrend]);
      const notable: string[] = [];
      if (cpuTrend === 'degrading' || cpuTrend === 'rapid_degradation') {
        notable.push(`CPU usage is ${cpuTrend.replace('_', ' ')}`);
      }
      if (memTrend === 'degrading' || memTrend === 'rapid_degradation') {
        notable.push(`Memory usage is ${memTrend.replace('_', ' ')}`);
      }

      summaries.push({
        pid,
        name: entry.info.name,
        overallTrend: overall,
        notableChanges: notable,
      });
    }
    return summaries;
  }

  getTrendRecord(pid: number): ProcessTrendRecord | null {
    const data = this.history.getTrendData(pid, this.config.maxTrendDataPoints);
    if (data.length < this.config.minTrendDataPoints) return null;
    const entry = this.history.getLatest()?.entries.find((e) => e.info.pid === pid);
    if (!entry) return null;

    const cpuTrend = this.computeTrend(data, 'cpuUsagePercent');
    const memoryTrend = this.computeMemoryTrend(data);
    const diskTrend = this.computeDiskTrend(data);
    const networkTrend = this.computeNetworkTrend(data);

    const first = data[0]!;
    const last = data[data.length - 1]!;
    const durationHours = (last.timestamp - first.timestamp) / (1000 * 60 * 60);
    const memoryChangeMBPerHour = durationHours > 0 ? (last.memoryMB - first.memoryMB) / durationHours : 0;
    const cpuChangePercentPerHour = durationHours > 0 ? (last.cpuUsagePercent - first.cpuUsagePercent) / durationHours : 0;

    return {
      pid,
      name: entry.info.name,
      cpuTrend,
      memoryTrend,
      diskTrend,
      networkTrend,
      memoryChangeMBPerHour,
      cpuChangePercentPerHour,
      dataPoints: data,
      duration: last.timestamp - first.timestamp,
      confidence: Math.min(1, data.length / 10),
    };
  }

  private computeTrend(data: ProcessTrendDataPoint[], metric: 'cpuUsagePercent'): TrendDirection {
    if (data.length < 3) return 'unknown';
    const recent = data.slice(-Math.min(data.length, 10));
    const first = recent[0]![metric];
    const last = recent[recent.length - 1]![metric];
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'degrading' : 'improving';
  }

  private computeMemoryTrend(data: ProcessTrendDataPoint[]): TrendDirection {
    if (data.length < 3) return 'unknown';
    const recent = data.slice(-Math.min(data.length, 10));
    const first = recent[0]!.memoryMB;
    const last = recent[recent.length - 1]!.memoryMB;
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    if (Math.abs(change) < 5) return 'stable';
    if (change > 20) return 'rapid_degradation';
    return change > 0 ? 'degrading' : 'improving';
  }

  private computeDiskTrend(data: ProcessTrendDataPoint[]): TrendDirection {
    if (data.length < 3) return 'unknown';
    const recent = data.slice(-5);
    const firstIO = recent[0]!.diskReadMBps + recent[0]!.diskWriteMBps;
    const lastIO = recent[recent.length - 1]!.diskReadMBps + recent[recent.length - 1]!.diskWriteMBps;
    if (Math.abs(lastIO - firstIO) < 5) return 'stable';
    return lastIO > firstIO ? 'degrading' : 'improving';
  }

  private computeNetworkTrend(data: ProcessTrendDataPoint[]): TrendDirection {
    if (data.length < 3) return 'unknown';
    const recent = data.slice(-5);
    const first = recent[0]!.networkMbps;
    const last = recent[recent.length - 1]!.networkMbps;
    if (Math.abs(last - first) < 5) return 'stable';
    return last > first ? 'degrading' : 'improving';
  }

  private worstTrend(trends: TrendDirection[]): TrendDirection {
    if (trends.includes('rapid_degradation')) return 'rapid_degradation';
    if (trends.includes('degrading')) return 'degrading';
    if (trends.includes('improving')) return 'improving';
    return 'stable';
  }
}
