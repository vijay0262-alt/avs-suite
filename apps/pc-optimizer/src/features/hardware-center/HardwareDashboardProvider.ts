/**
 * HardwareDashboardProvider — transforms raw hardware data into
 * dashboard-ready summaries with highlights and health overview.
 */

import type {
  HardwareSnapshot,
  HardwareDashboardData,
  HardwareDashboardHighlight,
  HardwareCategory,
  HealthLevel,
  HardwareComponent,
  CPUComponent,
  GPUComponent,
  RAMComponent,
  StorageComponent,
  BatteryComponent,
} from './types';
import { HardwareHealthEvaluator } from './HardwareHealth';

export class HardwareDashboardProvider {
  private readonly healthEvaluator = new HardwareHealthEvaluator();

  buildDashboard(snapshot: HardwareSnapshot, nextScanInMs?: number): HardwareDashboardData {
    const health = this.healthEvaluator.evaluate(snapshot.components);
    const categoriesCovered = snapshot.components.map((c) => c.category) as HardwareCategory[];
    const highlights = this.extractHighlights(snapshot.components);

    return {
      summary: {
        totalComponents: snapshot.components.length,
        categoriesCovered,
        overallHealth: health.overall,
        healthScore: health.score,
      },
      highlights,
      lastScanAt: snapshot.timestamp,
      nextScanInMs,
    };
  }

  private extractHighlights(components: HardwareComponent[]): HardwareDashboardHighlight[] {
    const highlights: HardwareDashboardHighlight[] = [];

    for (const component of components) {
      switch (component.category) {
        case 'cpu': {
          const cpu = component as CPUComponent;
          const temp = cpu.sensors.temperatureC;
          const util = cpu.info.packageUtilization;
          highlights.push({
            category: 'cpu',
            label: 'CPU Temperature',
            value: temp?.supported && temp.value !== undefined ? `${temp.value.toFixed(0)}°C` : 'N/A',
            level: this.tempLevel(temp?.supported ? temp.value : undefined, 75, 90),
          });
          if (util?.supported && util.value !== undefined) {
            highlights.push({
              category: 'cpu',
              label: 'CPU Utilization',
              value: `${util.value.toFixed(0)}%`,
              level: this.utilLevel(util.value),
            });
          }
          break;
        }
        case 'gpu': {
          const gpu = component as GPUComponent;
          const temp = gpu.sensors.temperatureC;
          const util = gpu.sensors.gpuUtilization;
          highlights.push({
            category: 'gpu',
            label: 'GPU Temperature',
            value: temp?.supported && temp.value !== undefined ? `${temp.value.toFixed(0)}°C` : 'N/A',
            level: this.tempLevel(temp?.supported ? temp.value : undefined, 70, 85),
          });
          if (util?.supported && util.value !== undefined) {
            highlights.push({
              category: 'gpu',
              label: 'GPU Utilization',
              value: `${util.value.toFixed(0)}%`,
              level: this.utilLevel(util.value),
            });
          }
          break;
        }
        case 'ram': {
          const ram = component as RAMComponent;
          const used = ram.info.usedMB;
          const total = ram.info.installedMB;
          if (used?.supported && used.value !== undefined && total > 0) {
            const pct = (used.value / total) * 100;
            highlights.push({
              category: 'ram',
              label: 'Memory Usage',
              value: `${(used.value / 1024).toFixed(1)} / ${(total / 1024).toFixed(0)} GB`,
              level: this.utilLevel(pct),
            });
          }
          break;
        }
        case 'storage': {
          const storage = component as StorageComponent;
          const health = storage.sensors.healthPercent;
          if (health?.supported && health.value !== undefined) {
            highlights.push({
              category: 'storage',
              label: `${storage.info.model} Health`,
              value: `${health.value}%`,
              level: this.storageHealthLevel(health.value),
            });
          }
          break;
        }
        case 'battery': {
          const battery = component as BatteryComponent;
          const charge = battery.info.currentChargePercent;
          if (charge?.supported && charge.value !== undefined) {
            highlights.push({
              category: 'battery',
              label: 'Battery Charge',
              value: `${charge.value}%`,
              level: charge.value < 20 ? 'poor' : 'good',
            });
          }
          const wear = battery.info.wearLevelPercent;
          if (wear?.supported && wear.value !== undefined) {
            highlights.push({
              category: 'battery',
              label: 'Battery Wear',
              value: `${wear.value}%`,
              level: this.batteryWearLevel(wear.value),
            });
          }
          break;
        }
      }
    }

    return highlights;
  }

  private tempLevel(temp: number | undefined, warn: number, crit: number): HealthLevel {
    if (temp === undefined) return 'unknown';
    if (temp >= crit) return 'critical';
    if (temp >= warn) return 'poor';
    return 'good';
  }

  private utilLevel(util: number): HealthLevel {
    if (util >= 90) return 'poor';
    if (util >= 70) return 'fair';
    return 'good';
  }

  private storageHealthLevel(health: number): HealthLevel {
    if (health < 20) return 'critical';
    if (health < 50) return 'poor';
    if (health < 80) return 'fair';
    return 'good';
  }

  private batteryWearLevel(wear: number): HealthLevel {
    if (wear >= 50) return 'critical';
    if (wear >= 30) return 'poor';
    if (wear >= 15) return 'fair';
    return 'good';
  }
}
