/**
 * Startup Manager ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { StartupEntry, StartupBackup } from './startup.types';
import type { IStartupService } from './startup.service';
import { startupService } from './startup.service';
import { optimizationEventBus, OptimizationEventType } from '../health';
import { currentEdition, canUse } from '../licensing/FeatureGate';
import { getEditionLimit } from '../licensing/editionLimits';

const FREE_DISABLE_LIMIT = 3;

export interface StartupState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  entries: StartupEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: StartupEntry | null;
  backups: StartupBackup[];
  /** Number of entries disabled in the current session */
  sessionDisabledCount: number;
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
      sessionDisabledCount: 0,
    });
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
    this.setState({ loading: true, error: null });
    try {
      const entries = await this.service.listEntries();
      this.setState({ entries, loading: false });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to load startup entries';
      this.setState({ error, loading: false });
      throw err;
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

  async disableEntry(entry: StartupEntry) {
    // Enforce Free edition limit: max 3 disables per session
    const isFree = currentEdition() === 'free';
    const hasUnlimited = canUse('startup.disable');
    if (isFree && !hasUnlimited && this.state.sessionDisabledCount >= FREE_DISABLE_LIMIT) {
      this.setState({
        error: `Free edition allows disabling up to ${FREE_DISABLE_LIMIT} startup entries. Upgrade to Professional for unlimited management.`,
      });
      return { success: false, message: 'Free limit reached' };
    }

    try {
      const result = await this.service.disableEntry(entry);
      if (result.success) {
        this.setState({ sessionDisabledCount: this.state.sessionDisabledCount + 1 });
      }
      await this.loadEntries();
      await this.loadBackups();
      optimizationEventBus.emit({
        type: OptimizationEventType.StartupOptimized,
        moduleId: 'startup',
        action: 'disable',
        itemsProcessed: 1,
        timestamp: Date.now(),
      });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to disable entry';
      this.setState({ error });
      throw err;
    }
  }

  async enableEntry(entry: StartupEntry) {
    try {
      const result = await this.service.enableEntry(entry);
      if (result.success) {
        await this.loadEntries();
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to enable entry';
      this.setState({ error });
      throw err;
    }
  }

  async restoreBackup(backupId: string) {
    try {
      const result = await this.service.restoreBackup(backupId);
      if (result.success) {
        await this.loadEntries();
        await this.loadBackups();
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

  /**
   * Returns the maximum number of entries that can be disabled in the current edition.
   * Returns null for unlimited (Professional).
   */
  getDisableLimit(): number | null {
    return getEditionLimit('startupManagerEntriesPerRun', currentEdition() === 'professional');
  }

  /**
   * Remaining disables available in this session (Free edition only).
   * Returns null for unlimited (Professional).
   */
  remainingDisables(): number | null {
    const limit = this.getDisableLimit();
    if (limit === null) return null;
    return Math.max(0, limit - this.state.sessionDisabledCount);
  }

  /**
   * Whether the disable limit has been reached (Free edition only).
   */
  isDisableLimitReached(): boolean {
    const remaining = this.remainingDisables();
    return remaining !== null && remaining === 0;
  }
}
