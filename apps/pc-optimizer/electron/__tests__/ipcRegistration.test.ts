/**
 * Regression test: duplicate IPC handler registration must not occur.
 *
 * Tests the central IPC registry (registerAllHandlers.ts) to ensure:
 * 1. All handlers are registered exactly once
 * 2. Calling registerAllHandlers twice does not throw
 * 3. Backend failures do not cause re-registration
 * 4. The startup state machine never double-registers
 */

const registeredChannels: Record<string, number> = {};

jest.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, _handler: unknown) {
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
    getPath: jest.fn(() => '/tmp'),
    quit: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
  dialog: {
    showErrorBox: jest.fn(),
  },
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
  execSync: jest.fn(),
  spawn: jest.fn(() => ({
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    stdin: { write: jest.fn() },
    on: jest.fn(),
    kill: jest.fn(),
  })),
}));

jest.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    allowPrerelease: false,
    logger: null,
    on: jest.fn(),
    checkForUpdates: jest.fn(),
    downloadUpdate: jest.fn(),
    quitAndInstall: jest.fn(),
  },
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock LicenseBridge
jest.mock('../licensing/licenseBridge', () => ({
  LicenseBridge: jest.fn().mockImplementation(() => ({
    startup: jest.fn().mockResolvedValue({
      status: 'active',
      edition: 'professional',
      is_offline: false,
    }),
    checkUpdates: jest.fn().mockResolvedValue({ update_available: false }),
    activate: jest.fn(),
    validate: jest.fn(),
    refresh: jest.fn(),
    deactivate: jest.fn(),
    getStatus: jest.fn(),
    isLicensed: jest.fn(),
    getInfo: jest.fn(),
    downloadUpdate: jest.fn(),
    installUpdate: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock pythonBridge
jest.mock('../ipc/pythonBridge', () => ({
  spawnPythonBackend: jest.fn().mockResolvedValue({
    call: jest.fn().mockResolvedValue({}),
    shutdown: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('Central IPC registry — duplicate registration prevention', () => {
  beforeEach(() => {
    for (const key of Object.keys(registeredChannels)) {
      delete registeredChannels[key];
    }
    jest.clearAllMocks();
  });

  describe('registerAllHandlers', () => {
    it('should register all handlers exactly once', async () => {
      const { registerAllHandlers, _resetIpcRegistry, getRegisteredChannels } = await import('../ipc/registerAllHandlers');
      _resetIpcRegistry();

      const mockRpc = { call: jest.fn(), shutdown: jest.fn() };
      const { LicenseBridge } = await import('../licensing/licenseBridge');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = new LicenseBridge(mockRpc as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerAllHandlers({ rpc: mockRpc as any, licenseBridge: bridge, logger: mockLogger });

      // Verify every channel was registered exactly once
      const channels = getRegisteredChannels();
      expect(channels.length).toBeGreaterThan(10);

      for (const [, count] of Object.entries(registeredChannels)) {
        expect(count).toBe(1);
      }
    });

    it('should not throw when called twice (idempotent)', async () => {
      const { registerAllHandlers, _resetIpcRegistry } = await import('../ipc/registerAllHandlers');
      _resetIpcRegistry();

      const mockRpc = { call: jest.fn(), shutdown: jest.fn() };
      const { LicenseBridge } = await import('../licensing/licenseBridge');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = new LicenseBridge(mockRpc as any);

      // First call — registers all handlers
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => registerAllHandlers({ rpc: mockRpc as any, licenseBridge: bridge, logger: mockLogger })).not.toThrow();

      // Second call — must NOT re-register (idempotent guard)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => registerAllHandlers({ rpc: mockRpc as any, licenseBridge: bridge, logger: mockLogger })).not.toThrow();

      // Verify no channel was registered twice
      for (const [, count] of Object.entries(registeredChannels)) {
        expect(count).toBe(1);
      }
    });

    it('should register avs:license:startup exactly once', async () => {
      const { registerAllHandlers, _resetIpcRegistry } = await import('../ipc/registerAllHandlers');
      _resetIpcRegistry();

      const mockRpc = { call: jest.fn(), shutdown: jest.fn() };
      const { LicenseBridge } = await import('../licensing/licenseBridge');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = new LicenseBridge(mockRpc as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerAllHandlers({ rpc: mockRpc as any, licenseBridge: bridge, logger: mockLogger });

      expect(registeredChannels['avs:license:startup']).toBe(1);
    });
  });

  describe('startup state machine', () => {
    const testEnv = {
      env: 'development' as const,
      updateFeedUrl: '',
      licenseApiUrl: '',
      analyticsUrl: null as string | null,
      logLevel: 'debug' as const,
      openDevTools: false,
    };

    it('should not double-register handlers when backend fails', async () => {
      jest.resetModules();

      // Re-mock with backend failure
      jest.doMock('../ipc/pythonBridge', () => ({
        spawnPythonBackend: jest.fn().mockRejectedValue(new Error('Backend unavailable')),
      }));

      const { runStartup, getStartupState } = await import('../startup/startupStateMachine');

      const createMainWindow = jest.fn().mockResolvedValue(undefined);
      const closeSplash = jest.fn();

      await runStartup(
        mockLogger,
        createMainWindow,
        closeSplash,
        testEnv,
      );

      // Should have transitioned to failed/degraded
      const state = getStartupState();
      expect(['STARTUP_FAILED', 'DEGRADED_MODE']).toContain(state);

      // Even in degraded mode, no channel should be registered twice
      for (const [, count] of Object.entries(registeredChannels)) {
        expect(count).toBe(1);
      }
    });

    it('should complete full startup without duplicate registrations', async () => {
      jest.resetModules();

      // Re-mock with successful backend
      jest.doMock('../ipc/pythonBridge', () => ({
        spawnPythonBackend: jest.fn().mockResolvedValue({
          call: jest.fn().mockResolvedValue({}),
          shutdown: jest.fn().mockResolvedValue(undefined),
        }),
      }));

      jest.doMock('../licensing/licenseBridge', () => ({
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

      const { runStartup, getStartupState } = await import('../startup/startupStateMachine');

      const createMainWindow = jest.fn().mockResolvedValue(undefined);
      const closeSplash = jest.fn();

      await runStartup(
        mockLogger,
        createMainWindow,
        closeSplash,
        testEnv,
      );

      expect(getStartupState()).toBe('APPLICATION_READY');

      // No channel registered twice
      for (const [, count] of Object.entries(registeredChannels)) {
        expect(count).toBe(1);
      }
    });
  });
});
