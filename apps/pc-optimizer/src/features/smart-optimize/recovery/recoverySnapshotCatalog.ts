/**
 * Optimization Recovery & Rollback Center — Snapshot Catalog
 *
 * Maintains metadata for available snapshots: creation time, optimization
 * source, profile used, recovery availability, retention policy, integrity
 * status, and dependencies.
 */
import type {
  SnapshotCatalogEntry,
  SystemSnapshot,
  RetentionPolicy,
  SnapshotIntegrityStatus,
  RecoveryConfiguration,
} from './types';
import { generateCatalogEntryId, createDefaultRetentionPolicy } from './types';

export class RecoverySnapshotCatalog {
  private _entries: Map<string, SnapshotCatalogEntry> = new Map();
  private _config: RecoveryConfiguration;

  constructor(config: RecoveryConfiguration) {
    this._config = config;
  }

  updateConfig(config: RecoveryConfiguration): void {
    this._config = config;
  }

  register(
    snapshot: SystemSnapshot,
    optimizationSource: string,
    profileUsed: string,
    metadata: Record<string, unknown> = {},
  ): SnapshotCatalogEntry {
    const entry: SnapshotCatalogEntry = {
      id: generateCatalogEntryId(),
      snapshotId: snapshot.id,
      executionId: snapshot.executionId,
      createdAt: snapshot.createdAt,
      optimizationSource,
      profileUsed,
      recoveryAvailable: snapshot.snapshotProviders.length > 0,
      retentionPolicy: createDefaultRetentionPolicy(),
      integrityStatus: snapshot.snapshotProviders.length > 0 ? 'intact' : 'unknown',
      dependencies: [],
      providers: [...snapshot.snapshotProviders],
      metadata,
      futureMetadata: {},
    };
    this._entries.set(entry.id, entry);
    return entry;
  }

  registerEntry(entry: SnapshotCatalogEntry): void {
    this._entries.set(entry.id, entry);
  }

  get(id: string): SnapshotCatalogEntry | undefined {
    return this._entries.get(id);
  }

  getBySnapshotId(snapshotId: string): SnapshotCatalogEntry | undefined {
    for (const entry of this._entries.values()) {
      if (entry.snapshotId === snapshotId) return entry;
    }
    return undefined;
  }

  getByExecutionId(executionId: string): SnapshotCatalogEntry | undefined {
    for (const entry of this._entries.values()) {
      if (entry.executionId === executionId) return entry;
    }
    return undefined;
  }

  getAll(): SnapshotCatalogEntry[] {
    return Array.from(this._entries.values());
  }

  getAvailable(): SnapshotCatalogEntry[] {
    return this.getAll().filter((e) => e.recoveryAvailable);
  }

  getByIntegrity(status: SnapshotIntegrityStatus): SnapshotCatalogEntry[] {
    return this.getAll().filter((e) => e.integrityStatus === status);
  }

  getByOptimizationSource(source: string): SnapshotCatalogEntry[] {
    return this.getAll().filter((e) => e.optimizationSource === source);
  }

  updateIntegrity(id: string, status: SnapshotIntegrityStatus): boolean {
    const entry = this._entries.get(id);
    if (!entry) return false;
    entry.integrityStatus = status;
    if (status === 'corrupted' || status === 'missing') {
      entry.recoveryAvailable = false;
    }
    return true;
  }

  updateRetentionPolicy(id: string, policy: RetentionPolicy): boolean {
    const entry = this._entries.get(id);
    if (!entry) return false;
    entry.retentionPolicy = policy;
    return true;
  }

  addDependency(id: string, dependency: string): boolean {
    const entry = this._entries.get(id);
    if (!entry) return false;
    if (!entry.dependencies.includes(dependency)) {
      entry.dependencies.push(dependency);
    }
    return true;
  }

  remove(id: string): boolean {
    return this._entries.delete(id);
  }

  clear(): void {
    this._entries.clear();
  }

  get count(): number {
    return this._entries.size;
  }

  applyRetentionPolicy(): { archived: number; deleted: number; kept: number } {
    let archived = 0;
    let deleted = 0;
    let kept = 0;

    const now = Date.now();
    const maxAgeMs = this._config.retentionRules.maxSnapshotAgeDays * 86400000;

    for (const [id, entry] of this._entries) {
      const ageMs = now - new Date(entry.createdAt).getTime();
      if (ageMs > maxAgeMs) {
        if (this._config.retentionRules.autoDelete) {
          this._entries.delete(id);
          deleted++;
        } else if (this._config.retentionRules.autoArchive) {
          entry.recoveryAvailable = false;
          entry.integrityStatus = 'degraded';
          archived++;
        } else {
          kept++;
        }
      } else {
        kept++;
      }
    }

    if (this._entries.size > this._config.retentionRules.maxSnapshotCount) {
      const sorted = this.getAll().sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const toRemove = sorted.slice(0, this._entries.size - this._config.retentionRules.maxSnapshotCount);
      for (const entry of toRemove) {
        this._entries.delete(entry.id);
        deleted++;
      }
    }

    return { archived, deleted, kept };
  }
}
