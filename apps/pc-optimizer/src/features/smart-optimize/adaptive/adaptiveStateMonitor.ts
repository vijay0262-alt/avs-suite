/**
 * Adaptive State Monitor — monitors system state changes.
 *
 * Tracks system state over time and provides idle detection,
 * state snapshots, and change detection.
 */
import type { SystemState, AdaptiveConfiguration } from './types';
import { createDefaultSystemState } from './types';

export class AdaptiveStateMonitor {
  private _config: AdaptiveConfiguration;
  private _currentState: SystemState;
  private _previousState: SystemState | null;
  private _lastActivityTime: number;

  constructor(config: AdaptiveConfiguration) {
    this._config = config;
    this._currentState = createDefaultSystemState();
    this._previousState = null;
    this._lastActivityTime = Date.now();
  }

  update(state: Partial<SystemState>): SystemState {
    this._previousState = { ...this._currentState };
    this._currentState = {
      ...this._currentState,
      ...state,
      timestamp: new Date().toISOString(),
    };

    if (state.userActive !== false && !state.isIdle) {
      this._lastActivityTime = Date.now();
    }

    this._detectIdle();
    return this._currentState;
  }

  getState(): SystemState {
    return { ...this._currentState };
  }

  getPreviousState(): SystemState | null {
    return this._previousState ? { ...this._previousState } : null;
  }

  hasStateChanged(): boolean {
    if (!this._previousState) return true;
    return JSON.stringify(this._currentState) !== JSON.stringify(this._previousState);
  }

  isIdle(): boolean {
    return this._currentState.isIdle;
  }

  isOnBattery(): boolean {
    return this._currentState.powerSource === 'battery';
  }

  isGaming(): boolean {
    return this._currentState.gamingMode || this._currentState.fullScreenApp;
  }

  isUnderLoad(): boolean {
    return this._currentState.cpuUsage > this._config.thresholds.cpuHighUsage ||
      this._currentState.memoryUsage > this._config.thresholds.memoryHighUsage;
  }

  isThermalThrottled(): boolean {
    return this._currentState.thermalState === 'hot' || this._currentState.thermalState === 'critical';
  }

  getChangeSummary(): string[] {
    if (!this._previousState) return ['Initial state'];
    const changes: string[] = [];

    if (this._currentState.cpuUsage !== this._previousState.cpuUsage) {
      changes.push(`CPU: ${this._previousState.cpuUsage}% → ${this._currentState.cpuUsage}%`);
    }
    if (this._currentState.memoryUsage !== this._previousState.memoryUsage) {
      changes.push(`Memory: ${this._previousState.memoryUsage}% → ${this._currentState.memoryUsage}%`);
    }
    if (this._currentState.powerSource !== this._previousState.powerSource) {
      changes.push(`Power: ${this._previousState.powerSource} → ${this._currentState.powerSource}`);
    }
    if (this._currentState.gamingMode !== this._previousState.gamingMode) {
      changes.push(`Gaming: ${this._previousState.gamingMode} → ${this._currentState.gamingMode}`);
    }
    if (this._currentState.fullScreenApp !== this._previousState.fullScreenApp) {
      changes.push(`Full screen: ${this._previousState.fullScreenApp} → ${this._currentState.fullScreenApp}`);
    }

    return changes;
  }

  private _detectIdle(): void {
    const idleMs = Date.now() - this._lastActivityTime;
    const idleThresholdMs = this._config.thresholds.idleThresholdMinutes * 60 * 1000;
    this._currentState.isIdle = idleMs >= idleThresholdMs && !this._currentState.userActive;
  }

  reset(): void {
    this._currentState = createDefaultSystemState();
    this._previousState = null;
    this._lastActivityTime = Date.now();
  }
}
