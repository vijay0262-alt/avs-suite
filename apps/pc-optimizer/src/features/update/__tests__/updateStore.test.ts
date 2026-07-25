/**
 * Tests for UpdateStore — Zustand store for the auto-update engine.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock updateService
vi.mock('../updateService', () => ({
  updateService: {
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    pauseDownload: vi.fn(),
    resumeDownload: vi.fn(),
    cancelDownload: vi.fn(),
    verifyUpdate: vi.fn(),
    prepareInstaller: vi.fn(),
    launchInstaller: vi.fn(),
    cleanup: vi.fn(),
    clearManifestCache: vi.fn(),
    getDownloadProgress: vi.fn(),
    getInstallerInfo: vi.fn(),
    _downloadedData: null as Uint8Array | null,
    _downloadProgress: null as unknown,
    _installerInfo: null as unknown,
    _checksumResult: null as unknown,
  },
  UpdateServiceError: class UpdateServiceError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'UpdateServiceError';
    }
  },
}));

// Mock version config
vi.mock('../../../config/version', () => ({
  getVersionInfo: () => ({ version: '1.0.0', buildNumber: '1001', channel: 'stable', releaseDate: '2026-07-23', architecture: 'x64', edition: 'free' }),
}));

import { useUpdateStore } from '../updateStore';
import { updateService, UpdateServiceError } from '../updateService';
import type { ProductManifest } from '../manifestClient';

function makeManifest(overrides: Partial<ProductManifest> = {}): ProductManifest {
  return {
    productCode: 'optimizer',
    currentVersion: '1.1.0',
    minimumSupportedVersion: '0.9.0',
    releaseChannel: 'stable',
    platform: 'windows-x64',
    downloadUrl: 'https://download.avs-shield.com/optimizer/1.1.0/setup.exe',
    sha256: 'abc123def4567890123456789012345678901234567890123456789012345678',
    fileSize: 52428800,
    releaseNotes: 'Bug fixes.',
    forceUpdate: false,
    publishedAt: '2026-07-25T12:00:00Z',
    ...overrides,
  };
}

describe('updateStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUpdateStore.setState({
      status: 'idle',
      updateInfo: null,
      manifest: null,
      downloadProgress: null,
      installer: null,
      error: null,
      errorCode: null,
      lastCheckAt: null,
      currentVersion: '1.0.0',
      backgroundCheckActive: false,
      forceUpdate: false,
    });
  });

  describe('checkForUpdates', () => {
    it('sets status to update-available when update found', async () => {
      vi.mocked(updateService.checkForUpdates).mockResolvedValue({
        available: true,
        forceUpdate: false,
        latestVersion: '1.1.0',
        currentVersion: '1.0.0',
        minimumSupportedVersion: '0.9.0',
        belowMinimum: false,
        manifest: makeManifest(),
      });

      const result = await useUpdateStore.getState().checkForUpdates('optimizer');

      expect(result).toBe(true);
      expect(useUpdateStore.getState().status).toBe('update-available');
      expect(useUpdateStore.getState().manifest).not.toBeNull();
    });

    it('sets status to no-update when no update found', async () => {
      vi.mocked(updateService.checkForUpdates).mockResolvedValue({
        available: false,
        forceUpdate: false,
        latestVersion: '1.0.0',
        currentVersion: '1.0.0',
        minimumSupportedVersion: '0.9.0',
        belowMinimum: false,
        manifest: null,
      });

      const result = await useUpdateStore.getState().checkForUpdates('optimizer');

      expect(result).toBe(false);
      expect(useUpdateStore.getState().status).toBe('no-update');
    });

    it('sets error state on failure', async () => {
      vi.mocked(updateService.checkForUpdates).mockRejectedValue(
        new UpdateServiceError('Offline', 'OFFLINE'),
      );

      const result = await useUpdateStore.getState().checkForUpdates('optimizer');

      expect(result).toBe(false);
      expect(useUpdateStore.getState().status).toBe('error');
      expect(useUpdateStore.getState().error).toBe('Offline');
      expect(useUpdateStore.getState().errorCode).toBe('OFFLINE');
    });

    it('sets forceUpdate when manifest says forced', async () => {
      vi.mocked(updateService.checkForUpdates).mockResolvedValue({
        available: true,
        forceUpdate: true,
        latestVersion: '1.1.0',
        currentVersion: '1.0.0',
        minimumSupportedVersion: '0.9.0',
        belowMinimum: false,
        manifest: makeManifest({ forceUpdate: true }),
      });

      await useUpdateStore.getState().checkForUpdates('optimizer');

      expect(useUpdateStore.getState().forceUpdate).toBe(true);
    });
  });

  describe('download', () => {
    it('sets status to downloaded on success', async () => {
      useUpdateStore.setState({ manifest: makeManifest() });
      vi.mocked(updateService.downloadUpdate).mockImplementation(async (_manifest, onProgress) => {
        onProgress?.({ downloadedBytes: 100, totalBytes: 100, percent: 100, speed: 1000 });
        return new Uint8Array([1, 2, 3]);
      });

      const result = await useUpdateStore.getState().download('optimizer');

      expect(result).toBe(true);
      expect(useUpdateStore.getState().status).toBe('downloaded');
    });

    it('sets error when no manifest available', async () => {
      useUpdateStore.setState({ manifest: null });

      const result = await useUpdateStore.getState().download('optimizer');

      expect(result).toBe(false);
      expect(useUpdateStore.getState().status).toBe('error');
    });

    it('sets error on download failure', async () => {
      useUpdateStore.setState({ manifest: makeManifest() });
      vi.mocked(updateService.downloadUpdate).mockRejectedValue(
        new UpdateServiceError('Download failed', 'DOWNLOAD_FAILED'),
      );

      const result = await useUpdateStore.getState().download('optimizer');

      expect(result).toBe(false);
      expect(useUpdateStore.getState().status).toBe('error');
      expect(useUpdateStore.getState().errorCode).toBe('DOWNLOAD_FAILED');
    });
  });

  describe('cancelDownload', () => {
    it('cancels and resets state', () => {
      useUpdateStore.setState({ status: 'downloading', downloadProgress: { downloadedBytes: 50, totalBytes: 100, percent: 50, speed: 500 } });

      useUpdateStore.getState().cancelDownload();

      expect(useUpdateStore.getState().status).toBe('idle');
      expect(useUpdateStore.getState().downloadProgress).toBeNull();
      expect(updateService.cancelDownload).toHaveBeenCalled();
    });
  });

  describe('verifyUpdate', () => {
    it('sets status to verified on success', async () => {
      useUpdateStore.setState({ manifest: makeManifest() });
      updateService._downloadedData = new Uint8Array([1, 2, 3]);
      vi.mocked(updateService.verifyUpdate).mockResolvedValue({ valid: true, computed: 'abc' });

      const result = await useUpdateStore.getState().verifyUpdate();

      expect(result).toBe(true);
      expect(useUpdateStore.getState().status).toBe('verified');
    });

    it('sets error on checksum mismatch', async () => {
      useUpdateStore.setState({ manifest: makeManifest() });
      updateService._downloadedData = new Uint8Array([1]);
      vi.mocked(updateService.verifyUpdate).mockRejectedValue(
        new UpdateServiceError('Checksum mismatch', 'CHECKSUM_MISMATCH'),
      );

      const result = await useUpdateStore.getState().verifyUpdate();

      expect(result).toBe(false);
      expect(useUpdateStore.getState().status).toBe('error');
      expect(useUpdateStore.getState().errorCode).toBe('CHECKSUM_MISMATCH');
    });
  });

  describe('prepareInstaller', () => {
    it('sets status to ready on success', async () => {
      useUpdateStore.setState({ manifest: makeManifest() });
      updateService._downloadedData = new Uint8Array([1, 2, 3]);
      vi.mocked(updateService.prepareInstaller).mockReturnValue({
        filePath: '/tmp/setup.exe',
        fileSize: 3,
        sha256: 'abc',
        ready: true,
      });

      const result = await useUpdateStore.getState().prepareInstaller();

      expect(result).toBe(true);
      expect(useUpdateStore.getState().status).toBe('ready');
      expect(useUpdateStore.getState().installer).not.toBeNull();
    });
  });

  describe('launchInstaller', () => {
    it('launches installer on success', async () => {
      vi.mocked(updateService.launchInstaller).mockResolvedValue(undefined);

      const result = await useUpdateStore.getState().launchInstaller();

      expect(result).toBe(true);
      expect(useUpdateStore.getState().status).toBe('idle');
    });

    it('sets error on launch failure', async () => {
      vi.mocked(updateService.launchInstaller).mockRejectedValue(
        new UpdateServiceError('Launch failed', 'INSTALLER_FAILED'),
      );

      const result = await useUpdateStore.getState().launchInstaller();

      expect(result).toBe(false);
      expect(useUpdateStore.getState().status).toBe('error');
    });
  });

  describe('cleanup', () => {
    it('resets all state', () => {
      useUpdateStore.setState({
        status: 'ready',
        downloadProgress: { downloadedBytes: 100, totalBytes: 100, percent: 100, speed: 1000 },
        installer: { filePath: '/tmp/test', fileSize: 100, sha256: 'abc', ready: true },
      });

      useUpdateStore.getState().cleanup();

      expect(useUpdateStore.getState().status).toBe('idle');
      expect(useUpdateStore.getState().downloadProgress).toBeNull();
      expect(useUpdateStore.getState().installer).toBeNull();
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      useUpdateStore.setState({ error: 'Something went wrong', errorCode: 'UNKNOWN' });

      useUpdateStore.getState().clearError();

      expect(useUpdateStore.getState().error).toBeNull();
      expect(useUpdateStore.getState().errorCode).toBeNull();
    });
  });

  describe('background checks', () => {
    it('startBackgroundChecks triggers immediate check', () => {
      vi.mocked(updateService.checkForUpdates).mockResolvedValue({
        available: false,
        forceUpdate: false,
        latestVersion: '1.0.0',
        currentVersion: '1.0.0',
        minimumSupportedVersion: '0.9.0',
        belowMinimum: false,
        manifest: null,
      });

      useUpdateStore.getState().startBackgroundChecks('optimizer');

      expect(updateService.checkForUpdates).toHaveBeenCalled();
      expect(useUpdateStore.getState().backgroundCheckActive).toBe(true);

      // Clean up timer
      useUpdateStore.getState().stopBackgroundChecks();
    });

    it('stopBackgroundChecks stops the timer', () => {
      useUpdateStore.getState().startBackgroundChecks('optimizer');
      useUpdateStore.getState().stopBackgroundChecks();

      expect(useUpdateStore.getState().backgroundCheckActive).toBe(false);
    });
  });
});
