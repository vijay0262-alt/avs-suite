/**
 * Execution Snapshot Manager — manages system snapshots before execution.
 *
 * Supports snapshot providers. Captures registry changes, startup entries,
 * system restore point, configuration backup, optimization module state.
 *
 * Does NOT implement OS-specific restore logic. Provides interfaces only.
 */
import type {
  SystemSnapshot,
  SnapshotProvider,
  ExecutionConfiguration,
} from './types';
import { generateSnapshotId } from './types';

export class ExecutionSnapshotManager {
  private _providers: Map<string, SnapshotProvider> = new Map();
  private _snapshots: Map<string, SystemSnapshot> = new Map();
  private _config: ExecutionConfiguration;

  constructor(config: ExecutionConfiguration) {
    this._config = config;
  }

  updateConfig(config: ExecutionConfiguration): void {
    this._config = config;
  }

  registerProvider(provider: SnapshotProvider): boolean {
    if (this._providers.has(provider.name)) return false;
    this._providers.set(provider.name, provider);
    return true;
  }

  unregisterProvider(name: string): boolean {
    return this._providers.delete(name);
  }

  getProvider(name: string): SnapshotProvider | undefined {
    return this._providers.get(name);
  }

  get providers(): string[] {
    return Array.from(this._providers.keys());
  }

  async capture(executionId: string): Promise<SystemSnapshot> {
    const snapshot: SystemSnapshot = {
      id: generateSnapshotId(),
      executionId,
      createdAt: new Date().toISOString(),
      restorePointCreated: false,
      registryBackupCreated: false,
      startupBackupCreated: false,
      configBackupCreated: false,
      moduleStateBackup: {},
      snapshotProviders: [],
      futureMetadata: {},
    };

    if (!this._config.featureFlags.enableSnapshots) {
      return snapshot;
    }

    for (const [name, provider] of this._providers) {
      try {
        const data = await provider.capture(executionId);
        snapshot.moduleStateBackup[name] = data;
        snapshot.snapshotProviders.push(name);

        if (name.includes('restore')) snapshot.restorePointCreated = true;
        if (name.includes('registry')) snapshot.registryBackupCreated = true;
        if (name.includes('startup')) snapshot.startupBackupCreated = true;
        if (name.includes('config')) snapshot.configBackupCreated = true;
      } catch (err) {
        console.error(`[SnapshotManager] Provider ${name} failed:`, err);
      }
    }

    this._snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async restore(snapshot: SystemSnapshot): Promise<boolean> {
    if (!this._config.featureFlags.enableRollback) return false;

    let allSuccess = true;
    for (const name of snapshot.snapshotProviders) {
      const provider = this._providers.get(name);
      if (!provider) continue;
      try {
        const success = await provider.restore(snapshot);
        if (!success) allSuccess = false;
      } catch (err) {
        console.error(`[SnapshotManager] Restore ${name} failed:`, err);
        allSuccess = false;
      }
    }
    return allSuccess;
  }

  getSnapshot(snapshotId: string): SystemSnapshot | undefined {
    return this._snapshots.get(snapshotId);
  }

  getSnapshotByExecution(executionId: string): SystemSnapshot | undefined {
    for (const snapshot of this._snapshots.values()) {
      if (snapshot.executionId === executionId) return snapshot;
    }
    return undefined;
  }

  clear(): void {
    this._snapshots.clear();
  }
}
