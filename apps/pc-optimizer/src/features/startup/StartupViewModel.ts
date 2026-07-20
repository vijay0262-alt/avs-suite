/**
 * Startup Manager ViewModel
 */

import { ViewModel } from '@avs/core/mvvm/ViewModel';
import type { StartupEntry, StartupBackup } from './startup.types';
import type { IStartupService } from './startup.service';
import { startupService } from './startup.service';

export interface StartupState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  bootstrapError: string | null;
  entries: StartupEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: StartupEntry | null;
  backups: StartupBackup[];
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
    try {
      const result = await this.service.disableEntry(entry);
      if (result.success) {
        await this.loadEntries();
        await this.loadBackups();
      }
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
}
