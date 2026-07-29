/**
 * Automation Engine — core engine that evaluates rules and generates plans.
 *
 * Pipeline:
 *   System Events → Trigger Evaluation → Condition Evaluation →
 *   Safety Policy Check → Cooldown Check → Approval Evaluation →
 *   Action Planning → Automation Plan
 *
 * Does NOT execute optimizations directly.
 */
import type {
  SystemState,
  AutomationConfiguration,
  AutomationRule,
  AutomationTrigger,
  AutomationTriggerType,
  AutomationTriggerContext,
  AutomationConditionContext,
  AutomationActionContext,
  AutomationPlan,
  AutomationHistoryEntry,
  AutomationStatistics,
  AutomationValidationResult,
  ApprovalContext,
  ApprovalDecision,
  SafetyEvaluationContext,
  RecommendationPriority,
  AutomationTriggerPlugin,
  AutomationConditionPlugin,
  AutomationActionPlugin,
  EnterpriseApprovalInfo,
  AutomationEventType,
  AutomationEventListener,
} from './types';
import { generatePlanId } from './types';
import { AutomationTriggerRegistry } from './automationTriggerRegistry';
import { AutomationConditionEngine } from './automationConditionEngine';
import { AutomationPolicyRegistry } from './automationPolicyRegistry';
import { AutomationRuleRegistry } from './automationRuleRegistry';
import { AutomationActionPlanner } from './automationActionPlanner';
import { AutomationApprovalEngine } from './automationApprovalEngine';
import { AutomationCooldownManager } from './automationCooldownManager';
import { AutomationHistory } from './automationHistory';
import { AutomationValidator } from './automationValidator';
import { AutomationEvents } from './automationEvents';

export interface AutomationEngineOptions {
  availableCapabilities?: string[];
  quotaRemaining?: number;
  subscriptionTier?: string | null;
  confidence?: number;
  priority?: RecommendationPriority;
  enterprisePolicy?: EnterpriseApprovalInfo | null;
  userId?: string | null;
  eventData?: Record<string, unknown>;
}

export interface RuleEvaluationResult {
  rule: AutomationRule;
  triggered: boolean;
  conditionsPassed: boolean;
  safe: boolean;
  inCooldown: boolean;
  approved: ApprovalDecision | null;
  reason: string;
}

export class AutomationEngine {
  private _config: AutomationConfiguration;
  private _triggerRegistry: AutomationTriggerRegistry;
  private _conditionEngine: AutomationConditionEngine;
  private _policyRegistry: AutomationPolicyRegistry;
  private _ruleRegistry: AutomationRuleRegistry;
  private _actionPlanner: AutomationActionPlanner;
  private _approvalEngine: AutomationApprovalEngine;
  private _cooldownManager: AutomationCooldownManager;
  private _history: AutomationHistory;
  private _validator: AutomationValidator;
  private _events: AutomationEvents;

  constructor(config: AutomationConfiguration) {
    this._config = config;
    this._triggerRegistry = new AutomationTriggerRegistry(config);
    this._conditionEngine = new AutomationConditionEngine();
    this._policyRegistry = new AutomationPolicyRegistry(config);
    this._ruleRegistry = new AutomationRuleRegistry(config);
    this._actionPlanner = new AutomationActionPlanner();
    this._approvalEngine = new AutomationApprovalEngine();
    this._cooldownManager = new AutomationCooldownManager();
    this._history = new AutomationHistory(config.maxHistoryEntries);
    this._validator = new AutomationValidator();
    this._events = new AutomationEvents();
  }

  evaluateRules(
    state: SystemState,
    triggerType: AutomationTriggerType,
    options?: AutomationEngineOptions,
  ): RuleEvaluationResult[] {
    const timestamp = new Date().toISOString();
    const eventData = options?.eventData ?? {};
    const rules = this._ruleRegistry.getEnabled();
    const results: RuleEvaluationResult[] = [];

    const triggerCtx: AutomationTriggerContext = {
      systemState: state,
      eventData,
      timestamp,
      futureMetadata: {},
    };

    for (const rule of rules) {
      if (rule.trigger.type !== triggerType) continue;

      const triggered = this._triggerRegistry.evaluate(triggerType, triggerCtx);

      if (!triggered) {
        results.push({ rule, triggered: false, conditionsPassed: false, safe: false, inCooldown: false, approved: null, reason: 'Trigger not matched' });
        this._history.record(rule.id, triggerType, 'ignored', options?.confidence ?? 0.5, rule.riskLevel, [], false, false, { reason: 'Trigger not matched' });
        continue;
      }

      if (this._config.enableEvents) this._events.emitTriggered(rule.id, { triggerType });

      const condCtx: AutomationConditionContext = {
        systemState: state,
        rule,
        trigger: rule.trigger,
        eventData,
        timestamp,
        availableCapabilities: options?.availableCapabilities ?? [],
        quotaRemaining: options?.quotaRemaining ?? 0,
        subscriptionTier: options?.subscriptionTier ?? null,
        confidence: options?.confidence ?? 0.5,
        priority: options?.priority ?? 'medium',
        futureMetadata: {},
      };

      const conditionsPassed = this._conditionEngine.evaluateGroup(rule.conditions, condCtx);

      if (!conditionsPassed) {
        results.push({ rule, triggered: true, conditionsPassed: false, safe: false, inCooldown: false, approved: null, reason: 'Conditions not met' });
        this._history.record(rule.id, triggerType, 'ignored', options?.confidence ?? 0.5, rule.riskLevel, [], false, false, { reason: 'Conditions not met' });
        continue;
      }

      if (this._config.enableEvents) this._events.emitRuleMatched(rule.id, { triggerType });

      const safetyCtx: SafetyEvaluationContext = { systemState: state, rule, timestamp, futureMetadata: {} };
      const safe = this._policyRegistry.isSafe(safetyCtx);

      if (!safe) {
        results.push({ rule, triggered: true, conditionsPassed: true, safe: false, inCooldown: false, approved: null, reason: 'Safety policy violation' });
        this._history.record(rule.id, triggerType, 'deferred', options?.confidence ?? 0.5, rule.riskLevel, [], false, false, { reason: 'Safety policy violation' });
        if (this._config.enableEvents) this._events.emitDeferred(rule.id, { reason: 'Safety policy violation' });
        continue;
      }

      const inCooldown = this._cooldownManager.isInCooldown(rule.id, null, rule.cooldown.scope);
      if (inCooldown) {
        results.push({ rule, triggered: true, conditionsPassed: true, safe: true, inCooldown: true, approved: null, reason: 'In cooldown' });
        this._history.record(rule.id, triggerType, 'deferred', options?.confidence ?? 0.5, rule.riskLevel, [], false, true, { reason: 'In cooldown' });
        if (this._config.enableEvents) this._events.emitDeferred(rule.id, { reason: 'In cooldown' });
        continue;
      }

      const approvalCtx: ApprovalContext = {
        rule,
        systemState: state,
        riskLevel: rule.riskLevel,
        confidence: options?.confidence ?? 0.5,
        userId: options?.userId ?? null,
        enterprisePolicy: options?.enterprisePolicy ?? null,
        futureMetadata: {},
      };

      const approval = this._approvalEngine.evaluate(rule, approvalCtx);

      if (!approval.approved) {
        results.push({ rule, triggered: true, conditionsPassed: true, safe: true, inCooldown: false, approved: approval, reason: 'Approval required' });
        this._history.record(rule.id, triggerType, 'approved' as never, options?.confidence ?? 0.5, rule.riskLevel, [], approval.requiresUserInput, false, { reason: 'Approval required' });
        continue;
      }

      results.push({ rule, triggered: true, conditionsPassed: true, safe: true, inCooldown: false, approved: approval, reason: 'Rule fully evaluated' });
      this._cooldownManager.applyCooldown(rule.id, null, rule.cooldown);
    }

    return results;
  }

  generateAutomationPlan(
    state: SystemState,
    rule: AutomationRule,
    options?: AutomationEngineOptions,
  ): AutomationPlan {
    const timestamp = new Date().toISOString();
    const actionCtx: AutomationActionContext = { systemState: state, rule, timestamp, futureMetadata: {} };
    const plannedActions = this._actionPlanner.planActions(rule.actions, actionCtx);

    const safetyCtx: SafetyEvaluationContext = { systemState: state, rule, timestamp, futureMetadata: {} };
    const safetyResults = this._policyRegistry.evaluateAll(safetyCtx);

    const approvalCtx: ApprovalContext = {
      rule,
      systemState: state,
      riskLevel: rule.riskLevel,
      confidence: options?.confidence ?? 0.5,
      userId: options?.userId ?? null,
      enterprisePolicy: options?.enterprisePolicy ?? null,
      futureMetadata: {},
    };
    const approvalDecision = this._approvalEngine.evaluate(rule, approvalCtx);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600000);

    const plan: AutomationPlan = {
      id: generatePlanId(),
      ruleId: rule.id,
      trigger: rule.trigger,
      actions: plannedActions.map((p) => p.action),
      approvalDecision,
      safetyResults,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      confidence: options?.confidence ?? 0.5,
      riskLevel: rule.riskLevel,
      executionPolicy: rule.executionPolicy,
      summary: `${rule.name}: ${plannedActions.length} action(s), risk=${rule.riskLevel}`,
      futureMetadata: { plannedActions: plannedActions.length },
    };

    this._history.record(
      rule.id,
      rule.trigger.type,
      approvalDecision.approved ? 'executed' : 'deferred',
      plan.confidence,
      rule.riskLevel,
      rule.actions.map((a) => a.type),
      approvalDecision.requiresUserInput,
      false,
      { planId: plan.id },
    );

    if (this._config.enableEvents) {
      if (approvalDecision.approved) {
        this._events.emitApproved(rule.id, { planId: plan.id });
        this._events.emitCompleted(rule.id, { planId: plan.id });
      }
    }

    return plan;
  }

  approveAutomation(ruleId: string, _reason?: string): void {
    const rule = this._ruleRegistry.get(ruleId);
    if (!rule) return;
    const decision: ApprovalDecision = {
      approved: true,
      reason: _reason ?? 'User approved',
      requiresUserInput: false,
      expiresAt: null,
      futureMetadata: {},
    };
    this._approvalEngine.rememberApproval(ruleId, decision);
    this._history.record(ruleId, rule.trigger.type, 'approved', 1.0, rule.riskLevel, [], false, false, { reason: _reason });
    if (this._config.enableEvents) this._events.emitApproved(ruleId, { reason: _reason });
  }

  rejectAutomation(ruleId: string, reason?: string): void {
    const rule = this._ruleRegistry.get(ruleId);
    if (!rule) return;
    this._history.record(ruleId, rule.trigger.type, 'rejected', 0, rule.riskLevel, [], false, false, { reason });
    if (this._config.enableEvents) this._events.emitRejected(ruleId, { reason });
  }

  cancelAutomation(ruleId: string, reason?: string): void {
    const rule = this._ruleRegistry.get(ruleId);
    if (!rule) return;
    this._history.record(ruleId, rule.trigger.type, 'cancelled', 0, rule.riskLevel, [], false, false, { reason });
    if (this._config.enableEvents) this._events.emitCancelled(ruleId, { reason });
  }

  getAutomationHistory(): AutomationHistoryEntry[] {
    return this._history.getAll();
  }

  getAutomationStatistics(): AutomationStatistics {
    const entries = this._history.getAll();
    const byTrigger: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    let totalExecuted = 0, totalApproved = 0, totalRejected = 0;
    let totalDeferred = 0, totalCancelled = 0, totalExpired = 0, totalIgnored = 0, totalTriggered = 0;
    let totalConfidence = 0;

    for (const entry of entries) {
      byTrigger[entry.triggerType] = (byTrigger[entry.triggerType] ?? 0) + 1;
      byOutcome[entry.outcome] = (byOutcome[entry.outcome] ?? 0) + 1;
      totalConfidence += entry.confidence;
      switch (entry.outcome) {
        case 'triggered': totalTriggered++; break;
        case 'executed': totalExecuted++; break;
        case 'approved': totalApproved++; break;
        case 'rejected': totalRejected++; break;
        case 'deferred': totalDeferred++; break;
        case 'cancelled': totalCancelled++; break;
        case 'expired': totalExpired++; break;
        case 'ignored': totalIgnored++; break;
      }
    }

    const totalFinal = totalExecuted + totalRejected + totalCancelled + totalExpired;
    const lastEntry = entries.length > 0 ? entries[entries.length - 1]! : null;

    return {
      totalEvaluations: entries.length,
      totalTriggered,
      totalExecuted,
      totalApproved,
      totalRejected,
      totalDeferred,
      totalCancelled,
      totalExpired,
      totalIgnored,
      byTrigger,
      byOutcome,
      successRate: totalFinal > 0 ? totalExecuted / totalFinal : 0,
      averageConfidence: entries.length > 0 ? totalConfidence / entries.length : 0,
      lastTriggeredAt: lastEntry?.timestamp ?? null,
    };
  }

  validateRule(rule: AutomationRule): AutomationValidationResult {
    return this._validator.validateRule(rule);
  }

  registerRule(rule: AutomationRule): boolean {
    return this._ruleRegistry.register(rule);
  }

  registerTrigger(trigger: AutomationTrigger): boolean {
    return this._triggerRegistry.register(trigger);
  }

  registerTriggerPlugin(plugin: AutomationTriggerPlugin): void {
    this._triggerRegistry.registerPlugin(plugin);
  }

  registerConditionPlugin(plugin: AutomationConditionPlugin): void {
    this._conditionEngine.registerPlugin(plugin);
  }

  registerActionPlugin(plugin: AutomationActionPlugin): void {
    this._actionPlanner.registerPlugin(plugin);
  }

  registerSafetyPolicy(policy: Parameters<AutomationPolicyRegistry['register']>[0]): boolean {
    return this._policyRegistry.register(policy);
  }

  on(event: AutomationEventType, listener: AutomationEventListener): () => void {
    return this._events.on(event, listener);
  }

  off(event: AutomationEventType, listener: AutomationEventListener): void {
    this._events.off(event, listener);
  }

  get config(): AutomationConfiguration { return this._config; }
  get triggerRegistry(): AutomationTriggerRegistry { return this._triggerRegistry; }
  get conditionEngine(): AutomationConditionEngine { return this._conditionEngine; }
  get policyRegistry(): AutomationPolicyRegistry { return this._policyRegistry; }
  get ruleRegistry(): AutomationRuleRegistry { return this._ruleRegistry; }
  get actionPlanner(): AutomationActionPlanner { return this._actionPlanner; }
  get approvalEngine(): AutomationApprovalEngine { return this._approvalEngine; }
  get cooldownManager(): AutomationCooldownManager { return this._cooldownManager; }
  get history(): AutomationHistory { return this._history; }
  get events(): AutomationEvents { return this._events; }

  clear(): void {
    this._history.clear();
    this._events.clear();
    this._cooldownManager.clear();
    this._approvalEngine.clearMemory();
  }
}
