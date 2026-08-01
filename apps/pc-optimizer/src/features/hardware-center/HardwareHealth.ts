/**
 * HardwareHealth — derives a health status from hardware components.
 *
 * Evaluates temperature, utilization, wear level, and sensor availability
 * to produce an overall health score and per-component health levels.
 */

import type {
  HardwareComponent,
  HardwareHealthStatus,
  HealthLevel,
  CPUComponent,
  GPUComponent,
  StorageComponent,
  BatteryComponent,
  CoolingComponent,
} from './types';

export class HardwareHealthEvaluator {
  evaluate(components: HardwareComponent[]): HardwareHealthStatus {
    const componentHealth: Record<string, { level: HealthLevel; issues: string[] }> = {};
    let totalScore = 0;
    let count = 0;

    for (const component of components) {
      const result = this.evaluateComponent(component);
      if (result) {
        componentHealth[component.category] = result;
        totalScore += this.levelToScore(result.level);
        count++;
      }
    }

    const score = count > 0 ? Math.round(totalScore / count) : 100;
    const overall = this.scoreToLevel(score);

    return {
      overall,
      score,
      components: componentHealth,
      lastUpdated: Date.now(),
    };
  }

  private evaluateComponent(
    component: HardwareComponent,
  ): { level: HealthLevel; issues: string[] } | null {
    switch (component.category) {
      case 'cpu':
        return this.evaluateCPU(component);
      case 'gpu':
        return this.evaluateGPU(component);
      case 'storage':
        return this.evaluateStorage(component);
      case 'battery':
        return this.evaluateBattery(component);
      case 'cooling':
        return this.evaluateCooling(component);
      default:
        return null;
    }
  }

  private evaluateCPU(cpu: CPUComponent): { level: HealthLevel; issues: string[] } {
    const issues: string[] = [];
    let level: HealthLevel = 'good';

    if (cpu.sensors.temperatureC !== undefined) {
      if (cpu.sensors.temperatureC >= 90) {
        level = 'critical';
        issues.push(`CPU temperature critical: ${cpu.sensors.temperatureC}°C`);
      } else if (cpu.sensors.temperatureC >= 75) {
        level = level === 'good' ? 'poor' : level;
        issues.push(`CPU temperature high: ${cpu.sensors.temperatureC}°C`);
      }
    }

    if (cpu.sensors.thermalThrottling) {
      level = 'poor';
      issues.push('CPU is thermal throttling');
    }

    if (cpu.sensorStatus.availability !== 'available') {
      issues.push(`CPU sensors ${cpu.sensorStatus.availability}`);
      if (level === 'good') level = 'fair';
    }

    return { level, issues };
  }

  private evaluateGPU(gpu: GPUComponent): { level: HealthLevel; issues: string[] } {
    const issues: string[] = [];
    let level: HealthLevel = 'good';

    if (gpu.sensors.temperatureC !== undefined) {
      if (gpu.sensors.temperatureC >= 85) {
        level = 'critical';
        issues.push(`GPU temperature critical: ${gpu.sensors.temperatureC}°C`);
      } else if (gpu.sensors.temperatureC >= 70) {
        level = level === 'good' ? 'poor' : level;
        issues.push(`GPU temperature high: ${gpu.sensors.temperatureC}°C`);
      }
    }

    if (gpu.sensorStatus.availability !== 'available') {
      issues.push(`GPU sensors ${gpu.sensorStatus.availability}`);
      if (level === 'good') level = 'fair';
    }

    return { level, issues };
  }

  private evaluateStorage(storage: StorageComponent): { level: HealthLevel; issues: string[] } {
    const issues: string[] = [];
    let level: HealthLevel = 'good';

    if (storage.sensors.healthPercent !== undefined) {
      if (storage.sensors.healthPercent < 20) {
        level = 'critical';
        issues.push(`Storage health critical: ${storage.sensors.healthPercent}%`);
      } else if (storage.sensors.healthPercent < 50) {
        level = 'poor';
        issues.push(`Storage health degraded: ${storage.sensors.healthPercent}%`);
      }
    }

    if (storage.sensors.lifetimeRemainingPercent !== undefined) {
      if (storage.sensors.lifetimeRemainingPercent < 10) {
        level = 'critical';
        issues.push(`Storage lifetime nearly exhausted: ${storage.sensors.lifetimeRemainingPercent}%`);
      }
    }

    if (storage.sensors.temperatureC !== undefined && storage.sensors.temperatureC >= 60) {
      level = level === 'good' ? 'poor' : level;
      issues.push(`Storage temperature high: ${storage.sensors.temperatureC}°C`);
    }

    return { level, issues };
  }

  private evaluateBattery(battery: BatteryComponent): { level: HealthLevel; issues: string[] } {
    const issues: string[] = [];
    let level: HealthLevel = 'good';

    if (battery.info.wearLevelPercent !== undefined) {
      if (battery.info.wearLevelPercent >= 50) {
        level = 'critical';
        issues.push(`Battery wear severe: ${battery.info.wearLevelPercent}%`);
      } else if (battery.info.wearLevelPercent >= 30) {
        level = 'poor';
        issues.push(`Battery wear significant: ${battery.info.wearLevelPercent}%`);
      } else if (battery.info.wearLevelPercent >= 15) {
        level = 'fair';
        issues.push(`Battery wear moderate: ${battery.info.wearLevelPercent}%`);
      }
    }

    return { level, issues };
  }

  private evaluateCooling(cooling: CoolingComponent): { level: HealthLevel; issues: string[] } {
    const issues: string[] = [];
    let level: HealthLevel = 'good';

    for (const fan of cooling.info.fans) {
      if (fan.rpm !== undefined && fan.rpm === 0) {
        level = 'critical';
        issues.push(`Fan "${fan.name}" not spinning (0 RPM)`);
      }
    }

    if (cooling.sensorStatus.availability !== 'available') {
      issues.push('Cooling sensors unavailable');
      if (level === 'good') level = 'fair';
    }

    return { level, issues };
  }

  private levelToScore(level: HealthLevel): number {
    switch (level) {
      case 'good': return 100;
      case 'fair': return 75;
      case 'poor': return 50;
      case 'critical': return 20;
      case 'unknown': return 50;
    }
  }

  private scoreToLevel(score: number): HealthLevel {
    if (score >= 90) return 'good';
    if (score >= 70) return 'fair';
    if (score >= 50) return 'poor';
    return 'critical';
  }
}
