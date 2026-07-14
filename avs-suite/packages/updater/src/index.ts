/**
 * @avs/updater — auto-update contracts.
 *
 * The concrete wrapper around `electron-updater` lives in the Electron
 * main process (see `apps/pc-optimizer/electron/updater`) and is bound
 * to `TOKENS.Updater` at bootstrap. This package holds only the shared
 * types & event names.
 */

export type UpdateChannel = 'stable' | 'beta' | 'nightly';

export interface UpdateInfo {
  version: string;
  releaseDate: string; // ISO-8601
  releaseNotes?: string;
  mandatory?: boolean;
}

export interface DownloadProgress {
  percent: number; // 0..100
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface IUpdateService {
  currentVersion(): string;
  channel(): UpdateChannel;
  setChannel(channel: UpdateChannel): Promise<void>;
  checkForUpdates(): Promise<UpdateInfo | null>;
  downloadUpdate(): Promise<void>;
  quitAndInstall(): void;
  onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void;
  onDownloadProgress(cb: (p: DownloadProgress) => void): () => void;
  onUpdateDownloaded(cb: (info: UpdateInfo) => void): () => void;
}

/** No-op placeholder used during development / when packaging as portable. */
export class NullUpdateService implements IUpdateService {
  currentVersion(): string {
    return '0.0.0';
  }
  channel(): UpdateChannel {
    return 'stable';
  }
  async setChannel(_c: UpdateChannel): Promise<void> {}
  async checkForUpdates(): Promise<UpdateInfo | null> {
    return null;
  }
  async downloadUpdate(): Promise<void> {}
  quitAndInstall(): void {}
  onUpdateAvailable(_cb: (info: UpdateInfo) => void): () => void {
    return () => {};
  }
  onDownloadProgress(_cb: (p: DownloadProgress) => void): () => void {
    return () => {};
  }
  onUpdateDownloaded(_cb: (info: UpdateInfo) => void): () => void {
    return () => {};
  }
}
