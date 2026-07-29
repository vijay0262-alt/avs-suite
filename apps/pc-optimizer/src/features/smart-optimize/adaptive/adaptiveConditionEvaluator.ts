/**
 * Adaptive Condition Evaluator — evaluates system state against condition rules.
 *
 * Evaluates: Current State, Prediction Engine, Device Profile,
 * Optimization Goal, Risk, Expected Benefit, Historical Outcomes, User Preferences.
 */
import type {
  SystemState,
  Condition,
  ConditionRule,
  ConditionType,
  ConditionSeverity,
  AdaptiveConfiguration,
  EvaluationContext,
} from './types';
import { generateConditionId } from './types';
import type { AdaptiveConditionRegistry } from './adaptiveConditionRegistry';

export class AdaptiveConditionEvaluator {
  private _registry: AdaptiveConditionRegistry;
  private _config: AdaptiveConfiguration;

  constructor(registry: AdaptiveConditionRegistry, config: AdaptiveConfiguration) {
    this._registry = registry;
    this._config = config;
  }

  evaluate(state: SystemState): Condition[] {
    const conditions: Condition[] = [];
    const rules = this._registry.getEnabledConditionRules();

    for (const rule of rules) {
      const value = this._extractValue(state, rule.conditionType);
      const triggered = this._evaluateRule(rule, value);

      if (triggered) {
        conditions.push(this._createCondition(rule, value));
      }
    }

    // Also evaluate condition plugins
    for (const plugin of this._registry.getConditionPlugins()) {
      if (plugin.isAvailable()) {
        const condition = plugin.evaluate(state);
        if (condition) conditions.push(condition);
      }
    }

    return conditions.sort((a, b) => {
      const severityOrder: Record<ConditionSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  evaluateWithContext(context: EvaluationContext): Condition[] {
    const conditions = this.evaluate(context.systemState);

    // Filter based on user preferences
    if (context.userPreferences) {
      return conditions.filter((c) => {
        if (!context.userPreferences!.pauseOnFullScreen && c.type === 'full_screen_app') return false;
        if (!context.userPreferences!.pauseOnGaming && c.type === 'gaming_mode') return false;
        if (!context.userPreferences!.deferOnBattery && c.type === 'battery_level') return false;
        if (!context.userPreferences!.thermalThrottle && c.type === 'thermal_state') return false;
        return true;
      });
    }

    return conditions;
  }

  private _extractValue(state: SystemState, type: ConditionType): number {
    switch (type) {
      case 'cpu_usage': return state.cpuUsage;
      case 'memory_usage': return state.memoryUsage;
      case 'disk_activity': return state.diskActivity;
      case 'battery_level': return state.batteryLevel ?? 100;
      case 'power_source': return state.powerSource === 'battery' ? 1 : 0;
      case 'user_activity': return state.userActive ? 1 : 0;
      case 'full_screen_app': return state.fullScreenApp ? 1 : 0;
      case 'gaming_mode': return state.gamingMode ? 1 : 0;
      case 'windows_update': return state.windowsUpdateActive ? 1 : 0;
      case 'network_activity': return state.networkActivity;
      case 'thermal_state': {
        const thermalMap = { normal: 0, warm: 1, hot: 2, critical: 3, unknown: 0 };
        return thermalMap[state.thermalState] ?? 0;
      }
      case 'storage_pressure': return state.storagePressure;
      default: return 0;
    }
  }

  private _evaluateRule(rule: ConditionRule, value: number): boolean {
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

  private _createCondition(rule: ConditionRule, value: number): Condition {
    return {
      id: generateConditionId(),
      type: rule.conditionType,
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      status: 'active',
      value,
      threshold: rule.threshold,
      unit: this._getUnit(rule.conditionType),
      detectedAt: new Date().toISOString(),
      futureMetadata: {},
    };
  }

  private _getUnit(type: ConditionType): string {
    const units: Partial<Record<ConditionType, string>> = {
      cpu_usage: '%',
      memory_usage: '%',
      disk_activity: '%',
      battery_level: '%',
      network_activity: '%',
      storage_pressure: '%',
      thermal_state: 'level',
    };
    return units[type] ?? 'boolean';
  }
}
