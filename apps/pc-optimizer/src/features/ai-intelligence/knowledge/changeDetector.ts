/**
 * Change Detector — detects changes by comparing current context
 * against previous snapshots.
 *
 * Detects: added, removed, improved, degraded, unchanged, unknown.
 */
import type {
  KnowledgeFact,
  KnowledgeChange,
  ChangeType,
  ContextSnapshot,
} from './types';
import { generateChangeId } from './types';
import type { EvidenceBuilder } from './evidenceBuilder';

export class ChangeDetector {
  private _evidenceBuilder: EvidenceBuilder;
  private _previousSnapshot: ContextSnapshot | null = null;

  constructor(evidenceBuilder: EvidenceBuilder) {
    this._evidenceBuilder = evidenceBuilder;
  }

  /**
   * Set the previous snapshot for comparison.
   */
  setPreviousSnapshot(snapshot: ContextSnapshot | null): void {
    this._previousSnapshot = snapshot;
  }

  /**
   * Get the previous snapshot.
   */
  getPreviousSnapshot(): ContextSnapshot | null {
    return this._previousSnapshot;
  }

  /**
   * Detect changes between the previous snapshot and current facts.
   */
  detectChanges(facts: KnowledgeFact[]): KnowledgeChange[] {
    if (!this._previousSnapshot) return [];

    const changes: KnowledgeChange[] = [];
    const prevFacts = new Map(this._previousSnapshot.facts.map((f) => [f.id, f]));
    const currentIds = new Set(facts.map((f) => f.id));

    // Detect changes in existing facts
    for (const fact of facts) {
      const prev = prevFacts.get(fact.id);
      if (!prev) {
        // Fact is new
        changes.push(this._createChange(
          fact, 'added', undefined, fact.value,
          'Fact newly detected', null,
        ));
        continue;
      }

      const changeType = this._compareValues(prev.value, fact.value, fact);
      if (changeType !== 'unchanged') {
        const delta = this._calculateDelta(prev.value, fact.value);
        const desc = this._describeChange(fact.name, prev.value, fact.value, changeType);
        changes.push(this._createChange(fact, changeType, prev.value, fact.value, desc, delta));
      }
    }

    // Detect removed facts
    for (const [id, prevFact] of prevFacts) {
      if (!currentIds.has(id)) {
        changes.push(this._createChange(
          { id, name: prevFact.name, category: prevFact.category, value: prevFact.value,
            dataType: 'number', unit: null, description: '', evidence: this._evidenceBuilder.forFact(
              prevFact.name, prevFact.value, 'unknown', prevFact.timestamp, 0.5),
            confidence: 0.5, sourceProvider: 'unknown', extractedAt: prevFact.timestamp },
          'removed', prevFact.value, null,
          `${prevFact.name} is no longer present`, null,
        ));
      }
    }

    return changes;
  }

  // ── Private ────────────────────────────────────────────────

  private _compareValues(
    prev: string | number | boolean | unknown[],
    curr: string | number | boolean | unknown[],
    fact: KnowledgeFact,
  ): ChangeType {
    if (typeof prev === 'number' && typeof curr === 'number') {
      if (prev === curr) return 'unchanged';

      // For health/score metrics, higher is better
      const isScoreMetric = fact.name.includes('score') || fact.name.includes('health');
      const isUsageMetric = fact.name.includes('usage') || fact.name.includes('used') ||
        fact.name.includes('wasted') || fact.name.includes('cache') ||
        fact.name.includes('temp') || fact.name.includes('recycle') ||
        fact.name.includes('duplicate') || fact.name.includes('boot_time') ||
        fact.name.includes('pending_updates') || fact.name.includes('denials') ||
        fact.name.includes('tracking') || fact.name.includes('issue');

      if (isScoreMetric) {
        return curr > prev ? 'improved' : 'degraded';
      }
      if (isUsageMetric) {
        return curr < prev ? 'improved' : 'degraded';
      }
      return curr > prev ? 'added' : 'removed';
    }

    if (typeof prev === 'boolean' && typeof curr === 'boolean') {
      if (prev === curr) return 'unchanged';
      return curr ? 'added' : 'removed';
    }

    if (typeof prev === 'string' && typeof curr === 'string') {
      if (prev === curr) return 'unchanged';
      return 'added';
    }

    if (Array.isArray(prev) && Array.isArray(curr)) {
      if (prev.length === curr.length) return 'unchanged';
      return curr.length > prev.length ? 'added' : 'removed';
    }

    return 'unknown';
  }

  private _calculateDelta(
    prev: string | number | boolean | unknown[],
    curr: string | number | boolean | unknown[],
  ): number | null {
    if (typeof prev === 'number' && typeof curr === 'number') {
      return curr - prev;
    }
    if (Array.isArray(prev) && Array.isArray(curr)) {
      return curr.length - prev.length;
    }
    return null;
  }

  private _describeChange(
    name: string,
    prev: string | number | boolean | unknown[],
    curr: string | number | boolean | unknown[],
    type: ChangeType,
  ): string {
    if (typeof prev === 'number' && typeof curr === 'number') {
      const delta = curr - prev;
      const sign = delta > 0 ? '+' : '';
      return `${name} ${type} from ${prev} to ${curr} (${sign}${delta})`;
    }
    return `${name} ${type}`;
  }

  private _createChange(
    fact: KnowledgeFact,
    changeType: ChangeType,
    previousValue: string | number | boolean | unknown[] | undefined,
    currentValue: string | number | boolean | unknown[] | null,
    description: string,
    delta: number | null,
  ): KnowledgeChange {
    return {
      id: generateChangeId(fact.id),
      factId: fact.id,
      factName: fact.name,
      changeType,
      previousValue: previousValue ?? null,
      currentValue: currentValue,
      delta,
      deltaDescription: description,
      evidence: this._evidenceBuilder.fromDataPoints(
        description,
        [
          { source: fact.sourceProvider, metric: `${fact.name}_previous`, value: previousValue as never, timestamp: fact.extractedAt },
          { source: fact.sourceProvider, metric: `${fact.name}_current`, value: currentValue as never, timestamp: fact.extractedAt },
        ],
        [fact.sourceProvider],
        fact.extractedAt,
        fact.confidence,
      ),
      detectedAt: new Date().toISOString(),
    };
  }
}
