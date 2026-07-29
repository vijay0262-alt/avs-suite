/**
 * Relationship Engine — connects facts with relationships.
 *
 * Relationships connect facts. Examples:
 *   "Startup time increased because startup apps increased."
 *   "Health score improved after optimization."
 *   "Storage usage increased because Downloads grew."
 *
 * Relationships are factual, based on data correlation.
 * Never infer causation without evidence.
 */
import type {
  AIContext,
  KnowledgeFact,
  KnowledgeRelationship,
  RelationshipType,
} from './types';
import { generateRelationshipId } from './types';
import type { EvidenceBuilder } from './evidenceBuilder';

export class RelationshipEngine {
  private _evidenceBuilder: EvidenceBuilder;

  constructor(evidenceBuilder: EvidenceBuilder) {
    this._evidenceBuilder = evidenceBuilder;
  }

  /**
   * Build relationships between facts based on context data.
   */
  buildRelationships(facts: KnowledgeFact[], context: AIContext): KnowledgeRelationship[] {
    const relationships: KnowledgeRelationship[] = [];
    const factMap = new Map(facts.map((f) => [f.id, f]));
    const ts = context.metadata.timestamp;

    // Startup items → boot time (causal)
    if (context.startup) {
      const itemCount = factMap.get('fact_startup_total_items');
      const bootTime = factMap.get('fact_startup_estimated_boot_time');
      if (itemCount && bootTime) {
        relationships.push(this._createRelationship(
          'causal', itemCount, bootTime,
          'Startup item count influences estimated boot time',
          ts, 0.8,
        ));
      }

      const highImpact = factMap.get('fact_startup_high_impact_count');
      if (highImpact && bootTime) {
        relationships.push(this._createRelationship(
          'causal', highImpact, bootTime,
          'High-impact startup items contribute to longer boot times',
          ts, 0.85,
        ));
      }
    }

    // Storage usage → disk health (correlative)
    if (context.storage && context.health) {
      const usedSpace = factMap.get('fact_storage_used_space');
      const diskScore = factMap.get('fact_health_disk_score');
      if (usedSpace && diskScore) {
        relationships.push(this._createRelationship(
          'correlative', usedSpace, diskScore,
          'Storage usage correlates with disk health score',
          ts, 0.6,
        ));
      }
    }

    // Duplicates → wasted space (compositional)
    if (context.duplicates) {
      const dupFiles = factMap.get('fact_duplicates_duplicate_files');
      const wastedSpace = factMap.get('fact_duplicates_wasted_space');
      if (dupFiles && wastedSpace) {
        relationships.push(this._createRelationship(
          'compositional', dupFiles, wastedSpace,
          'Duplicate files contribute to wasted storage space',
          ts, 0.95,
        ));
      }
    }

    // Browser cache → privacy (correlative)
    if (context.browser && context.privacy) {
      const cache = factMap.get('fact_browser_total_cache');
      const trackingCookies = factMap.get('fact_privacy_tracking_cookies');
      if (cache && trackingCookies) {
        relationships.push(this._createRelationship(
          'correlative', cache, trackingCookies,
          'Browser cache size correlates with tracking cookies count',
          ts, 0.5,
        ));
      }
    }

    // CPU usage → CPU health score (correlative)
    if (context.performance && context.health) {
      const cpuUsage = factMap.get('fact_performance_cpu_usage');
      const cpuScore = factMap.get('fact_health_cpu_score');
      if (cpuUsage && cpuScore) {
        relationships.push(this._createRelationship(
          'correlative', cpuUsage, cpuScore,
          'CPU usage correlates with CPU health score',
          ts, 0.6,
        ));
      }

      const ramUsage = factMap.get('fact_performance_ram_usage');
      const ramScore = factMap.get('fact_health_ram_score');
      if (ramUsage && ramScore) {
        relationships.push(this._createRelationship(
          'correlative', ramUsage, ramScore,
          'RAM usage correlates with RAM health score',
          ts, 0.6,
        ));
      }
    }

    // History optimizations → health score (temporal)
    if (context.history && context.health) {
      const totalOpt = factMap.get('fact_history_total_optimizations');
      const overallScore = factMap.get('fact_health_overall_score');
      if (totalOpt && overallScore) {
        relationships.push(this._createRelationship(
          'temporal', totalOpt, overallScore,
          'Optimization history relates to overall health score',
          ts, 0.5,
        ));
      }
    }

    // Quota usage → experience plan (dependency)
    if (context.quota && context.experience) {
      const lockedFeatures = factMap.get('fact_experience_locked_features');
      if (lockedFeatures) {
        relationships.push(this._createRelationship(
          'dependency', lockedFeatures, lockedFeatures,
          'Locked features depend on current subscription plan',
          ts, 0.9,
        ));
      }
    }

    // Temp files → storage used (compositional)
    if (context.privacy && context.storage) {
      const tempFiles = factMap.get('fact_privacy_temp_files');
      const usedSpace = factMap.get('fact_storage_used_space');
      if (tempFiles && usedSpace) {
        relationships.push(this._createRelationship(
          'compositional', tempFiles, usedSpace,
          'Temporary files contribute to used storage space',
          ts, 0.7,
        ));
      }
    }

    // Recycle bin → storage used (compositional)
    if (context.privacy && context.storage) {
      const recycleBin = factMap.get('fact_privacy_recycle_bin');
      const usedSpace = factMap.get('fact_storage_used_space');
      if (recycleBin && usedSpace) {
        relationships.push(this._createRelationship(
          'compositional', recycleBin, usedSpace,
          'Recycle bin contents contribute to used storage space',
          ts, 0.7,
        ));
      }
    }

    return relationships;
  }

  private _createRelationship(
    type: RelationshipType,
    source: KnowledgeFact,
    target: KnowledgeFact,
    description: string,
    timestamp: string,
    confidence: number,
  ): KnowledgeRelationship {
    return {
      id: generateRelationshipId(source.id, target.id, type),
      type,
      sourceFactId: source.id,
      targetFactId: target.id,
      description,
      evidence: this._evidenceBuilder.forRelationship(
        description,
        source.name, source.value,
        target.name, target.value,
        source.sourceProvider,
        timestamp,
        confidence,
      ),
      confidence,
      createdAt: timestamp,
    };
  }
}
