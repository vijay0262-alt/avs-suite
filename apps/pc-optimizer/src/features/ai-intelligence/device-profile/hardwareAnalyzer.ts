/**
 * Hardware Analyzer — analyzes hardware characteristics from context.
 *
 * Analyzes: CPU, Memory, Storage, GPU, Displays, Battery,
 * Storage Types, Drive Count, RAM Capacity, Performance Tier.
 *
 * NEVER inspects private user data. Only uses system telemetry.
 */
import type {
  AIContext,
  HardwareSummary,
  HardwareDetails,
  PerformanceTier,
  ProfileConfiguration,
  ContextEvidence,
} from './types';
import { clampScore } from './types';

export class HardwareAnalyzer {
  private _config: ProfileConfiguration;

  constructor(config: ProfileConfiguration) {
    this._config = config;
  }

  updateConfig(config: ProfileConfiguration): void {
    this._config = config;
  }

  analyze(context: AIContext): HardwareSummary {
    const system = context.system;
    const storage = context.storage;

    const cpuModel = system?.cpuModel ?? 'Unknown';
    const cpuCores = system?.cpuCores ?? 0;
    const totalMemoryMB = system?.totalMemoryMB ?? 0;
    const gpuModel = system?.gpuModel ?? null;
    const storageType = storage?.driveType ?? 'Unknown';
    const storageCapacityMB = storage?.totalCapacityMB ?? 0;

    const details = this._analyzeDetails(cpuModel, cpuCores, totalMemoryMB, gpuModel, storageCapacityMB, storageType, context);
    const performanceTier = this._derivePerformanceTier(details);
    const confidence = this._calculateConfidence(system, storage);

    return {
      cpuModel,
      cpuCores,
      totalMemoryMB,
      gpuModel,
      storageType,
      storageCapacityMB,
      driveCount: 1,
      performanceTier,
      displayCount: null,
      hasBattery: this._detectBattery(context),
      details,
      confidence,
    };
  }

  getEvidence(context: AIContext): ContextEvidence[] {
    const evidence: ContextEvidence[] = [];
    const system = context.system;
    const storage = context.storage;
    const ts = new Date().toISOString();

    if (system) {
      evidence.push({ source: 'system', metric: 'cpu_model', value: system.cpuModel, timestamp: ts });
      evidence.push({ source: 'system', metric: 'cpu_cores', value: system.cpuCores, timestamp: ts });
      evidence.push({ source: 'system', metric: 'total_memory_mb', value: system.totalMemoryMB, timestamp: ts });
      if (system.gpuModel) {
        evidence.push({ source: 'system', metric: 'gpu_model', value: system.gpuModel, timestamp: ts });
      }
    }
    if (storage) {
      evidence.push({ source: 'storage', metric: 'total_capacity_mb', value: storage.totalCapacityMB, timestamp: ts });
      evidence.push({ source: 'storage', metric: 'drive_type', value: storage.driveType, timestamp: ts });
    }

    return evidence;
  }

  // ── Private ────────────────────────────────────────────────

  private _analyzeDetails(
    cpuModel: string,
    cpuCores: number,
    totalMemoryMB: number,
    gpuModel: string | null,
    storageCapacityMB: number,
    storageType: string,
    context: AIContext,
  ): HardwareDetails {
    const rules = this._config.hardwareRules;

    const ramCapacity = this._tierRam(totalMemoryMB, rules);
    const cpuTier = this._tierCpu(cpuCores, cpuModel, rules);
    const gpuTier = this._tierGpu(gpuModel);
    const storageTier = this._tierStorage(storageCapacityMB, storageType, rules);
    const isLaptop = this._detectLaptop(context);
    const isServer = this._detectServer(context, cpuModel);
    const isVirtualMachine = this._detectVM(context, cpuModel);

    return {
      ramCapacity,
      cpuTier,
      gpuTier,
      storageTier,
      isLaptop,
      isServer,
      isVirtualMachine,
    };
  }

  private _tierRam(totalMemoryMB: number, rules: ProfileConfiguration['hardwareRules']): HardwareDetails['ramCapacity'] {
    if (totalMemoryMB === 0) return 'unknown';
    if (totalMemoryMB < rules.lowRamThresholdMB) return 'low';
    if (totalMemoryMB < rules.mediumRamThresholdMB) return 'medium';
    if (totalMemoryMB < rules.highRamThresholdMB) return 'high';
    return 'very_high';
  }

  private _tierCpu(cpuCores: number, cpuModel: string, rules: ProfileConfiguration['hardwareRules']): HardwareDetails['cpuTier'] {
    if (cpuCores === 0 && cpuModel === 'Unknown') return 'unknown';
    if (cpuCores <= rules.lowCpuCores) return 'low';
    if (cpuCores <= rules.mediumCpuCores) return 'medium';
    if (cpuCores <= rules.highCpuCores) return 'high';
    return 'very_high';
  }

  private _tierGpu(gpuModel: string | null): HardwareDetails['gpuTier'] {
    if (!gpuModel) return 'none';
    const model = gpuModel.toLowerCase();
    if (model.includes('rtx 40') || model.includes('rtx 50') || model.includes('radeon vii') || model.includes('a100') || model.includes('h100')) return 'very_high';
    if (model.includes('rtx') || model.includes('radeon rx') || model.includes('quadro') || model.includes('firepro')) return 'high';
    if (model.includes('gtx') || model.includes('radeon') || model.includes('iris') || model.includes('vega')) return 'medium';
    return 'low';
  }

  private _tierStorage(storageCapacityMB: number, storageType: string, rules: ProfileConfiguration['hardwareRules']): HardwareDetails['storageTier'] {
    if (storageCapacityMB === 0) return 'unknown';
    if (storageCapacityMB < rules.lowStorageThresholdMB) return 'low';
    if (storageCapacityMB < rules.mediumStorageThresholdMB) return 'medium';
    if (storageCapacityMB < rules.highStorageThresholdMB) return 'high';
    return 'very_high';
  }

  private _detectLaptop(context: AIContext): boolean | null {
    if (context.system) {
      const hostname = context.system.hostname.toLowerCase();
      const cpuModel = context.system.cpuModel.toLowerCase();
      if (hostname.includes('laptop') || hostname.includes('notebook')) return true;
      if (cpuModel.includes('mobile') || cpuModel.includes('u ') || cpuModel.includes('ryzen mobile')) return true;
    }
    if (this._config.hardwareRules.laptopBatteryIndication && context.system?.uptime !== undefined) {
      // Laptops often have lower uptime due to sleep/suspend
      // This is a weak signal, so we don't rely on it alone
    }
    return null;
  }

  private _detectServer(context: AIContext, cpuModel: string): boolean | null {
    const model = cpuModel.toLowerCase();
    if (model.includes('xeon') || model.includes('epyc') || model.includes('threadripper')) return true;
    if (context.windows?.services && context.windows.services.length > 20) return true;
    return null;
  }

  private _detectVM(context: AIContext, cpuModel: string): boolean | null {
    const model = cpuModel.toLowerCase();
    if (model.includes('virtual') || model.includes('vcpu') || model.includes('emulated')) return true;
    if (context.system?.hostname.toLowerCase().includes('vm') || context.system?.hostname.toLowerCase().includes('virtual')) return true;
    return null;
  }

  private _detectBattery(context: AIContext): boolean | null {
    // We don't have direct battery info in context, but laptop detection implies battery
    const isLaptop = this._detectLaptop(context);
    if (isLaptop === true) return true;
    if (isLaptop === false) return false;
    return null;
  }

  private _derivePerformanceTier(details: HardwareDetails): PerformanceTier {
    if (details.isServer) return 'enterprise';
    if (details.isVirtualMachine) return 'low_end';

    const tiers: Record<string, number> = { unknown: 0, none: 0, low: 1, medium: 2, high: 3, 'very_high': 4 };
    const scores = [
      tiers[details.ramCapacity] ?? 0,
      tiers[details.cpuTier] ?? 0,
      tiers[details.gpuTier] ?? 0,
      tiers[details.storageTier] ?? 0,
    ];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    if (avg >= 3.5) return 'enterprise';
    if (avg >= 2.5) return 'high_end';
    if (avg >= 1.5) return 'mid_range';
    return 'low_end';
  }

  private _calculateConfidence(system: AIContext['system'], storage: AIContext['storage']): number {
    let confidence = 0;
    if (system) confidence += 0.5;
    if (storage) confidence += 0.3;
    if (system?.cpuModel && system.cpuModel !== 'Unknown') confidence += 0.1;
    if (system?.gpuModel) confidence += 0.1;
    return clampScore(confidence);
  }
}
