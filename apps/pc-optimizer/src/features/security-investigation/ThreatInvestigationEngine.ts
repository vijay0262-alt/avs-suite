/**
 * ThreatInvestigationEngine — the orchestrator.
 *
 * Consumes existing SecurityThreat objects and transforms them into
 * comprehensive, human-readable investigations.
 *
 * Pipeline:
 *   1. Receive threats from SecuritySnapshot / ScanResult
 *   2. Correlate related threats into groups
 *   3. For each group, build:
 *      - Summary, Explanation, Severity, Confidence
 *      - Evidence collection, Timeline, Relationship graph
 *      - Affected components, MITRE mappings
 *      - Recommendations, Impact/Recovery estimates
 *      - False-positive analysis, Context
 *   4. Generate reports if enabled
 *   5. Emit events
 *
 * Never performs scanning directly. Never performs remediation.
 */
import type {
  Threat,
  ThreatInvestigation,
  InvestigationInput,
  InvestigationConfiguration,
  AffectedComponent,
  FalsePositiveAnalysis,
  MitreAttackMapping,
  ThreatReport,
  InvestigationStatus,
} from './types';

import { ThreatConfigurationManager } from './ThreatConfiguration';
import { ThreatKnowledgeBase } from './ThreatKnowledgeBase';
import { ThreatSeverityEngine } from './ThreatSeverityEngine';
import { ThreatConfidenceEngine } from './ThreatConfidenceEngine';
import { ThreatEvidenceCollector } from './ThreatEvidenceCollector';
import { ThreatTimelineBuilder } from './ThreatTimelineBuilder';
import { ThreatCorrelationEngine } from './ThreatCorrelationEngine';
import { ThreatRelationshipGraphBuilder } from './ThreatRelationshipGraph';
import { ThreatExplanationEngine } from './ThreatExplanationEngine';
import { ThreatSummaryBuilder } from './ThreatSummaryBuilder';
import { ThreatRecommendationEngine } from './ThreatRecommendationEngine';
import { ThreatContextBuilder } from './ThreatContextBuilder';
import { ThreatReportGenerator } from './ThreatReportGenerator';
import { ThreatHistory } from './ThreatHistory';
import { ThreatDashboardProvider } from './ThreatDashboardProvider';
import { threatEventBus } from './ThreatEvents';

export class ThreatInvestigationEngine {
  private configManager: ThreatConfigurationManager;
  private knowledgeBase: ThreatKnowledgeBase;
  private severityEngine: ThreatSeverityEngine;
  private confidenceEngine: ThreatConfidenceEngine;
  private evidenceCollector: ThreatEvidenceCollector;
  private timelineBuilder: ThreatTimelineBuilder;
  private correlationEngine: ThreatCorrelationEngine;
  private graphBuilder: ThreatRelationshipGraphBuilder;
  private explanationEngine: ThreatExplanationEngine;
  private summaryBuilder: ThreatSummaryBuilder;
  private recommendationEngine: ThreatRecommendationEngine;
  private contextBuilder: ThreatContextBuilder;
  private reportGenerator: ThreatReportGenerator;
  private history: ThreatHistory;
  private dashboardProvider: ThreatDashboardProvider;

  private investigations: Map<string, ThreatInvestigation> = new Map();
  private reports: Map<string, ThreatReport> = new Map();

  constructor(config?: Partial<InvestigationConfiguration>) {
    this.configManager = new ThreatConfigurationManager(config);
    this.knowledgeBase = new ThreatKnowledgeBase();
    this.severityEngine = new ThreatSeverityEngine();
    this.confidenceEngine = new ThreatConfidenceEngine();
    this.evidenceCollector = new ThreatEvidenceCollector();
    this.timelineBuilder = new ThreatTimelineBuilder();
    this.correlationEngine = new ThreatCorrelationEngine();
    this.graphBuilder = new ThreatRelationshipGraphBuilder();
    this.explanationEngine = new ThreatExplanationEngine(this.knowledgeBase);
    this.summaryBuilder = new ThreatSummaryBuilder(this.knowledgeBase);
    this.recommendationEngine = new ThreatRecommendationEngine(this.knowledgeBase);
    this.contextBuilder = new ThreatContextBuilder();
    this.reportGenerator = new ThreatReportGenerator();
    this.history = new ThreatHistory(this.configManager.getMaxInvestigations());
    this.dashboardProvider = new ThreatDashboardProvider();
  }

  investigate(input: InvestigationInput): ThreatInvestigation[] {
    if (!this.configManager.isEnabled()) return [];

    const start = Date.now();
    const { threats, snapshot, historySummary, processContext, hardwareContext, networkContext } = input;

    if (threats.length === 0) return [];

    // Step 1: Correlate threats into groups
    let groups;
    if (this.configManager.isCorrelationEnabled()) {
      groups = this.correlationEngine.correlate(threats, this.configManager.getCorrelationTimeWindow());
    } else {
      groups = threats.map((t) => ({ primaryThreatId: t.id, threatIds: [t.id], relationships: [] }));
    }

    // Step 2: Build investigation for each group
    const investigations: ThreatInvestigation[] = [];

    for (const group of groups) {
      const groupThreats = threats.filter((t) => group.threatIds.includes(t.id));
      const investigation = this.buildInvestigation(
        groupThreats,
        group.relationships,
        group.primaryThreatId,
        threats,
        snapshot,
        historySummary,
        processContext,
        hardwareContext,
        networkContext,
        start,
      );

      investigations.push(investigation);
      this.investigations.set(investigation.id, investigation);
      this.history.recordCreated(investigation.id);
      threatEventBus.emitInvestigationCreated(investigation.id, `Investigation created: ${investigation.summary.title}`);

      // Generate report if enabled
      if (this.configManager.isReportsEnabled() && this.configManager.get().autoGenerateReports) {
        const report = this.reportGenerator.generate(
          investigation,
          groupThreats,
          investigation.evidence,
          investigation.timeline,
          investigation.recommendedActions,
          investigation.falsePositiveAnalysis,
          investigation.affectedComponents,
        );
        this.reports.set(investigation.id, report);
        threatEventBus.emitReportGenerated(investigation.id, 'Report generated automatically');
      }
    }

    // Enforce max investigations limit
    if (this.investigations.size > this.configManager.getMaxInvestigations()) {
      const sorted = [...this.investigations.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      const toRemove = sorted.slice(this.configManager.getMaxInvestigations());
      for (const inv of toRemove) {
        this.investigations.delete(inv.id);
        this.reports.delete(inv.id);
      }
    }

    return investigations;
  }

  private buildInvestigation(
    groupThreats: Threat[],
    relationships: ThreatInvestigation['relationships'],
    primaryThreatId: string,
    allThreats: Threat[],
    snapshot: InvestigationInput['snapshot'],
    historySummary: InvestigationInput['historySummary'],
    processContext: InvestigationInput['processContext'],
    hardwareContext: InvestigationInput['hardwareContext'],
    networkContext: InvestigationInput['networkContext'],
    startTime: number,
  ): ThreatInvestigation {
    const now = Date.now();
    const investigationId = `inv-${now}-${Math.random().toString(36).slice(2, 8)}`;

    // Build summary
    const summary = this.summaryBuilder.build(groupThreats);

    // Collect evidence
    const evidence = this.evidenceCollector.collect(groupThreats);
    threatEventBus.emitEvidenceCollected(investigationId, { total: evidence.total });

    // Build timeline
    const timeline = this.configManager.isTimelineEnabled()
      ? this.timelineBuilder.build(groupThreats)
      : [];

    // Compute severity
    const severity = this.severityEngine.compute(groupThreats);

    // Analyze false positives
    const falsePositiveAnalysis = this.analyzeFalsePositives(groupThreats);

    // Compute confidence (with false-positive factors)
    const confidence = this.confidenceEngine.compute(
      groupThreats,
      relationships.length,
      falsePositiveAnalysis.confidenceReducingFactors,
    );

    // Build explanation
    const explanation = this.explanationEngine.explain(groupThreats, evidence, confidence, falsePositiveAnalysis);

    // Generate recommendations
    const recommendedActions = this.recommendationEngine.generate(groupThreats);
    const estimatedImpact = this.recommendationEngine.getEstimatedImpact(groupThreats);
    const estimatedRecovery = this.recommendationEngine.getEstimatedRecovery(groupThreats);

    // Build affected components
    const affectedComponents = this.buildAffectedComponents(groupThreats);

    // Collect MITRE mappings
    const mitreAttack = this.collectMitreMappings(groupThreats);

    // Build relationship graph
    const relationshipGraph = this.configManager.isVisualizationEnabled()
      ? this.graphBuilder.build(groupThreats, relationships, primaryThreatId)
      : { nodes: [], edges: [], clusters: [], totalNodes: 0, totalEdges: 0 };

    // Build context
    const context = this.configManager.isContextualAnalysisEnabled()
      ? this.contextBuilder.build(groupThreats, allThreats, snapshot, historySummary, processContext, hardwareContext, networkContext)
      : {
          systemState: { osVersion: 'Unknown', lastBootTime: 0, uptime: 0, securityScore: 0, providersActive: 0, providersTotal: 0 },
          relatedThreats: [],
          historicalContext: null,
          processContext: null,
          hardwareContext: null,
          networkContext: null,
        };

    // Emit correlation event if correlations found
    if (relationships.length > 0) {
      threatEventBus.emitCorrelationFound(investigationId, { count: relationships.length });
    }

    return {
      id: investigationId,
      threatIds: groupThreats.map((t) => t.id),
      primaryThreatId,
      summary,
      explanation,
      severity,
      confidence,
      risk: this.severityToRisk(severity.level),
      evidence,
      timeline,
      relationships,
      affectedComponents,
      mitreAttack,
      recommendedActions,
      estimatedImpact,
      estimatedRecovery,
      falsePositiveAnalysis,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      metadata: {
        source: relationships.length > 0 ? 'correlation' : 'automatic',
        version: '1.0.0',
        engineVersion: '1.2.0',
        processingTime: Date.now() - startTime,
        threatsProcessed: groupThreats.length,
        correlationsFound: relationships.length,
      },
      relationshipGraph,
      context,
    };
  }

  private analyzeFalsePositives(threats: Threat[]): FalsePositiveAnalysis {
    const reasons: string[] = [];
    const confidenceReducingFactors: string[] = [];
    const additionalVerificationSteps: string[] = [];
    const similarKnownGoodSoftware: string[] = [];

    let couldBeLegitimate = false;

    for (const threat of threats) {
      const kbEntry = this.knowledgeBase.get(threat.category);
      if (!kbEntry) continue;

      // Check false-positive scenarios from knowledge base
      for (const scenario of kbEntry.falsePositiveScenarios) {
        reasons.push(scenario);
        similarKnownGoodSoftware.push(scenario);
        couldBeLegitimate = true;
      }

      // Low confidence threats have higher false-positive potential
      if (threat.confidence < 0.5) {
        confidenceReducingFactors.push(`Threat "${threat.name}" has low confidence (${(threat.confidence * 100).toFixed(0)}%)`);
      }

      // Single evidence items are weaker
      if (threat.evidence.length < 2) {
        confidenceReducingFactors.push(`Threat "${threat.name}" has limited evidence (${threat.evidence.length} item)`);
      }

      // Unknown category is less certain
      if (threat.category === 'unknown') {
        confidenceReducingFactors.push('Threat category is unknown — behavior may be legitimate');
      }
    }

    // Add verification steps
    if (couldBeLegitimate) {
      additionalVerificationSteps.push('Verify the software is not a legitimate application with similar behavior');
      additionalVerificationSteps.push('Check if the user intentionally installed the detected software');
      additionalVerificationSteps.push('Research the process name and publisher online');
    }
    additionalVerificationSteps.push('Run a full system scan to check for additional indicators');
    additionalVerificationSteps.push('Monitor the system for changes after detection');

    return {
      couldBeLegitimate,
      reasons: [...new Set(reasons)].slice(0, 5),
      confidenceReducingFactors: [...new Set(confidenceReducingFactors)],
      additionalVerificationSteps: [...new Set(additionalVerificationSteps)],
      similarKnownGoodSoftware: [...new Set(similarKnownGoodSoftware)].slice(0, 5),
    };
  }

  private buildAffectedComponents(threats: Threat[]): AffectedComponent[] {
    const components: AffectedComponent[] = [];
    const seen = new Set<string>();

    for (const threat of threats) {
      for (const asset of threat.affectedAssets) {
        const key = `${asset.type}:${asset.path}`;
        if (seen.has(key)) continue;
        seen.add(key);

        components.push({
          type: this.mapAssetType(asset.type),
          name: asset.name,
          path: asset.path,
          status: 'affected',
          description: `Affected ${asset.type} detected by ${threat.detectionSource}`,
        });
      }
    }

    return components;
  }

  private mapAssetType(assetType: string): AffectedComponent['type'] {
    const mapping: Record<string, AffectedComponent['type']> = {
      file: 'file',
      process: 'process',
      registry: 'registry',
      service: 'service',
      scheduled_task: 'scheduled_task',
      startup_entry: 'startup_entry',
      browser_extension: 'browser_extension',
      network: 'network_connection',
    };
    return mapping[assetType] ?? 'file';
  }

  private collectMitreMappings(threats: Threat[]): MitreAttackMapping[] {
    const mappings: MitreAttackMapping[] = [];
    const seen = new Set<string>();

    for (const t of threats) {
      if (t.mitreAttack) {
        const key = t.mitreAttack.technique;
        if (!seen.has(key)) {
          seen.add(key);
          mappings.push(t.mitreAttack);
        }
      }
    }

    return mappings;
  }

  private severityToRisk(severity: string): ThreatInvestigation['risk'] {
    switch (severity) {
      case 'critical': return 'severe';
      case 'high': return 'high';
      case 'medium': return 'moderate';
      case 'low': return 'low';
      default: return 'none';
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  getInvestigation(id: string): ThreatInvestigation | null {
    return this.investigations.get(id) ?? null;
  }

  getAllInvestigations(): ThreatInvestigation[] {
    return [...this.investigations.values()];
  }

  getActiveInvestigations(): ThreatInvestigation[] {
    return [...this.investigations.values()].filter((i) => i.status === 'open' || i.status === 'reviewing');
  }

  getReport(investigationId: string): ThreatReport | null {
    return this.reports.get(investigationId) ?? null;
  }

  generateReport(investigationId: string): ThreatReport | null {
    const inv = this.investigations.get(investigationId);
    if (!inv) return null;

    const report = this.reportGenerator.generate(
      inv,
      [], // threats are already processed
      inv.evidence,
      inv.timeline,
      inv.recommendedActions,
      inv.falsePositiveAnalysis,
      inv.affectedComponents,
    );

    this.reports.set(investigationId, report);
    threatEventBus.emitReportGenerated(investigationId, 'Report generated on demand');
    return report;
  }

  updateStatus(investigationId: string, status: InvestigationStatus, notes?: string): void {
    const inv = this.investigations.get(investigationId);
    if (!inv) return;

    inv.status = status;
    inv.updatedAt = Date.now();

    switch (status) {
      case 'resolved':
        this.history.recordResolved(investigationId, notes);
        threatEventBus.emitInvestigationResolved(investigationId, notes);
        break;
      case 'false_positive':
        this.history.recordFalsePositive(investigationId, notes);
        threatEventBus.emitFalsePositive(investigationId, notes);
        break;
      case 'ignored':
        this.history.recordIgnored(investigationId, notes);
        break;
      default:
        this.history.recordUpdated(investigationId, notes);
        threatEventBus.emitInvestigationUpdated(investigationId, notes);
    }
  }

  getHistory() {
    return this.history.getSummary();
  }

  getDashboard() {
    return this.dashboardProvider.build([...this.investigations.values()]);
  }

  getConfiguration(): InvestigationConfiguration {
    return this.configManager.get();
  }

  updateConfiguration(updates: Partial<InvestigationConfiguration>): void {
    this.configManager.update(updates);
  }

  clear(): void {
    this.investigations.clear();
    this.reports.clear();
    this.history.clear();
  }
}
