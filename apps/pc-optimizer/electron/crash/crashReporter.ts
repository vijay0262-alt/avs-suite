/**
 * Global crash & unhandled-rejection handler.
 *
 * Persists a JSON crash record under <userData>/crashes/ and (in the
 * future) forwards it to the update-server for aggregation. Never throws.
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

interface Logger {
  error(message: string, meta?: unknown): void;
}

export function installCrashHandler(logger: Logger): void {
  const crashDir = path.join(app.getPath('userData'), 'crashes');

  const write = (kind: string, payload: unknown) => {
    try {
      fs.mkdirSync(crashDir, { recursive: true });
      const file = path.join(crashDir, `crash-${Date.now()}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify(
          {
            kind,
            capturedAt: new Date().toISOString(),
            app: app.getName(),
            version: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            payload,
          },
          null,
          2,
        ),
      );
    } catch {
      /* never let the crash handler crash */
    }
  };

  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', { message: err.message, stack: err.stack });
    write('uncaughtException', { message: err.message, stack: err.stack });
  });

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    logger.error('unhandledRejection', { message, stack });
    write('unhandledRejection', { message, stack });
  });
}
