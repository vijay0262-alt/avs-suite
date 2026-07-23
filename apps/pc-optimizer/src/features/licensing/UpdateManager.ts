/**
 * UpdateManager — SDK-based update checking, downloading, and installation.
 *
 * Uses the AVS License SDK's Release Management API via IPC to:
 * - Check for updates automatically
 * - Notify the user of available updates
 * - Download updates with SHA256 verification
 * - Launch the installer
 *
 * Replaces the generic electron-updater for AVS products.
 */

interface UpdateCheckResult {
  product_found: boolean;
  product_name: string | null;
  update_available: boolean;
  force_upgrade: boolean;
  critical: boolean;
  latest_version: string | null;
  current_version: string | null;
  download_url: string | null;
  sha256: string | null;
  release_notes: string | null;
  file_size: number | null;
  channel: string | null;
  architecture: string | null;
  release_id: number | null;
}

type UpdateListener = (event: UpdateEvent) => void;

interface UpdateEvent {
  type: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'installed';
  data?: UpdateCheckResult;
  progress?: number;
  error?: string;
  filePath?: string;
}

class UpdateManagerImpl {
  private listeners: Set<UpdateListener> = new Set();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastCheckResult: UpdateCheckResult | null = null;

  /**
   * Subscribe to update events.
   */
  on(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: UpdateEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener errors
      }
    }
  }

  /**
   * Check for updates manually.
   */
  async checkForUpdates(channel?: string): Promise<UpdateCheckResult | null> {
    this.emit({ type: 'checking' });
    try {
      const result = await window.avs.license.checkUpdates(channel);
      if (result) {
        this.lastCheckResult = result;
        if (result.update_available) {
          this.emit({ type: 'available', data: result });
        } else {
          this.emit({ type: 'not-available' });
        }
      } else {
        this.emit({ type: 'not-available' });
      }
      return result;
    } catch (err) {
      this.emit({ type: 'error', error: err instanceof Error ? err.message : 'Check failed' });
      return null;
    }
  }

  /**
   * Download an update.
   */
  async downloadUpdate(releaseId: number): Promise<string | null> {
    if (!this.lastCheckResult?.update_available) {
      this.emit({ type: 'error', error: 'No update available to download' });
      return null;
    }
    this.emit({ type: 'downloading' });
    try {
      const result = await window.avs.license.downloadUpdate(releaseId);
      if (result.success && result.file_path) {
        this.emit({ type: 'downloaded', filePath: result.file_path });
        return result.file_path;
      }
      this.emit({ type: 'error', error: result.error ?? 'Download failed' });
      return null;
    } catch (err) {
      this.emit({ type: 'error', error: err instanceof Error ? err.message : 'Download failed' });
      return null;
    }
  }

  /**
   * Install an update from a downloaded file.
   */
  async installUpdate(filePath: string, silent = false): Promise<boolean> {
    try {
      const result = await window.avs.license.installUpdate(filePath, silent);
      if (result.success) {
        this.emit({ type: 'installed', filePath });
        return true;
      }
      this.emit({ type: 'error', error: result.error ?? 'Install failed' });
      return false;
    } catch (err) {
      this.emit({ type: 'error', error: err instanceof Error ? err.message : 'Install failed' });
      return false;
    }
  }

  /**
   * Start automatic update checking.
   */
  startAutoCheck(intervalHours = 24, channel?: string): void {
    if (this.checkInterval) clearInterval(this.checkInterval);
    const intervalMs = intervalHours * 60 * 60 * 1000;
    this.checkInterval = setInterval(() => {
      this.checkForUpdates(channel).catch(() => {});
    }, intervalMs);
  }

  /**
   * Stop automatic update checking.
   */
  stopAutoCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Get the last check result.
   */
  getLastCheckResult(): UpdateCheckResult | null {
    return this.lastCheckResult;
  }

  /**
   * Listen to license events from the main process (for update-available notifications).
   */
  listenToMainProcess(): () => void {
    return window.avs.license.onEvent((event) => {
      if (event.type === 'update-available') {
        this.lastCheckResult = event.payload as UpdateCheckResult;
        this.emit({ type: 'available', data: this.lastCheckResult });
      }
    });
  }
}

export const UpdateManager = new UpdateManagerImpl();
export type { UpdateCheckResult, UpdateEvent, UpdateListener };
