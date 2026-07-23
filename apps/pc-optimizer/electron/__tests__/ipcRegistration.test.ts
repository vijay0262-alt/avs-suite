/**
 * Regression test: duplicate IPC handler registration must not occur.
 *
 * This test verifies that:
 * 1. initLicenseBridge() can be called multiple times without throwing
 * 2. registerIpcHandlers() can be called multiple times without throwing
 * 3. The second call is a no-op (returns without re-registering)
 *
 * Root cause: licenseStartup.ts catch block called initLicenseBridge()
 * a second time after it already succeeded, causing Electron to throw
 * "Attempted to register second handler 'avs:license:startup'".
 */

// We can't import Electron in a unit test, so we mock the ipcMain module
// and verify that handle() is called exactly once per channel.

const registeredChannels: Record<string, number> = {};

jest.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, handler: unknown) {
      registeredChannels[channel] = (registeredChannels[channel] ?? 0) + 1;
      if (registeredChannels[channel] > 1) {
        throw new Error(`Attempted to register second handler '${channel}'`);
      }
    },
    removeHandler: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
  app: {
    getVersion: jest.fn(() => '1.0.0'),
  },
  shell: {
    openExternal: jest.fn(),
  },
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
}));

// Mock the logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock the LicenseBridge class
jest.mock('../licensing/licenseBridge', () => ({
  LicenseBridge: jest.fn().mockImplementation(() => ({
    startup: jest.fn().mockResolvedValue({
      status: 'active',
      edition: 'professional',
      is_offline: false,
    }),
    checkUpdates: jest.fn().mockResolvedValue({ update_available: false }),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock pythonBridge
jest.mock('../ipc/pythonBridge', () => ({
  spawnPythonBackend: jest.fn(),
}));

describe('IPC handler registration idempotency', () => {
  beforeEach(() => {
    // Reset channel registration counts
    for (const key of Object.keys(registeredChannels)) {
      delete registeredChannels[key];
    }
    jest.clearAllMocks();
  });

  describe('licenseIpc.initLicenseBridge', () => {
    it('should not throw when called twice (regression: duplicate handler)', async () => {
      const { initLicenseBridge, shutdownLicenseBridge } = await import('../licensing/licenseIpc');
      const mockRpc = { call: jest.fn(), shutdown: jest.fn() };

      // First call — registers all handlers
      expect(() => initLicenseBridge(mockRpc as any, mockLogger)).not.toThrow();

      // Second call — must NOT re-register handlers
      expect(() => initLicenseBridge(mockRpc as any, mockLogger)).not.toThrow();

      // Verify each channel was registered exactly once
      const licenseChannels = Object.keys(registeredChannels).filter((ch) =>
        ch.startsWith('avs:license:'),
      );
      for (const channel of licenseChannels) {
        expect(registeredChannels[channel]).toBe(1);
      }

      // Should have registered a reasonable number of handlers
      expect(licenseChannels.length).toBeGreaterThan(5);

      shutdownLicenseBridge();
    });

    it('should allow re-registration after shutdown', async () => {
      const { initLicenseBridge, shutdownLicenseBridge } = await import('../licensing/licenseIpc');
      const mockRpc = { call: jest.fn(), shutdown: jest.fn() };

      initLicenseBridge(mockRpc as any, mockLogger);
      shutdownLicenseBridge();

      // After shutdown, should be able to register again
      expect(() => initLicenseBridge(mockRpc as any, mockLogger)).not.toThrow();

      shutdownLicenseBridge();
    });
  });

  describe('handlers.registerIpcHandlers', () => {
    it('should not throw when called twice (regression: duplicate handler)', async () => {
      const { registerIpcHandlers } = await import('../ipc/handlers');
      const mockRpc = { call: jest.fn(), shutdown: jest.fn() };

      // First call — registers all handlers
      expect(() => registerIpcHandlers(mockRpc as any, mockLogger)).not.toThrow();

      // Second call — must NOT re-register handlers
      expect(() => registerIpcHandlers(mockRpc as any, mockLogger)).not.toThrow();

      // Verify each channel was registered exactly once
      const appChannels = Object.keys(registeredChannels).filter((ch) =>
        ch.startsWith('avs:app:') || ch.startsWith('avs:rpc:'),
      );
      for (const channel of appChannels) {
        expect(registeredChannels[channel]).toBe(1);
      }
    });
  });

  describe('licenseStartup.initLicensing', () => {
    it('should not call initLicenseBridge twice even when startup fails', async () => {
      // Reset modules to get fresh state
      jest.resetModules();

      // Re-mock after reset
      jest.doMock('electron', () => ({
        ipcMain: {
          handle(channel: string, handler: unknown) {
            registeredChannels[channel] = (registeredChannels[channel] ?? 0) + 1;
            if (registeredChannels[channel] > 1) {
              throw new Error(`Attempted to register second handler '${channel}'`);
            }
          },
          removeHandler: jest.fn(),
        },
        BrowserWindow: { getAllWindows: jest.fn(() => []) },
        app: { getVersion: jest.fn(() => '1.0.0') },
        shell: { openExternal: jest.fn() },
      }));

      jest.doMock('../licensing/licenseBridge', () => ({
        LicenseBridge: jest.fn().mockImplementation(() => ({
          startup: jest.fn().mockRejectedValue(new Error('SDK not available')),
          checkUpdates: jest.fn().mockResolvedValue({ update_available: false }),
          close: jest.fn().mockResolvedValue(undefined),
        })),
      }));

      jest.doMock('../ipc/pythonBridge', () => ({
        spawnPythonBackend: jest.fn(),
      }));

      const { initLicensing, shutdownLicenseBridge } = await import('../licensing/licenseStartup');
      const mockRpc = { call: jest.fn(), shutdown: jest.fn() };

      // This should not throw even though bridge.startup() fails
      await expect(initLicensing(mockRpc as any, mockLogger)).resolves.not.toThrow();

      // Verify no channel was registered more than once
      for (const [channel, count] of Object.entries(registeredChannels)) {
        expect(count).toBe(1);
      }

      shutdownLicenseBridge();
    });
  });
});
