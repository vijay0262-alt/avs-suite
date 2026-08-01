/**
 * Component Analyzers — individual analyzers for each hardware category.
 *
 * Each analyzer consumes a HardwareComponent and produces a ComponentAnalysis
 * with health, performance, efficiency, reliability, trend, issues, and metrics.
 * All findings are evidence-based — no hallucinated information.
 */
import type {
  ComponentAnalysis,
  ComponentIssue,
  ComponentMetric,
  AIEvidence,
  AISeverity,
  HardwareAIConfiguration,
  TrendDirection,
  ThermalAnalysisResult,
  ThermalAnomaly,
} from './types';
import {
  severityToRisk,
  severityToUrgency,
  makeEvidence,
} from './types';
import type {
  HardwareCategory,
  HealthLevel,
  SensorReading,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  NetworkComponent,
  BatteryComponent,
  CoolingComponent,
  HardwareComponent,
} from '../hardware-center/types';
import type { HardwareTrendHistory } from './HardwareTrendHistory';

export abstract class BaseAnalyzer<T extends HardwareComponent> {
  constructor(
    protected config: HardwareAIConfiguration,
    protected trendHistory: HardwareTrendHistory,
  ) {}

  abstract analyze(component: T): ComponentAnalysis;

  protected makeIssue(
    id: string,
    title: string,
    description: string,
    severity: AISeverity,
    evidence: AIEvidence[],
    confidence: number,
  ): ComponentIssue {
    return { id, title, description, severity, evidence, confidence };
  }

  protected makeMetric(
    label: string,
    reading: SensorReading<unknown> | undefined,
    normal: boolean,
    trend: TrendDirection = 'unknown',
  ): ComponentMetric {
    if (!reading?.supported || reading.value === undefined) {
      return { label, value: 'N/A', unit: reading?.unit ?? '', normal, trend, source: reading?.source ?? 'unknown' };
    }
    return {
      label,
      value: String(reading.value),
      unit: reading.unit,
      normal,
      trend,
      source: reading.source,
    };
  }

  protected scoreToHealthLevel(score: number): HealthLevel {
    if (score >= 85) return 'good';
    if (score >= 65) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }
}

// ── CPU Analyzer ─────────────────────────────────────────────────────

export class CPUAnalyzer extends BaseAnalyzer<CPUComponent> {
  analyze(cpu: CPUComponent): ComponentAnalysis {
    const issues: ComponentIssue[] = [];
    const strengths: string[] = [];
    const metrics: ComponentMetric[] = [];
    let score = 100;
    const evidence: AIEvidence[] = [];

    const temp = cpu.sensors.temperatureC;
    const util = cpu.info.packageUtilization;
    const power = cpu.sensors.powerDrawW;
    const throttling = cpu.sensors.thermalThrottling;
    const freq = cpu.info.currentFrequencyMHz;

    // Temperature analysis
    if (temp?.supported && temp.value !== undefined) {
      metrics.push(this.makeMetric('Temperature', temp, temp.value < this.config.thermalThresholds.cpuWarningC, this.trendHistory.computeTrend('cpu', 'temperatureC')));
      evidence.push(makeEvidence(temp.source, 'temperatureC', temp));
      if (temp.value >= this.config.thermalThresholds.cpuCriticalC) {
        score -= 65;
        issues.push(this.makeIssue(
          'cpu-temp-critical', 'Critical CPU Temperature',
          `CPU temperature is ${temp.value.toFixed(0)}°C, exceeding the critical threshold of ${this.config.thermalThresholds.cpuCriticalC}°C.`,
          'critical', [makeEvidence(temp.source, 'temperatureC', temp)], 0.95,
        ));
      } else if (temp.value >= this.config.thermalThresholds.cpuWarningC) {
        score -= 35;
        issues.push(this.makeIssue(
          'cpu-temp-high', 'High CPU Temperature',
          `CPU temperature is ${temp.value.toFixed(0)}°C, above the warning threshold of ${this.config.thermalThresholds.cpuWarningC}°C.`,
          'high', [makeEvidence(temp.source, 'temperatureC', temp)], 0.9,
        ));
      } else {
        strengths.push(`CPU temperature is within normal range (${temp.value.toFixed(0)}°C)`);
      }
    } else {
      issues.push(this.makeIssue('cpu-temp-missing', 'Temperature Sensor Missing', 'CPU temperature sensor is not available.', 'info', [], 0.5));
      score -= 5;
    }

    // Throttling
    if (throttling?.supported && throttling.value) {
      score -= 55;
      issues.push(this.makeIssue(
        'cpu-throttling', 'Thermal Throttling Active',
        'CPU is actively thermal throttling, reducing clock speeds to prevent damage.',
        'critical', [makeEvidence(throttling.source, 'thermalThrottling', throttling)], 0.98,
      ));
    }

    // Utilization
    if (util?.supported && util.value !== undefined) {
      metrics.push(this.makeMetric('Utilization', util, util.value < this.config.utilizationThresholds.cpuHighPercent, this.trendHistory.computeTrend('cpu', 'utilization')));
      if (util.value >= this.config.utilizationThresholds.cpuHighPercent) {
        score -= 15;
        issues.push(this.makeIssue(
          'cpu-util-high', 'High CPU Utilization',
          `CPU utilization is ${util.value.toFixed(0)}%, above the high threshold.`,
          'medium', [makeEvidence(util.source, 'packageUtilization', util)], 0.85,
        ));
      } else if (util.value > this.config.utilizationThresholds.cpuBackgroundPercent && util.value < this.config.utilizationThresholds.cpuHighPercent) {
        issues.push(this.makeIssue(
          'cpu-util-background', 'Background CPU Load',
          `CPU utilization is ${util.value.toFixed(0)}%, suggesting background processes.`,
          'low', [makeEvidence(util.source, 'packageUtilization', util)], 0.7,
        ));
      } else {
        strengths.push(`CPU utilization is low (${util.value.toFixed(0)}%)`);
      }
    }

    // Power
    if (power?.supported && power.value !== undefined) {
      metrics.push(this.makeMetric('Power Draw', power, true, this.trendHistory.computeTrend('cpu', 'powerDrawW')));
    }

    // Frequency
    if (freq?.supported && freq.value !== undefined) {
      metrics.push(this.makeMetric('Current Frequency', freq, true));
    }

    score = Math.max(0, Math.min(100, score));
    const trend = this.trendHistory.computeTrend('cpu', 'temperatureC');
    const worstSeverity = issues.reduce<AISeverity>((s, i) => this.worseSeverity(s, i.severity), 'info' as AISeverity);

    return {
      category: 'cpu',
      health: this.scoreToHealthLevel(score),
      healthScore: score,
      performance: util?.supported && util.value !== undefined
        ? util.value >= this.config.utilizationThresholds.cpuHighPercent ? 'fair' : 'optimal'
        : 'unknown',
      efficiency: score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'poor',
      reliability: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
      trend,
      confidence: evidence.length > 0 ? Math.min(0.95, 0.5 + evidence.length * 0.15) : 0.3,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      issues,
      strengths,
      metrics,
    };
  }

  private worseSeverity(a: AISeverity, b: AISeverity): AISeverity {
    const order: AISeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
}

// ── GPU Analyzer ─────────────────────────────────────────────────────

export class GPUAnalyzer extends BaseAnalyzer<GPUComponent> {
  analyze(gpu: GPUComponent): ComponentAnalysis {
    const issues: ComponentIssue[] = [];
    const strengths: string[] = [];
    const metrics: ComponentMetric[] = [];
    let score = 100;
    const evidence: AIEvidence[] = [];

    const temp = gpu.sensors.temperatureC;
    const util = gpu.sensors.gpuUtilization;
    const memUtil = gpu.sensors.memoryUtilization;
    const power = gpu.sensors.powerDrawW;

    if (temp?.supported && temp.value !== undefined) {
      metrics.push(this.makeMetric('Temperature', temp, temp.value < this.config.thermalThresholds.gpuWarningC, this.trendHistory.computeTrend('gpu', 'temperatureC')));
      evidence.push(makeEvidence(temp.source, 'temperatureC', temp));
      if (temp.value >= this.config.thermalThresholds.gpuCriticalC) {
        score -= 65;
        issues.push(this.makeIssue('gpu-temp-critical', 'Critical GPU Temperature', `GPU temperature is ${temp.value.toFixed(0)}°C.`, 'critical', [makeEvidence(temp.source, 'temperatureC', temp)], 0.95));
      } else if (temp.value >= this.config.thermalThresholds.gpuWarningC) {
        score -= 35;
        issues.push(this.makeIssue('gpu-temp-high', 'High GPU Temperature', `GPU temperature is ${temp.value.toFixed(0)}°C.`, 'high', [makeEvidence(temp.source, 'temperatureC', temp)], 0.9));
      } else {
        strengths.push(`GPU temperature is normal (${temp.value.toFixed(0)}°C)`);
      }
    } else {
      score -= 5;
      issues.push(this.makeIssue('gpu-temp-missing', 'GPU Temperature Sensor Missing', 'GPU temperature sensor is not available.', 'info', [], 0.5));
    }

    if (util?.supported && util.value !== undefined) {
      metrics.push(this.makeMetric('GPU Utilization', util, util.value < this.config.utilizationThresholds.gpuHighPercent, this.trendHistory.computeTrend('gpu', 'utilization')));
      if (util.value >= this.config.utilizationThresholds.gpuHighPercent) {
        score -= 10;
        issues.push(this.makeIssue('gpu-util-high', 'High GPU Utilization', `GPU utilization is ${util.value.toFixed(0)}%.`, 'medium', [makeEvidence(util.source, 'gpuUtilization', util)], 0.85));
      } else if (util.value > 10 && util.value < 50) {
        issues.push(this.makeIssue('gpu-util-background', 'Background GPU Usage', `GPU utilization is ${util.value.toFixed(0)}% without foreground load.`, 'low', [makeEvidence(util.source, 'gpuUtilization', util)], 0.7));
      } else {
        strengths.push(`GPU utilization is low (${util.value.toFixed(0)}%)`);
      }
    }

    if (memUtil?.supported && memUtil.value !== undefined) {
      metrics.push(this.makeMetric('VRAM Utilization', memUtil, memUtil.value < 90));
      if (memUtil.value >= 90) {
        score -= 15;
        issues.push(this.makeIssue('gpu-vram-pressure', 'VRAM Pressure', `VRAM usage is ${memUtil.value.toFixed(0)}%.`, 'medium', [makeEvidence(memUtil.source, 'memoryUtilization', memUtil)], 0.8));
      }
    }

    if (power?.supported && power.value !== undefined) {
      metrics.push(this.makeMetric('Power Draw', power, true, this.trendHistory.computeTrend('gpu', 'powerDrawW')));
    }

    score = Math.max(0, Math.min(100, score));
    const trend = this.trendHistory.computeTrend('gpu', 'temperatureC');
    const worstSeverity = issues.reduce<AISeverity>((s, i) => this.worseSeverity(s, i.severity), 'info' as AISeverity);

    return {
      category: 'gpu',
      health: this.scoreToHealthLevel(score),
      healthScore: score,
      performance: util?.supported && util.value !== undefined ? util.value >= 90 ? 'fair' : 'good' : 'unknown',
      efficiency: score >= 80 ? 'excellent' : score >= 60 ? 'good' : 'poor',
      reliability: score >= 70 ? 'high' : 'medium',
      trend,
      confidence: evidence.length > 0 ? Math.min(0.95, 0.5 + evidence.length * 0.15) : 0.3,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      issues,
      strengths,
      metrics,
    };
  }

  private worseSeverity(a: AISeverity, b: AISeverity): AISeverity {
    const order: AISeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
}

// ── Memory Analyzer ──────────────────────────────────────────────────

export class MemoryAnalyzer extends BaseAnalyzer<RAMComponent> {
  analyze(ram: RAMComponent): ComponentAnalysis {
    const issues: ComponentIssue[] = [];
    const strengths: string[] = [];
    const metrics: ComponentMetric[] = [];
    let score = 100;
    const evidence: AIEvidence[] = [];

    const used = ram.info.usedMB;
    const total = ram.info.installedMB;
    const pressure = ram.info.memoryPressure;
    const available = ram.info.availableMB;
    const cached = ram.info.cachedMB;

    if (used?.supported && used.value !== undefined && total > 0) {
      const pct = (used.value / total) * 100;
      metrics.push(this.makeMetric('Memory Usage', used, pct < this.config.utilizationThresholds.ramHighPercent, this.trendHistory.computeTrend('ram', 'usedMB')));
      evidence.push(makeEvidence(used.source, 'usedMB', used));
      if (pct >= this.config.utilizationThresholds.ramPressurePercent) {
        score -= 30;
        issues.push(this.makeIssue('ram-pressure', 'Memory Pressure', `Memory usage is ${pct.toFixed(0)}%, exceeding pressure threshold.`, 'high', [makeEvidence(used.source, 'usedMB', used)], 0.9));
      } else if (pct >= this.config.utilizationThresholds.ramHighPercent) {
        score -= 15;
        issues.push(this.makeIssue('ram-high-usage', 'High Memory Usage', `Memory usage is ${pct.toFixed(0)}%.`, 'medium', [makeEvidence(used.source, 'usedMB', used)], 0.85));
      } else {
        strengths.push(`Memory usage is healthy at ${pct.toFixed(0)}%`);
      }
    }

    if (pressure?.supported && pressure.value !== undefined) {
      metrics.push(this.makeMetric('Memory Pressure', pressure, pressure.value < this.config.utilizationThresholds.ramPressurePercent, this.trendHistory.computeTrend('ram', 'memoryPressure')));
      if (pressure.value >= this.config.utilizationThresholds.ramPressurePercent) {
        score -= 10;
        issues.push(this.makeIssue('ram-pressure-high', 'High Memory Pressure', `Memory pressure is ${pressure.value.toFixed(0)}%.`, 'high', [makeEvidence(pressure.source, 'memoryPressure', pressure)], 0.88));
      }
    }

    if (available?.supported && available.value !== undefined) {
      metrics.push(this.makeMetric('Available Memory', available, true));
    }
    if (cached?.supported && cached.value !== undefined) {
      metrics.push(this.makeMetric('Cached Memory', cached, true));
    }

    score = Math.max(0, Math.min(100, score));
    const trend = this.trendHistory.computeTrend('ram', 'usedMB');
    const worstSeverity = issues.reduce<AISeverity>((s, i) => this.worseSeverity(s, i.severity), 'info' as AISeverity);

    return {
      category: 'ram',
      health: this.scoreToHealthLevel(score),
      healthScore: score,
      performance: score >= 80 ? 'optimal' : score >= 60 ? 'good' : 'fair',
      efficiency: score >= 80 ? 'excellent' : 'good',
      reliability: 'high',
      trend,
      confidence: evidence.length > 0 ? Math.min(0.9, 0.5 + evidence.length * 0.15) : 0.3,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      issues,
      strengths,
      metrics,
    };
  }

  private worseSeverity(a: AISeverity, b: AISeverity): AISeverity {
    const order: AISeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
}

// ── Storage Analyzer ─────────────────────────────────────────────────

export class StorageAnalyzer extends BaseAnalyzer<StorageComponent> {
  analyze(storage: StorageComponent): ComponentAnalysis {
    const issues: ComponentIssue[] = [];
    const strengths: string[] = [];
    const metrics: ComponentMetric[] = [];
    let score = 100;
    const evidence: AIEvidence[] = [];

    const health = storage.sensors.healthPercent;
    const lifetime = storage.sensors.lifetimeRemainingPercent;
    const temp = storage.sensors.temperatureC;
    const usedBytes = storage.info.usedBytes;
    const freeBytes = storage.info.freeBytes;
    const capacity = storage.info.capacityBytes;

    if (health?.supported && health.value !== undefined) {
      metrics.push(this.makeMetric('SMART Health', health, health.value >= this.config.storageThresholds.smartWarningPercent, this.trendHistory.computeTrend('storage', 'healthPercent')));
      evidence.push(makeEvidence(health.source, 'healthPercent', health));
      if (health.value < this.config.storageThresholds.smartCriticalPercent) {
        score -= 70;
        issues.push(this.makeIssue('storage-smart-critical', 'Critical SMART Health', `Drive health is ${health.value.toFixed(0)}%, below critical threshold.`, 'critical', [makeEvidence(health.source, 'healthPercent', health)], 0.95));
      } else if (health.value < this.config.storageThresholds.smartWarningPercent) {
        score -= 40;
        issues.push(this.makeIssue('storage-smart-degraded', 'SMART Degradation', `Drive health is ${health.value.toFixed(0)}%.`, 'high', [makeEvidence(health.source, 'healthPercent', health)], 0.9));
      } else {
        strengths.push(`Drive health is good (${health.value.toFixed(0)}%)`);
      }
    }

    if (lifetime?.supported && lifetime.value !== undefined) {
      metrics.push(this.makeMetric('Lifetime Remaining', lifetime, lifetime.value > 20));
      if (lifetime.value < 10) {
        score -= 20;
        issues.push(this.makeIssue('storage-lifetime-low', 'Low Lifetime Remaining', `Only ${lifetime.value.toFixed(0)}% lifetime remaining.`, 'high', [makeEvidence(lifetime.source, 'lifetimeRemainingPercent', lifetime)], 0.85));
      }
    }

    if (temp?.supported && temp.value !== undefined) {
      metrics.push(this.makeMetric('Temperature', temp, temp.value < this.config.thermalThresholds.storageWarningC, this.trendHistory.computeTrend('storage', 'temperatureC')));
      if (temp.value >= this.config.thermalThresholds.storageCriticalC) {
        score -= 20;
        issues.push(this.makeIssue('storage-temp-critical', 'Critical Drive Temperature', `Drive temperature is ${temp.value.toFixed(0)}°C.`, 'critical', [makeEvidence(temp.source, 'temperatureC', temp)], 0.9));
      } else if (temp.value >= this.config.thermalThresholds.storageWarningC) {
        score -= 10;
        issues.push(this.makeIssue('storage-temp-high', 'High Drive Temperature', `Drive temperature is ${temp.value.toFixed(0)}°C.`, 'medium', [makeEvidence(temp.source, 'temperatureC', temp)], 0.85));
      }
    }

    if (freeBytes?.supported && freeBytes.value !== undefined && capacity > 0) {
      const freePct = (freeBytes.value / capacity) * 100;
      metrics.push(this.makeMetric('Free Space', freeBytes, freePct > this.config.storageThresholds.lowFreeSpacePercent));
      if (freePct < this.config.storageThresholds.lowFreeSpacePercent) {
        score -= 15;
        issues.push(this.makeIssue('storage-low-space', 'Low Free Space', `Only ${freePct.toFixed(0)}% free space remaining.`, 'medium', [makeEvidence(freeBytes.source, 'freeBytes', freeBytes)], 0.8));
      }
    }

    if (usedBytes?.supported && usedBytes.value !== undefined) {
      metrics.push(this.makeMetric('Used Space', usedBytes, true));
    }

    score = Math.max(0, Math.min(100, score));
    const trend = this.trendHistory.computeTrend('storage', 'healthPercent');
    const worstSeverity = issues.reduce<AISeverity>((s, i) => this.worseSeverity(s, i.severity), 'info' as AISeverity);

    return {
      category: 'storage',
      health: this.scoreToHealthLevel(score),
      healthScore: score,
      performance: 'good',
      efficiency: 'good',
      reliability: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
      trend,
      confidence: evidence.length > 0 ? Math.min(0.95, 0.5 + evidence.length * 0.15) : 0.3,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      issues,
      strengths,
      metrics,
    };
  }

  private worseSeverity(a: AISeverity, b: AISeverity): AISeverity {
    const order: AISeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
}

// ── Battery Analyzer ─────────────────────────────────────────────────

export class BatteryAnalyzer extends BaseAnalyzer<BatteryComponent> {
  analyze(battery: BatteryComponent): ComponentAnalysis {
    const issues: ComponentIssue[] = [];
    const strengths: string[] = [];
    const metrics: ComponentMetric[] = [];
    let score = 100;
    const evidence: AIEvidence[] = [];

    const charge = battery.info.currentChargePercent;
    const wear = battery.info.wearLevelPercent;
    const runtime = battery.info.estimatedRuntimeMinutes;
    const status = battery.info.chargingStatus;

    if (wear?.supported && wear.value !== undefined) {
      metrics.push(this.makeMetric('Wear Level', wear, wear.value < this.config.batteryThresholds.wearWarningPercent, this.trendHistory.computeTrend('battery', 'wearPercent')));
      evidence.push(makeEvidence(wear.source, 'wearLevelPercent', wear));
      if (wear.value >= this.config.batteryThresholds.wearCriticalPercent) {
        score -= 30;
        issues.push(this.makeIssue('battery-wear-critical', 'Critical Battery Wear', `Battery wear is ${wear.value.toFixed(0)}%.`, 'high', [makeEvidence(wear.source, 'wearLevelPercent', wear)], 0.9));
      } else if (wear.value >= this.config.batteryThresholds.wearWarningPercent) {
        score -= 15;
        issues.push(this.makeIssue('battery-wear-warning', 'Battery Wear Warning', `Battery wear is ${wear.value.toFixed(0)}%.`, 'medium', [makeEvidence(wear.source, 'wearLevelPercent', wear)], 0.85));
      } else {
        strengths.push(`Battery wear is low (${wear.value.toFixed(0)}%)`);
      }
    }

    if (charge?.supported && charge.value !== undefined) {
      metrics.push(this.makeMetric('Charge Level', charge, charge.value > this.config.batteryThresholds.lowChargePercent, this.trendHistory.computeTrend('battery', 'chargePercent')));
      if (charge.value < this.config.batteryThresholds.lowChargePercent) {
        score -= 10;
        issues.push(this.makeIssue('battery-low-charge', 'Low Battery Charge', `Battery charge is ${charge.value.toFixed(0)}%.`, 'medium', [makeEvidence(charge.source, 'currentChargePercent', charge)], 0.8));
      }
    }

    if (runtime?.supported && runtime.value !== undefined) {
      metrics.push(this.makeMetric('Estimated Runtime', runtime, true));
    }
    if (status?.supported && status.value !== undefined) {
      metrics.push(this.makeMetric('Charging Status', status, true));
    }

    score = Math.max(0, Math.min(100, score));
    const trend = this.trendHistory.computeTrend('battery', 'wearPercent');
    const worstSeverity = issues.reduce<AISeverity>((s, i) => this.worseSeverity(s, i.severity), 'info' as AISeverity);

    return {
      category: 'battery',
      health: this.scoreToHealthLevel(score),
      healthScore: score,
      performance: 'good',
      efficiency: wear?.supported && wear.value !== undefined ? wear.value < 15 ? 'excellent' : 'fair' : 'unknown',
      reliability: score >= 70 ? 'high' : 'medium',
      trend,
      confidence: evidence.length > 0 ? Math.min(0.9, 0.5 + evidence.length * 0.15) : 0.3,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      issues,
      strengths,
      metrics,
    };
  }

  private worseSeverity(a: AISeverity, b: AISeverity): AISeverity {
    const order: AISeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
}

// ── Network Analyzer ─────────────────────────────────────────────────

export class NetworkAnalyzer extends BaseAnalyzer<NetworkComponent> {
  analyze(network: NetworkComponent): ComponentAnalysis {
    const issues: ComponentIssue[] = [];
    const strengths: string[] = [];
    const metrics: ComponentMetric[] = [];
    let score = 100;
    const evidence: AIEvidence[] = [];

    const download = network.sensors.downloadMbps;
    const upload = network.sensors.uploadMbps;
    const usage = network.sensors.usagePercent;
    const signal = network.info.signalStrengthPercent;

    if (download?.supported && download.value !== undefined) {
      metrics.push(this.makeMetric('Download Speed', download, true, this.trendHistory.computeTrend('network', 'downloadMbps')));
      if (download.value > 0 && download.value > (network.info.linkSpeedMbps ?? 1000) * 0.8) {
        issues.push(this.makeIssue('net-high-download', 'High Bandwidth Usage', `Download is ${download.value.toFixed(1)} Mbps.`, 'low', [makeEvidence(download.source, 'downloadMbps', download)], 0.7));
      }
    }

    if (upload?.supported && upload.value !== undefined) {
      metrics.push(this.makeMetric('Upload Speed', upload, true, this.trendHistory.computeTrend('network', 'uploadMbps')));
    }

    if (usage?.supported && usage.value !== undefined) {
      metrics.push(this.makeMetric('Network Usage', usage, usage.value < this.config.utilizationThresholds.networkHighPercent));
      if (usage.value >= this.config.utilizationThresholds.networkHighPercent) {
        score -= 10;
        issues.push(this.makeIssue('net-high-usage', 'High Network Usage', `Network usage is ${usage.value.toFixed(0)}%.`, 'low', [makeEvidence(usage.source, 'usagePercent', usage)], 0.7));
      }
    }

    if (signal?.supported && signal.value !== undefined) {
      metrics.push(this.makeMetric('Wi-Fi Signal', signal, signal.value > 30));
      if (signal.value < 30) {
        score -= 15;
        issues.push(this.makeIssue('net-weak-signal', 'Weak Wi-Fi Signal', `Signal strength is ${signal.value.toFixed(0)}%.`, 'medium', [makeEvidence(signal.source, 'signalStrengthPercent', signal)], 0.8));
      } else {
        strengths.push(`Wi-Fi signal is good (${signal.value.toFixed(0)}%)`);
      }
    }

    score = Math.max(0, Math.min(100, score));
    const worstSeverity = issues.reduce<AISeverity>((s, i) => this.worseSeverity(s, i.severity), 'info' as AISeverity);

    return {
      category: 'network',
      health: this.scoreToHealthLevel(score),
      healthScore: score,
      performance: 'good',
      efficiency: 'good',
      reliability: 'high',
      trend: 'stable',
      confidence: evidence.length > 0 ? 0.8 : 0.4,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      issues,
      strengths,
      metrics,
    };
  }

  private worseSeverity(a: AISeverity, b: AISeverity): AISeverity {
    const order: AISeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
}

// ── Cooling Analyzer ─────────────────────────────────────────────────

export class CoolingAnalyzer extends BaseAnalyzer<CoolingComponent> {
  analyze(cooling: CoolingComponent): ComponentAnalysis {
    const issues: ComponentIssue[] = [];
    const strengths: string[] = [];
    const metrics: ComponentMetric[] = [];
    let score = 100;

    for (const fan of cooling.info.fans) {
      if (fan.rpm?.supported && fan.rpm.value !== undefined) {
        metrics.push(this.makeMetric(`${fan.name} RPM`, fan.rpm, fan.rpm.value > 0, this.trendHistory.computeTrend('cooling', `fan:${fan.name}`)));
        if (fan.rpm.value === 0) {
          score -= 65;
          issues.push(this.makeIssue(`fan-stopped-${fan.name}`, 'Fan Not Spinning', `Fan "${fan.name}" reports 0 RPM.`, 'critical', [makeEvidence(fan.rpm.source, 'rpm', fan.rpm)], 0.95));
        } else {
          strengths.push(`Fan "${fan.name}" is operational (${fan.rpm.value} RPM)`);
        }
      }
    }

    if (cooling.sensorStatus.availability !== 'available') {
      score -= 10;
      issues.push(this.makeIssue('cooling-sensors-unavailable', 'Cooling Sensors Unavailable', 'Cooling sensor data is not available.', 'info', [], 0.5));
    }

    score = Math.max(0, Math.min(100, score));
    const worstSeverity = issues.reduce<AISeverity>((s, i) => this.worseSeverity(s, i.severity), 'info' as AISeverity);

    return {
      category: 'cooling',
      health: this.scoreToHealthLevel(score),
      healthScore: score,
      performance: score >= 80 ? 'optimal' : 'poor',
      efficiency: 'good',
      reliability: score >= 70 ? 'high' : 'low',
      trend: 'stable',
      confidence: 0.8,
      risk: severityToRisk(worstSeverity),
      urgency: severityToUrgency(worstSeverity),
      issues,
      strengths,
      metrics,
    };
  }

  private worseSeverity(a: AISeverity, b: AISeverity): AISeverity {
    const order: AISeverity[] = ['info', 'low', 'medium', 'high', 'critical'];
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }
}

// ── Thermal Analyzer ─────────────────────────────────────────────────

export class ThermalAnalyzer {
  constructor(private config: HardwareAIConfiguration) {}

  analyze(components: HardwareComponent[]): ThermalAnalysisResult[] {
    const results: ThermalAnalysisResult[] = [];

    for (const component of components) {
      switch (component.category) {
        case 'cpu': {
          const cpu = component as CPUComponent;
          results.push(this.analyzeThermal('cpu', cpu.sensors.temperatureC, cpu.sensors.thermalThrottling));
          break;
        }
        case 'gpu': {
          const gpu = component as GPUComponent;
          results.push(this.analyzeThermal('gpu', gpu.sensors.temperatureC));
          break;
        }
        case 'storage': {
          const storage = component as StorageComponent;
          results.push(this.analyzeThermal('storage', storage.sensors.temperatureC));
          break;
        }
      }
    }

    return results;
  }

  private analyzeThermal(
    category: HardwareCategory,
    tempReading: SensorReading<number> | undefined,
    throttlingReading?: SensorReading<boolean>,
  ): ThermalAnalysisResult {
    const anomalies: ThermalAnomaly[] = [];
    let currentTemp: number | null = null;
    let throttling = false;
    let confidence = 0.5;

    if (tempReading?.supported && tempReading.value !== undefined) {
      currentTemp = tempReading.value;
      confidence = 0.9;

      const thresholds = this.config.thermalThresholds;
      const warningC = category === 'cpu' ? thresholds.cpuWarningC : category === 'gpu' ? thresholds.gpuWarningC : thresholds.storageWarningC;
      const criticalC = category === 'cpu' ? thresholds.cpuCriticalC : category === 'gpu' ? thresholds.gpuCriticalC : thresholds.storageCriticalC;

      if (currentTemp >= criticalC) {
        anomalies.push({
          type: 'high_temp',
          description: `${category.toUpperCase()} temperature is ${currentTemp.toFixed(0)}°C, exceeding critical threshold of ${criticalC}°C.`,
          severity: 'critical',
          evidence: [makeEvidence(tempReading.source, 'temperatureC', tempReading)],
        });
      } else if (currentTemp >= warningC) {
        anomalies.push({
          type: 'high_temp',
          description: `${category.toUpperCase()} temperature is ${currentTemp.toFixed(0)}°C, above warning threshold of ${warningC}°C.`,
          severity: 'high',
          evidence: [makeEvidence(tempReading.source, 'temperatureC', tempReading)],
        });
      }

      if (currentTemp > thresholds.abnormalIdleC && category === 'cpu') {
        anomalies.push({
          type: 'abnormal_idle',
          description: `CPU idle temperature appears abnormally high at ${currentTemp.toFixed(0)}°C.`,
          severity: 'medium',
          evidence: [makeEvidence(tempReading.source, 'temperatureC', tempReading)],
        });
      }
    } else {
      anomalies.push({
        type: 'missing_sensors',
        description: `${category.toUpperCase()} temperature sensor is not available.`,
        severity: 'info',
        evidence: [],
      });
    }

    if (throttlingReading?.supported && throttlingReading.value) {
      throttling = true;
      anomalies.push({
        type: 'throttling',
        description: `${category.toUpperCase()} is actively thermal throttling.`,
        severity: 'critical',
        evidence: [makeEvidence(throttlingReading.source, 'thermalThrottling', throttlingReading)],
      });
    }

    return {
      category,
      currentTempC: currentTemp,
      idleTempC: null,
      tempTrend: 'unknown',
      throttling,
      coolingAdequate: !throttling && (currentTemp === null || currentTemp < (category === 'cpu' ? this.config.thermalThresholds.cpuWarningC : category === 'gpu' ? this.config.thermalThresholds.gpuWarningC : this.config.thermalThresholds.storageWarningC)),
      anomalies,
      confidence,
    };
  }
}

// ── Power Analyzer ───────────────────────────────────────────────────

export class PowerAnalyzer extends BaseAnalyzer<HardwareComponent> {
  analyze(_component: HardwareComponent): ComponentAnalysis {
    return {
      category: 'power_supply',
      health: 'unknown',
      healthScore: 75,
      performance: 'unknown',
      efficiency: 'unknown',
      reliability: 'medium',
      trend: 'stable',
      confidence: 0.3,
      risk: 'none',
      urgency: 'none',
      issues: [],
      strengths: [],
      metrics: [],
    };
  }
}
