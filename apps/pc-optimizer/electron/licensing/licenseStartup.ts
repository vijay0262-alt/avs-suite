/**
 * License Startup — orchestrates the SDK startup sequence during
 * application boot. Called from main/index.ts after the Python
 * backend is ready.
 *
 * Sequence:
 * 1. Initialize SDK (via Python RPC license.startup)
 * 2. Load encrypted local license
 * 3. Validate license (online or offline grace)
 * 4. Start automatic refresh
 * 5. Start automatic update check
 * 6. Notify renderer of license state
 */
import { BrowserWindow } from 'electron';
import { initLicenseBridge, shutdownLicenseBridge } from './licenseIpc';
import type { RpcClient } from '../ipc/pythonBridge';

interface Logger {
  info(m: string, meta?: unknown): void;
  warn(m: string, meta?: unknown): void;
  error(m: string, meta?: unknown): void;
}

export async function initLicensing(
  rpc: RpcClient,
  logger: Logger,
): Promise<void> {
  const t0 = Date.now();
  logger.info('[startup] Initializing licensing subsystem...');

  // Register IPC handlers exactly once. This must happen before any
  // bridge calls so the renderer can communicate even if startup fails.
  const bridge = initLicenseBridge(rpc, logger);
  logger.info(`[startup] License bridge initialized (${Date.now() - t0}ms)`);

  try {
    // Perform startup sequence (load local license, validate or check grace)
    const t1 = Date.now();
    const status = await bridge.startup();
    logger.info(
      `[startup] License startup complete (${Date.now() - t1}ms): status=${status.status}, edition=${status.edition}, offline=${status.is_offline}`,
    );

    // Start automatic update check (default: every 24 hours)
    const updateChannel = process.env.UPDATE_CHANNEL ?? 'stable';
    const updateIntervalHours = parseInt(
      process.env.UPDATE_CHECK_INTERVAL_HOURS ?? '24',
      10,
    );

    try {
      // Check for updates immediately on startup
      const t2 = Date.now();
      const updateInfo = await bridge.checkUpdates(updateChannel);
      logger.info(`[startup] Update check complete (${Date.now() - t2}ms)`);
      if (updateInfo?.update_available) {
        logger.info(
          `[startup] Update available: ${updateInfo.latest_version} (force=${updateInfo.force_upgrade}, critical=${updateInfo.critical})`,
        );
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('avs:license:event', {
            type: 'update-available',
            payload: updateInfo,
          });
        }
      }
    } catch (err) {
      logger.warn('[startup] Initial update check failed', err);
    }

    // Start periodic update checks
    if (updateIntervalHours > 0) {
      const intervalMs = updateIntervalHours * 60 * 60 * 1000;
      setInterval(async () => {
        try {
          const result = await bridge.checkUpdates(updateChannel);
          if (result?.update_available) {
            logger.info(`[auto-update] ${result.latest_version} available`);
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send('avs:license:event', {
                type: 'update-available',
                payload: result,
              });
            }
          }
        } catch (err) {
          logger.warn('[auto-update] Check failed', err);
        }
      }, intervalMs);
      logger.info(`[startup] Auto update check scheduled (every ${updateIntervalHours}h)`);
    }

    logger.info(`[startup] Licensing subsystem fully initialized (${Date.now() - t0}ms total)`);
  } catch (err) {
    // The bridge is already initialized with IPC handlers.
    // Do NOT call initLicenseBridge again — that would re-register handlers
    // and cause "Attempted to register second handler" errors.
    logger.error('[startup] License startup sequence failed — continuing in free mode', err);
  }
}

export { shutdownLicenseBridge };
