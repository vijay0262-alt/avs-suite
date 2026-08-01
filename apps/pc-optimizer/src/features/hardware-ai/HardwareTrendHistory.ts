/**
 * HardwareTrendHistory — maintains historical sensor data for trend detection.
 *
 * Records data points per category/metric and computes trend direction
 * (improving, stable, degrading, rapid_degradation).
 */
import type {
  TrendDataPoint,
  TrendRecord,
  TrendDirection,
  TrendSummary,
} from './types';
import type {
  HardwareSnapshot,
  HardwareCategory,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  NetworkComponent,
  BatteryComponent,
  CoolingComponent,
  OSComponent,
} from '../hardware-center/types';

export class HardwareTrendHistory {
  private history: Map<string, TrendDataPoint[]> = new Map();
  private readonly maxPoints: number;
  private readonly minDataPoints: number;

  constructor(maxPoints = 100, minDataPoints = 3) {
    this.maxPoints = maxPoints;
    this.minDataPoints = minDataPoints;
  }

  /** Record a single metric data point. */
  record(category: HardwareCategory, metric: string, point: TrendDataPoint): void {
    const key = `${category}:${metric}`;
    const points = this.history.get(key) ?? [];
    points.push(point);
    if (points.length > this.maxPoints) {
      points.shift();
    }
    this.history.set(key, points);
  }

  /** Extract and record all metrics from a snapshot. */
  recordSnapshot(snapshot: HardwareSnapshot): void {
    const ts = snapshot.timestamp;
    for (const component of snapshot.components) {
      this.recordComponent(component, ts);
    }
  }

  private recordComponent(component: HardwareSnapshot['components'][number], ts: number): void {
    switch (component.category) {
      case 'cpu': {
        const cpu = component as CPUComponent;
        if (cpu.sensors.temperatureC?.supported && cpu.sensors.temperatureC.value !== undefined) {
          this.record('cpu', 'temperatureC', { timestamp: ts, value: cpu.sensors.temperatureC.value, unit: '°C', source: cpu.sensors.temperatureC.source });
        }
        if (cpu.info.packageUtilization?.supported && cpu.info.packageUtilization.value !== undefined) {
          this.record('cpu', 'utilization', { timestamp: ts, value: cpu.info.packageUtilization.value, unit: '%', source: cpu.info.packageUtilization.source });
        }
        if (cpu.sensors.powerDrawW?.supported && cpu.sensors.powerDrawW.value !== undefined) {
          this.record('cpu', 'powerDrawW', { timestamp: ts, value: cpu.sensors.powerDrawW.value, unit: 'W', source: cpu.sensors.powerDrawW.source });
        }
        break;
      }
      case 'gpu': {
        const gpu = component as GPUComponent;
        if (gpu.sensors.temperatureC?.supported && gpu.sensors.temperatureC.value !== undefined) {
          this.record('gpu', 'temperatureC', { timestamp: ts, value: gpu.sensors.temperatureC.value, unit: '°C', source: gpu.sensors.temperatureC.source });
        }
        if (gpu.sensors.gpuUtilization?.supported && gpu.sensors.gpuUtilization.value !== undefined) {
          this.record('gpu', 'utilization', { timestamp: ts, value: gpu.sensors.gpuUtilization.value, unit: '%', source: gpu.sensors.gpuUtilization.source });
        }
        if (gpu.sensors.powerDrawW?.supported && gpu.sensors.powerDrawW.value !== undefined) {
          this.record('gpu', 'powerDrawW', { timestamp: ts, value: gpu.sensors.powerDrawW.value, unit: 'W', source: gpu.sensors.powerDrawW.source });
        }
        break;
      }
      case 'ram': {
        const ram = component as RAMComponent;
        if (ram.info.usedMB?.supported && ram.info.usedMB.value !== undefined) {
          this.record('ram', 'usedMB', { timestamp: ts, value: ram.info.usedMB.value, unit: 'MB', source: ram.info.usedMB.source });
        }
        if (ram.info.memoryPressure?.supported && ram.info.memoryPressure.value !== undefined) {
          this.record('ram', 'memoryPressure', { timestamp: ts, value: ram.info.memoryPressure.value, unit: '%', source: ram.info.memoryPressure.source });
        }
        break;
      }
      case 'storage': {
        const storage = component as StorageComponent;
        if (storage.sensors.temperatureC?.supported && storage.sensors.temperatureC.value !== undefined) {
          this.record('storage', 'temperatureC', { timestamp: ts, value: storage.sensors.temperatureC.value, unit: '°C', source: storage.sensors.temperatureC.source });
        }
        if (storage.sensors.healthPercent?.supported && storage.sensors.healthPercent.value !== undefined) {
          this.record('storage', 'healthPercent', { timestamp: ts, value: storage.sensors.healthPercent.value, unit: '%', source: storage.sensors.healthPercent.source });
        }
        break;
      }
      case 'network': {
        const net = component as NetworkComponent;
        if (net.sensors.downloadMbps?.supported && net.sensors.downloadMbps.value !== undefined) {
          this.record('network', 'downloadMbps', { timestamp: ts, value: net.sensors.downloadMbps.value, unit: 'Mbps', source: net.sensors.downloadMbps.source });
        }
        if (net.sensors.uploadMbps?.supported && net.sensors.uploadMbps.value !== undefined) {
          this.record('network', 'uploadMbps', { timestamp: ts, value: net.sensors.uploadMbps.value, unit: 'Mbps', source: net.sensors.uploadMbps.source });
        }
        break;
      }
      case 'battery': {
        const battery = component as BatteryComponent;
        if (battery.info.currentChargePercent?.supported && battery.info.currentChargePercent.value !== undefined) {
          this.record('battery', 'chargePercent', { timestamp: ts, value: battery.info.currentChargePercent.value, unit: '%', source: battery.info.currentChargePercent.source });
        }
        if (battery.info.wearLevelPercent?.supported && battery.info.wearLevelPercent.value !== undefined) {
          this.record('battery', 'wearPercent', { timestamp: ts, value: battery.info.wearLevelPercent.value, unit: '%', source: battery.info.wearLevelPercent.source });
        }
        break;
      }
      case 'cooling': {
        const cooling = component as CoolingComponent;
        for (const fan of cooling.info.fans) {
          if (fan.rpm?.supported && fan.rpm.value !== undefined) {
            this.record('cooling', `fan:${fan.name}`, { timestamp: ts, value: fan.rpm.value, unit: 'RPM', source: fan.rpm.source });
          }
        }
        break;
      }
      case 'operating_system': {
        const os = component as OSComponent;
        if (os.info.uptimeSeconds?.supported && os.info.uptimeSeconds.value !== undefined) {
          this.record('operating_system', 'uptime', { timestamp: ts, value: os.info.uptimeSeconds.value, unit: 's', source: os.info.uptimeSeconds.source });
        }
        break;
      }
    }
  }

  /** Get all data points for a specific metric. */
  getPoints(category: HardwareCategory, metric: string): TrendDataPoint[] {
    return this.history.get(`${category}:${metric}`) ?? [];
  }

  /** Compute trend direction for a specific metric. */
  computeTrend(category: HardwareCategory, metric: string): TrendDirection {
    const points = this.getPoints(category, metric);
    if (points.length < this.minDataPoints) return 'unknown';

    const recent = points.slice(-Math.min(points.length, 10));
    const first = recent[0]!;
    const last = recent[recent.length - 1]!;
    const change = last.value - first.value;
    const changePercent = first.value !== 0 ? (change / Math.abs(first.value)) * 100 : 0;

    // Determine if this is a "higher is better" or "lower is better" metric
    const lowerIsBetter = ['temperatureC', 'powerDrawW', 'usedMB', 'memoryPressure', 'wearPercent', 'utilization'].includes(metric);

    const absChange = Math.abs(changePercent);
    if (absChange < 5) return 'stable';

    if (lowerIsBetter) {
      if (changePercent > 20) return 'rapid_degradation';
      if (changePercent > 5) return 'degrading';
      if (changePercent < -5) return 'improving';
    } else {
      if (changePercent < -20) return 'rapid_degradation';
      if (changePercent < -5) return 'degrading';
      if (changePercent > 5) return 'improving';
    }

    return 'stable';
  }

  /** Get a full trend record for a metric. */
  getTrendRecord(category: HardwareCategory, metric: string): TrendRecord | null {
    const points = this.getPoints(category, metric);
    if (points.length < this.minDataPoints) return null;

    const direction = this.computeTrend(category, metric);
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const changePercent = first.value !== 0 ? ((last.value - first.value) / Math.abs(first.value)) * 100 : 0;

    return {
      category,
      metric,
      direction,
      changePercent,
      duration: last.timestamp - first.timestamp,
      dataPoints: points,
      confidence: Math.min(1, points.length / 10),
    };
  }

  /** Get trend summaries for all categories. */
  getAllTrendSummaries(): TrendSummary[] {
    const categories = new Set<HardwareCategory>();
    for (const key of this.history.keys()) {
      categories.add(key.split(':')[0] as HardwareCategory);
    }

    const summaries: TrendSummary[] = [];
    for (const category of categories) {
      const metrics: Record<string, TrendDirection> = {};
      const notableChanges: string[] = [];

      for (const key of this.history.keys()) {
        if (!key.startsWith(`${category}:`)) continue;
        const metric = key.split(':').slice(1).join(':');
        const direction = this.computeTrend(category, metric);
        metrics[metric] = direction;
        if (direction === 'degrading' || direction === 'rapid_degradation') {
          notableChanges.push(`${metric} is ${direction.replace('_', ' ')}`);
        }
      }

      // Overall trend is the worst among all metrics
      const trends = Object.values(metrics);
      let overall: TrendDirection = 'stable';
      if (trends.includes('rapid_degradation')) overall = 'rapid_degradation';
      else if (trends.includes('degrading')) overall = 'degrading';
      else if (trends.includes('improving')) overall = 'improving';

      summaries.push({ category, overallTrend: overall, metrics, notableChanges });
    }

    return summaries;
  }

  clear(): void {
    this.history.clear();
  }

  size(): number {
    return this.history.size;
  }
}
