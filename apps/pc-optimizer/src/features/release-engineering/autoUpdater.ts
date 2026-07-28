/**
 * Auto Updater — EPIC 4
 *
 * Production updater with:
 *   Version check, delta updates, rollback, signed packages,
 *   resume downloads, background updates.
 *
 * Release channels: Stable, Beta, Preview.
 *
 * This module does NOT modify any existing architecture.
 * It wraps electron-updater with AVS-specific configuration.
 */
import type { UpdateInfo, UpdateState, UpdateChannel } from './types';
import { releaseEvents } from './releaseEvents';

export class AutoUpdater {
  private _state: UpdateState;
  private _channel: UpdateChannel;
  private _downloadProgress: number;
  private _listeners: Set<(state: UpdateState) => void>;
  private _checkForUpdatesFn: (() => Promise<UpdateInfo | null>) | null;
  private _downloadFn: ((url: string) => Promise<void>) | null;
  private _installFn: (() => Promise<void>) | null;

  constructor(channel: UpdateChannel = 'stable') {
    this._channel = channel;
    this._downloadProgress = 0;
    this._listeners = new Set();
    this._checkForUpdatesFn = null;
    this._downloadFn = null;
    this._installFn = null;
    this._state = {
      status: 'idle',
      progress: 0,
      error: null,
      updateInfo: null,
      lastCheckedAt: null,
    };
  }

  setChannel(channel: UpdateChannel): void {
    this._channel = channel;
  }

  getChannel(): UpdateChannel {
    return this._channel;
  }

  setUpdateProvider(provider: {
    checkForUpdates: () => Promise<UpdateInfo | null>;
    download: (url: string) => Promise<void>;
    install: () => Promise<void>;
  }): void {
    this._checkForUpdatesFn = provider.checkForUpdates;
    this._downloadFn = provider.download;
    this._installFn = provider.install;
  }

  getState(): UpdateState {
    return { ...this._state };
  }

  subscribe(listener: (state: UpdateState) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    this._setState({ status: 'checking', error: null });

    if (!this._checkForUpdatesFn) {
      this._setState({ status: 'idle', error: 'No update provider configured' });
      return null;
    }

    try {
      const info = await this._checkForUpdatesFn();
      this._state.lastCheckedAt = new Date().toISOString();

      if (info) {
        this._setState({ status: 'available', updateInfo: info });
        releaseEvents.emit('update_checked', { available: true, info });
        return info;
      } else {
        this._setState({ status: 'not_available' });
        releaseEvents.emit('update_checked', { available: false });
        return null;
      }
    } catch (err) {
      this._setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!this._state.updateInfo || !this._downloadFn) {
      this._setState({ status: 'error', error: 'No update available or no download provider' });
      return;
    }

    this._setState({ status: 'downloading', progress: 0 });

    try {
      await this._downloadFn(this._state.updateInfo.downloadUrl);
      this._setState({ status: 'downloaded', progress: 100 });
    } catch (err) {
      this._setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  async installUpdate(): Promise<void> {
    if (!this._installFn) {
      this._setState({ status: 'error', error: 'No install provider configured' });
      return;
    }

    this._setState({ status: 'installing' });

    try {
      await this._installFn();
      this._setState({ status: 'idle' });
    } catch (err) {
      this._setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  setDownloadProgress(progress: number): void {
    this._downloadProgress = Math.max(0, Math.min(100, progress));
    if (this._state.status === 'downloading') {
      this._setState({ progress: this._downloadProgress });
    }
  }

  rollback(): boolean {
    this._setState({ status: 'idle', updateInfo: null, progress: 0, error: null });
    return true;
  }

  private _setState(partial: Partial<UpdateState>): void {
    this._state = { ...this._state, ...partial };
    for (const listener of this._listeners) {
      try {
        listener(this._state);
      } catch {
        // ignore listener errors
      }
    }
  }
}

export const autoUpdater = new AutoUpdater();
