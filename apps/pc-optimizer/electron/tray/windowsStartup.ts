/**
 * Windows startup — register/unregister AVS Shield to launch
 * automatically when Windows starts.
 *
 * Uses the Windows Registry Run key (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
 * which is the standard approach for per-user startup entries.
 *
 * On non-Windows platforms this is a no-op.
 */
import { app } from 'electron';
import { exec, execSync } from 'child_process';
import type { Logger } from '../ipc/registerAllHandlers';

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APP_NAME = 'AVSShield';

/**
 * Check if the app is currently registered to start with Windows.
 */
export function isStartupEnabled(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const result = execSync(
      `reg query "${RUN_KEY}" /v "${APP_NAME}"`,
      { encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return result.includes(APP_NAME);
  } catch {
    return false;
  }
}

/**
 * Enable startup with Windows.
 */
export function enableStartup(logger: Logger): boolean {
  if (process.platform !== 'win32') return false;
  const exePath = app.getPath('exe');
  const escapedPath = exePath.replace(/'/g, "''");
  const command = `"${escapedPath}" --minimized`;

  try {
    exec(
      `reg add "${RUN_KEY}" /v "${APP_NAME}" /t REG_SZ /d "${command}" /f`,
      { timeout: 5000 },
      (err) => {
        if (err) {
          logger.error('[startup-reg] Failed to enable startup', err);
        } else {
          logger.info('[startup-reg] Startup enabled');
        }
      },
    );
    return true;
  } catch (err) {
    logger.error('[startup-reg] Failed to enable startup', err);
    return false;
  }
}

/**
 * Disable startup with Windows.
 */
export function disableStartup(logger: Logger): boolean {
  if (process.platform !== 'win32') return false;
  try {
    exec(
      `reg delete "${RUN_KEY}" /v "${APP_NAME}" /f`,
      { timeout: 5000 },
      (err) => {
        if (err) {
          // If the key doesn't exist, reg delete returns error — that's fine
          logger.info('[startup-reg] Startup key not found or already removed');
        } else {
          logger.info('[startup-reg] Startup disabled');
        }
      },
    );
    return true;
  } catch (err) {
    logger.error('[startup-reg] Failed to disable startup', err);
    return false;
  }
}
