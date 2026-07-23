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
  logger.info('Initializing licensing subsystem...');

  try {
    const bridge = initLicenseBridge(rpc, logger);

    // Perform startup sequence (load local license, validate or check grace)
    const status = await bridge.startup();
    logger.info(
      `License startup complete: status=${status.status}, edition=${status.edition}, offline=${status.is_offline}`,
    );

    // Start automatic update check (default: every 24 hours)
    const updateChannel = process.env.UPDATE_CHANNEL ?? 'stable';
    const updateIntervalHours = parseInt(
      process.env.UPDATE_CHECK_INTERVAL_HOURS ?? '24',
      10,
    );

    try {
      // Check for updates immediately on startup
      const updateInfo = await bridge.checkUpdates(updateChannel);
      if (updateInfo?.update_available) {
        logger.info(
          `Update available: ${updateInfo.latest_version} (force=${updateInfo.force_upgrade}, critical=${updateInfo.critical})`,
        );
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('avs:license:event', {
            type: 'update-available',
            payload: updateInfo,
          });
        }
      }
    } catch (err) {
      logger.warn('Initial update check failed', err);
    }

    // Start periodic update checks
    if (updateIntervalHours > 0) {
      const intervalMs = updateIntervalHours * 60 * 60 * 1000;
      setInterval(async () => {
        try {
          const result = await bridge.checkUpdates(updateChannel);
          if (result?.update_available) {
            logger.info(`Auto update check: ${result.latest_version} available`);
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send('avs:license:event', {
                type: 'update-available',
                payload: result,
              });
            }
          }
        } catch (err) {
          logger.warn('Auto update check failed', err);
        }
      }, intervalMs);
      logger.info(`Auto update check started (every ${updateIntervalHours}h)`);
    }
  } catch (err) {
    logger.error('Licensing initialization failed — continuing in free mode', err);
    // Still initialize the bridge so the renderer can attempt activation later
    initLicenseBridge(rpc, logger);
  }
}

export { shutdownLicenseBridge };
