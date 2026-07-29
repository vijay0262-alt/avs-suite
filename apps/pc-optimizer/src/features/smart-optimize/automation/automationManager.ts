/**
 * Automation Manager — top-level orchestrator for the Policy-Based Automation Engine.
 *
 * Public APIs:
 *   registerRule()
 *   registerTrigger()
 *   evaluateRules()
 *   generateAutomationPlan()
 *   approveAutomation()
 *   rejectAutomation()
 *   getAutomationHistory()
 *   getAutomationStatistics()
 *   on() / off()
 */
import type {
  SystemState,
  AutomationConfiguration,
  AutomationRule,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationPlan,
  AutomationHistoryEntry,
  AutomationStatistics,
  AutomationValidationResult,
  AutomationEventType,
  AutomationEventListener,
  AutomationTriggerPlugin,
  AutomationConditionPlugin,
  AutomationActionPlugin,
  SafetyPolicy,
} from './types';
import { AutomationEngine, type AutomationEngineOptions, type RuleEvaluationResult } from './automationEngine';
import { createAutomationConfiguration, type DeepPartial } from './automationConfiguration';

export class AutomationManager {
  private _config: AutomationConfiguration;
  private _engine: AutomationEngine;

  constructor(config?: AutomationConfiguration | DeepPartial<AutomationConfiguration>) {
    if (config && 'configVersion' in config) {
      this._config = config as AutomationConfiguration;
    } else {
      this._config = createAutomationConfiguration(config as DeepPartial<AutomationConfiguration>);
    }
    this._engine = new AutomationEngine(this._config);
  }

  registerRule(rule: AutomationRule): boolean {
    return this._engine.registerRule(rule);
  }

  registerTrigger(trigger: AutomationTrigger): boolean {
    return this._engine.registerTrigger(trigger);
  }

  registerTriggerPlugin(plugin: AutomationTriggerPlugin): void {
    this._engine.registerTriggerPlugin(plugin);
  }

  registerConditionPlugin(plugin: AutomationConditionPlugin): void {
    this._engine.registerConditionPlugin(plugin);
  }

  registerActionPlugin(plugin: AutomationActionPlugin): void {
    this._engine.registerActionPlugin(plugin);
  }

  registerSafetyPolicy(policy: SafetyPolicy): boolean {
    return this._engine.registerSafetyPolicy(policy);
  }

  evaluateRules(
    state: SystemState,
    triggerType: AutomationTriggerType,
    options?: AutomationEngineOptions,
  ): RuleEvaluationResult[] {
    return this._engine.evaluateRules(state, triggerType, options);
  }

  generateAutomationPlan(
    state: SystemState,
    rule: AutomationRule,
    options?: AutomationEngineOptions,
  ): AutomationPlan {
    return this._engine.generateAutomationPlan(state, rule, options);
  }

  approveAutomation(ruleId: string, reason?: string): void {
    this._engine.approveAutomation(ruleId, reason);
  }

  rejectAutomation(ruleId: string, reason?: string): void {
    this._engine.rejectAutomation(ruleId, reason);
  }

  cancelAutomation(ruleId: string, reason?: string): void {
    this._engine.cancelAutomation(ruleId, reason);
  }

  getAutomationHistory(): AutomationHistoryEntry[] {
    return this._engine.getAutomationHistory();
  }

  getAutomationStatistics(): AutomationStatistics {
    return this._engine.getAutomationStatistics();
  }

  validateRule(rule: AutomationRule): AutomationValidationResult {
    return this._engine.validateRule(rule);
  }

  on(event: AutomationEventType, listener: AutomationEventListener): () => void {
    return this._engine.on(event, listener);
  }

  off(event: AutomationEventType, listener: AutomationEventListener): void {
    this._engine.off(event, listener);
  }

  get config(): AutomationConfiguration { return this._config; }

  updateConfig(overrides: DeepPartial<AutomationConfiguration>): void {
    this._config = createAutomationConfiguration(overrides);
  }

  clear(): void {
    this._engine.clear();
  }

  get engine(): AutomationEngine { return this._engine; }
}
