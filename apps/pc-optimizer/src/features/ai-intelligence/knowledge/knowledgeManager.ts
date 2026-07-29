/**
 * Knowledge Manager — main orchestrator for the AI Knowledge Engine.
 *
 * Public APIs:
 *   buildKnowledge(context)
 *   getKnowledge()
 *   getFacts()
 *   getRelationships()
 *   getEvidence()
 *   getChanges()
 *   getTrends()
 *   getSummaries()
 *   getKnowledgeStatistics()
 *   validateKnowledge()
 *
 * The Knowledge Engine transforms raw AIContext into structured, explainable
 * knowledge. It NEVER generates recommendations. It ONLY describes what is true.
 *
 * Future AI components consume Knowledge only. Never consume raw Context directly.
 */
import type {
  AIContext,
  KnowledgeObject,
  KnowledgeFact,
  KnowledgeRelationship,
  KnowledgeEvidence,
  KnowledgeChange,
  KnowledgeTrend,
  KnowledgeSummary,
  KnowledgeStatistics,
  KnowledgeValidationResult,
  KnowledgeConfiguration,
  KnowledgeBuilderPlugin,
} from './types';
import { KnowledgeRegistry } from './knowledgeRegistry';
import { KnowledgeValidator } from './knowledgeValidator';
import { KnowledgeBuilder } from './knowledgeBuilder';
import { knowledgeEvents } from './knowledgeEvents';
import { createKnowledgeConfig } from './knowledgeConfiguration';

export class KnowledgeManager {
  private _registry: KnowledgeRegistry;
  private _validator: KnowledgeValidator;
  private _builder: KnowledgeBuilder;
  private _config: KnowledgeConfiguration;
  private _currentKnowledge: KnowledgeObject | null = null;

  constructor(config?: Partial<KnowledgeConfiguration>) {
    this._config = createKnowledgeConfig(config);
    this._registry = new KnowledgeRegistry();
    this._validator = new KnowledgeValidator(this._config);
    this._builder = new KnowledgeBuilder(this._registry, this._validator, this._config);
  }

  /**
   * Build knowledge from an AIContext.
   */
  async buildKnowledge(context: AIContext): Promise<KnowledgeObject> {
    try {
      const knowledge = await this._builder.build(context);
      this._currentKnowledge = knowledge;

      knowledgeEvents.emit('knowledge_updated', {
        knowledgeId: knowledge.metadata.knowledgeId,
        timestamp: new Date().toISOString(),
      });

      return knowledge;
    } catch (err) {
      knowledgeEvents.emit('knowledge_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Get the current knowledge object (null if not built).
   */
  getKnowledge(): KnowledgeObject | null {
    return this._currentKnowledge;
  }

  /**
   * Get all facts from current knowledge.
   */
  getFacts(): KnowledgeFact[] {
    return this._currentKnowledge?.facts ?? [];
  }

  /**
   * Get facts by category.
   */
  getFactsByCategory(category: string): KnowledgeFact[] {
    return this.getFacts().filter((f) => f.category === category);
  }

  /**
   * Get a specific fact by ID.
   */
  getFactById(id: string): KnowledgeFact | null {
    return this.getFacts().find((f) => f.id === id) ?? null;
  }

  /**
   * Get all relationships from current knowledge.
   */
  getRelationships(): KnowledgeRelationship[] {
    return this._currentKnowledge?.relationships ?? [];
  }

  /**
   * Get relationships for a specific fact.
   */
  getRelationshipsForFact(factId: string): KnowledgeRelationship[] {
    return this.getRelationships().filter(
      (r) => r.sourceFactId === factId || r.targetFactId === factId,
    );
  }

  /**
   * Get all evidence from current knowledge.
   */
  getEvidence(): KnowledgeEvidence[] {
    if (!this._currentKnowledge) return [];
    const evidence: KnowledgeEvidence[] = [];
    evidence.push(...this._currentKnowledge.facts.map((f) => f.evidence));
    evidence.push(...this._currentKnowledge.relationships.map((r) => r.evidence));
    evidence.push(...this._currentKnowledge.changes.map((c) => c.evidence));
    evidence.push(...this._currentKnowledge.trends.map((t) => t.evidence));
    evidence.push(...this._currentKnowledge.summaries.map((s) => s.evidence));
    return evidence;
  }

  /**
   * Get evidence for a specific fact.
   */
  getEvidenceForFact(factId: string): KnowledgeEvidence | null {
    const fact = this.getFactById(factId);
    return fact?.evidence ?? null;
  }

  /**
   * Get all changes from current knowledge.
   */
  getChanges(): KnowledgeChange[] {
    return this._currentKnowledge?.changes ?? [];
  }

  /**
   * Get changes by type.
   */
  getChangesByType(type: string): KnowledgeChange[] {
    return this.getChanges().filter((c) => c.changeType === type);
  }

  /**
   * Get all trends from current knowledge.
   */
  getTrends(): KnowledgeTrend[] {
    return this._currentKnowledge?.trends ?? [];
  }

  /**
   * Get trends by direction.
   */
  getTrendsByDirection(direction: string): KnowledgeTrend[] {
    return this.getTrends().filter((t) => t.direction === direction);
  }

  /**
   * Get all summaries from current knowledge.
   */
  getSummaries(): KnowledgeSummary[] {
    return this._currentKnowledge?.summaries ?? [];
  }

  /**
   * Get a specific summary by type.
   */
  getSummaryByType(type: string): KnowledgeSummary | null {
    return this.getSummaries().find((s) => s.type === type) ?? null;
  }

  /**
   * Get knowledge statistics.
   */
  getKnowledgeStatistics(): KnowledgeStatistics | null {
    return this._currentKnowledge?.statistics ?? null;
  }

  /**
   * Validate the current knowledge object.
   */
  validateKnowledge(): KnowledgeValidationResult {
    if (!this._currentKnowledge) {
      return { valid: false, issues: [{ level: 'error', code: 'NO_KNOWLEDGE', message: 'No knowledge object available' }] };
    }
    return this._validator.validate(this._currentKnowledge);
  }

  /**
   * Validate a specific knowledge object.
   */
  validate(knowledge: KnowledgeObject): KnowledgeValidationResult {
    return this._validator.validate(knowledge);
  }

  /**
   * Register a knowledge builder plugin.
   */
  registerPlugin(plugin: KnowledgeBuilderPlugin): boolean {
    return this._registry.registerPlugin(plugin);
  }

  /**
   * Unregister a knowledge builder plugin.
   */
  unregisterPlugin(name: string): boolean {
    return this._registry.unregisterPlugin(name);
  }

  /**
   * Get all registered plugins.
   */
  getPlugins(): KnowledgeBuilderPlugin[] {
    return this._registry.getPlugins();
  }

  /**
   * Get plugin names.
   */
  getPluginNames(): string[] {
    return this._registry.getPluginNames();
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<KnowledgeConfiguration>): void {
    this._config = createKnowledgeConfig({ ...this._config, ...config });
    this._validator.updateConfig(this._config);
    this._builder.updateConfig(this._config);
  }

  /**
   * Get the registry.
   */
  getRegistry(): KnowledgeRegistry {
    return this._registry;
  }

  /**
   * Get the validator.
   */
  getValidator(): KnowledgeValidator {
    return this._validator;
  }

  /**
   * Get accumulated snapshots.
   */
  getSnapshots() {
    return this._builder.getSnapshots();
  }

  /**
   * Clear snapshots (resets trend and change detection history).
   */
  clearSnapshots(): void {
    this._builder.clearSnapshots();
  }

  /**
   * Clear current knowledge.
   */
  clear(): void {
    this._currentKnowledge = null;
  }
}

export const knowledgeManager = new KnowledgeManager();
