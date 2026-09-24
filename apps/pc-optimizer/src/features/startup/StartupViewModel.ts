/**
 * Startup Manager ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { StartupEntry, StartupBackup, StartupScanProgress } from './startup.types';
import type { IStartupService } from './startup.service';
import { startupService } from './startup.service';
import { optimizationEventBus, OptimizationEventType } from '../health';

const SCAN_POLL_INTERVAL_MS = 250;

export interface StartupState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  entries: StartupEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: StartupEntry | null;
  backups: StartupBackup[];
  /** Names of entries with a toggle currently in flight. */
  pendingToggles: string[];
  /** Live scan progress — current path being scanned. */
  scanProgress: StartupScanProgress | null;
}

export class StartupViewModel extends ViewModel<StartupState> {
  constructor(private service: IStartupService = startupService) {
    super({
      bootstrap: 'idle',
      bootstrapError: null,
      entries: [],
      loading: false,
      error: null,
      selectedEntry: null,
      backups: [],
      pendingToggles: [],
      scanProgress: null,
    });
  }

  private scanPollTimer: ReturnType<typeof setInterval> | null = null;

  private startScanPolling(): void {
    this.stopScanPolling();
    void this.pollScanOnce();
    this.scanPollTimer = setInterval(() => void this.pollScanOnce(), SCAN_POLL_INTERVAL_MS);
  }

  private stopScanPolling(): void {
    if (this.scanPollTimer) {
      clearInterval(this.scanPollTimer);
      this.scanPollTimer = null;
    }
  }

  private async pollScanOnce(): Promise<void> {
    if (!this.state.loading) return this.stopScanPolling();
    try {
      const progress = await this.service.scanProgress();
      this.setState({ scanProgress: progress });
    } catch {
      // Progress polling is best-effort — never break the load.
    }
  }

  async bootstrap() {
    // Render the shell immediately; load data in the background.
    this.setState({ bootstrap: 'ready', bootstrapError: null, loading: true });
    try {
      await this.loadEntries();
      await this.loadBackups();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load startup entries';
      this.setState({ bootstrap: 'error', bootstrapError: error, loading: false });
    }
  }

  async loadEntries() {
    this.setState({ loading: true, error: null, scanProgress: null });
    this.startScanPolling();
    try {
      const entries = await this.service.listEntries();
      this.setState({ entries, loading: false, scanProgress: null });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load startup entries';
      this.setState({ error, loading: false, scanProgress: null });
      throw err;
    } finally {
      this.stopScanPolling();
    }
  }

  async loadBackups() {
    try {
      const backups = await this.service.getBackups();
      this.setState({ backups });
    } catch (err) {
      console.error('Failed to load backups:', err);
    }
  }

  /** Identity key for an entry — name + location disambiguates dupes. */
  private entryKey(entry: StartupEntry): string {
    return `${entry.name}::${entry.location}`;
  }

  /** Optimistically flip an entry's enabled flag in place. */
  private setEntryEnabled(entry: StartupEntry, enabled: boolean): void {
    const key = this.entryKey(entry);
    this.setState({
      entries: this.state.entries.map((e) =>
        this.entryKey(e) === key
          ? { ...e, enabled, status: enabled ? 'enabled' : 'disabled' }
          : e,
      ),
    });
  }

  private setPending(entry: StartupEntry, pending: boolean): void {
    const key = this.entryKey(entry);
    this.setState({
      pendingToggles: pending
        ? [...this.state.pendingToggles, key]
        : this.state.pendingToggles.filter((k) => k !== key),
    });
  }

  isTogglePending(entry: StartupEntry): boolean {
    return this.state.pendingToggles.includes(this.entryKey(entry));
  }

  /**
   * Toggle an entry on/off. Optimistic: the UI flips instantly, the
   * backend updates its cache in place, and the flag is reverted only
   * if the call fails. No full rescan per toggle.
   */
  private async toggleEntry(
    entry: StartupEntry,
    enabled: boolean,
    action: 'disable' | 'enable',
    call: () => Promise<{ success: boolean; message?: string; error?: string; reason?: string }>,
  ) {
    if (this.isTogglePending(entry)) return { success: false, message: 'Busy' };
    this.setPending(entry, true);
    this.setEntryEnabled(entry, enabled);
    try {
      const result = await call();
      if (result.success) {
        optimizationEventBus.emit({
          type: OptimizationEventType.StartupOptimized,
          moduleId: 'startup',
          action,
          itemsProcessed: 1,
          timestamp: Date.now(),
        });
        void this.loadBackups();
      } else {
        // Revert the optimistic flip.
        this.setEntryEnabled(entry, !enabled);
      }
      return result;
    } catch (err) {
      this.setEntryEnabled(entry, !enabled);
      const error = err instanceof Error ? err.message : `Failed to ${action} entry`;
      this.setState({ error });
      throw err;
    } finally {
      this.setPending(entry, false);
    }
  }

  async disableEntry(entry: StartupEntry) {
    return this.toggleEntry(entry, false, 'disable', () => this.service.disableEntry(entry));
  }

  async enableEntry(entry: StartupEntry) {
    return this.toggleEntry(entry, true, 'enable', () => this.service.enableEntry(entry));
  }

  async restoreBackup(backupId: string) {
    try {
      const result = await this.service.restoreBackup(backupId);
      if (result.success) {
        await this.loadEntries();
        await this.loadBackups();
        optimizationEventBus.emit({
          type: OptimizationEventType.StartupOptimized,
          moduleId: 'startup',
          action: 'restore',
          itemsProcessed: 1,
          timestamp: Date.now(),
        });
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to restore backup';
      this.setState({ error });
      throw err;
    }
  }

  selectEntry(entry: StartupEntry | null) {
    this.setState({ selectedEntry: entry });
  }
}
