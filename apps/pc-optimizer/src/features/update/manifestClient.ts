/**
 * ManifestClient — fetches the Product Manifest from the AVS License Server.
 *
 * Endpoint:
 *   GET /api/products/{productCode}/manifest
 *
 * The manifest contains all information needed to determine whether
 * an update is available and how to download it.
 *
 * Reusable for every future AVS AI Shield product (antivirus, vpn, etc.)
 * by passing a different productCode.
 */
import { apiClient, ApiError, NetworkError } from '../auth/apiClient';

/** Release channel from the manifest. */
export type ManifestChannel = 'stable' | 'beta' | 'nightly';

/** Target platform for the update package. */
export type ManifestPlatform = 'windows-x64' | 'windows-arm64' | 'macos-x64' | 'macos-arm64' | 'linux-x64';

/** Product manifest returned by the server. */
export interface ProductManifest {
  /** Product code (e.g. "optimizer"). */
  productCode: string;
  /** Latest version available. */
  currentVersion: string;
  /** Minimum supported version — below this, update is forced. */
  minimumSupportedVersion: string;
  /** Release channel. */
  releaseChannel: ManifestChannel;
  /** Target platform. */
  platform: ManifestPlatform;
  /** Download URL for the update package. */
  downloadUrl: string;
  /** Expected SHA256 hash of the download. */
  sha256: string;
  /** File size in bytes. */
  fileSize: number;
  /** Release notes (markdown or plain text). */
  releaseNotes: string;
  /** Whether this update is mandatory. */
  forceUpdate: boolean;
  /** ISO timestamp when the manifest was published. */
  publishedAt: string;
}

/** Raw manifest shape from the server (snake_case). */
interface RawManifest {
  product_code: string;
  current_version: string;
  minimum_supported_version: string;
  release_channel: string;
  platform: string;
  download_url: string;
  sha256: string;
  file_size: number;
  release_notes: string;
  force_update: boolean;
  published_at: string;
}

export type ManifestErrorCode =
  | 'OFFLINE'
  | 'MANIFEST_NOT_FOUND'
  | 'MANIFEST_INVALID'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class ManifestError extends Error {
  constructor(
    message: string,
    public readonly code: ManifestErrorCode,
  ) {
    super(message);
    this.name = 'ManifestError';
  }
}

function classifyError(err: unknown): ManifestError {
  if (err instanceof NetworkError) {
    return new ManifestError(
      'Unable to connect to the AVS AI Shield server. Update check will retry later.',
      'OFFLINE',
    );
  }

  if (err instanceof ApiError) {
    if (err.statusCode === 404) {
      return new ManifestError(
        'Product manifest not found. Please contact support.',
        'MANIFEST_NOT_FOUND',
      );
    }
    if (err.statusCode >= 500) {
      return new ManifestError(
        'The AVS AI Shield server is experiencing issues. Update check will retry later.',
        'SERVER_ERROR',
      );
    }
    return new ManifestError(
      err.detail ?? err.message,
      'UNKNOWN',
    );
  }

  return new ManifestError(
    err instanceof Error ? err.message : 'An unexpected error occurred.',
    'UNKNOWN',
  );
}

/** Convert raw server response to ProductManifest. */
function toManifest(raw: RawManifest): ProductManifest {
  if (!raw.product_code || !raw.current_version || !raw.download_url || !raw.sha256) {
    throw new ManifestError(
      'Manifest is missing required fields.',
      'MANIFEST_INVALID',
    );
  }
  return {
    productCode: raw.product_code,
    currentVersion: raw.current_version,
    minimumSupportedVersion: raw.minimum_supported_version,
    releaseChannel: raw.release_channel as ManifestChannel,
    platform: raw.platform as ManifestPlatform,
    downloadUrl: raw.download_url,
    sha256: raw.sha256,
    fileSize: raw.file_size,
    releaseNotes: raw.release_notes,
    forceUpdate: raw.force_update,
    publishedAt: raw.published_at,
  };
}

export const manifestClient = {
  /**
   * Fetch the product manifest from the server.
   *
   * @param productCode - e.g. "optimizer"
   * @returns The product manifest.
   * @throws ManifestError on failure.
   */
  async fetchManifest(productCode: string = 'optimizer'): Promise<ProductManifest> {
    try {
      const raw = await apiClient.get<RawManifest>(
        `/api/products/${encodeURIComponent(productCode)}/manifest`,
      );
      return toManifest(raw);
    } catch (err) {
      if (err instanceof ManifestError) throw err;
      throw classifyError(err);
    }
  },
};
