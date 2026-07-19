import log from 'electron-log';
import path from 'node:path';
import { app } from 'electron';

export type LogLevel = 'silly' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured, rotating logger built on electron-log.
 * File rotation: 5 MiB per file, up to 5 archives.
 * Location: <userData>/logs/
 * - main.log: Main process log
 * - renderer.log: Renderer process log
 * - avs-<scope>.log: Scope-specific logs (backend, etc.)
 */
export function createLogger(scope: string, level: LogLevel = 'info') {
  const logger = log.create({ logId: scope });
  logger.transports.file.level = level;
  logger.transports.console.level = level;
  logger.transports.file.maxSize = 5 * 1024 * 1024;
  logger.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', `avs-${scope}.log`);
  logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  return logger;
}

/**
 * Create a renderer-specific logger that writes to renderer.log
 */
export function createRendererLogger(level: LogLevel = 'info') {
  const logger = log.create({ logId: 'renderer' });
  logger.transports.file.level = level;
  logger.transports.console.level = level;
  logger.transports.file.maxSize = 5 * 1024 * 1024;
  logger.transports.file.resolvePathFn = () =>
    path.join(app.getPath('userData'), 'logs', 'renderer.log');
  logger.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  return logger;
}
