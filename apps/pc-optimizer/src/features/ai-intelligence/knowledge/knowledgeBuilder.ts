/**
 * Knowledge Builder — the pipeline that transforms AIContext into KnowledgeObject.
 *
 * Pipeline:
 *   AI Context → Knowledge Analyzer (facts) → Evidence Builder →
 *   Relationship Engine → Trend Analyzer → Change Detector →
 *   Insight Classifier → Knowledge Graph → Knowledge Object
 *
 * Future AI components consume Knowledge only. Never consume raw Context directly.
 */
import type {
  AIContext,
  KnowledgeObject,
  KnowledgeFact,
  KnowledgeRelationship,
  KnowledgeChange,
  KnowledgeTrend,
  KnowledgeSummary,
  KnowledgeInsight,
  KnowledgeMetadata,
  KnowledgeStatistics,
  KnowledgeConfiguration,
  KnowledgeGraph as IKnowledgeGraph,
  ContextSnapshot,
  SummaryType,
  SummaryStatement,
} from './types';
import { generateKnowledgeId, factsToSnapshot } from './types';
import { KnowledgeAnalyzer } from './knowledgeAnalyzer';
import { EvidenceBuilder } from './evidenceBuilder';
import { RelationshipEngine } from './relationshipEngine';
import { TrendAnalyzer } from './trendAnalyzer';
import { ChangeDetector } from './changeDetector';
import { InsightClassifier } from './insightClassifier';
import { KnowledgeGraphBuilder } from './knowledgeGraph';
import type { KnowledgeValidator } from './knowledgeValidator';
import type { KnowledgeRegistry } from './knowledgeRegistry';
import { knowledgeEvents } from './knowledgeEvents';

export class KnowledgeBuilder {
  private _evidenceBuilder: EvidenceBuilder;
  private _analyzer: KnowledgeAnalyzer;
  private _relationshipEngine: RelationshipEngine;
  private _trendAnalyzer: TrendAnalyzer;
  private _changeDetector: ChangeDetector;
  private _insightClassifier: InsightClassifier;
  private _graphBuilder: KnowledgeGraphBuilder;
  private _validator: KnowledgeValidator;
  private _registry: KnowledgeRegistry;
  private _config: KnowledgeConfiguration;
  private _snapshots: ContextSnapshot[] = [];

  constructor(
    registry: KnowledgeRegistry,
    validator: KnowledgeValidator,
    config: KnowledgeConfiguration,
  ) {
    this._registry = registry;
    this._validator = validator;
    this._config = config;
    this._evidenceBuilder = new EvidenceBuilder();
    this._analyzer = new KnowledgeAnalyzer(this._evidenceBuilder);
    this._relationshipEngine = new RelationshipEngine(this._evidenceBuilder);
    this._trendAnalyzer = new TrendAnalyzer(this._evidenceBuilder);
    this._changeDetector = new ChangeDetector(this._evidenceBuilder);
    this._insightClassifier = new InsightClassifier(this._evidenceBuilder);
    this._graphBuilder = new KnowledgeGraphBuilder(config.graphMaxNodes, config.graphMaxEdges);
  }

  updateConfig(config: KnowledgeConfiguration): void {
    this._config = config;
    this._graphBuilder.setLimits(config.graphMaxNodes, config.graphMaxEdges);
  }

  /**
   * Build a KnowledgeObject from an AIContext.
   */
  async build(context: AIContext): Promise<KnowledgeObject> {
    const startTime = Date.now();

    knowledgeEvents.emit('knowledge_build_started', {
      contextId: context.metadata.contextId,
      timestamp: new Date().toISOString(),
    });

    // Step 1: Extract facts
    let facts = this._analyzer.analyze(context);

    // Step 2: Collect facts from registered plugins
    const plugins = this._registry.getAvailablePlugins();
    for (const plugin of plugins) {
      try {
        const pluginFacts = plugin.buildFacts(context);
        facts = facts.concat(pluginFacts);
      } catch (err) {
        knowledgeEvents.emit('knowledge_failed', {
          plugin: plugin.getPluginName(),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Step 3: Build relationships
    let relationships: KnowledgeRelationship[] = [];
    if (this._config.enableRelationships) {
      relationships = this._relationshipEngine.buildRelationships(facts, context);

      // Plugin relationships
      for (const plugin of plugins) {
        if (plugin.buildRelationships) {
          try {
            const pluginRels = plugin.buildRelationships(facts, context);
            relationships = relationships.concat(pluginRels);
          } catch {
            // Continue on plugin failure
          }
        }
      }

      for (const rel of relationships) {
        knowledgeEvents.emit('relationship_created', { relationshipId: rel.id });
      }
    }

    // Step 4: Detect changes
    let changes: KnowledgeChange[] = [];
    if (this._config.enableChanges) {
      this._changeDetector.setPreviousSnapshot(
        this._snapshots.length > 0 ? this._snapshots[this._snapshots.length - 1]! : null,
      );
      changes = this._changeDetector.detectChanges(facts);
      for (const change of changes) {
        if (change.changeType !== 'unchanged' && change.changeType !== 'unknown') {
          knowledgeEvents.emit('change_detected', {
            factId: change.factId,
            changeType: change.changeType,
          });
        }
      }
    }

    // Step 5: Analyze trends
    let trends: KnowledgeTrend[] = [];
    if (this._config.enableTrends) {
      this._trendAnalyzer.setSnapshots(this._snapshots);
      trends = this._trendAnalyzer.analyzeTrends(facts);
      for (const trend of trends) {
        if (trend.direction !== 'unknown' && trend.direction !== 'stable') {
          knowledgeEvents.emit('trend_detected', {
            factId: trend.factId,
            direction: trend.direction,
          });
        }
      }
    }

    // Step 6: Build summaries
    let summaries: KnowledgeSummary[] = [];
    if (this._config.enableSummaries) {
      summaries = this._buildSummaries(facts, context);

      // Plugin summaries
      for (const plugin of plugins) {
        if (plugin.buildSummaries) {
          try {
            const pluginSummaries = plugin.buildSummaries(facts, context);
            summaries = summaries.concat(pluginSummaries);
          } catch {
            // Continue on plugin failure
          }
        }
      }
    }

    // Step 7: Classify insights
    let insights: KnowledgeInsight[] = [];
    if (this._config.enableInsights) {
      insights = this._insightClassifier.classify(facts, relationships, changes, trends);
    }

    // Step 8: Build knowledge graph
    let graph: IKnowledgeGraph = { nodes: [], edges: [], nodeCount: 0, edgeCount: 0 };
    if (this._config.enableGraph) {
      graph = this._graphBuilder.build(facts, relationships);
    }

    // Save snapshot for future change detection and trend analysis
    const snapshot = factsToSnapshot(facts, context.metadata.contextId);
    this._snapshots.push(snapshot);
    if (this._snapshots.length > this._config.maxHistorySnapshots) {
      this._snapshots = this._snapshots.slice(-this._config.maxHistorySnapshots);
    }

    // Build metadata
    const buildTime = Date.now() - startTime;
    const metadata: KnowledgeMetadata = {
      knowledgeId: generateKnowledgeId(),
      contextId: context.metadata.contextId,
      generatedAt: new Date().toISOString(),
      knowledgeVersion: this._config.knowledgeVersion,
      generationTimeMs: buildTime,
      factsCount: facts.length,
      relationshipsCount: relationships.length,
      changesCount: changes.length,
      trendsCount: trends.length,
      summariesCount: summaries.length,
      insightsCount: insights.length,
    };

    // Build statistics
    const statistics = this._buildStatistics(facts, relationships, changes, trends, summaries, insights, graph, buildTime);

    // Assemble knowledge object
    const knowledge: KnowledgeObject = {
      metadata,
      facts,
      relationships,
      changes,
      trends,
      summaries,
      insights,
      graph,
      provenance: context.provenance,
      statistics,
    };

    // Validate
    const validation = this._validator.validate(knowledge);
    knowledgeEvents.emit('knowledge_validated', {
      knowledgeId: metadata.knowledgeId,
      valid: validation.valid,
      issueCount: validation.issues.length,
    });

    knowledgeEvents.emit('knowledge_build_completed', {
      knowledgeId: metadata.knowledgeId,
      contextId: context.metadata.contextId,
      buildTimeMs: buildTime,
      factsCount: facts.length,
      relationshipsCount: relationships.length,
    });

    return knowledge;
  }

  /**
   * Get accumulated snapshots.
   */
  getSnapshots(): ContextSnapshot[] {
    return [...this._snapshots];
  }

  /**
   * Clear snapshots.
   */
  clearSnapshots(): void {
    this._snapshots = [];
  }

  // ── Private: Summaries ─────────────────────────────────────

  private _buildSummaries(facts: KnowledgeFact[], context: AIContext): KnowledgeSummary[] {
    const summaries: KnowledgeSummary[] = [];
    const ts = context.metadata.timestamp;

    // Group facts by category
    const byCategory = new Map<string, KnowledgeFact[]>();
    for (const fact of facts) {
      const list = byCategory.get(fact.category) ?? [];
      list.push(fact);
      byCategory.set(fact.category, list);
    }

    // Health summary
    if (byCategory.has('health')) {
      summaries.push(this._buildCategorySummary('health', 'Health Summary', byCategory.get('health')!, ts));
    }

    // Storage summary
    if (byCategory.has('storage')) {
      summaries.push(this._buildCategorySummary('storage', 'Storage Summary', byCategory.get('storage')!, ts));
    }

    // Privacy summary
    if (byCategory.has('privacy')) {
      summaries.push(this._buildCategorySummary('privacy', 'Privacy Summary', byCategory.get('privacy')!, ts));
    }

    // Performance summary
    if (byCategory.has('performance')) {
      summaries.push(this._buildCategorySummary('performance', 'Performance Summary', byCategory.get('performance')!, ts));
    }

    // Windows summary
    if (byCategory.has('windows')) {
      summaries.push(this._buildCategorySummary('windows', 'Windows Summary', byCategory.get('windows')!, ts));
    }

    // Startup summary
    if (byCategory.has('startup')) {
      summaries.push(this._buildCategorySummary('startup', 'Startup Summary', byCategory.get('startup')!, ts));
    }

    // Browser summary
    if (byCategory.has('browser')) {
      summaries.push(this._buildCategorySummary('browser', 'Browser Summary', byCategory.get('browser')!, ts));
    }

    // Duplicates summary
    if (byCategory.has('duplicates')) {
      summaries.push(this._buildCategorySummary('duplicates', 'Duplicates Summary', byCategory.get('duplicates')!, ts));
    }

    // History summary
    if (byCategory.has('history')) {
      summaries.push(this._buildCategorySummary('history', 'History Summary', byCategory.get('history')!, ts));
    }

    // Overall summary
    summaries.push(this._buildOverallSummary(facts, ts));

    return summaries;
  }

  private _buildCategorySummary(
    category: string,
    title: string,
    facts: KnowledgeFact[],
    timestamp: string,
  ): KnowledgeSummary {
    const statements: SummaryStatement[] = [];
    for (const fact of facts) {
      const valueStr = typeof fact.value === 'object' ? JSON.stringify(fact.value) : String(fact.value);
      const unitStr = fact.unit ? ` ${fact.unit}` : '';
      statements.push({
        text: `${fact.name}: ${valueStr}${unitStr}`,
        factIds: [fact.id],
        confidence: fact.confidence,
      });
    }

    const avgConfidence = facts.length > 0
      ? facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
      : 1.0;

    return {
      type: category as SummaryType,
      title,
      statements,
      evidence: this._evidenceBuilder.fromDataPoints(
        `${title} based on ${facts.length} facts`,
        facts.map((f) => ({
          source: f.sourceProvider,
          metric: f.name,
          value: f.value as never,
          timestamp: f.extractedAt,
        })),
        facts.map((f) => f.sourceProvider),
        timestamp,
        avgConfidence,
      ),
      confidence: avgConfidence,
      generatedAt: new Date().toISOString(),
    };
  }

  private _buildOverallSummary(facts: KnowledgeFact[], timestamp: string): KnowledgeSummary {
    const statements: SummaryStatement[] = [];
    const categories = new Set(facts.map((f) => f.category));

    for (const category of categories) {
      const catFacts = facts.filter((f) => f.category === category);
      statements.push({
        text: `${category}: ${catFacts.length} facts extracted`,
        factIds: catFacts.map((f) => f.id),
        confidence: catFacts.reduce((sum, f) => sum + f.confidence, 0) / catFacts.length,
      });
    }

    const avgConfidence = facts.length > 0
      ? facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
      : 1.0;

    return {
      type: 'overall',
      title: 'Overall System Summary',
      statements,
      evidence: this._evidenceBuilder.fromDataPoints(
        `Overall summary based on ${facts.length} facts across ${categories.size} categories`,
        facts.slice(0, 20).map((f) => ({
          source: f.sourceProvider,
          metric: f.name,
          value: f.value as never,
          timestamp: f.extractedAt,
        })),
        [...new Set(facts.map((f) => f.sourceProvider))],
        timestamp,
        avgConfidence,
      ),
      confidence: avgConfidence,
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Private: Statistics ────────────────────────────────────

  private _buildStatistics(
    facts: KnowledgeFact[],
    relationships: KnowledgeRelationship[],
    changes: KnowledgeChange[],
    trends: KnowledgeTrend[],
    summaries: KnowledgeSummary[],
    insights: KnowledgeInsight[],
    graph: { nodes: unknown[]; edges: unknown[] },
    buildTime: number,
  ): KnowledgeStatistics {
    const factsByCategory: Record<string, number> = {};
    for (const f of facts) {
      factsByCategory[f.category] = (factsByCategory[f.category] ?? 0) + 1;
    }

    const changesByType: Record<string, number> = {};
    for (const c of changes) {
      changesByType[c.changeType] = (changesByType[c.changeType] ?? 0) + 1;
    }

    const trendsByDirection: Record<string, number> = {};
    for (const t of trends) {
      trendsByDirection[t.direction] = (trendsByDirection[t.direction] ?? 0) + 1;
    }

    const insightsByType: Record<string, number> = {};
    const insightsBySeverity: Record<string, number> = {};
    for (const i of insights) {
      insightsByType[i.type] = (insightsByType[i.type] ?? 0) + 1;
      insightsBySeverity[i.severity] = (insightsBySeverity[i.severity] ?? 0) + 1;
    }

    const totalEvidence = facts.reduce((sum, f) => sum + f.evidence.dataPoints.length, 0) +
      relationships.reduce((sum, r) => sum + r.evidence.dataPoints.length, 0);

    const avgConfidence = facts.length > 0
      ? facts.reduce((sum, f) => sum + f.confidence, 0) / facts.length
      : 0;

    const maxPossible = graph.nodes.length > 1
      ? (graph.nodes.length * (graph.nodes.length - 1)) / 2
      : 1;

    return {
      totalFacts: facts.length,
      totalRelationships: relationships.length,
      totalChanges: changes.length,
      totalTrends: trends.length,
      totalSummaries: summaries.length,
      totalInsights: insights.length,
      totalEvidencePieces: totalEvidence,
      averageConfidence: avgConfidence,
      factsByCategory,
      changesByType,
      trendsByDirection,
      insightsByType,
      insightsBySeverity,
      graphDensity: graph.edges.length / maxPossible,
      lastBuildTimeMs: buildTime,
      lastBuildAt: new Date().toISOString(),
    };
  }
}
