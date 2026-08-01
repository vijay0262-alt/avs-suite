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
            value: temp !== undefined ? `${temp.toFixed(0)}°C` : 'N/A',
            level: this.tempLevel(temp, 75, 90),
          });
          if (util !== undefined) {
            highlights.push({
              category: 'cpu',
              label: 'CPU Utilization',
              value: `${util.toFixed(0)}%`,
              level: this.utilLevel(util),
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
            value: temp !== undefined ? `${temp.toFixed(0)}°C` : 'N/A',
            level: this.tempLevel(temp, 70, 85),
          });
          if (util !== undefined) {
            highlights.push({
              category: 'gpu',
              label: 'GPU Utilization',
              value: `${util.toFixed(0)}%`,
              level: this.utilLevel(util),
            });
          }
          break;
        }
        case 'ram': {
          const ram = component as RAMComponent;
          const used = ram.info.usedMB;
          const total = ram.info.installedMB;
          if (used !== undefined && total > 0) {
            const pct = (used / total) * 100;
            highlights.push({
              category: 'ram',
              label: 'Memory Usage',
              value: `${(used / 1024).toFixed(1)} / ${(total / 1024).toFixed(0)} GB`,
              level: this.utilLevel(pct),
            });
          }
          break;
        }
        case 'storage': {
          const storage = component as StorageComponent;
          if (storage.sensors.healthPercent !== undefined) {
            highlights.push({
              category: 'storage',
              label: `${storage.info.model} Health`,
              value: `${storage.sensors.healthPercent}%`,
              level: this.storageHealthLevel(storage.sensors.healthPercent),
            });
          }
          break;
        }
        case 'battery': {
          const battery = component as BatteryComponent;
          highlights.push({
            category: 'battery',
            label: 'Battery Charge',
            value: `${battery.info.currentChargePercent}%`,
            level: battery.info.currentChargePercent < 20 ? 'poor' : 'good',
          });
          if (battery.info.wearLevelPercent !== undefined) {
            highlights.push({
              category: 'battery',
              label: 'Battery Wear',
              value: `${battery.info.wearLevelPercent}%`,
              level: this.batteryWearLevel(battery.info.wearLevelPercent),
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
