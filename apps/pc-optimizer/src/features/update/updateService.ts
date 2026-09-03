/**
 * UpdateService — orchestrates the complete update flow.
 *
 * Responsibilities:
 *   - Check for updates (fetch manifest, compare versions)
 *   - Download updates (via DownloadManager)
 *   - Verify integrity (via ChecksumValidator)
 *   - Prepare installer (via InstallerLauncher)
 *   - Cache manifest to avoid duplicate checks
 *
 * The service is the single entry point for all update operations.
 * UI components interact only with the update store, which wraps this service.
 *
 * Reusable for every future AVS AI Shield product.
 */
import { manifestClient, type ProductManifest, ManifestError } from './manifestClient';
import { isNewer, isAtLeast } from './versionComparator';
import { downloadManager, type DownloadProgress, DownloadError } from './downloadManager';
import { validateChecksum, type ChecksumResult } from './checksumValidator';
import { installerLauncher, type InstallerInfo } from './installerLauncher';
import { getVersionInfo } from '../../config/version';

/** Current app version from the central version config. */
function getCurrentVersion(): string {
  return getVersionInfo().version;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'no-update'
  | 'update-available'
  | 'downloading'
  | 'downloaded'
  | 'verifying'
  | 'verified'
  | 'preparing'
  | 'ready'
  | 'installing'
  | 'error';

export interface UpdateInfo {
  /** Whether an update is available. */
  available: boolean;
  /** Whether the update is forced (mandatory). */
  forceUpdate: boolean;
  /** Latest version from the manifest. */
  latestVersion: string | null;
  /** Current installed version. */
  currentVersion: string;
  /** Minimum supported version. */
  minimumSupportedVersion: string | null;
  /** Whether current version is below minimum (force update). */
  belowMinimum: boolean;
  /** The full manifest if an update is available. */
  manifest: ProductManifest | null;
}

export type UpdateErrorCode =
  | 'OFFLINE'
  | 'MANIFEST_UNAVAILABLE'
  | 'DOWNLOAD_FAILED'
  | 'CHECKSUM_MISMATCH'
  | 'INSTALLER_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class UpdateServiceError extends Error {
  constructor(
    message: string,
    public readonly code: UpdateErrorCode,
  ) {
    super(message);
    this.name = 'UpdateServiceError';
  }
}

/** Cache manifest for 24 hours to avoid duplicate checks. */
const MANIFEST_CACHE_KEY = 'avs-update-manifest-cache';
const MANIFEST_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface ManifestCache {
  manifest: ProductManifest;
  cachedAt: string; // ISO timestamp
}

function loadCachedManifest(): ProductManifest | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(MANIFEST_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as ManifestCache;
    const age = Date.now() - new Date(cache.cachedAt).getTime();
    if (age > MANIFEST_CACHE_TTL_MS) return null;
    return cache.manifest;
  } catch {
    return null;
  }
}

function saveCachedManifest(manifest: ProductManifest): void {
  try {
    if (typeof window === 'undefined') return;
    const cache: ManifestCache = {
      manifest,
      cachedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage might be unavailable
  }
}

function clearCachedManifest(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(MANIFEST_CACHE_KEY);
    }
  } catch {
    // ignore
  }
}

export const updateService = {
  /** Current download progress (null if not downloading). */
  _downloadProgress: null as DownloadProgress | null,
  /** Downloaded data (null if not downloaded). */
  _downloadedData: null as Uint8Array | null,
  /** Installer info (null if not prepared). */
  _installerInfo: null as InstallerInfo | null,
  /** Last checksum result. */
  _checksumResult: null as ChecksumResult | null,

  /**
   * Check for updates.
   *
   * Fetches the manifest, compares versions, and returns update info.
   * Uses cached manifest if fresh (< 24h) to avoid duplicate checks.
   *
   * @param productCode - e.g. "optimizer"
   * @returns Update info with availability and version details.
   */
  async checkForUpdates(productCode: string = 'optimizer'): Promise<UpdateInfo> {
    const currentVersion = getCurrentVersion();

    // Try cached manifest first (but still fetch fresh in background)
    const cached = loadCachedManifest();
    if (cached) {
      const available = isNewer(cached.currentVersion, currentVersion);
      const belowMin = !isAtLeast(currentVersion, cached.minimumSupportedVersion);
      if (!available) {
        return {
          available: false,
          forceUpdate: false,
          latestVersion: cached.currentVersion,
          currentVersion,
          minimumSupportedVersion: cached.minimumSupportedVersion,
          belowMinimum: false,
          manifest: null,
        };
      }
      return {
        available: true,
        forceUpdate: cached.forceUpdate || belowMin,
        latestVersion: cached.currentVersion,
        currentVersion,
        minimumSupportedVersion: cached.minimumSupportedVersion,
        belowMinimum: belowMin,
        manifest: cached,
      };
    }

    // Fetch fresh manifest
    try {
      const manifest = await manifestClient.fetchManifest(productCode);
      saveCachedManifest(manifest);

      const available = isNewer(manifest.currentVersion, currentVersion);
      const belowMin = !isAtLeast(currentVersion, manifest.minimumSupportedVersion);

      return {
        available,
        forceUpdate: manifest.forceUpdate || belowMin,
        latestVersion: manifest.currentVersion,
        currentVersion,
        minimumSupportedVersion: manifest.minimumSupportedVersion,
        belowMinimum: belowMin,
        manifest: available ? manifest : null,
      };
    } catch (err) {
      if (err instanceof ManifestError) {
        throw new UpdateServiceError(err.message, err.code === 'OFFLINE' ? 'OFFLINE' : 'MANIFEST_UNAVAILABLE');
      }
      throw new UpdateServiceError(
        err instanceof Error ? err.message : 'Update check failed.',
        'UNKNOWN',
      );
    }
  },

  /**
   * Download the update package.
   *
   * @param manifest - The product manifest with download info
   * @param onProgress - Progress callback
   * @returns The downloaded data.
   */
  async downloadUpdate(
    manifest: ProductManifest,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<Uint8Array> {
    try {
      const data = await downloadManager.download({
        url: manifest.downloadUrl,
        expectedSize: manifest.fileSize,
        onProgress: (p) => {
          this._downloadProgress = p;
          onProgress?.(p);
        },
      });
      this._downloadedData = data;
      return data;
    } catch (err) {
      if (err instanceof DownloadError) {
        throw new UpdateServiceError(
          err.message,
          err.code === 'OFFLINE' ? 'DOWNLOAD_FAILED' :
          err.code === 'TIMEOUT' ? 'TIMEOUT' :
          'DOWNLOAD_FAILED',
        );
      }
      throw new UpdateServiceError(
        err instanceof Error ? err.message : 'Download failed.',
        'DOWNLOAD_FAILED',
      );
    }
  },

  /**
   * Verify the downloaded update's checksum.
   *
   * @param data - The downloaded data
   * @param expectedHash - Expected SHA256 from the manifest
   * @returns The checksum result.
   */
  async verifyUpdate(data: Uint8Array, expectedHash: string): Promise<ChecksumResult> {
    try {
      const result = await validateChecksum(data, expectedHash);
      this._checksumResult = result;

      if (!result.valid) {
        // Discard the download — never install invalid packages
        this._downloadedData = null;
        throw new UpdateServiceError(
          `Checksum verification failed: ${result.message}`,
          'CHECKSUM_MISMATCH',
        );
      }

      return result;
    } catch (err) {
      if (err instanceof UpdateServiceError) throw err;
      throw new UpdateServiceError(
        err instanceof Error ? err.message : 'Checksum verification failed.',
        'CHECKSUM_MISMATCH',
      );
    }
  },

  /**
   * Prepare the installer for launch.
   *
   * @param data - The verified download data
   * @param sha256 - The verified SHA256 hash
   * @returns The installer info.
   */
  prepareInstaller(data: Uint8Array, sha256: string): InstallerInfo {
    try {
      const installer = installerLauncher.prepare(data, sha256);
      this._installerInfo = installer;
      return installer;
    } catch (err) {
      throw new UpdateServiceError(
        err instanceof Error ? err.message : 'Installer preparation failed.',
        'INSTALLER_FAILED',
      );
    }
  },

  /**
   * Launch the installer (after user confirmation).
   */
  async launchInstaller(): Promise<void> {
    if (!this._installerInfo) {
      throw new UpdateServiceError(
        'No installer ready. Download and verify the update first.',
        'INSTALLER_FAILED',
      );
    }

    try {
      await installerLauncher.launch(this._installerInfo);
    } catch (err) {
      throw new UpdateServiceError(
        err instanceof Error ? err.message : 'Installer launch failed.',
        'INSTALLER_FAILED',
      );
    }
  },

  /**
   * Cancel any ongoing download.
   */
  cancelDownload(): void {
    downloadManager.cancel();
    this._downloadedData = null;
    this._downloadProgress = null;
  },

  /**
   * Pause the current download.
   */
  pauseDownload(): void {
    downloadManager.pause();
  },

  /**
   * Resume a paused download.
   */
  async resumeDownload(
    manifest: ProductManifest,
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<Uint8Array> {
    try {
      const data = await downloadManager.resume({
        url: manifest.downloadUrl,
        expectedSize: manifest.fileSize,
        onProgress: (p) => {
          this._downloadProgress = p;
          onProgress?.(p);
        },
      });
      this._downloadedData = data;
      return data;
    } catch (err) {
      if (err instanceof DownloadError) {
        throw new UpdateServiceError(err.message, 'DOWNLOAD_FAILED');
      }
      throw new UpdateServiceError(
        err instanceof Error ? err.message : 'Resume failed.',
        'DOWNLOAD_FAILED',
      );
    }
  },

  /**
   * Clean up all download artifacts.
   */
  cleanup(): void {
    downloadManager.cancel();
    this._downloadedData = null;
    this._downloadProgress = null;
    this._checksumResult = null;
    if (this._installerInfo) {
      void installerLauncher.cleanup(this._installerInfo);
    }
    this._installerInfo = null;
  },

  /**
   * Clear the manifest cache.
   */
  clearManifestCache(): void {
    clearCachedManifest();
  },

  /**
   * Get the current download progress.
   */
  getDownloadProgress(): DownloadProgress | null {
    return this._downloadProgress;
  },

  /**
   * Get the installer info.
   */
  getInstallerInfo(): InstallerInfo | null {
    return this._installerInfo;
  },
};
