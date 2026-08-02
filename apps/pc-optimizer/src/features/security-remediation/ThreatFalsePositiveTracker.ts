/**
 * ThreatFalsePositiveTracker — manages false positive entries.
 *
 * Allows users to:
 *   - Mark safe
 *   - Exclude
 *   - Whitelist
 *   - Restore
 *
 * Provides a reason and tracks false-positive history.
 * Uses local learning only — no cloud, no external data.
 */
import type { FalsePositiveEntry, FalsePositiveExclusionType, FalsePositiveSummary, Threat } from './types';

export class ThreatFalsePositiveTracker {
  private entries = new Map<string, FalsePositiveEntry>();
  private exclusions = new Map<string, FalsePositiveExclusionType>();
  private whitelistHashes = new Set<string>();
  private excludePaths = new Set<string>();
  private whitelistPublishers = new Set<string>();

  markFalsePositive(
    threat: Threat,
    investigationId: string,
    reason: string,
    exclusionType: FalsePositiveExclusionType,
    markedBy: string = 'user',
    notes?: string,
  ): FalsePositiveEntry {
    const id = `fp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: FalsePositiveEntry = {
      id,
      threatId: threat.id,
      investigationId,
      reason,
      markedAt: Date.now(),
      markedBy,
      exclusionType,
      hash: threat.affectedAssets[0]?.hash ?? null,
      path: threat.affectedAssets[0]?.path ?? null,
      publisher: null,
      notes: notes ?? null,
    };

    this.entries.set(id, entry);

    // Apply exclusion
    const key = `${threat.category}:${threat.name}`;
    this.exclusions.set(key, exclusionType);

    if (entry.hash && exclusionType === 'whitelist') {
      this.whitelistHashes.add(entry.hash);
    }
    if (entry.path && exclusionType === 'exclude') {
      this.excludePaths.add(entry.path);
    }

    return entry;
  }

  isFalsePositive(threat: Threat): boolean {
    // Check by hash
    const hash = threat.affectedAssets[0]?.hash;
    if (hash && this.whitelistHashes.has(hash)) return true;

    // Check by path
    const path = threat.affectedAssets[0]?.path;
    if (path && this.excludePaths.has(path)) return true;

    // Check by publisher
    if (this.whitelistPublishers.size > 0) {
      const publisher = threat.evidence.find((e) => e.type.includes('publisher'))?.value;
      if (publisher && this.whitelistPublishers.has(publisher)) return true;
    }

    // Check by category:name key
    const key = `${threat.category}:${threat.name}`;
    return this.exclusions.has(key);
  }

  getExclusionType(threat: Threat): FalsePositiveExclusionType | null {
    const key = `${threat.category}:${threat.name}`;
    return this.exclusions.get(key) ?? null;
  }

  get(id: string): FalsePositiveEntry | null {
    return this.entries.get(id) ?? null;
  }

  getAll(): FalsePositiveEntry[] {
    return [...this.entries.values()];
  }

  getByInvestigation(investigationId: string): FalsePositiveEntry[] {
    return [...this.entries.values()].filter((e) => e.investigationId === investigationId);
  }

  remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;

    // Remove from exclusion maps
    const key = `${entry.threatId}`;
    this.exclusions.delete(key);
    if (entry.hash) this.whitelistHashes.delete(entry.hash);
    if (entry.path) this.excludePaths.delete(entry.path);

    this.entries.delete(id);
    return true;
  }

  getSummary(): FalsePositiveSummary {
    const all = [...this.entries.values()];
    return {
      totalFalsePositives: all.length,
      markSafeCount: all.filter((e) => e.exclusionType === 'mark_safe').length,
      excludeCount: all.filter((e) => e.exclusionType === 'exclude').length,
      whitelistCount: all.filter((e) => e.exclusionType === 'whitelist').length,
      restoreCount: all.filter((e) => e.exclusionType === 'restore').length,
      recentFalsePositives: all.sort((a, b) => b.markedAt - a.markedAt).slice(0, 10),
    };
  }

  clear(): void {
    this.entries.clear();
    this.exclusions.clear();
    this.whitelistHashes.clear();
    this.excludePaths.clear();
    this.whitelistPublishers.clear();
  }
}
