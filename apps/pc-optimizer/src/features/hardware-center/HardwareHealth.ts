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

    const temp = cpu.sensors.temperatureC;
    if (temp?.supported && temp.value !== undefined) {
      if (temp.value >= 90) {
        level = 'critical';
        issues.push(`CPU temperature critical: ${temp.value}°C`);
      } else if (temp.value >= 75) {
        level = level === 'good' ? 'poor' : level;
        issues.push(`CPU temperature high: ${temp.value}°C`);
      }
    }

    const throttling = cpu.sensors.thermalThrottling;
    if (throttling?.supported && throttling.value) {
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

    const temp = gpu.sensors.temperatureC;
    if (temp?.supported && temp.value !== undefined) {
      if (temp.value >= 85) {
        level = 'critical';
        issues.push(`GPU temperature critical: ${temp.value}°C`);
      } else if (temp.value >= 70) {
        level = level === 'good' ? 'poor' : level;
        issues.push(`GPU temperature high: ${temp.value}°C`);
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

    const health = storage.sensors.healthPercent;
    if (health?.supported && health.value !== undefined) {
      if (health.value < 20) {
        level = 'critical';
        issues.push(`Storage health critical: ${health.value}%`);
      } else if (health.value < 50) {
        level = 'poor';
        issues.push(`Storage health degraded: ${health.value}%`);
      }
    }

    const lifetime = storage.sensors.lifetimeRemainingPercent;
    if (lifetime?.supported && lifetime.value !== undefined) {
      if (lifetime.value < 10) {
        level = 'critical';
        issues.push(`Storage lifetime nearly exhausted: ${lifetime.value}%`);
      }
    }

    const temp = storage.sensors.temperatureC;
    if (temp?.supported && temp.value !== undefined && temp.value >= 60) {
      level = level === 'good' ? 'poor' : level;
      issues.push(`Storage temperature high: ${temp.value}°C`);
    }

    return { level, issues };
  }

  private evaluateBattery(battery: BatteryComponent): { level: HealthLevel; issues: string[] } {
    const issues: string[] = [];
    let level: HealthLevel = 'good';

    const wear = battery.info.wearLevelPercent;
    if (wear?.supported && wear.value !== undefined) {
      if (wear.value >= 50) {
        level = 'critical';
        issues.push(`Battery wear severe: ${wear.value}%`);
      } else if (wear.value >= 30) {
        level = 'poor';
        issues.push(`Battery wear significant: ${wear.value}%`);
      } else if (wear.value >= 15) {
        level = 'fair';
        issues.push(`Battery wear moderate: ${wear.value}%`);
      }
    }

    return { level, issues };
  }

  private evaluateCooling(cooling: CoolingComponent): { level: HealthLevel; issues: string[] } {
    const issues: string[] = [];
    let level: HealthLevel = 'good';

    for (const fan of cooling.info.fans) {
      const rpm = fan.rpm;
      if (rpm?.supported && rpm.value !== undefined && rpm.value === 0) {
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
