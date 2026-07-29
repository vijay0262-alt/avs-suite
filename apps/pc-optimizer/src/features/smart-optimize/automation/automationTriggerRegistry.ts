/**
 * Automation Trigger Registry — manages trigger definitions and plugins.
 *
 * Supported triggers: Health Score Changed, Recommendation Generated,
 * Prediction Updated, Maintenance Window Available, System Idle,
 * User Inactive, Windows Update Completed, Storage Threshold Reached,
 * Startup Growth, Battery Charging, Power Connected, Device Profile Changed,
 * Custom Trigger, Future Triggers.
 */
import type {
  AutomationTrigger,
  AutomationTriggerType,
  AutomationTriggerContext,
  AutomationTriggerDefinition,
  AutomationTriggerPlugin,
  AutomationConfiguration,
} from './types';

export class AutomationTriggerRegistry {
  private _config: AutomationConfiguration;
  private _triggers: Map<string, AutomationTrigger> = new Map();
  private _plugins: AutomationTriggerPlugin[] = [];

  constructor(config: AutomationConfiguration) {
    this._config = config;
  }

  register(trigger: AutomationTrigger): boolean {
    if (this._triggers.has(trigger.id)) return false;
    this._triggers.set(trigger.id, trigger);
    return true;
  }

  unregister(id: string): boolean {
    return this._triggers.delete(id);
  }

  registerPlugin(plugin: AutomationTriggerPlugin): void {
    this._plugins.push(plugin);
    this._plugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  get(id: string): AutomationTrigger | undefined {
    return this._triggers.get(id);
  }

  getAll(): AutomationTrigger[] {
    return Array.from(this._triggers.values());
  }

  getEnabled(): AutomationTrigger[] {
    return this.getAll().filter((t) => t.enabled);
  }

  getByType(type: AutomationTriggerType): AutomationTrigger[] {
    return this.getAll().filter((t) => t.type === type);
  }

  evaluate(type: AutomationTriggerType, context: AutomationTriggerContext): boolean {
    // Check plugins first
    for (const plugin of this._plugins) {
      if (plugin.isAvailable() && plugin.getTriggerType() === type) {
        return plugin.evaluate(context);
      }
    }

    // Check registered triggers
    const triggers = this.getByType(type).filter((t) => t.enabled);
    for (const trigger of triggers) {
      if (trigger.evaluate(context)) return true;
    }

    // Check built-in defaults
    return this._evaluateBuiltin(type, context);
  }

  private _evaluateBuiltin(type: AutomationTriggerType, context: AutomationTriggerContext): boolean {
    const state = context.systemState;
    switch (type) {
      case 'system_idle':
        return state.isIdle;
      case 'user_inactive':
        return !state.userActive;
      case 'power_connected':
        return state.powerSource === 'ac';
      case 'battery_charging':
        return state.powerSource === 'ac' && state.batteryLevel !== null && state.batteryLevel < 100;
      case 'storage_threshold_reached':
        return state.storagePressure > 80;
      case 'maintenance_window_available':
        return state.isIdle && state.cpuUsage < 30;
      case 'windows_update_completed':
        return !state.windowsUpdateActive && Boolean(context.eventData['windowsUpdateJustCompleted']);
      case 'health_score_changed':
        return Boolean(context.eventData['healthScoreDelta']);
      case 'recommendation_generated':
        return Boolean(context.eventData['recommendationId']);
      case 'prediction_updated':
        return Boolean(context.eventData['predictionUpdated']);
      case 'startup_growth':
        return Boolean(context.eventData['startupGrowthDetected']);
      case 'device_profile_changed':
        return Boolean(context.eventData['profileChanged']);
      case 'custom_trigger':
        return Boolean(context.eventData['customTriggerMatched']);
      default:
        return false;
    }
  }

  getDefinitions(): AutomationTriggerDefinition[] {
    return this._config.triggerDefinitions;
  }

  count(): number {
    return this._triggers.size;
  }

  clear(): void {
    this._triggers.clear();
  }
}
