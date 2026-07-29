/**
 * Smart Optimize 2.0 — Optimization Preview & Simulation Engine Type Definitions
 *
 * EPIC 4 PHASE B PART 2 — Optimization Preview & Simulation Engine.
 *
 * Simulates and predicts the expected outcome of an optimization plan
 * before execution. The simulation is evidence-based, explainable, and
 * deterministic. No actual system changes are allowed.
 *
 * Architecture:
 *   Optimization Plan → Simulation Planner → Prediction Engine →
 *   Recommendation Engine → Simulation Engine → Simulation Result
 *
 * Core architectural principle:
 *   "The AI must never invent information. Every estimate must be
 *    traceable back to historical evidence, with supporting evidence,
 *    a confidence score, assumptions, and potential uncertainty."
 */
import type { RiskLevel, RecommendationPriority } from '../planner/types';
import type { SmartPlan, OptimizationHistoryEntry } from '../planner/types';
import type { SystemState } from '../adaptive/types';
import type { Evidence } from '../intelligence/types';

// Re-export for convenience
export type { RiskLevel, RecommendationPriority } from '../planner/types';
export type {
  SmartPlan,
  OptimizationGoal,
  OptimizationStrategy,
  SmartPlanAction,
  SmartPlanBenefits,
  SafetyAssessment,
  EligibilityResult,
  OptimizationHistoryEntry,
  DeviceProfileSnapshot,
} from '../planner/types';
export type { SystemState } from '../adaptive/types';
export type { Evidence } from '../intelligence/types';

// ── Simulation Types ─────────────────────────────────────────

export type SimulationType =
  | 'quick_optimize'
  | 'performance_boost'
  | 'storage_recovery'
  | 'privacy_cleanup'
  | 'startup_optimization'
  | 'maintenance_plan'
  | 'custom_plan'
  | 'future_simulation';

export type SimulationStatus =
  | 'generated'
  | 'viewed'
  | 'compared'
  | 'accepted'
  | 'rejected'
  | 'executed'
  | 'expired';

// ── Simulation Result ───────────────────────────────────────

export interface SimulationResult {
  id: string;
  planId: string;
  type: SimulationType;
  generatedAt: string;
  estimatedDuration: number;
  estimatedHealthBefore: number;
  estimatedHealthAfter: number;
  estimatedStorageRecovered: number;
  estimatedPerformanceGain: number;
  estimatedPrivacyImprovement: number;
  estimatedMemoryRecovery: number;
  estimatedStartupImprovement: number;
  estimatedRisk: RiskLevel;
  estimatedConfidence: number;
  rollbackAvailability: boolean;
  assumptions: SimulationAssumption[];
  supportingEvidence: Evidence[];
  explainability: SimulationExplainability;
  actionBreakdown: SimulationActionBreakdown[];
  futureMetadata: Record<string, unknown>;
}

export interface SimulationAssumption {
  id: string;
  description: string;
  impact: number;
  confidence: number;
  category: string;
  futureMetadata: Record<string, unknown>;
}

export interface SimulationExplainability {
  whyThisEstimate: string;
  evidenceUsed: string[];
  confidenceScore: number;
  assumptions: string[];
  potentialUncertainty: string;
  alternativePlanId: string | null;
  futureMetadata: Record<string, unknown>;
}

export interface SimulationActionBreakdown {
  actionId: string;
  title: string;
  estimatedDuration: number;
  estimatedBenefit: number;
  estimatedRisk: RiskLevel;
  confidence: number;
  evidence: Evidence[];
  futureMetadata: Record<string, unknown>;
}

// ── Simulation Input ────────────────────────────────────────

export interface SimulationInput {
  plan: SmartPlan;
  systemState: SystemState;
  healthScore: number;
  deviceProfileType: string;
  optimizationHistory: OptimizationHistoryEntry[];
  futureMetadata: Record<string, unknown>;
}

// ── Simulation Comparison ───────────────────────────────────

export interface SimulationComparison {
  id: string;
  simulations: SimulationResult[];
  generatedAt: string;
  deltas: SimulationDelta[];
  winner: string | null;
  summary: string;
  recommendation: string;
  futureMetadata: Record<string, unknown>;
}

export interface SimulationDelta {
  metric: string;
  label: string;
  values: number[];
  unit: string;
  bestIndex: number;
  futureMetadata: Record<string, unknown>;
}

// ── Simulation Validation ───────────────────────────────────

export interface SimulationValidationResult {
  valid: boolean;
  errors: SimulationValidationError[];
  warnings: SimulationValidationWarning[];
  futureMetadata: Record<string, unknown>;
}

export interface SimulationValidationError {
  code: string;
  message: string;
  field?: string;
}

export interface SimulationValidationWarning {
  code: string;
  message: string;
  field?: string;
}

// ── Simulation History ──────────────────────────────────────

export interface SimulationHistoryEntry {
  id: string;
  simulationId: string;
  planId: string;
  status: SimulationStatus;
  timestamp: string;
  metadata: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

// ── Simulation Analytics ────────────────────────────────────

export interface SimulationAnalytics {
  totalSimulations: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  averageHealthGain: number;
  averageStorageRecovered: number;
  averagePerformanceGain: number;
  averagePrivacyImprovement: number;
  averageConfidence: number;
  averageDuration: number;
  acceptanceRate: number;
  rejectionRate: number;
  executionRate: number;
  expiryRate: number;
  lastSimulationAt: string | null;
  futureMetadata: Record<string, unknown>;
}

// ── Export Formats ──────────────────────────────────────────

export type ExportFormat = 'json' | 'markdown' | 'pdf_ready' | 'future_format';

export interface SimulationExport {
  format: ExportFormat;
  content: string;
  metadata: SimulationExportMetadata;
  futureMetadata: Record<string, unknown>;
}

export interface SimulationExportMetadata {
  exportedAt: string;
  simulationId: string;
  formatVersion: string;
  byteSize: number;
  futureMetadata: Record<string, unknown>;
}

// ── Configuration ────────────────────────────────────────────

export interface EstimationRule {
  factor: EstimationFactor;
  weight: number;
  enabled: boolean;
  minConfidence: number;
  futureMetadata: Record<string, unknown>;
}

export type EstimationFactor =
  | 'historical_success'
  | 'plan_confidence'
  | 'action_confidence'
  | 'risk_level'
  | 'health_score'
  | 'device_profile'
  | 'optimization_history'
  | 'plan_benefits'
  | 'safety_assessment'
  | 'future_factor';

export interface ConfidenceRule {
  factor: string;
  weight: number;
  enabled: boolean;
  minSamples: number;
  futureMetadata: Record<string, unknown>;
}

export interface FormattingRule {
  format: ExportFormat;
  enabled: boolean;
  template: string;
  options: Record<string, unknown>;
  futureMetadata: Record<string, unknown>;
}

export interface ComparisonRule {
  metric: string;
  weight: number;
  enabled: boolean;
  higherIsBetter: boolean;
  futureMetadata: Record<string, unknown>;
}

export interface SimulationFeatureFlags {
  enableEstimation: boolean;
  enableComparison: boolean;
  enableValidation: boolean;
  enableHistory: boolean;
  enableAnalytics: boolean;
  enableExport: boolean;
  enableExplainability: boolean;
  enableIncrementalUpdates: boolean;
  enableCaching: boolean;
  futureFlags: Record<string, boolean>;
}

export interface SimulationConfiguration {
  configVersion: string;
  estimationRules: EstimationRule[];
  confidenceRules: ConfidenceRule[];
  formattingRules: FormattingRule[];
  comparisonRules: ComparisonRule[];
  featureFlags: SimulationFeatureFlags;
  enableEvents: boolean;
  maxHistoryEntries: number;
  simulationExpiryMs: number;
  maxSimulationsPerComparison: number;
  performanceTargetMs: number;
  futureMetadata: Record<string, unknown>;
}

// ── Events ──────────────────────────────────────────────────

export type SimulationEventType =
  | 'simulation_started'
  | 'simulation_generated'
  | 'simulation_compared'
  | 'simulation_exported'
  | 'simulation_expired';

export interface SimulationEvent {
  type: SimulationEventType;
  simulationId: string | null;
  timestamp: string;
  data: unknown;
}

export type SimulationEventListener = (event: SimulationEvent) => void;

// ── Plugin / Provider Architecture ──────────────────────────

export interface SimulationProviderPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getSimulationType(): SimulationType;
  simulate(input: SimulationInput, config: SimulationConfiguration): SimulationResult | null;
}

export interface EstimationPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getFactor(): EstimationFactor;
  estimate(input: SimulationInput, config: SimulationConfiguration): number;
}

export interface ComparisonPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getMetric(): string;
  compare(simulations: SimulationResult[], config: SimulationConfiguration): SimulationDelta | null;
}

export interface ExportPlugin {
  getPluginName(): string;
  getVersion(): string;
  getPriority(): number;
  isAvailable(): boolean;
  getFormat(): ExportFormat;
  export(simulation: SimulationResult, config: SimulationConfiguration): SimulationExport | null;
}

// ── Helper Functions ────────────────────────────────────────

export function generateSimulationId(): string {
  return `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateComparisonId(): string {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateSimulationHistoryId(): string {
  return `simhist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateAssumptionId(): string {
  return `assumption_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateDeltaId(): string {
  return `delta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateExportId(): string {
  return `export_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function riskToScore(risk: RiskLevel): number {
  const scores: Record<RiskLevel, number> = {
    none: 0,
    low: 0.2,
    medium: 0.5,
    high: 0.8,
    critical: 1.0,
  };
  return scores[risk] ?? 0.5;
}

export function scoreToRisk(score: number): RiskLevel {
  if (score < 0.1) return 'none';
  if (score < 0.35) return 'low';
  if (score < 0.65) return 'medium';
  if (score < 0.9) return 'high';
  return 'critical';
}

export function priorityToScore(priority: RecommendationPriority): number {
  const scores: Record<RecommendationPriority, number> = {
    critical: 1.0,
    high: 0.8,
    medium: 0.5,
    low: 0.2,
    informational: 0.1,
  };
  return scores[priority] ?? 0.5;
}

export function createDefaultSimulationInput(): SimulationInput {
  return {
    plan: {
      id: '',
      title: '',
      summary: '',
      generatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      deviceProfile: {
        profileType: 'general' as never,
        performanceTier: 'mid' as never,
        primaryWorkload: 'general' as never,
        deviceName: 'Unknown',
        confidenceScore: 0.5,
      },
      optimizationGoal: 'balanced',
      strategy: 'balanced',
      estimatedDuration: 0,
      estimatedBenefits: {
        estimatedHealthGain: 0,
        estimatedStorageRecovery: 0,
        estimatedPerformanceGain: 0,
        estimatedPrivacyGain: 0,
        estimatedStartupGain: 0,
        estimatedTimeSaved: 0,
      },
      estimatedRisk: 'low',
      confidence: 0.5,
      priority: 'medium',
      recommendedActions: [],
      deferredActions: [],
      excludedActions: [],
      rollbackAvailable: true,
      requiresConfirmation: false,
      safetyAssessment: {
        overallRisk: 'low',
        confirmationRequired: false,
        rollbackAvailable: true,
        protectedAreas: [],
        unsafeActions: [],
        skippedActions: [],
        riskScore: 0.2,
      },
      eligibilityResult: {
        eligible: true,
        eligibleActions: [],
        ineligibleActions: [],
      },
      futureMetadata: {},
    },
    systemState: {
      cpuUsage: 0,
      memoryUsage: 0,
      diskActivity: 0,
      batteryLevel: null,
      powerSource: 'ac',
      userActive: false,
      fullScreenApp: false,
      gamingMode: false,
      windowsUpdateActive: false,
      networkActivity: 0,
      thermalState: 'normal',
      storagePressure: 0,
      isIdle: true,
      timestamp: new Date().toISOString(),
    },
    healthScore: 50,
    deviceProfileType: 'general',
    optimizationHistory: [],
    futureMetadata: {},
  };
}
