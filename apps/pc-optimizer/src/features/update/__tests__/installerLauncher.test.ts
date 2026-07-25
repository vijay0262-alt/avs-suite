/**
 * Tests for InstallerLauncher — preparing and launching installers.
 *
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from 'vitest';
import { installerLauncher, InstallerError } from '../installerLauncher';

describe('installerLauncher', () => {
  describe('prepare', () => {
    it('prepares installer info from verified data', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const info = installerLauncher.prepare(data, 'abc123hash');

      expect(info.fileSize).toBe(5);
      expect(info.sha256).toBe('abc123hash');
      expect(info.ready).toBe(true);
      expect(info.filePath).toContain('avs-updates');
    });

    it('generates a unique file path', () => {
      const data = new Uint8Array([1]);
      const info1 = installerLauncher.prepare(data, 'hash1');
      const info2 = installerLauncher.prepare(data, 'hash2');

      expect(info1.filePath).not.toBe(info2.filePath);
    });
  });

  describe('launch', () => {
    it('launches when installer is ready', async () => {
      const data = new Uint8Array([1]);
      const info = installerLauncher.prepare(data, 'hash');

      await expect(installerLauncher.launch(info)).resolves.toBeUndefined();
    });

    it('throws InstallerError when not ready', async () => {
      const info = {
        filePath: '/tmp/test.exe',
        fileSize: 100,
        sha256: 'abc',
        ready: false,
      };

      await expect(installerLauncher.launch(info)).rejects.toThrow(InstallerError);
      try {
        await installerLauncher.launch(info);
      } catch (err) {
        expect((err as InstallerError).code).toBe('NO_FILE');
      }
    });
  });

  describe('cleanup', () => {
    it('does not throw on cleanup', async () => {
      const info = installerLauncher.prepare(new Uint8Array([1]), 'hash');
      await expect(installerLauncher.cleanup(info)).resolves.toBeUndefined();
    });
  });
});
