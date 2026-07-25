/**
 * Tests for UpdateService — orchestrates the complete update flow.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateService, UpdateServiceError } from '../updateService';
import type { ProductManifest } from '../manifestClient';

// Mock manifestClient
vi.mock('../manifestClient', () => ({
  manifestClient: {
    fetchManifest: vi.fn(),
  },
  ManifestError: class ManifestError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'ManifestError';
    }
  },
}));

// Mock downloadManager
vi.mock('../downloadManager', () => ({
  downloadManager: {
    download: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  },
  DownloadError: class DownloadError extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'DownloadError';
    }
  },
}));

// Mock checksumValidator
vi.mock('../checksumValidator', () => ({
  validateChecksum: vi.fn(),
}));

// Mock installerLauncher
vi.mock('../installerLauncher', () => ({
  installerLauncher: {
    prepare: vi.fn(),
    launch: vi.fn(),
    cleanup: vi.fn(),
  },
}));

// Mock version config
vi.mock('../../../config/version', () => ({
  getVersionInfo: () => ({ version: '1.0.0', buildNumber: '1001', channel: 'stable', releaseDate: '2026-07-23', architecture: 'x64', edition: 'free' }),
}));

import { manifestClient } from '../manifestClient';
import { downloadManager } from '../downloadManager';
import { validateChecksum } from '../checksumValidator';
import { installerLauncher } from '../installerLauncher';
import { ManifestError } from '../manifestClient';
import { DownloadError } from '../downloadManager';

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
    releaseNotes: 'Bug fixes and improvements.',
    forceUpdate: false,
    publishedAt: '2026-07-25T12:00:00Z',
    ...overrides,
  };
}

describe('updateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    updateService._downloadedData = null;
    updateService._downloadProgress = null;
    updateService._installerInfo = null;
    updateService._checksumResult = null;
  });

  describe('checkForUpdates', () => {
    it('returns update available when manifest version is newer', async () => {
      vi.mocked(manifestClient.fetchManifest).mockResolvedValue(makeManifest());
      const info = await updateService.checkForUpdates('optimizer');
      expect(info.available).toBe(true);
      expect(info.latestVersion).toBe('1.1.0');
      expect(info.currentVersion).toBe('1.0.0');
      expect(info.manifest).not.toBeNull();
    });

    it('returns no update when manifest version is same', async () => {
      vi.mocked(manifestClient.fetchManifest).mockResolvedValue(makeManifest({ currentVersion: '1.0.0' }));
      const info = await updateService.checkForUpdates('optimizer');
      expect(info.available).toBe(false);
      expect(info.manifest).toBeNull();
    });

    it('returns no update when manifest version is older', async () => {
      vi.mocked(manifestClient.fetchManifest).mockResolvedValue(makeManifest({ currentVersion: '0.9.0' }));
      const info = await updateService.checkForUpdates('optimizer');
      expect(info.available).toBe(false);
    });

    it('detects belowMinimum when current < minimumSupported', async () => {
      vi.mocked(manifestClient.fetchManifest).mockResolvedValue(makeManifest({ minimumSupportedVersion: '1.5.0' }));
      const info = await updateService.checkForUpdates('optimizer');
      expect(info.belowMinimum).toBe(true);
      expect(info.forceUpdate).toBe(true);
    });

    it('detects forceUpdate flag from manifest', async () => {
      vi.mocked(manifestClient.fetchManifest).mockResolvedValue(makeManifest({ forceUpdate: true }));
      const info = await updateService.checkForUpdates('optimizer');
      expect(info.forceUpdate).toBe(true);
    });

    it('caches manifest to localStorage', async () => {
      vi.mocked(manifestClient.fetchManifest).mockResolvedValue(makeManifest());
      await updateService.checkForUpdates('optimizer');
      const cached = window.localStorage.getItem('avs-update-manifest-cache');
      expect(cached).not.toBeNull();
    });

    it('uses cached manifest when fresh', async () => {
      const manifest = makeManifest();
      window.localStorage.setItem('avs-update-manifest-cache', JSON.stringify({
        manifest,
        cachedAt: new Date().toISOString(),
      }));
      // Should NOT call fetchManifest
      const info = await updateService.checkForUpdates('optimizer');
      expect(manifestClient.fetchManifest).not.toHaveBeenCalled();
      expect(info.available).toBe(true);
    });

    it('throws UpdateServiceError on manifest fetch failure', async () => {
      vi.mocked(manifestClient.fetchManifest).mockRejectedValue(new ManifestError('Offline', 'OFFLINE'));
      await expect(updateService.checkForUpdates('optimizer')).rejects.toThrow(UpdateServiceError);
    });
  });

  describe('downloadUpdate', () => {
    it('downloads update data', async () => {
      const manifest = makeManifest();
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      vi.mocked(downloadManager.download).mockResolvedValue(data);

      const result = await updateService.downloadUpdate(manifest);
      expect(result).toBe(data);
      expect(updateService._downloadedData).toBe(data);
    });

    it('reports progress via callback', async () => {
      const manifest = makeManifest();
      const data = new Uint8Array([1, 2, 3]);
      const progressFn = vi.fn();
      vi.mocked(downloadManager.download).mockImplementation(async (opts) => {
        opts.onProgress?.({ downloadedBytes: 3, totalBytes: 3, percent: 100, speed: 1000 });
        return data;
      });

      await updateService.downloadUpdate(manifest, progressFn);
      expect(progressFn).toHaveBeenCalledWith({ downloadedBytes: 3, totalBytes: 3, percent: 100, speed: 1000 });
    });

    it('throws UpdateServiceError on download failure', async () => {
      const manifest = makeManifest();
      vi.mocked(downloadManager.download).mockRejectedValue(new DownloadError('Failed', 'OFFLINE'));
      await expect(updateService.downloadUpdate(manifest)).rejects.toThrow(UpdateServiceError);
    });
  });

  describe('verifyUpdate', () => {
    it('returns valid result when checksum matches', async () => {
      const data = new Uint8Array([1, 2, 3]);
      const hash = 'abc123';
      vi.mocked(validateChecksum).mockResolvedValue({ valid: true, computed: hash });

      const result = await updateService.verifyUpdate(data, hash);
      expect(result.valid).toBe(true);
    });

    it('throws UpdateServiceError on checksum mismatch', async () => {
      const data = new Uint8Array([1, 2, 3]);
      const hash = 'abc123';
      vi.mocked(validateChecksum).mockResolvedValue({
        valid: false,
        computed: 'wrong',
        expected: hash,
        message: 'Checksum mismatch',
      });

      await expect(updateService.verifyUpdate(data, hash)).rejects.toThrow(UpdateServiceError);
      try {
        await updateService.verifyUpdate(data, hash);
      } catch (err) {
        expect((err as UpdateServiceError).code).toBe('CHECKSUM_MISMATCH');
      }
    });

    it('discards downloaded data on checksum mismatch', async () => {
      const data = new Uint8Array([1, 2, 3]);
      updateService._downloadedData = data;
      vi.mocked(validateChecksum).mockResolvedValue({
        valid: false,
        computed: 'wrong',
        expected: 'abc',
        message: 'mismatch',
      });

      try {
        await updateService.verifyUpdate(data, 'abc');
      } catch {
        // expected
      }
      expect(updateService._downloadedData).toBeNull();
    });
  });

  describe('prepareInstaller', () => {
    it('prepares installer from verified data', () => {
      const data = new Uint8Array([1, 2, 3]);
      const installerInfo = {
        filePath: '/tmp/avs-update/setup.exe',
        fileSize: 3,
        sha256: 'abc',
        ready: true,
      };
      vi.mocked(installerLauncher.prepare).mockReturnValue(installerInfo);

      const result = updateService.prepareInstaller(data, 'abc');
      expect(result.ready).toBe(true);
      expect(updateService._installerInfo).toBe(installerInfo);
    });
  });

  describe('launchInstaller', () => {
    it('launches installer after preparation', async () => {
      updateService._installerInfo = {
        filePath: '/tmp/avs-update/setup.exe',
        fileSize: 100,
        sha256: 'abc',
        ready: true,
      };
      vi.mocked(installerLauncher.launch).mockResolvedValue(undefined);

      await updateService.launchInstaller();
      expect(installerLauncher.launch).toHaveBeenCalled();
    });

    it('throws when no installer is prepared', async () => {
      updateService._installerInfo = null;
      await expect(updateService.launchInstaller()).rejects.toThrow(UpdateServiceError);
    });
  });

  describe('cancelDownload', () => {
    it('cancels download and clears data', () => {
      updateService._downloadedData = new Uint8Array([1]);
      updateService._downloadProgress = { downloadedBytes: 1, totalBytes: 10, percent: 10, speed: 100 };

      updateService.cancelDownload();

      expect(updateService._downloadedData).toBeNull();
      expect(updateService._downloadProgress).toBeNull();
      expect(downloadManager.cancel).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('clears all state', () => {
      updateService._downloadedData = new Uint8Array([1]);
      updateService._downloadProgress = { downloadedBytes: 1, totalBytes: 10, percent: 10, speed: 100 };
      updateService._installerInfo = {
        filePath: '/tmp/test',
        fileSize: 1,
        sha256: 'abc',
        ready: true,
      };

      updateService.cleanup();

      expect(updateService._downloadedData).toBeNull();
      expect(updateService._downloadProgress).toBeNull();
      expect(updateService._installerInfo).toBeNull();
    });
  });

  describe('clearManifestCache', () => {
    it('removes cached manifest from localStorage', () => {
      window.localStorage.setItem('avs-update-manifest-cache', '{"manifest":{},"cachedAt":"2026-01-01"}');

      updateService.clearManifestCache();

      expect(window.localStorage.getItem('avs-update-manifest-cache')).toBeNull();
    });
  });
});
