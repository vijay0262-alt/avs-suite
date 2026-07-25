/**
 * UpdateStore — Zustand store for the auto-update engine.
 *
 * Tracks: update status, manifest info, download progress, installer state.
 * Bridges the updateService (async) with React components.
 *
 * UI components must consume only this store — never call updateService directly.
 *
 * Background checks:
 *   - Application startup
 *   - Every 24 hours
 *   - Manual "Check for Updates"
 */
import { create } from 'zustand';
import {
  updateService,
  type UpdateInfo,
  type UpdateStatus,
  type UpdateErrorCode,
  type UpdateServiceError,
} from './updateService';
import type { ProductManifest } from './manifestClient';
import type { DownloadProgress } from './downloadManager';
import type { InstallerInfo } from './installerLauncher';
import { getVersionInfo } from '../../config/version';

/** Interval for background update checks (24 hours). */
const BACKGROUND_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface UpdateState {
  /** Current update status. */
  status: UpdateStatus;
  /** Update info from the last check. */
  updateInfo: UpdateInfo | null;
  /** The product manifest if an update is available. */
  manifest: ProductManifest | null;
  /** Download progress (null if not downloading). */
  downloadProgress: DownloadProgress | null;
  /** Installer info (null if not prepared). */
  installer: InstallerInfo | null;
  /** Error message if update failed. */
  error: string | null;
  /** Error code if update failed. */
  errorCode: UpdateErrorCode | null;
  /** ISO timestamp of the last update check. */
  lastCheckAt: string | null;
  /** Current installed version. */
  currentVersion: string;
  /** Whether a background check timer is active. */
  backgroundCheckActive: boolean;
  /** Whether the update is forced (mandatory). */
  forceUpdate: boolean;

  /** Check for updates. Returns true if an update is available. */
  checkForUpdates: (productCode?: string) => Promise<boolean>;
  /** Download the update. Returns true on success. */
  download: (productCode?: string) => Promise<boolean>;
  /** Pause the current download. */
  pauseDownload: () => void;
  /** Resume a paused download. Returns true on success. */
  resumeDownload: (productCode?: string) => Promise<boolean>;
  /** Cancel the current download. */
  cancelDownload: () => void;
  /** Verify the downloaded update. Returns true on success. */
  verifyUpdate: () => Promise<boolean>;
  /** Prepare the installer. Returns true on success. */
  prepareInstaller: () => Promise<boolean>;
  /** Launch the installer (after user confirmation). */
  launchInstaller: () => Promise<boolean>;
  /** Clean up all update artifacts. */
  cleanup: () => void;
  /** Clear error state. */
  clearError: () => void;
  /** Start background update checks. */
  startBackgroundChecks: (productCode?: string) => void;
  /** Stop background update checks. */
  stopBackgroundChecks: () => void;
}

let backgroundTimer: ReturnType<typeof setInterval> | null = null;

export const useUpdateStore = create<UpdateState>((set, get) => ({
  status: 'idle',
  updateInfo: null,
  manifest: null,
  downloadProgress: null,
  installer: null,
  error: null,
  errorCode: null,
  lastCheckAt: null,
  currentVersion: getVersionInfo().version,
  backgroundCheckActive: false,
  forceUpdate: false,

  checkForUpdates: async (productCode: string = 'optimizer'): Promise<boolean> => {
    set({ status: 'checking', error: null, errorCode: null });
    try {
      const info = await updateService.checkForUpdates(productCode);
      set({
        status: info.available ? 'update-available' : 'no-update',
        updateInfo: info,
        manifest: info.manifest,
        lastCheckAt: new Date().toISOString(),
        forceUpdate: info.forceUpdate,
        error: null,
        errorCode: null,
      });
      return info.available;
    } catch (err) {
      const svcErr = err as UpdateServiceError;
      set({
        status: 'error',
        error: svcErr.message ?? 'Update check failed.',
        errorCode: svcErr.code ?? 'UNKNOWN',
      });
      return false;
    }
  },

  download: async (_productCode: string = 'optimizer'): Promise<boolean> => {
    const { manifest } = get();
    if (!manifest) {
      set({
        status: 'error',
        error: 'No update manifest available. Check for updates first.',
        errorCode: 'UNKNOWN',
      });
      return false;
    }

    set({ status: 'downloading', error: null, errorCode: null, downloadProgress: null });
    try {
      await updateService.downloadUpdate(manifest, (progress) => {
        set({ downloadProgress: progress });
      });
      set({ status: 'downloaded', downloadProgress: null });
      return true;
    } catch (err) {
      const svcErr = err as UpdateServiceError;
      set({
        status: 'error',
        error: svcErr.message ?? 'Download failed.',
        errorCode: svcErr.code ?? 'DOWNLOAD_FAILED',
      });
      return false;
    }
  },

  pauseDownload: () => {
    updateService.pauseDownload();
    set({ status: 'idle' });
  },

  resumeDownload: async (_productCode: string = 'optimizer'): Promise<boolean> => {
    const { manifest } = get();
    if (!manifest) {
      set({
        status: 'error',
        error: 'No update manifest available.',
        errorCode: 'UNKNOWN',
      });
      return false;
    }

    set({ status: 'downloading', error: null, errorCode: null });
    try {
      await updateService.resumeDownload(manifest, (progress) => {
        set({ downloadProgress: progress });
      });
      set({ status: 'downloaded', downloadProgress: null });
      return true;
    } catch (err) {
      const svcErr = err as UpdateServiceError;
      set({
        status: 'error',
        error: svcErr.message ?? 'Resume failed.',
        errorCode: svcErr.code ?? 'DOWNLOAD_FAILED',
      });
      return false;
    }
  },

  cancelDownload: () => {
    updateService.cancelDownload();
    set({
      status: 'idle',
      downloadProgress: null,
      error: null,
      errorCode: null,
    });
  },

  verifyUpdate: async (): Promise<boolean> => {
    const { manifest } = get();
    if (!manifest) {
      set({
        status: 'error',
        error: 'No update manifest available.',
        errorCode: 'UNKNOWN',
      });
      return false;
    }

    set({ status: 'verifying', error: null, errorCode: null });
    try {
      // Get the downloaded data from the service
      const data = updateService._downloadedData;
      if (!data) {
        set({
          status: 'error',
          error: 'No downloaded data to verify.',
          errorCode: 'DOWNLOAD_FAILED',
        });
        return false;
      }
      await updateService.verifyUpdate(data, manifest.sha256);
      set({ status: 'verified' });
      return true;
    } catch (err) {
      const svcErr = err as UpdateServiceError;
      set({
        status: 'error',
        error: svcErr.message ?? 'Verification failed.',
        errorCode: svcErr.code ?? 'CHECKSUM_MISMATCH',
      });
      return false;
    }
  },

  prepareInstaller: async (): Promise<boolean> => {
    const { manifest } = get();
    if (!manifest) {
      set({
        status: 'error',
        error: 'No update manifest available.',
        errorCode: 'UNKNOWN',
      });
      return false;
    }

    set({ status: 'preparing', error: null, errorCode: null });
    try {
      const data = updateService._downloadedData;
      if (!data) {
        set({
          status: 'error',
          error: 'No downloaded data to prepare.',
          errorCode: 'DOWNLOAD_FAILED',
        });
        return false;
      }
      const installer = updateService.prepareInstaller(data, manifest.sha256);
      set({ status: 'ready', installer });
      return true;
    } catch (err) {
      const svcErr = err as UpdateServiceError;
      set({
        status: 'error',
        error: svcErr.message ?? 'Installer preparation failed.',
        errorCode: svcErr.code ?? 'INSTALLER_FAILED',
      });
      return false;
    }
  },

  launchInstaller: async (): Promise<boolean> => {
    set({ status: 'installing', error: null, errorCode: null });
    try {
      await updateService.launchInstaller();
      set({ status: 'idle' });
      return true;
    } catch (err) {
      const svcErr = err as UpdateServiceError;
      set({
        status: 'error',
        error: svcErr.message ?? 'Installer launch failed.',
        errorCode: svcErr.code ?? 'INSTALLER_FAILED',
      });
      return false;
    }
  },

  cleanup: () => {
    updateService.cleanup();
    set({
      status: 'idle',
      downloadProgress: null,
      installer: null,
      error: null,
      errorCode: null,
    });
  },

  clearError: () => {
    set({ error: null, errorCode: null });
  },

  startBackgroundChecks: (productCode: string = 'optimizer') => {
    if (backgroundTimer) return; // Already running

    set({ backgroundCheckActive: true });

    // Check immediately on startup
    void get().checkForUpdates(productCode);

    // Then check every 24 hours
    backgroundTimer = setInterval(() => {
      void get().checkForUpdates(productCode);
    }, BACKGROUND_CHECK_INTERVAL_MS);
  },

  stopBackgroundChecks: () => {
    if (backgroundTimer) {
      clearInterval(backgroundTimer);
      backgroundTimer = null;
    }
    set({ backgroundCheckActive: false });
  },
}));

/**
 * Convenience hook for components that need update status.
 */
export function useUpdate(): UpdateState {
  return useUpdateStore();
}
