/**
 * Tests for ManifestClient — fetching and parsing product manifests.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { manifestClient, ManifestError } from '../manifestClient';

// Mock the apiClient
vi.mock('../../auth/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode: number, public detail?: string) {
      super(message);
      this.name = 'ApiError';
    }
  },
  NetworkError: class NetworkError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NetworkError';
    }
  },
}));

import { apiClient } from '../../auth/apiClient';

function makeRawManifest(overrides: Record<string, unknown> = {}) {
  return {
    product_code: 'optimizer',
    current_version: '1.1.0',
    minimum_supported_version: '0.9.0',
    release_channel: 'stable',
    platform: 'windows-x64',
    download_url: 'https://download.avs-shield.com/optimizer/1.1.0/setup.exe',
    sha256: 'abc123def4567890123456789012345678901234567890123456789012345678',
    file_size: 52428800,
    release_notes: 'Bug fixes and performance improvements.',
    force_update: false,
    published_at: '2026-07-25T12:00:00Z',
    ...overrides,
  };
}

describe('manifestClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchManifest', () => {
    it('fetches and parses a valid manifest', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(makeRawManifest());

      const manifest = await manifestClient.fetchManifest('optimizer');

      expect(manifest.productCode).toBe('optimizer');
      expect(manifest.currentVersion).toBe('1.1.0');
      expect(manifest.minimumSupportedVersion).toBe('0.9.0');
      expect(manifest.releaseChannel).toBe('stable');
      expect(manifest.platform).toBe('windows-x64');
      expect(manifest.downloadUrl).toContain('setup.exe');
      expect(manifest.sha256).toHaveLength(64);
      expect(manifest.fileSize).toBe(52428800);
      expect(manifest.releaseNotes).toContain('Bug fixes');
      expect(manifest.forceUpdate).toBe(false);
      expect(manifest.publishedAt).toBe('2026-07-25T12:00:00Z');
    });

    it('calls the correct endpoint', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(makeRawManifest());

      await manifestClient.fetchManifest('optimizer');

      expect(apiClient.get).toHaveBeenCalledWith('/api/products/optimizer/manifest');
    });

    it('throws ManifestError for missing required fields', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(makeRawManifest({ download_url: '' }));

      await expect(manifestClient.fetchManifest('optimizer')).rejects.toThrow(ManifestError);
    });

    it('throws ManifestError with MANIFEST_INVALID for missing sha256', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(makeRawManifest({ sha256: '' }));

      try {
        await manifestClient.fetchManifest('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ManifestError);
        expect((err as ManifestError).code).toBe('MANIFEST_INVALID');
      }
    });

    it('handles network errors', async () => {
      const { NetworkError } = await import('../../auth/apiClient');
      vi.mocked(apiClient.get).mockRejectedValue(new NetworkError('Connection refused'));

      await expect(manifestClient.fetchManifest('optimizer')).rejects.toThrow(ManifestError);
      try {
        await manifestClient.fetchManifest('optimizer');
      } catch (err) {
        expect((err as ManifestError).code).toBe('OFFLINE');
      }
    });

    it('handles 404 errors', async () => {
      const { ApiError } = await import('../../auth/apiClient');
      vi.mocked(apiClient.get).mockRejectedValue(new ApiError('Not found', 404));

      try {
        await manifestClient.fetchManifest('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as ManifestError).code).toBe('MANIFEST_NOT_FOUND');
      }
    });

    it('handles 500 errors', async () => {
      const { ApiError } = await import('../../auth/apiClient');
      vi.mocked(apiClient.get).mockRejectedValue(new ApiError('Server error', 500));

      try {
        await manifestClient.fetchManifest('optimizer');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as ManifestError).code).toBe('SERVER_ERROR');
      }
    });

    it('handles force_update = true', async () => {
      vi.mocked(apiClient.get).mockResolvedValue(makeRawManifest({ force_update: true }));

      const manifest = await manifestClient.fetchManifest('optimizer');
      expect(manifest.forceUpdate).toBe(true);
    });
  });
});
