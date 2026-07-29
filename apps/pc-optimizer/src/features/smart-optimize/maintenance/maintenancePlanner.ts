/**
 * Maintenance Planner — orchestrates the maintenance planning pipeline.
 *
 * Pipeline:
 *   System State → Window Detector → Opportunity Generation →
 *   Eligibility Check → Policy Evaluation → Priority Ranking →
 *   Validation → Maintenance Plan
 */
import type {
  SystemState,
  MaintenancePlan,
  MaintenanceOpportunity,
  MaintenanceWindow,
  MaintenanceConfiguration,
  MaintenanceType,
  MaintenanceRequiredConditions,
  MaintenanceEligibility,
  PriorityResult,
  SubscriptionInfo,
  CapabilityInfo,
  QuotaInfo,
  PermissionInfo,
  EnterprisePolicyInfo,
  MaintenanceHistoryEntry,
  MaintenanceTypeProviderPlugin,
  RiskLevel,
  RecommendationPriority,
} from './types';
import {
  generateOpportunityId,
  generatePlanId,
  createDefaultRequiredConditions,
  createDefaultEligibility,
} from './types';
import { MaintenanceWindowDetector } from './maintenanceWindowDetector';
import { MaintenanceEligibilityEngine } from './maintenanceEligibilityEngine';
import { MaintenancePolicyEngine } from './maintenancePolicyEngine';
import { MaintenancePriorityEngine } from './maintenancePriorityEngine';
import { MaintenanceValidator } from './maintenanceValidator';

export class MaintenancePlanner {
  private _config: MaintenanceConfiguration;
  private _windowDetector: MaintenanceWindowDetector;
  private _eligibilityEngine: MaintenanceEligibilityEngine;
  private _policyEngine: MaintenancePolicyEngine;
  private _priorityEngine: MaintenancePriorityEngine;
  private _validator: MaintenanceValidator;
  private _typePlugins: MaintenanceTypeProviderPlugin[] = [];

  constructor(config: MaintenanceConfiguration) {
    this._config = config;
    this._windowDetector = new MaintenanceWindowDetector(config);
    this._eligibilityEngine = new MaintenanceEligibilityEngine(config);
    this._policyEngine = new MaintenancePolicyEngine(config);
    this._priorityEngine = new MaintenancePriorityEngine(config);
    this._validator = new MaintenanceValidator();
  }

  registerTypePlugin(plugin: MaintenanceTypeProviderPlugin): void {
    this._typePlugins.push(plugin);
    this._typePlugins.sort((a, b) => a.getPriority() - b.getPriority());
  }

  registerWindowPlugin(plugin: Parameters<MaintenanceWindowDetector['registerPlugin']>[0]): void {
    this._windowDetector.registerPlugin(plugin);
  }

  registerEligibilityRule(rule: Parameters<MaintenanceEligibilityEngine['registerRule']>[0]): boolean {
    return this._eligibilityEngine.registerRule(rule);
  }

  registerPolicy(policy: Parameters<MaintenancePolicyEngine['registerPolicy']>[0]): boolean {
    return this._policyEngine.registerPolicy(policy);
  }

  generatePlan(
    state: SystemState,
    options?: {
      types?: MaintenanceType[];
      subscription?: SubscriptionInfo | null;
      capabilities?: CapabilityInfo | null;
      quota?: QuotaInfo | null;
      permissions?: PermissionInfo | null;
      enterprisePolicy?: EnterprisePolicyInfo | null;
      historicalOutcomes?: MaintenanceHistoryEntry[];
    },
  ): MaintenancePlan {
    const window = this._windowDetector.detect(state);
    const types = options?.types ?? this._getDefaultTypes();
    const opportunities: MaintenanceOpportunity[] = [];

    for (const type of types) {
      const opp = this._generateOpportunity(type, state, window);
      if (opp) {
        const eligibility = this._eligibilityEngine.evaluate(opp, state, {
          subscription: options?.subscription,
          capabilities: options?.capabilities,
          quota: options?.quota,
          permissions: options?.permissions,
          enterprisePolicy: options?.enterprisePolicy,
          historicalOutcomes: options?.historicalOutcomes,
        });

        const policyResult = this._policyEngine.evaluate(opp, state);

        const enrichedOpp: MaintenanceOpportunity = {
          ...opp,
          currentEligibility: eligibility,
          futureMetadata: {
            ...opp.futureMetadata,
            policyAction: policyResult.action,
            policyReason: policyResult.reason,
            policyConfidence: policyResult.confidence,
          },
        };

        if (eligibility.status !== 'ineligible' && policyResult.action !== 'block') {
          opportunities.push(enrichedOpp);
        }
      }
    }

    // Try type plugins
    for (const plugin of this._typePlugins) {
      if (plugin.isAvailable()) {
        const opp = plugin.evaluate(state);
        if (opp) opportunities.push(opp);
      }
    }

    // Rank
    const rankings = this._priorityEngine.rank(opportunities, options?.historicalOutcomes);
    const rankedOpportunities = rankings
      .sort((a, b) => a.rank - b.rank)
      .map((r) => opportunities.find((o) => o.id === r.opportunityId)!)
      .filter(Boolean);

    const totalDuration = rankedOpportunities.reduce((sum, o) => sum + o.estimatedDuration, 0);
    const totalBenefit = rankedOpportunities.reduce((sum, o) => sum + o.expectedBenefit, 0);
    const avgConfidence = rankedOpportunities.length > 0
      ? rankedOpportunities.reduce((sum, o) => sum + o.confidence, 0) / rankedOpportunities.length
      : 0;
    const overallRisk = this._determineOverallRisk(rankedOpportunities);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3600000);

    return {
      id: generatePlanId(),
      opportunities: rankedOpportunities,
      window,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      summary: this._generateSummary(rankedOpportunities, window, rankings),
      totalEstimatedDuration: totalDuration,
      totalExpectedBenefit: totalBenefit,
      overallRisk,
      confidence: avgConfidence,
      futureMetadata: { rankingCount: rankings.length },
    };
  }

  findWindow(state: SystemState): MaintenanceWindow | null {
    return this._windowDetector.detect(state);
  }

  evaluateEligibility(
    opportunity: MaintenanceOpportunity,
    state: SystemState,
    options?: {
      subscription?: SubscriptionInfo | null;
      capabilities?: CapabilityInfo | null;
      quota?: QuotaInfo | null;
      permissions?: PermissionInfo | null;
      enterprisePolicy?: EnterprisePolicyInfo | null;
      historicalOutcomes?: MaintenanceHistoryEntry[];
    },
  ): MaintenanceEligibility {
    return this._eligibilityEngine.evaluate(opportunity, state, options);
  }

  rankOpportunities(
    opportunities: MaintenanceOpportunity[],
    historicalOutcomes?: MaintenanceHistoryEntry[],
  ): PriorityResult[] {
    return this._priorityEngine.rank(opportunities, historicalOutcomes);
  }

  validatePlan(plan: MaintenancePlan) {
    return this._validator.validatePlan(plan);
  }

  get windowDetector(): MaintenanceWindowDetector {
    return this._windowDetector;
  }

  get policyEngine(): MaintenancePolicyEngine {
    return this._policyEngine;
  }

  get eligibilityEngine(): MaintenanceEligibilityEngine {
    return this._eligibilityEngine;
  }

  private _getDefaultTypes(): MaintenanceType[] {
    return [
      'quick_maintenance',
      'routine_maintenance',
      'deep_maintenance',
      'performance_maintenance',
      'storage_maintenance',
      'startup_maintenance',
    ];
  }

  private _generateOpportunity(
    type: MaintenanceType,
    state: SystemState,
    window: MaintenanceWindow | null,
  ): MaintenanceOpportunity | null {
    const config = this._getTypeConfig(type);
    const now = new Date();
    const startOffset = window ? 0 : 5 * 60 * 1000;

    return {
      id: generateOpportunityId(),
      type,
      recommendedStart: new Date(now.getTime() + startOffset).toISOString(),
      estimatedDuration: config.duration,
      priority: config.priority,
      confidence: window ? window.confidence : 0.3,
      risk: config.risk,
      expectedBenefit: config.benefit,
      requiredConditions: config.conditions,
      currentEligibility: createDefaultEligibility(),
      recommendedActions: config.actions,
      deferredActions: [],
      futureMetadata: { windowId: window?.id ?? null },
    };
  }

  private _getTypeConfig(type: MaintenanceType): {
    duration: number;
    priority: RecommendationPriority;
    risk: RiskLevel;
    benefit: number;
    conditions: MaintenanceRequiredConditions;
    actions: string[];
  } {
    const configs: Record<MaintenanceType, {
      duration: number;
      priority: RecommendationPriority;
      risk: RiskLevel;
      benefit: number;
      conditions: MaintenanceRequiredConditions;
      actions: string[];
    }> = {
      quick_maintenance: {
        duration: 60_000, priority: 'high', risk: 'low', benefit: 0.3,
        conditions: { ...createDefaultRequiredConditions(), requireIdle: false },
        actions: ['junk_cleaner'],
      },
      routine_maintenance: {
        duration: 300_000, priority: 'medium', risk: 'low', benefit: 0.5,
        conditions: createDefaultRequiredConditions(),
        actions: ['junk_cleaner', 'browser_cleaner'],
      },
      deep_maintenance: {
        duration: 900_000, priority: 'medium', risk: 'medium', benefit: 0.8,
        conditions: { ...createDefaultRequiredConditions(), requireAcPower: true, requireIdle: true },
        actions: ['junk_cleaner', 'browser_cleaner', 'recycle_bin_cleaner', 'temp_files_cleaner'],
      },
      privacy_maintenance: {
        duration: 120_000, priority: 'high', risk: 'medium', benefit: 0.6,
        conditions: { ...createDefaultRequiredConditions(), requireIdle: true },
        actions: ['privacy_cleaner'],
      },
      performance_maintenance: {
        duration: 300_000, priority: 'high', risk: 'medium', benefit: 0.7,
        conditions: createDefaultRequiredConditions(),
        actions: ['startup_optimizer', 'service_optimizer'],
      },
      storage_maintenance: {
        duration: 600_000, priority: 'medium', risk: 'low', benefit: 0.6,
        conditions: { ...createDefaultRequiredConditions(), requireIdle: true },
        actions: ['duplicate_finder', 'large_file_finder'],
      },
      startup_maintenance: {
        duration: 120_000, priority: 'high', risk: 'medium', benefit: 0.5,
        conditions: createDefaultRequiredConditions(),
        actions: ['startup_optimizer'],
      },
      health_recovery: {
        duration: 600_000, priority: 'critical', risk: 'high', benefit: 0.9,
        conditions: { ...createDefaultRequiredConditions(), requireAcPower: true, requireIdle: true },
        actions: ['system_repair', 'registry_cleaner'],
      },
      custom_maintenance: {
        duration: 300_000, priority: 'low', risk: 'low', benefit: 0.4,
        conditions: createDefaultRequiredConditions(),
        actions: [],
      },
      future_maintenance: {
        duration: 300_000, priority: 'low', risk: 'low', benefit: 0.3,
        conditions: createDefaultRequiredConditions(),
        actions: [],
      },
    };

    return configs[type] ?? configs.custom_maintenance!;
  }

  private _determineOverallRisk(opportunities: MaintenanceOpportunity[]): RiskLevel {
    if (opportunities.length === 0) return 'low';
    const hasCritical = opportunities.some((o) => o.risk === 'critical');
    const hasHigh = opportunities.some((o) => o.risk === 'high');
    const hasMedium = opportunities.some((o) => o.risk === 'medium');
    if (hasCritical) return 'critical';
    if (hasHigh) return 'high';
    if (hasMedium) return 'medium';
    return 'low';
  }

  private _generateSummary(
    opportunities: MaintenanceOpportunity[],
    window: MaintenanceWindow | null,
    rankings: PriorityResult[],
  ): string {
    const parts: string[] = [];
    parts.push(`${opportunities.length} maintenance opportunity(ies)`);
    if (window) {
      parts.push(`window: ${window.quality} (${(window.confidence * 100).toFixed(0)}% confidence)`);
    } else {
      parts.push('no maintenance window detected');
    }
    if (rankings.length > 0) {
      parts.push(`top priority: ${rankings[0]!.opportunityId} (${rankings[0]!.score.toFixed(2)})`);
    }
    return parts.join(', ');
  }
}
