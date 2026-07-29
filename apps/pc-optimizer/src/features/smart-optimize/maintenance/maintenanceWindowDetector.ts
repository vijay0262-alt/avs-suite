/**
 * Maintenance Window Detector — detects favorable maintenance windows.
 *
 * Evaluates: System Idle Time, CPU, Memory, Disk, Power Source, Battery,
 * Network, Windows Update, Full Screen, Gaming, Active Calls, User Activity.
 *
 * Performance target: window detection under 100ms.
 */
import type {
  SystemState,
  MaintenanceWindow,
  WindowSignal,
  WindowQuality,
  WindowRule,
  MaintenanceConfiguration,
  MaintenanceWindowProviderPlugin,
} from './types';
import { generateWindowId, windowQualityToScore } from './types';

export class MaintenanceWindowDetector {
  private _config: MaintenanceConfiguration;
  private _plugins: MaintenanceWindowProviderPlugin[] = [];

  constructor(config: MaintenanceConfiguration) {
    this._config = config;
  }

  registerPlugin(plugin: MaintenanceWindowProviderPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  detect(state: SystemState): MaintenanceWindow | null {
    const start = performance.now();

    // Try plugins first
    for (const plugin of this._plugins) {
      if (plugin.isAvailable()) {
        const window = plugin.detectWindow(state);
        if (window) return window;
      }
    }

    // Built-in detection
    const availableSignals: WindowSignal[] = [];
    const blockedSignals: WindowSignal[] = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const rule of this._config.windowRules) {
      if (!rule.enabled) continue;
      totalWeight += rule.weight;

      const value = this._extractSignalValue(state, rule.signal);
      const matched = this._evaluateRule(rule, value);

      if (matched) {
        availableSignals.push(rule.signal);
        matchedWeight += rule.weight;
      } else {
        blockedSignals.push(rule.signal);
      }
    }

    if (totalWeight === 0) return null;

    const confidence = matchedWeight / totalWeight;
    if (confidence < this._config.thresholds.windowConfidenceThreshold) return null;

    const quality = this._determineQuality(confidence);
    const now = new Date();
    const durationMs = this._estimateWindowDuration(state, quality);
    const windowEnd = new Date(now.getTime() + durationMs);

    const elapsed = performance.now() - start;

    return {
      id: generateWindowId(),
      detectedAt: now.toISOString(),
      windowStart: now.toISOString(),
      windowEnd: windowEnd.toISOString(),
      estimatedDurationMs: durationMs,
      availableSignals,
      blockedSignals,
      confidence,
      quality,
      futureMetadata: { detectionTimeMs: elapsed },
    };
  }

  private _extractSignalValue(state: SystemState, signal: WindowSignal): number {
    switch (signal) {
      case 'idle_time': return state.isIdle ? 1 : 0;
      case 'low_cpu': return state.cpuUsage;
      case 'low_memory': return state.memoryUsage;
      case 'low_disk': return state.diskActivity;
      case 'ac_power': return state.powerSource === 'ac' ? 1 : 0;
      case 'sufficient_battery': return state.batteryLevel ?? 100;
      case 'low_network': return state.networkActivity;
      case 'no_windows_update': return state.windowsUpdateActive ? 1 : 0;
      case 'no_full_screen': return state.fullScreenApp ? 1 : 0;
      case 'no_gaming': return state.gamingMode ? 1 : 0;
      case 'no_active_calls': return 0;
      case 'low_user_activity': return state.userActive ? 1 : 0;
      default: return 0;
    }
  }

  private _evaluateRule(rule: WindowRule, value: number): boolean {
    switch (rule.operator) {
      case '>': return value > rule.threshold;
      case '<': return value < rule.threshold;
      case '>=': return value >= rule.threshold;
      case '<=': return value <= rule.threshold;
      case '==': return value === rule.threshold;
      case '!=': return value !== rule.threshold;
      default: return false;
    }
  }

  private _determineQuality(confidence: number): WindowQuality {
    if (confidence >= 0.85) return 'optimal';
    if (confidence >= 0.65) return 'good';
    if (confidence >= 0.45) return 'fair';
    if (confidence >= 0.25) return 'poor';
    return 'unavailable';
  }

  private _estimateWindowDuration(state: SystemState, quality: WindowQuality): number {
    const baseMs = 15 * 60 * 1000;
    const qualityMultiplier = windowQualityToScore(quality);
    const cpuFactor = 1 - state.cpuUsage / 200;
    return Math.round(baseMs * qualityMultiplier * cpuFactor);
  }

  isWindowAvailable(state: SystemState): boolean {
    return this.detect(state) !== null;
  }

  getWindowQuality(state: SystemState): WindowQuality {
    const window = this.detect(state);
    return window?.quality ?? 'unavailable';
  }
}
