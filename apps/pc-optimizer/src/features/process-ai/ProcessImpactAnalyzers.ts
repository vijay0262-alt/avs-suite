/**
 * Process Impact Analyzers — individual analyzers for each resource type.
 *
 * Each analyzer consumes a ProcessEntry and produces an impact assessment
 * with level, trend, description, and evidence. All findings are
 * evidence-based — no hallucinated information.
 */
import type {
  ProcessEntry,
  ProcessConfiguration,
  ImpactLevel,
  TrendDirection,
  CPUImpact,
  MemoryImpact,
  DiskImpact,
  GPUImpact,
  NetworkImpact,
  PowerImpact,
  StartupImpact,
  BackgroundImpact,
  OverallImpact,
  ProcessEvidence,
  ProcessTrendDataPoint,
} from './types';
import {
  makeProcessEvidence,
  impactToScore,
} from './types';

// ── CPU Impact Analyzer ──────────────────────────────────────────────

export class CPUImpactAnalyzer {
  constructor(private config: ProcessConfiguration) {}

  analyze(entry: ProcessEntry, trendData: ProcessTrendDataPoint[]): CPUImpact {
    const t = this.config.thresholds;
    const cpu = entry.sensors.cpuUsagePercent;
    const perCoreAvg = entry.sensors.perCoreUsage.length > 0
      ? entry.sensors.perCoreUsage.reduce((a, b) => a + b, 0) / entry.sensors.perCoreUsage.length
      : cpu;
    const evidence: ProcessEvidence[] = [
      makeProcessEvidence('cpuUsagePercent', cpu.toFixed(1), '%'),
      makeProcessEvidence('perCoreAverage', perCoreAvg.toFixed(1), '%'),
    ];

    let level: ImpactLevel = 'none';
    let isBackgroundLoad = false;
    let isSustained = false;

    if (cpu >= t.cpuHighPercent) {
      level = 'high';
      isSustained = this.checkSustained(trendData, t.cpuSustainedMinutes, t.cpuHighPercent);
      if (isSustained) level = 'critical';
    } else if (cpu >= t.cpuBackgroundPercent) {
      level = 'moderate';
      isBackgroundLoad = true;
    } else if (cpu > 1) {
      level = 'low';
      isBackgroundLoad = true;
    }

    const trend = this.computeTrend(trendData, 'cpuUsagePercent');
    const description = this.describe(entry, cpu, level, isBackgroundLoad, isSustained);

    return { level, usagePercent: cpu, perCoreAverage: perCoreAvg, trend, isBackgroundLoad, isSustained, description, evidence };
  }

  private checkSustained(trendData: ProcessTrendDataPoint[], minutes: number, threshold: number): boolean {
    if (trendData.length < 2) return false;
    const cutoff = Date.now() - minutes * 60 * 1000;
    const recent = trendData.filter((p) => p.timestamp >= cutoff);
    return recent.length >= 2 && recent.every((p) => p.cpuUsagePercent >= threshold);
  }

  private computeTrend(trendData: ProcessTrendDataPoint[], metric: 'cpuUsagePercent' | 'memoryMB'): TrendDirection {
    if (trendData.length < 3) return 'unknown';
    const recent = trendData.slice(-Math.min(trendData.length, 10));
    const first = recent[0]![metric];
    const last = recent[recent.length - 1]![metric];
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    if (Math.abs(change) < 5) return 'stable';
    if (metric === 'cpuUsagePercent') {
      return change > 0 ? 'degrading' : 'improving';
    }
    return change > 0 ? 'degrading' : 'improving';
  }

  private describe(entry: ProcessEntry, cpu: number, level: ImpactLevel, isBg: boolean, isSustained: boolean): string {
    if (level === 'critical' || isSustained) {
      return `${entry.info.displayName} is consuming ${cpu.toFixed(1)}% CPU continuously, which is above the high threshold of ${this.config.thresholds.cpuHighPercent}%.`;
    }
    if (level === 'high') {
      return `${entry.info.displayName} is consuming ${cpu.toFixed(1)}% CPU, which is high.`;
    }
    if (isBg) {
      return `${entry.info.displayName} is running in the background at ${cpu.toFixed(1)}% CPU.`;
    }
    return `${entry.info.displayName} is consuming minimal CPU (${cpu.toFixed(1)}%).`;
  }
}

// ── Memory Impact Analyzer ───────────────────────────────────────────

export class MemoryImpactAnalyzer {
  constructor(private config: ProcessConfiguration) {}

  analyze(entry: ProcessEntry, trendData: ProcessTrendDataPoint[]): MemoryImpact {
    const t = this.config.thresholds;
    const mem = entry.sensors.memoryMB;
    const privateMB = entry.sensors.privateMemoryMB;
    const workingSet = entry.sensors.workingSetMB;
    const virtualMB = entry.sensors.virtualMemoryMB;
    const evidence: ProcessEvidence[] = [
      makeProcessEvidence('memoryMB', mem.toFixed(0), 'MB'),
      makeProcessEvidence('privateMemoryMB', privateMB.toFixed(0), 'MB'),
      makeProcessEvidence('workingSetMB', workingSet.toFixed(0), 'MB'),
    ];

    let level: ImpactLevel = 'none';
    if (mem >= t.memoryHighMB * 2) level = 'critical';
    else if (mem >= t.memoryHighMB) level = 'high';
    else if (mem >= t.memoryHighMB * 0.3) level = 'moderate';
    else if (mem > 10) level = 'low';
    else level = 'minimal';

    const leakRate = this.computeLeakRate(trendData);
    const isLeakSuspected = leakRate >= t.memoryLeakRateMBPerHour;
    if (isLeakSuspected) level = level === 'high' || level === 'critical' ? level : 'high';

    const trend = this.computeMemoryTrend(trendData);
    const description = this.describe(entry, mem, level, isLeakSuspected, leakRate);

    return {
      level, usageMB: mem, privateMB, workingSetMB: workingSet, virtualMB,
      trend, isLeakSuspected, leakRateMBPerHour: leakRate,
      description, evidence,
    };
  }

  private computeLeakRate(trendData: ProcessTrendDataPoint[]): number {
    if (trendData.length < 3) return 0;
    const recent = trendData.slice(-Math.min(trendData.length, 10));
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;
    const durationHours = (last.timestamp - first.timestamp) / (1000 * 60 * 60);
    if (durationHours <= 0) return 0;
    return Math.max(0, (last.memoryMB - first.memoryMB) / durationHours);
  }

  private computeMemoryTrend(trendData: ProcessTrendDataPoint[]): TrendDirection {
    if (trendData.length < 3) return 'unknown';
    const recent = trendData.slice(-Math.min(trendData.length, 10));
    const first = recent[0]!.memoryMB;
    const last = recent[recent.length - 1]!.memoryMB;
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    if (Math.abs(change) < 5) return 'stable';
    if (change > 20) return 'rapid_degradation';
    return change > 0 ? 'degrading' : 'improving';
  }

  private describe(entry: ProcessEntry, mem: number, level: ImpactLevel, isLeak: boolean, leakRate: number): string {
    if (isLeak) {
      return `${entry.info.displayName} has steadily increased memory usage at a rate of ${leakRate.toFixed(0)} MB/hour. This pattern may indicate a memory leak or unusually high cache growth.`;
    }
    if (level === 'critical' || level === 'high') {
      return `${entry.info.displayName} is using ${mem.toFixed(0)} MB of memory, which is high.`;
    }
    return `${entry.info.displayName} is using ${mem.toFixed(0)} MB of memory.`;
  }
}

// ── Disk Impact Analyzer ─────────────────────────────────────────────

export class DiskImpactAnalyzer {
  constructor(private config: ProcessConfiguration) {}

  analyze(entry: ProcessEntry, trendData: ProcessTrendDataPoint[]): DiskImpact {
    const t = this.config.thresholds;
    const read = entry.sensors.diskReadMBps;
    const write = entry.sensors.diskWriteMBps;
    const totalIOps = read + write;
    const evidence: ProcessEvidence[] = [
      makeProcessEvidence('diskReadMBps', read.toFixed(1), 'MB/s'),
      makeProcessEvidence('diskWriteMBps', write.toFixed(1), 'MB/s'),
    ];

    let level: ImpactLevel = 'none';
    if (totalIOps >= t.diskHighMBps * 2) level = 'critical';
    else if (totalIOps >= t.diskHighMBps) level = 'high';
    else if (totalIOps >= t.diskHighMBps * 0.3) level = 'moderate';
    else if (totalIOps > 0.1) level = 'low';
    else level = 'none';

    const isActive = totalIOps > 1;
    const trend = this.computeTrend(trendData);
    const description = this.describe(entry, read, write, level, isActive);

    return { level, readMBps: read, writeMBps: write, totalIOps, trend, isActive, description, evidence };
  }

  private computeTrend(trendData: ProcessTrendDataPoint[]): TrendDirection {
    if (trendData.length < 3) return 'unknown';
    const recent = trendData.slice(-5);
    const firstIO = recent[0]!.diskReadMBps + recent[0]!.diskWriteMBps;
    const lastIO = recent[recent.length - 1]!.diskReadMBps + recent[recent.length - 1]!.diskWriteMBps;
    if (Math.abs(lastIO - firstIO) < 5) return 'stable';
    return lastIO > firstIO ? 'degrading' : 'improving';
  }

  private describe(entry: ProcessEntry, read: number, write: number, level: ImpactLevel, isActive: boolean): string {
    if (!isActive) return `${entry.info.displayName} has no significant disk activity.`;
    if (level === 'high' || level === 'critical') {
      return `${entry.info.displayName} is performing heavy disk I/O: ${read.toFixed(1)} MB/s read, ${write.toFixed(1)} MB/s write.`;
    }
    return `${entry.info.displayName} has moderate disk activity: ${read.toFixed(1)} MB/s read, ${write.toFixed(1)} MB/s write.`;
  }
}

// ── GPU Impact Analyzer ──────────────────────────────────────────────

export class GPUImpactAnalyzer {
  constructor(private config: ProcessConfiguration) {}

  analyze(entry: ProcessEntry): GPUImpact {
    const t = this.config.thresholds;
    const gpu = entry.sensors.gpuUsagePercent;
    const vram = entry.sensors.vramMB;
    const evidence: ProcessEvidence[] = [
      makeProcessEvidence('gpuUsagePercent', gpu.toFixed(1), '%'),
      makeProcessEvidence('vramMB', vram.toFixed(0), 'MB'),
    ];

    let level: ImpactLevel = 'none';
    if (gpu >= t.gpuHighPercent * 1.5) level = 'critical';
    else if (gpu >= t.gpuHighPercent) level = 'high';
    else if (gpu >= t.gpuHighPercent * 0.3) level = 'moderate';
    else if (gpu > 1) level = 'low';
    else level = 'none';

    const description = this.describe(entry, gpu, vram, level);

    return { level, usagePercent: gpu, vramMB: vram, trend: 'unknown', description, evidence };
  }

  private describe(entry: ProcessEntry, gpu: number, vram: number, level: ImpactLevel): string {
    if (level === 'high' || level === 'critical') {
      return `${entry.info.displayName} is using ${gpu.toFixed(1)}% GPU and ${vram.toFixed(0)} MB VRAM.`;
    }
    if (gpu > 0) {
      return `${entry.info.displayName} is using ${gpu.toFixed(1)}% GPU and ${vram.toFixed(0)} MB VRAM.`;
    }
    return `${entry.info.displayName} has no GPU usage.`;
  }
}

// ── Network Impact Analyzer ──────────────────────────────────────────

export class NetworkImpactAnalyzer {
  constructor(private config: ProcessConfiguration) {}

  analyze(entry: ProcessEntry): NetworkImpact {
    const t = this.config.thresholds;
    const down = entry.sensors.networkDownloadMbps;
    const up = entry.sensors.networkUploadMbps;
    const total = down + up;
    const evidence: ProcessEvidence[] = [
      makeProcessEvidence('downloadMbps', down.toFixed(1), 'Mbps'),
      makeProcessEvidence('uploadMbps', up.toFixed(1), 'Mbps'),
    ];

    let level: ImpactLevel = 'none';
    if (total >= t.networkHighMbps * 2) level = 'critical';
    else if (total >= t.networkHighMbps) level = 'high';
    else if (total >= t.networkHighMbps * 0.2) level = 'moderate';
    else if (total > 0.5) level = 'low';
    else level = 'none';

    const isAbnormal = total > t.networkHighMbps && entry.info.category !== 'browser' && entry.info.category !== 'updater';
    const description = this.describe(entry, down, up, level, isAbnormal);

    return { level, downloadMbps: down, uploadMbps: up, trend: 'unknown', isAbnormal, description, evidence };
  }

  private describe(entry: ProcessEntry, down: number, up: number, level: ImpactLevel, isAbnormal: boolean): string {
    if (isAbnormal) {
      return `${entry.info.displayName} is generating abnormal network traffic: ${down.toFixed(1)} Mbps down, ${up.toFixed(1)} Mbps up. This is unusual for this type of process.`;
    }
    if (level === 'high' || level === 'critical') {
      return `${entry.info.displayName} is using significant bandwidth: ${down.toFixed(1)} Mbps down, ${up.toFixed(1)} Mbps up.`;
    }
    return `${entry.info.displayName} has minimal network activity: ${down.toFixed(1)} Mbps down, ${up.toFixed(1)} Mbps up.`;
  }
}

// ── Power Impact Analyzer ────────────────────────────────────────────

export class PowerImpactAnalyzer {
  analyze(entry: ProcessEntry): PowerImpact {
    const power = entry.sensors.powerDrawEstimateW;
    const evidence: ProcessEvidence[] = [
      makeProcessEvidence('powerDrawEstimateW', power.toFixed(1), 'W'),
    ];

    let level: ImpactLevel = 'none';
    if (power >= 20) level = 'critical';
    else if (power >= 10) level = 'high';
    else if (power >= 5) level = 'moderate';
    else if (power >= 1) level = 'low';
    else level = 'minimal';

    const isBatteryDrain = power >= 5 && entry.info.category !== 'system' && entry.info.category !== 'windows';
    const description = this.describe(entry, power, isBatteryDrain);

    return { level, estimatedPowerW: power, isBatteryDrain, description, evidence };
  }

  private describe(entry: ProcessEntry, power: number, isBatteryDrain: boolean): string {
    if (isBatteryDrain) {
      return `${entry.info.displayName} is estimated to draw ${power.toFixed(1)}W, which may significantly impact battery life.`;
    }
    return `${entry.info.displayName} is estimated to draw ${power.toFixed(1)}W.`;
  }
}

// ── Startup Impact Analyzer ──────────────────────────────────────────

export class StartupImpactAnalyzer {
  constructor(private config: ProcessConfiguration) {}

  analyze(entry: ProcessEntry): StartupImpact {
    const t = this.config.thresholds;
    const isStartup = entry.info.isStartupEntry;
    const delay = isStartup ? t.startupHighDelayMs : 0;
    const evidence: ProcessEvidence[] = isStartup
      ? [makeProcessEvidence('isStartupEntry', 'true', 'bool'), makeProcessEvidence('startupDelayMs', String(delay), 'ms')]
      : [makeProcessEvidence('isStartupEntry', 'false', 'bool')];

    let level: ImpactLevel = 'none';
    if (isStartup && delay >= t.startupHighDelayMs) level = 'high';
    else if (isStartup) level = 'moderate';

    const description = this.describe(entry, isStartup, delay);

    return { level, isStartupEntry: isStartup, startupDelayMs: delay, description, evidence };
  }

  private describe(entry: ProcessEntry, isStartup: boolean, delay: number): string {
    if (isStartup) {
      return `${entry.info.displayName} is configured to start with Windows${delay > 0 ? ` with an estimated delay of ${delay}ms` : ''}.`;
    }
    return `${entry.info.displayName} is not a startup process.`;
  }
}

// ── Background Impact Analyzer ───────────────────────────────────────

export class BackgroundImpactAnalyzer {
  constructor(private config: ProcessConfiguration) {}

  analyze(entry: ProcessEntry, trendData: ProcessTrendDataPoint[]): BackgroundImpact {
    const t = this.config.thresholds;
    const cpu = entry.sensors.cpuUsagePercent;
    const isBackgroundProcess = entry.info.category === 'background' || entry.info.category === 'updater' || !entry.info.windowTitle;
    const idleDurationMs = this.computeIdleDuration(trendData, t.idleThresholdMinutes);
    const isIdle = cpu < 1 && idleDurationMs >= t.idleThresholdMinutes * 60 * 1000;
    const evidence: ProcessEvidence[] = [
      makeProcessEvidence('cpuUsagePercent', cpu.toFixed(1), '%'),
      makeProcessEvidence('idleDurationMs', String(idleDurationMs), 'ms'),
    ];

    let level: ImpactLevel = 'none';
    if (isIdle && isBackgroundProcess) level = 'moderate';
    else if (isBackgroundProcess && cpu < t.cpuBackgroundPercent) level = 'low';
    else if (isBackgroundProcess) level = 'moderate';

    const description = this.describe(entry, isIdle, isBackgroundProcess, idleDurationMs);

    return { level, isIdle, idleDurationMs, isBackgroundProcess, description, evidence };
  }

  private computeIdleDuration(trendData: ProcessTrendDataPoint[], _thresholdMinutes: number): number {
    if (trendData.length < 2) return 0;
    let idleSince = trendData[0]!.timestamp;
    for (let i = trendData.length - 1; i >= 0; i--) {
      if (trendData[i]!.cpuUsagePercent >= 1) {
        idleSince = trendData[i]!.timestamp;
        break;
      }
    }
    const lastTimestamp = trendData[trendData.length - 1]!.timestamp;
    const duration = lastTimestamp - idleSince;
    return duration > 0 ? duration : 0;
  }

  private describe(entry: ProcessEntry, isIdle: boolean, isBg: boolean, idleMs: number): string {
    if (isIdle) {
      const hours = (idleMs / (1000 * 60 * 60)).toFixed(1);
      return `${entry.info.displayName} has been idle for ${hours} hours with minimal CPU activity.`;
    }
    if (isBg) {
      return `${entry.info.displayName} is running as a background process at ${entry.sensors.cpuUsagePercent.toFixed(1)}% CPU.`;
    }
    return `${entry.info.displayName} is an active foreground process.`;
  }
}

// ── Overall Impact Calculator ────────────────────────────────────────

export function computeOverallImpact(
  cpu: CPUImpact,
  memory: MemoryImpact,
  disk: DiskImpact,
  gpu: GPUImpact,
  network: NetworkImpact,
  power: PowerImpact,
  startup: StartupImpact,
  background: BackgroundImpact,
): OverallImpact {
  const scores = [
    impactToScore(cpu.level),
    impactToScore(memory.level),
    impactToScore(disk.level),
    impactToScore(gpu.level),
    impactToScore(network.level),
    impactToScore(power.level),
    impactToScore(startup.level),
    impactToScore(background.level),
  ];

  const maxScore = Math.max(...scores);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const score = Math.round(maxScore * 0.7 + avgScore * 0.3);

  let level: ImpactLevel = 'none';
  if (score >= 80) level = 'critical';
  else if (score >= 60) level = 'high';
  else if (score >= 40) level = 'moderate';
  else if (score >= 20) level = 'low';
  else if (score > 0) level = 'minimal';

  const primaryConcern = getPrimaryConcern(cpu, memory, disk, gpu, network, power);
  const thermalContribution = estimateThermalContribution(cpu, gpu, power);

  return {
    level,
    score,
    primaryConcern,
    thermalContribution,
    description: `Overall impact is ${level} with a score of ${score}/100. Primary concern: ${primaryConcern}.`,
  };
}

function getPrimaryConcern(
  cpu: CPUImpact, memory: MemoryImpact, disk: DiskImpact,
  gpu: GPUImpact, network: NetworkImpact, power: PowerImpact,
): string {
  const impacts: { name: string; score: number }[] = [
    { name: 'CPU', score: impactToScore(cpu.level) },
    { name: 'Memory', score: impactToScore(memory.level) },
    { name: 'Disk', score: impactToScore(disk.level) },
    { name: 'GPU', score: impactToScore(gpu.level) },
    { name: 'Network', score: impactToScore(network.level) },
    { name: 'Power', score: impactToScore(power.level) },
  ];
  impacts.sort((a, b) => b.score - a.score);
  return impacts[0]!.score > 0 ? impacts[0]!.name : 'None';
}

function estimateThermalContribution(cpu: CPUImpact, gpu: GPUImpact, power: PowerImpact): number {
  return Math.round((cpu.usagePercent * 0.3 + gpu.usagePercent * 0.2 + power.estimatedPowerW * 0.1) * 10) / 10;
}
