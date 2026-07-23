/**
 * Regression test: duplicate IPC handler registration must not occur.
 *
 * Tests the central IPC registry (registerAllHandlers.ts) to ensure:
 * 1. All handlers are registered exactly once
 * 2. Calling registerAllHandlers twice does not throw
 * 3. Backend failures do not cause re-registration
 * 4. The startup state machine never double-registers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const registeredChannels: Record<string, number> = {};

vi.mock('electron', () => ({
  ipcMain: {
    handle(channel: string, _handler: unknown) {
      registeredChannels[channel] = (registeredChannels[channel] ?? 0) + 1;
      if (registeredChannels[channel] > 1) {
        throw new Error(`Attempted to register second handler '${channel}'`);
      }
    },
    removeHandler: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  app: {
    getVersion: vi.fn(() => '1.0.0'),
    getPath: vi.fn(() => '/tmp'),
    quit: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
  dialog: {
    showErrorBox: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: false,
    allowPrerelease: false,
    logger: null,
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  },
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock LicenseBridge
vi.mock('../licensing/licenseBridge', () => ({
  LicenseBridge: vi.fn().mockImplementation(() => ({
    startup: vi.fn().mockResolvedValue({
      status: 'active',
      edition: 'professional',
      is_offline: false,
    }),
    checkUpdates: vi.fn().mockResolvedValue({ update_available: false }),
    activate: vi.fn(),
    validate: vi.fn(),
    refresh: vi.fn(),
    deactivate: vi.fn(),
    getStatus: vi.fn(),
    isLicensed: vi.fn(),
    getInfo: vi.fn(),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock pythonBridge
vi.mock('../ipc/pythonBridge', () => ({
  spawnPythonBackend: vi.fn().mockResolvedValue({
    call: vi.fn().mockResolvedValue({}),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('Central IPC registry — duplicate registration prevention', () => {
  beforeEach(() => {
    for (const key of Object.keys(registeredChannels)) {
      delete registeredChannels[key];
    }
    vi.clearAllMocks();
  });

  describe('registerAllHandlers', () => {
    it('should register all handlers exactly once', async () => {
      const { registerAllHandlers, _resetIpcRegistry, getRegisteredChannels } = await import('../ipc/registerAllHandlers');
      _resetIpcRegistry();

      const mockRpc = { call: vi.fn(), shutdown: vi.fn() };
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

      const mockRpc = { call: vi.fn(), shutdown: vi.fn() };
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

      const mockRpc = { call: vi.fn(), shutdown: vi.fn() };
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
      vi.resetModules();

      // Re-mock with backend failure
      vi.doMock('../ipc/pythonBridge', () => ({
        spawnPythonBackend: vi.fn().mockRejectedValue(new Error('Backend unavailable')),
      }));

      const { runStartup, getStartupState } = await import('../startup/startupStateMachine');

      const createMainWindow = vi.fn().mockResolvedValue(undefined);
      const closeSplash = vi.fn();

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
      vi.resetModules();

      // Re-mock with successful backend
      vi.doMock('../ipc/pythonBridge', () => ({
        spawnPythonBackend: vi.fn().mockResolvedValue({
          call: vi.fn().mockResolvedValue({}),
          shutdown: vi.fn().mockResolvedValue(undefined),
        }),
      }));

      vi.doMock('../licensing/licenseBridge', () => ({
        LicenseBridge: vi.fn().mockImplementation(() => ({
          startup: vi.fn().mockResolvedValue({
            status: 'active',
            edition: 'professional',
            is_offline: false,
          }),
          checkUpdates: vi.fn().mockResolvedValue({ update_available: false }),
          close: vi.fn().mockResolvedValue(undefined),
        })),
      }));

      const { runStartup, getStartupState } = await import('../startup/startupStateMachine');

      const createMainWindow = vi.fn().mockResolvedValue(undefined);
      const closeSplash = vi.fn();

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
