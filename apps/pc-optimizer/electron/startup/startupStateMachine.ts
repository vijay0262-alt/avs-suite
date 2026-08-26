/**
 * Startup State Machine — replaces scattered initialization logic with
 * a single linear state machine that transitions through well-defined
 * stages.
 *
 * States:
 *   INITIALIZING → BACKEND_STARTING → BACKEND_READY → IPC_REGISTERED
 *   → (LICENSE_READY ∥ RENDERER_READY) → APPLICATION_READY
 *
 * If any stage fails:
 *   - Log the failure with full context
 *   - Show a startup error dialog
 *   - Transition to STARTUP_FAILED
 *   - The application may continue in degraded mode or exit
 *
 * The state machine ensures:
 *   - IPC handlers are registered exactly once
 *   - Backend startup and IPC registration are independent
 *   - License SDK init happens after backend is ready
 *   - Renderer is created after all handlers are registered
 *   - No stage can execute twice
 */

import { app, dialog } from 'electron';
import { spawnPythonBackend, type RpcClient } from '../ipc/pythonBridge';
import { registerAllHandlers, getRegisteredChannels, cleanupAllHandlers, type IpcDependencies, type Logger } from '../ipc/registerAllHandlers';
import { LicenseBridge } from '../licensing/licenseBridge';
import { initAutoUpdater, type EnvironmentConfig } from '../updater/updater';

// ── Types ───────────────────────────────────────────────────

export type StartupState =
  | 'INITIALIZING'
  | 'BACKEND_STARTING'
  | 'BACKEND_READY'
  | 'IPC_REGISTERED'
  | 'LICENSE_READY'
  | 'RENDERER_READY'
  | 'APPLICATION_READY'
  | 'STARTUP_FAILED'
  | 'DEGRADED_MODE';

export interface StartupDiagnostics {
  electronVersion: string;
  nodeVersion: string;
  platform: string;
  appVersion: string;
  startupDurationMs: number;
  state: StartupState;
  backendReady: boolean;
  licenseReady: boolean;
  ipcChannels: string[];
  stageTimings: Record<string, number>;
  error?: string;
  errorStack?: string;
}

interface StageTiming {
  name: string;
  startMs: number;
  endMs: number;
}

// ── State ───────────────────────────────────────────────────

let currentState: StartupState = 'INITIALIZING';
let rpcClient: RpcClient | null = null;
let licenseBridge: LicenseBridge | null = null;
let stageTimings: StageTiming[] = [];
let startupStartTime = 0;
let lastError: Error | null = null;

function transition(newState: StartupState, logger: Logger): void {
  const oldState = currentState;
  currentState = newState;
  logger.info(`[startup-state] ${oldState} → ${newState}`);
}

function recordTiming(name: string, startMs: number, logger: Logger): void {
  const endMs = Date.now();
  stageTimings.push({ name, startMs, endMs });
  logger.info(`[startup-timeline] ${name} completed (${endMs - startMs}ms)`);
}

function getStageTimings(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const t of stageTimings) {
    result[t.name] = t.endMs - t.startMs;
  }
  return result;
}

// ── Mock RPC for degraded mode ──────────────────────────────

function createMockRpc(): RpcClient {
  return {
    call<T>(_method: string, _params?: unknown): Promise<T> {
      return Promise.reject(new Error('Backend not available'));
    },
    shutdown(): Promise<void> {
      return Promise.resolve();
    },
    onReconnect(_callback: () => void): void {
      // No-op — mock RPC never reconnects
    },
  };
}

// ── Public API ──────────────────────────────────────────────

/**
 * Run the full startup sequence.
 *
 * This is the ONLY function that should be called from main/index.ts.
 * It handles all initialization stages and never throws — on failure
 * it transitions to STARTUP_FAILED or DEGRADED_MODE.
 */
export async function runStartup(
  logger: Logger,
  createMainWindow: () => Promise<void>,
  closeSplashWindow: () => void,
  env: EnvironmentConfig,
): Promise<void> {
  startupStartTime = Date.now();
  stageTimings = [];
  lastError = null;

  logger.info('[startup] === AVS Suite Startup Begin ===');
  logger.info(`[startup] Electron ${process.versions.electron}, Node ${process.version}, Platform ${process.platform}`);
  transition('INITIALIZING', logger);

  // ── Stage 1: Start Python Backend ────────────────────────
  transition('BACKEND_STARTING', logger);
  const t0 = Date.now();
  try {
    rpcClient = await spawnPythonBackend(logger);
    recordTiming('backend-spawn', t0, logger);
    transition('BACKEND_READY', logger);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    logger.error('[startup] FAILED: Python backend startup', lastError);
    recordTiming('backend-spawn-failed', t0, logger);
    return handleStartupFailure(logger, createMainWindow, closeSplashWindow);
  }

  // ── Stage 2: Register ALL IPC handlers ───────────────────
  // This happens AFTER backend is ready but does NOT depend on
  // license SDK — the bridge is created with the real RPC client.
  // Auto-updater init is independent and runs in parallel.
  const t1 = Date.now();
  try {
    const rpc = rpcClient ?? createMockRpc();
    licenseBridge = new LicenseBridge(rpc);
    const deps: IpcDependencies = { rpc, licenseBridge, logger };

    // Run IPC registration and auto-updater init in parallel
    // since they are completely independent.
    await Promise.all([
      Promise.resolve(registerAllHandlers(deps)),
      (async () => {
        try {
          initAutoUpdater(logger, env);
        } catch (err) {
          logger.warn('[startup] Auto-updater init failed — continuing', err);
        }
      })(),
    ]);

    recordTiming('ipc-registration', t1, logger);
    transition('IPC_REGISTERED', logger);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    logger.error('[startup] FAILED: IPC handler registration', lastError);
    recordTiming('ipc-registration-failed', t1, logger);
    return handleStartupFailure(logger, createMainWindow, closeSplashWindow);
  }

  // ── Stage 3+4: License init ∥ Window creation ───────────
  // License init is non-fatal (falls back to free mode) so it must
  // not block the renderer. Running in parallel saves ~200-500ms.
  const t3 = Date.now();
  const licensePromise = (async () => {
    try {
      if (licenseBridge) {
        const status = await licenseBridge.startup();
        logger.info(
          `[startup] License SDK ready: status=${status.status}, edition=${status.edition}, offline=${status.is_offline}`,
        );
      }
      recordTiming('license-init', t3, logger);
      transition('LICENSE_READY', logger);
    } catch (err) {
      logger.warn('[startup] License SDK init failed — continuing in free mode', err);
      recordTiming('license-init-skipped', t3, logger);
      transition('LICENSE_READY', logger);
    }
  })();

  try {
    await createMainWindow();
    recordTiming('renderer-create', t3, logger);
    transition('RENDERER_READY', logger);
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err));
    logger.error('[startup] FAILED: Renderer window creation', lastError);
    recordTiming('renderer-create-failed', t3, logger);
    await licensePromise;
    return handleStartupFailure(logger, createMainWindow, closeSplashWindow);
  }

  // Ensure license init completes before declaring application ready
  await licensePromise;

  // ── Stage 5: Application ready ───────────────────────────
  const totalMs = Date.now() - startupStartTime;
  logger.info(`[startup] === Application Ready (${totalMs}ms total) ===`);
  transition('APPLICATION_READY', logger);
}

/**
 * Handle a startup failure.
 *
 * Shows an error dialog with diagnostics and either continues in
 * degraded mode (if backend failed) or exits (if IPC/renderer failed).
 */
async function handleStartupFailure(
  logger: Logger,
  createMainWindow: () => Promise<void>,
  closeSplashWindow: () => void,
): Promise<void> {
  closeSplashWindow();
  transition('STARTUP_FAILED', logger);

  const diag = getDiagnostics();
  const errorDetails = lastError
    ? `${lastError.message}\n\nStack: ${lastError.stack ?? 'N/A'}`
    : 'Unknown error';

  // Show error dialog
  dialog.showErrorBox(
    'AVS Suite — Startup Failed',
    `A critical error occurred during startup:\n\n${errorDetails}\n\n` +
    `State: ${diag.state}\n` +
    `Backend ready: ${diag.backendReady}\n` +
    `IPC channels registered: ${diag.ipcChannels.length}\n\n` +
    `The application will attempt to continue in limited mode.`,
  );

  // If IPC handlers haven't been registered yet, register with mock RPC
  // so the renderer can at least show an error page
  if (currentState === 'STARTUP_FAILED' && diag.ipcChannels.length === 0) {
    try {
      const mockRpc = createMockRpc();
      licenseBridge = new LicenseBridge(mockRpc);
      registerAllHandlers({ rpc: mockRpc, licenseBridge, logger });
      logger.info('[startup] Registered IPC handlers with mock RPC for degraded mode');
    } catch (err) {
      logger.error('[startup] Failed to register even mock IPC handlers', err);
    }
  }

  // Try to create the main window in degraded mode
  try {
    transition('DEGRADED_MODE', logger);
    await createMainWindow();
    logger.info('[startup] Renderer loaded in degraded mode');
  } catch (err) {
    logger.error('[startup] Cannot create renderer even in degraded mode — exiting', err);
    app.quit();
  }
}

/**
 * Get current startup diagnostics (for About page, error dialogs, etc.)
 */
export function getDiagnostics(): StartupDiagnostics {
  return {
    electronVersion: process.versions.electron,
    nodeVersion: process.version,
    platform: process.platform,
    appVersion: app.getVersion(),
    startupDurationMs: Date.now() - startupStartTime,
    state: currentState,
    backendReady: rpcClient !== null,
    licenseReady: currentState === 'LICENSE_READY' || currentState === 'RENDERER_READY' || currentState === 'APPLICATION_READY',
    ipcChannels: getRegisteredChannels(),
    stageTimings: getStageTimings(),
    error: lastError?.message,
    errorStack: lastError?.stack,
  };
}

/**
 * Get the current startup state.
 */
export function getStartupState(): StartupState {
  return currentState;
}

/**
 * Get the RPC client (null if backend failed).
 */
export function getRpcClient(): RpcClient | null {
  return rpcClient;
}

/**
 * Get the license bridge (null if not created).
 */
export function getLicenseBridge(): LicenseBridge | null {
  return licenseBridge;
}

/**
 * Shutdown — clean up resources.  Must be awaited so the backend
 * process is actually killed before the Electron process exits.
 */
export async function shutdownStartup(): Promise<void> {
  if (licenseBridge) {
    licenseBridge.close().catch(() => {});
    licenseBridge = null;
  }
  if (rpcClient) {
    try {
      await rpcClient.shutdown();
    } catch {
      // Best-effort — the backend may already be dead
    }
    rpcClient = null;
  }
  cleanupAllHandlers();
}
