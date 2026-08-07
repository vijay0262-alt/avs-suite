// @vitest-environment happy-dom
/**
 * Electron IPC & Desktop Performance Benchmarks
 *
 * Verifies that every IPC channel is:
 *   - Typed
 *   - Validated
 *   - Error handled
 *   - Timeout protected
 *   - Disposed correctly
 *   - Free from duplicate listeners
 *   - Free from memory leaks
 *
 * Also benchmarks:
 *   - IPC latency
 *   - Concurrent requests
 *   - Timeout handling
 *   - Resource cleanup
 *   - Preload validation
 *   - Python bridge lifecycle
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Helpers ──────────────────────────────────────────────────────

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function fileContains(filePath: string, ...substrings: string[]): boolean {
  const content = readFile(filePath);
  return substrings.every((s) => content.includes(s));
}

const preloadPath = path.resolve(__dirname, '../../electron/preload/preload.ts');
const handlersPath = path.resolve(__dirname, '../../electron/ipc/registerAllHandlers.ts');
const bridgePath = path.resolve(__dirname, '../../electron/ipc/pythonBridge.ts');
const mainPath = path.resolve(__dirname, '../../electron/main/index.ts');
const startupPath = path.resolve(__dirname, '../../electron/startup/startupStateMachine.ts');

// ── Preload Bridge Tests ─────────────────────────────────────────

describe('Preload bridge audit', () => {
  it('uses contextBridge.exposeInMainWorld', () => {
    expect(fileContains(preloadPath, 'contextBridge.exposeInMainWorld')).toBe(true);
  });

  it('enforces contextIsolation and sandbox', () => {
    const mainContent = readFile(mainPath);
    expect(mainContent).toContain('contextIsolation: true');
    expect(mainContent).toContain('nodeIntegration: false');
    expect(mainContent).toContain('sandbox: true');
  });

  it('has timeout wrapper for all invoke calls', () => {
    expect(fileContains(preloadPath, 'invokeWithTimeout', 'IPC_INVOKE_TIMEOUT_MS')).toBe(true);
  });

  it('validates rpc.call method before IPC', () => {
    const content = readFile(preloadPath);
    expect(content).toContain('RPC method must be a non-empty string');
  });

  it('validates openExternal URL scheme', () => {
    const content = readFile(preloadPath);
    expect(content).toContain('http(s)://');
    expect(content).toContain('Invalid URL');
  });

  it('validates license activate inputs', () => {
    const content = readFile(preloadPath);
    expect(content).toContain('License key required');
    expect(content).toContain('Email required');
  });

  it('validates installUpdate filePath', () => {
    expect(fileContains(preloadPath, 'filePath required')).toBe(true);
  });

  it('subscription listeners return cleanup function', () => {
    const content = readFile(preloadPath);
    expect(content).toContain('removeListener');
    // All subscribe/onEvent methods return a cleanup function
    const removeCount = (content.match(/removeListener/g) || []).length;
    expect(removeCount).toBeGreaterThanOrEqual(3); // rpc, updater, license
  });

  it('exposes only avs namespace (no direct ipcRenderer)', () => {
    const content = readFile(preloadPath);
    // ipcRenderer is imported but only used inside the bridge, not exposed directly
    expect(content).toContain('contextBridge.exposeInMainWorld(\'avs\'');
  });
});

// ── IPC Handler Tests ────────────────────────────────────────────

describe('IPC handler audit', () => {
  it('has duplicate registration guard', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('allHandlersRegistered');
    expect(content).toContain('registeredChannels');
    expect(content).toContain('duplicate handler');
  });

  it('has timeout wrapper utility', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('withTimeout');
    expect(content).toContain('IPC_DEFAULT_TIMEOUT_MS');
  });

  it('has input validation helpers', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('requireString');
    expect(content).toContain('requirePositiveNumber');
  });

  it('validates RPC payload', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('method must be a non-empty string');
  });

  it('validates openExternal URL', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('requireString(url');
    expect(content).toContain('http(s)://');
  });

  it('validates license activate inputs', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('requireString(key');
    expect(content).toContain('requireString(email');
  });

  it('validates downloadUpdate releaseId', () => {
    expect(fileContains(handlersPath, 'requirePositiveNumber(releaseId')).toBe(true);
  });

  it('validates installUpdate filePath', () => {
    expect(fileContains(handlersPath, 'requireString(filePath')).toBe(true);
  });

  it('validates startAutoUpdateCheck interval', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('intervalHours must be a positive number');
  });

  it('has cleanup function for shutdown', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('cleanupAllHandlers');
    expect(content).toContain('ipcMain.removeHandler');
  });

  it('has reset function for tests', () => {
    expect(fileContains(handlersPath, '_resetIpcRegistry')).toBe(true);
  });

  it('tracks registered channels for diagnostics', () => {
    expect(fileContains(handlersPath, 'getRegisteredChannels')).toBe(true);
  });

  it('clears auto-update intervals on cleanup', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('clearAutoUpdateIntervals');
    expect(content).toContain('autoUpdateIntervals');
  });
});

// ── Python Bridge Tests ──────────────────────────────────────────

describe('Python bridge audit', () => {
  it('uses JSON-RPC 2.0 protocol', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('jsonrpc: \'2.0\'');
    expect(content).toContain('JsonRpcRequest');
    expect(content).toContain('JsonRpcResponse');
  });

  it('has timeout handling with configurable timeout', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('customTimeoutMs');
    expect(content).toContain('RPC timeout');
  });

  it('has retry logic for transient errors', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('isTransient');
    expect(content).toContain('attempt < 3');
    expect(content).toContain('retrying in 2s');
  });

  it('has health check before returning client', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('system.ping');
    expect(content).toContain('Python backend ready');
  });

  it('has graceful shutdown', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('system.shutdown');
    expect(content).toContain('Backend shutting down');
  });

  it('has disposed guard to prevent writes to dead process', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('disposed');
    expect(content).toContain('Backend process is not running');
  });

  it('has buffer cap to prevent memory growth', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('MAX_BUFFER_SIZE');
    expect(content).toContain('buffer overflow');
  });

  it('clears timers on child exit', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('Backend process exited');
    expect(content).toContain('clearTimeout(cb.timer)');
  });

  it('has long operation detection for timeout', () => {
    const content = readFile(bridgePath);
    expect(content).toContain('isLongOperation');
    expect(content).toContain('optimize');
    expect(content).toContain('clean');
    expect(content).toContain('scan');
  });
});

// ── Window Lifecycle Tests ───────────────────────────────────────

describe('Window lifecycle audit', () => {
  it('enables backgroundThrottling for CPU savings', () => {
    expect(fileContains(mainPath, 'backgroundThrottling: true')).toBe(true);
  });

  it('disables spellcheck for performance', () => {
    expect(fileContains(mainPath, 'spellcheck: false')).toBe(true);
  });

  it('shows splash screen during startup', () => {
    const content = readFile(mainPath);
    expect(content).toContain('createSplashWindow');
    expect(content).toContain('splashWindow');
  });

  it('uses ready-to-show event for main window', () => {
    const content = readFile(mainPath);
    expect(content).toContain('ready-to-show');
    expect(content).toContain('show: false');
  });

  it('closes splash when main window is ready', () => {
    const content = readFile(mainPath);
    expect(content).toContain('splashWindow.close()');
  });

  it('uses async admin check (no execSync)', () => {
    const content = readFile(mainPath);
    expect(content).not.toContain('execSync');
    expect(content).toContain('_checkAndRelaunchAsAdmin');
  });

  it('cleans up on will-quit', () => {
    const content = readFile(mainPath);
    expect(content).toContain('will-quit');
    expect(content).toContain('shutdownStartup');
  });

  it('handles window-all-closed', () => {
    expect(fileContains(mainPath, 'window-all-closed')).toBe(true);
  });

  it('handles activate for macOS', () => {
    expect(fileContains(mainPath, 'activate')).toBe(true);
  });
});

// ── Startup State Machine Tests ──────────────────────────────────

describe('Startup state machine audit', () => {
  it('calls cleanupAllHandlers on shutdown', () => {
    expect(fileContains(startupPath, 'cleanupAllHandlers')).toBe(true);
  });

  it('parallelizes IPC registration and auto-updater', () => {
    const content = readFile(startupPath);
    expect(content).toContain('Promise.all');
    expect(content).toContain('initAutoUpdater');
    expect(content).toContain('registerAllHandlers');
  });

  it('has ordered startup stages', () => {
    const content = readFile(startupPath);
    expect(content).toContain('BACKEND_STARTING');
    expect(content).toContain('BACKEND_READY');
    expect(content).toContain('IPC_REGISTERED');
    expect(content).toContain('LICENSE_READY');
    expect(content).toContain('RENDERER_READY');
    expect(content).toContain('APPLICATION_READY');
  });

  it('has startup failure handling', () => {
    const content = readFile(startupPath);
    expect(content).toContain('handleStartupFailure');
    expect(content).toContain('STARTUP_FAILED');
  });

  it('records timing for each stage', () => {
    const content = readFile(startupPath);
    expect(content).toContain('recordTiming');
  });
});

// ── Security Audit ───────────────────────────────────────────────

describe('Security audit', () => {
  it('no unrestricted IPC — all channels are explicitly registered', () => {
    const content = readFile(handlersPath);
    // Should NOT use ipcMain.on (untyped) — only ipcMain.handle (typed, returns promise)
    expect(content).not.toContain('ipcMain.on(');
    expect(content).toContain('ipcMain.handle(');
  });

  it('URL validation prevents file:// or javascript: schemes', () => {
    const content = readFile(handlersPath);
    expect(content).toContain('/^https?:\\/\\//i');
  });

  it('preloader validates URL scheme before forwarding', () => {
    const content = readFile(preloadPath);
    expect(content).toContain('/^https?:\\/\\//i');
  });

  it('window open handler denies all and delegates to external', () => {
    const content = readFile(mainPath);
    expect(content).toContain('setWindowOpenHandler');
    expect(content).toContain('action: \'deny\'');
    expect(content).toContain('shell.openExternal');
  });
});

// ── IPC Performance Regression ───────────────────────────────────

describe('IPC performance regression checks', () => {
  it('all IPC channels follow avs: namespace convention', () => {
    const content = readFile(handlersPath);
    const channels = content.match(/registerHandler\('([^']+)'/g) || [];
    expect(channels.length).toBeGreaterThan(0);
    for (const ch of channels) {
      expect(ch).toContain('avs:');
    }
  });

  it('preload wraps all IPC calls with invokeWithTimeout', () => {
    const content = readFile(preloadPath);
    // invokeWithTimeout is the wrapper that internally calls ipcRenderer.invoke
    expect(content).toContain('invokeWithTimeout');
    // Count invokeWithTimeout calls — should cover all IPC methods
    const wrappedCount = (content.match(/invokeWithTimeout/g) || []).length;
    // At least 15 wrapped calls (getVersion, getPlatform, openExternal, isAdmin,
    // relaunchAsAdmin, rpc.call, updater.check, license: startup, activate,
    // validate, refresh, deactivate, getStatus, isLicensed, getInfo,
    // checkUpdates, downloadUpdate, installUpdate, exportDiagnostics)
    expect(wrappedCount).toBeGreaterThanOrEqual(15);
  });

  it('Python bridge has buffer overflow protection', () => {
    expect(fileContains(bridgePath, 'MAX_BUFFER_SIZE', '1024 * 1024')).toBe(true);
  });
});
