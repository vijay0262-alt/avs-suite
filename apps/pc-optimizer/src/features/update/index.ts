/**
 * Auto Update Engine — barrel export.
 *
 * Public API for the update subsystem.
 * UI components should only import from this barrel.
 */

// Version comparison
export {
  parseVersion,
  compareVersions,
  isNewer,
  isOlder,
  isEqual,
  isAtLeast,
  maxVersion,
  type SemVer,
} from './versionComparator';

// Manifest client
export {
  manifestClient,
  ManifestError,
  type ProductManifest,
  type ManifestChannel,
  type ManifestPlatform,
  type ManifestErrorCode,
} from './manifestClient';

// Checksum validator
export {
  computeSHA256,
  validateChecksum,
  isChecksumValid,
  type ChecksumResult,
} from './checksumValidator';

// Download manager
export {
  DownloadManager,
  downloadManager,
  DownloadError,
  type DownloadStatus,
  type DownloadProgress,
  type DownloadErrorCode,
  type DownloadOptions,
} from './downloadManager';

// Installer launcher
export {
  installerLauncher,
  InstallerError,
  type InstallerStatus,
  type InstallerInfo,
  type InstallerErrorCode,
} from './installerLauncher';

// Update service
export {
  updateService,
  UpdateServiceError,
  type UpdateStatus,
  type UpdateInfo,
  type UpdateErrorCode,
} from './updateService';

// Update store
export {
  useUpdateStore,
  useUpdate,
  type UpdateState,
} from './updateStore';
