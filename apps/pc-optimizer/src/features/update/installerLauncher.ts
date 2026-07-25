/**
 * InstallerLauncher — prepares the downloaded update for installation.
 *
 * After a download is verified (checksum valid), the installer is
 * prepared for launch. The actual launch only happens after user
 * confirmation — no silent installation.
 *
 * In the Electron environment, this would use IPC to call
 * child_process.execFile or shell.openPath. In the browser/dev
 * environment, it simulates the launch.
 */

export type InstallerStatus =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'launched'
  | 'error';

export interface InstallerInfo {
  /** Path or identifier for the downloaded installer. */
  filePath: string;
  /** File size in bytes. */
  fileSize: number;
  /** SHA256 hash of the verified file. */
  sha256: string;
  /** Whether the installer is ready to launch. */
  ready: boolean;
}

export type InstallerErrorCode =
  | 'NO_FILE'
  | 'LAUNCH_FAILED'
  | 'PLATFORM_UNSUPPORTED'
  | 'UNKNOWN';

export class InstallerError extends Error {
  constructor(
    message: string,
    public readonly code: InstallerErrorCode,
  ) {
    super(message);
    this.name = 'InstallerError';
  }
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { avs?: unknown }).avs;
}

/** Monotonic counter for unique file paths. */
let installerCounter = 0;

export const installerLauncher = {
  /**
   * Prepare the installer for launch.
   * Stores the file info and marks it as ready.
   */
  prepare(data: Uint8Array, sha256: string): InstallerInfo {
    // In a real Electron app, this would write the data to a temp file
    // and return the path. For now, we simulate with a virtual path.
    const tempDir = isElectron()
      ? 'C:\\Users\\Default\\AppData\\Local\\Temp\\avs-updates'
      : '/tmp/avs-updates';
    installerCounter++;
    const fileName = `avs-shield-update-${Date.now()}-${installerCounter}.exe`;
    const filePath = `${tempDir}/${fileName}`;

    return {
      filePath,
      fileSize: data.byteLength,
      sha256,
      ready: true,
    };
  },

  /**
   * Launch the installer.
   * This should only be called after user confirmation.
   */
  async launch(installer: InstallerInfo): Promise<void> {
    if (!installer.ready) {
      throw new InstallerError(
        'Installer is not ready. Download and verify the update first.',
        'NO_FILE',
      );
    }

    if (isElectron()) {
      // In production Electron:
      // window.avs.shell.openPath(installer.filePath)
      // or use child_process via IPC
      // For now, simulate success
      return;
    }

    // In dev/browser: simulate launch
    // No actual file system access
    return;
  },

  /**
   * Clean up the installer file after installation or cancellation.
   */
  async cleanup(installer: InstallerInfo): Promise<void> {
    // In production: delete the temp file
    // In dev: no-op
    void installer;
  },
};
