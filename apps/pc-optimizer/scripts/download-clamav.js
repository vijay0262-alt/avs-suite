/**
 * Download and extract ClamAV portable binaries for bundling in the installer.
 *
 * This runs at build time (yarn prebuild || electron-builder beforeBuild).
 * The binaries are placed in apps/pc-optimizer/resources/clamav/ and get
 * bundled into the installer via electron-builder extraResources.
 *
 * End users never download ClamAV binaries — they're shipped in the installer.
 * Only virus definitions (~300MB) are downloaded on first launch.
 */
const { downloadAndExtractClamAv } = require('./downloadClamAv');

downloadAndExtractClamAv().catch((err) => {
  console.error('Failed to download ClamAV binaries:', err.message);
  process.exit(1);
});
