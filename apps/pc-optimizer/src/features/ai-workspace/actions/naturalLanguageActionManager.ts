/**
 * Natural Language Action Engine — Manager
 *
 * EPIC 5 PHASE A PART 4
 *
 * Main public API facade for the Natural Language Action Engine.
 * Public APIs: parseRequest(), classifyIntent(), extractEntities(),
 * generateActionPlan(), approveAction(), rejectAction(), getSuggestedActions()
 *
 * Uses the AI Tool Framework for tool selection.
 * Does NOT bypass execution safety.
 * No direct execution logic — hands approved plans to Execution Pipeline.
 *
 * Architecture:
 *   User Request → Intent Classification → Entity Extraction →
 *   Context Resolution → Tool Selection → Action Planning →
 *   Approval → Execution Pipeline
 */
import type {
  ActionConfiguration,
  ClassifiedIntent,
  ExtractedEntity,
  ActionPlan,
  ParsedRequest,
  ActionValidationResult,
  ApprovalResult,
  ActionSuggestion,
  AIAssistantContext,
  PermissionLevel,
  ActionPlugin,
  ActionAnalyticsData,
  ApprovalPolicyType,
} from './types';
import type { ToolManager } from '../tools/toolManager';
import { DEFAULT_ACTION_CONFIGURATION, createActionConfiguration, validateActionConfiguration } from './actionConfiguration';
import { ActionEvents, actionEvents } from './actionEvents';
import { IntentClassifier } from './intentClassifier';
import { EntityExtractor } from './entityExtractor';
import { ActionContextResolver } from './actionContextResolver';
import { ActionResolver } from './actionResolver';
import { ActionPlanner } from './actionPlanner';
import { ActionValidator } from './actionValidator';
import { ActionApprovalEngine } from './actionApprovalEngine';
import { ActionPlanFormatter } from './actionPlanFormatter';
import { ActionSuggestionEngine } from './actionSuggestionEngine';
import { ActionAnalytics } from './actionAnalytics';

export class NaturalLanguageActionManager {
  private _config: ActionConfiguration;
  private _events: ActionEvents;
  private _classifier: IntentClassifier;
  private _extractor: EntityExtractor;
  private _contextResolver: ActionContextResolver;
  private _resolver: ActionResolver;
  private _planner: ActionPlanner;
  private _validator: ActionValidator;
  private _approvalEngine: ActionApprovalEngine;
  private _formatter: ActionPlanFormatter;
  private _suggestionEngine: ActionSuggestionEngine;
  private _analytics: ActionAnalytics;
  private _userPermission: PermissionLevel = 'free';
  private _userCapabilities: string[] = [];
  private _pendingPlans: Map<string, ActionPlan> = new Map();

  constructor(config?: Partial<ActionConfiguration>) {
    this._config = config
      ? createActionConfiguration(config as never)
      : structuredClone(DEFAULT_ACTION_CONFIGURATION);

    const validation = validateActionConfiguration(this._config);
    if (!validation.valid) {
      throw new Error(`Invalid Action configuration: ${validation.errors.join('; ')}`);
    }

    this._events = new ActionEvents();
    this._classifier = new IntentClassifier(this._config.intentDefinitions);
    this._extractor = new EntityExtractor(this._config.entityRules);
    this._contextResolver = new ActionContextResolver();
    this._resolver = new ActionResolver();
    this._planner = new ActionPlanner();
    this._validator = new ActionValidator();
    this._approvalEngine = new ActionApprovalEngine(this._config.approvalPolicies);
    this._formatter = new ActionPlanFormatter();
    this._suggestionEngine = new ActionSuggestionEngine(this._config.suggestionRules);
    this._analytics = new ActionAnalytics();
  }

  // ── Public API ──────────────────────────────────────────────

  setContextProvider(provider: () => AIAssistantContext): void {
    this._contextResolver.setContextProvider(provider);
  }

  setToolManager(manager: ToolManager): void {
    this._resolver.setToolManager(manager);
  }

  setUserContext(permission: PermissionLevel, capabilities: string[]): void {
    this._userPermission = permission;
    this._userCapabilities = capabilities;
  }

  parseRequest(request: string): ParsedRequest {
    if (!this._config.featureFlags.enableActionEngine) {
      throw new Error('Action Engine is disabled');
    }

    this._analytics.recordRequest();

    // Step 1: Classify intent
    const intent = this.classifyIntent(request);
    if (!intent) {
      return {
        rawRequest: request,
        intent: null,
        entities: [],
        actionPlan: null,
        validation: null,
        approval: null,
        futureMetadata: {},
      };
    }

    // Step 2: Extract entities
    const entities = this.extractEntities(request);
    intent.entities = entities;

    // Step 3: Generate action plan
    const plan = this.generateActionPlan(intent, entities);

    // Step 4: Validate
    let validation: ActionValidationResult | null = null;
    if (plan) {
      const context = this._contextResolver.resolve(intent, entities).context;
      validation = this._validator.validate(plan, context, this._userPermission, this._userCapabilities);
    }

    // Step 5: Check approval
    let approval: ApprovalResult | null = null;
    if (plan && validation?.valid && plan.requiresApproval) {
      approval = this._approvalEngine.checkApproval(plan);
      if (!approval.approved) {
        this._pendingPlans.set(plan.id, plan);
      }
    }

    return {
      rawRequest: request,
      intent,
      entities,
      actionPlan: plan,
      validation,
      approval,
      futureMetadata: {},
    };
  }

  classifyIntent(request: string): ClassifiedIntent | null {
    if (!this._config.featureFlags.enableIntentClassification) return null;
    const intent = this._classifier.classify(request);
    if (intent) {
      this._events.emit({
        type: 'intent_detected',
        timestamp: new Date().toISOString(),
        data: intent,
      });
    }
    return intent;
  }

  extractEntities(request: string): ExtractedEntity[] {
    if (!this._config.featureFlags.enableEntityExtraction) return [];
    const entities = this._extractor.extract(request);
    if (entities.length > 0) {
      this._events.emit({
        type: 'entities_extracted',
        timestamp: new Date().toISOString(),
        data: entities,
      });
    }
    return entities;
  }

  generateActionPlan(intent: ClassifiedIntent, entities?: ExtractedEntity[]): ActionPlan | null {
    if (!this._config.featureFlags.enableActionPlanning) return null;

    const start = Date.now();
    const resolvedEntities = entities ?? intent.entities;
    const resolvedContext = this._contextResolver.resolve(intent, resolvedEntities);
    const tools = this._resolver.resolve(intent, resolvedContext.context);

    if (tools.length === 0 && intent.requiredTools.length > 0) {
      // Try resolving by tool IDs directly
      const toolDefs = this._resolver.resolveByIds(intent.requiredTools);
      if (toolDefs.length === 0) {
        // No tools available — still generate a plan with empty tools for explainability
        const plan = this._planner.plan(intent, resolvedEntities, resolvedContext.context, []);
        this._finalizePlan(plan, start);
        return plan;
      }
      const plan = this._planner.plan(intent, resolvedEntities, resolvedContext.context, toolDefs);
      this._finalizePlan(plan, start);
      return plan;
    }

    const plan = this._planner.plan(intent, resolvedEntities, resolvedContext.context, tools);
    this._finalizePlan(plan, start);
    return plan;
  }

  approveAction(planId: string, policyType?: ApprovalPolicyType): ApprovalResult | null {
    const plan = this._pendingPlans.get(planId);
    if (!plan) return null;

    const result = this._approvalEngine.approve(plan, policyType);
    plan.status = 'approved';

    this._analytics.recordApproval(true);
    this._events.emit({
      type: 'action_approved',
      timestamp: new Date().toISOString(),
      data: { planId, result },
    });

    this._pendingPlans.delete(planId);
    return result;
  }

  rejectAction(planId: string, reason?: string): ApprovalResult | null {
    const plan = this._pendingPlans.get(planId);
    if (!plan) return null;

    const result = this._approvalEngine.reject(plan, reason ?? 'Rejected by user');
    plan.status = 'rejected';

    this._analytics.recordApproval(false);
    this._events.emit({
      type: 'action_rejected',
      timestamp: new Date().toISOString(),
      data: { planId, reason },
    });

    this._pendingPlans.delete(planId);
    return result;
  }

  getSuggestedActions(limit?: number): ActionSuggestion[] {
    if (!this._config.featureFlags.enableSuggestions) return [];
    const context = this._contextResolver.resolve(
      { id: '', intent: 'future_action', confidence: 0, entities: [], parameters: {}, requiredTools: [], requiredPermissions: 'free', riskLevel: 'none', rawRequest: '', futureMetadata: {} },
      [],
    ).context;
    return this._suggestionEngine.getSuggestions(context, limit);
  }

  // ── Utility ─────────────────────────────────────────────────

  getPendingPlans(): ActionPlan[] {
    return Array.from(this._pendingPlans.values());
  }

  formatPlan(plan: ActionPlan) {
    return this._formatter.format(plan);
  }

  formatPlanCompact(plan: ActionPlan): string {
    return this._formatter.formatCompact(plan);
  }

  getAnalytics(): ActionAnalyticsData {
    return this._analytics.getAnalytics();
  }

  getConfig(): ActionConfiguration {
    return this._config;
  }

  updateConfig(config: Partial<ActionConfiguration>): void {
    this._config = createActionConfiguration(config as never);
    this._classifier.updateDefinitions(this._config.intentDefinitions);
    this._extractor.updateRules(this._config.entityRules);
    this._suggestionEngine.updateRules(this._config.suggestionRules);
  }

  setApprovalPolicy(policyType: ApprovalPolicyType): boolean {
    return this._approvalEngine.setActivePolicy(policyType);
  }

  getEvents(): ActionEvents {
    return this._events;
  }

  registerPlugin(plugin: ActionPlugin): boolean {
    if (!this._config.featureFlags.enablePlugins) return false;
    const intents = plugin.getIntentDefinitions();
    const rules = plugin.getEntityRules();
    const allIntents = [...this._config.intentDefinitions, ...intents];
    const allRules = [...this._config.entityRules, ...rules];
    this._config.intentDefinitions = allIntents;
    this._config.entityRules = allRules;
    this._classifier.updateDefinitions(allIntents);
    this._extractor.updateRules(allRules);
    return true;
  }

  clearAll(): void {
    this._pendingPlans.clear();
    this._analytics.reset();
    this._approvalEngine.clearAll();
    this._events.removeAllListeners();
  }

  // ── Private ─────────────────────────────────────────────────

  private _finalizePlan(plan: ActionPlan, startTime: number): void {
    const planningTime = Date.now() - startTime;
    this._analytics.recordPlanGenerated(plan.intent, plan.explanation.evidence.length > 0
      ? plan.explanation.evidence.reduce((sum, e) => sum + e.confidence, 0) / plan.explanation.evidence.length
      : 0.5,
      planningTime,
    );

    this._events.emit({
      type: 'action_generated',
      timestamp: new Date().toISOString(),
      data: { planId: plan.id, planningTimeMs: planningTime },
    });
  }
}

export { actionEvents };
