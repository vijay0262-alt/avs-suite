/**
 * pythonBridge — spawns the Python backend as a child process and speaks
 * JSON-RPC 2.0 over line-delimited stdio.
 *
 * The bundled backend location is:
 *   - dev:   backend/src/avs_backend/api/rpc_server.py (invoked via python)
 *   - prod:  <resources>/backend/avs-backend(.exe) — a PyInstaller bundle
 */
import { spawn, execSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { app } from 'electron';

// Local RPC types (copied from shared package to avoid ES module import)
export const JSON_RPC_VERSION = '2.0' as const;

export interface JsonRpcRequest<TParams = unknown> {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: string | number;
  method: string;
  params?: TParams;
}

export interface JsonRpcSuccess<TResult = unknown> {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: string | number;
  result: TResult;
}

export interface JsonRpcErrorPayload {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcError {
  jsonrpc: typeof JSON_RPC_VERSION;
  id: string | number | null;
  error: JsonRpcErrorPayload;
}

export type JsonRpcResponse<T = unknown> = JsonRpcSuccess<T> | JsonRpcError;

export interface RpcClient {
  call<T>(method: string, params?: unknown, customTimeoutMs?: number): Promise<T>;
  shutdown(): Promise<void>;
  onReconnect(callback: () => void): void;
}

interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

type ReconnectCallback = () => void;

function resolveBackendCommand(): { command: string; args: string[]; cwd?: string; pythonPath?: string } {
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? 'avs-backend.exe' : 'avs-backend';
    const command = path.join(process.resourcesPath, 'backend', exe);
    // Set cwd to the backend directory to ensure the executable can find its dependencies
    const cwd = path.join(process.resourcesPath, 'backend');
    return { command, args: [], cwd };
  }
  const backendSrc = path.resolve(__dirname, '../../../../backend/src');
  const script = path.join(backendSrc, 'avs_backend', 'api', 'rpc_server.py');
  const cwd = path.resolve(__dirname, '../../../..');
  return { command: process.env.AVS_PYTHON ?? 'python', args: ['-u', script], cwd, pythonPath: backendSrc };
}

export async function spawnPythonBackend(logger: Logger): Promise<RpcClient> {
  const { command, args, cwd, pythonPath } = resolveBackendCommand();
  logger.info(`Spawning Python backend: ${command} ${args.join(' ')}`);

  const child: ChildProcessWithoutNullStreams = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1', ...(pythonPath ? { PYTHONPATH: pythonPath } : {}) },
    cwd,
  });

  const pending = new Map<string | number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer?: ReturnType<typeof setTimeout> }>();
  let nextId = 1;
  let buffer = '';
  let disposed = false;
  let restarting = false;
  let restartAttempts = 0;
  const MAX_RESTART_ATTEMPTS = 5;
  const RESTART_DELAY_MS = 3000;
  const reconnectCallbacks: ReconnectCallback[] = [];
  let activeChild = child;

  // Cap buffer size to prevent memory growth from malformed backend output.
  // Must be large enough for the biggest JSON-RPC response (scan results
  // with thousands of findings can exceed 10 MB).
  const MAX_BUFFER_SIZE = 64 * 1024 * 1024; // 64 MB

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    // Prevent unbounded buffer growth from malformed output
    if (buffer.length > MAX_BUFFER_SIZE) {
      logger.warn('Python backend stdout buffer overflow — truncating');
      buffer = buffer.slice(-MAX_BUFFER_SIZE);
    }
    let idx: number;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        const cb = pending.get(msg.id as string | number);
        if (!cb) continue;
        pending.delete(msg.id as string | number);
        if (cb.timer) clearTimeout(cb.timer);
        if ('error' in msg) cb.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else cb.resolve(msg.result);
      } catch (e) {
        logger.warn('Malformed line from Python backend', { line });
      }
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    logger.warn(`[py] ${chunk.toString('utf8').trimEnd()}`);
  });

  child.on('exit', (code, signal) => {
    logger.error(`Python backend exited (code=${code}, signal=${signal})`);
    for (const cb of pending.values()) {
      if (cb.timer) clearTimeout(cb.timer);
      cb.reject(new Error('Backend process exited'));
    }
    pending.clear();
    buffer = '';
    if (!disposed) attemptRestart();
  });

  function attachChild(c: ChildProcessWithoutNullStreams) {
    c.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > MAX_BUFFER_SIZE) {
        logger.warn('Python backend stdout buffer overflow — truncating');
        buffer = buffer.slice(-MAX_BUFFER_SIZE);
      }
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as JsonRpcResponse;
          const cb = pending.get(msg.id as string | number);
          if (!cb) continue;
          pending.delete(msg.id as string | number);
          if (cb.timer) clearTimeout(cb.timer);
          if ('error' in msg) cb.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
          else cb.resolve(msg.result);
        } catch {
          logger.warn('Malformed line from Python backend', { line });
        }
      }
    });
    c.stderr.on('data', (chunk: Buffer) => {
      logger.warn(`[py] ${chunk.toString('utf8').trimEnd()}`);
    });
    c.on('exit', (code, signal) => {
      logger.error(`Python backend exited (code=${code}, signal=${signal})`);
      for (const cb of pending.values()) {
        if (cb.timer) clearTimeout(cb.timer);
        cb.reject(new Error('Backend process exited'));
      }
      pending.clear();
      buffer = '';
      if (!disposed) attemptRestart();
    });
  }

  function attemptRestart() {
    if (restarting || disposed) return;
    if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
      logger.error(`[reconnect] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached — giving up`);
      return;
    }
    restarting = true;
    restartAttempts++;
    logger.info(`[reconnect] Attempting restart ${restartAttempts}/${MAX_RESTART_ATTEMPTS} in ${RESTART_DELAY_MS}ms...`);
    setTimeout(() => {
      if (disposed) { restarting = false; return; }
      try {
        const newChild = spawn(command, args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUNBUFFERED: '1', ...(pythonPath ? { PYTHONPATH: pythonPath } : {}) },
          cwd,
        });
        activeChild = newChild;
        attachChild(newChild);
        // Health-check the restarted backend
        const pingId = `ping-${Date.now()}`;
        const pingReq: JsonRpcRequest = { jsonrpc: '2.0', id: pingId, method: 'system.ping' as never };
        newChild.stdin.write(JSON.stringify(pingReq) + '\n');
        // Wait for ping response with timeout
        const pingTimer = setTimeout(() => {
          logger.warn('[reconnect] Restarted backend ping timed out — will retry on next exit');
        }, 60000);
        const pingHandler = (chunk: Buffer) => {
          if (chunk.toString('utf8').includes(pingId)) {
            clearTimeout(pingTimer);
            newChild.stdout.removeListener('data', pingHandler);
            restarting = false;
            restartAttempts = 0;
            logger.info('[reconnect] Python backend restarted successfully');
            for (const cb of reconnectCallbacks) {
              try { cb(); } catch { /* ignore */ }
            }
          }
        };
        newChild.stdout.on('data', pingHandler);
      } catch (err) {
        logger.error(`[reconnect] Restart attempt ${restartAttempts} failed`, err);
        restarting = false;
      }
    }, RESTART_DELAY_MS);
  }

  const client: RpcClient = {
    call<T>(method: string, params?: unknown, customTimeoutMs?: number): Promise<T> {
      if (disposed) return Promise.reject(new Error('Backend process is not running'));
      if (restarting) return Promise.reject(new Error('Backend is restarting'));
      const doCall = (attempt: number): Promise<T> => new Promise<T>((resolve, reject) => {
        const id = nextId++;
        // Give optimize/clean/analyze operations more time since they do real work
        const isLongOperation = method.includes('optimize') || method.includes('clean') || method.includes('execute') || method.includes('analyze') || method.includes('scan') || method.includes('dashboard.') || method.includes('metrics') || method.includes('orchestrator.');
        const timeoutMs = customTimeoutMs ?? (isLongOperation ? 120000 : 30000);
        const timeout = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`RPC timeout: ${method} (${timeoutMs / 1000}s)`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (v: unknown) => { clearTimeout(timeout); resolve(v as T); },
          reject: (e: Error) => {
            clearTimeout(timeout);
            // Retry on "Unknown method" or "Module failed to load" — the backend module may still be loading
            const isTransient = e.message.includes('Unknown method') || e.message.includes('failed to load');
            if (attempt < 3 && isTransient) {
              logger.warn(`RPC ${method} got transient error (attempt ${attempt + 1}/3): ${e.message}, retrying in 2s...`);
              setTimeout(() => doCall(attempt + 1).then(resolve, reject), 2000);
            } else {
              reject(e);
            }
          },
          timer: timeout,
        });
        if (disposed) {
          pending.delete(id);
          clearTimeout(timeout);
          reject(new Error('Backend process is not running'));
          return;
        }
        const req: JsonRpcRequest = { jsonrpc: '2.0', id, method: method as never, params };
        activeChild.stdin.write(JSON.stringify(req) + '\n');
      });
      return doCall(0);
    },
    async shutdown(): Promise<void> {
      if (disposed) return;
      disposed = true;
      // Graceful shutdown: try sending a shutdown command first
      try {
        const req: JsonRpcRequest = { jsonrpc: '2.0', id: nextId++, method: 'system.shutdown' as never };
        activeChild.stdin.write(JSON.stringify(req) + '\n');
        // Give the backend 2 seconds to shut down gracefully
        await new Promise((r) => setTimeout(r, 2000));
      } catch {
        // Best-effort — if write fails, just kill
      }
      // Clear all pending requests
      for (const cb of pending.values()) {
        if (cb.timer) clearTimeout(cb.timer);
        cb.reject(new Error('Backend shutting down'));
      }
      pending.clear();
      // Kill the backend process tree.  On Windows, child.kill() only
      // kills the immediate process — PyInstaller bundles spawn child
      // processes that survive.  Use taskkill /T /F to kill the entire
      // tree so no avs-backend.exe instances are left running.
      if (process.platform === 'win32' && activeChild.pid) {
        try {
          execSync(`taskkill /PID ${activeChild.pid} /T /F`, { stdio: 'ignore', timeout: 5000 });
        } catch {
          // Fall back to regular kill
          activeChild.kill();
        }
      } else {
        activeChild.kill();
      }
    },
    onReconnect(callback: () => void): void {
      reconnectCallbacks.push(callback);
    },
  };

  // Health-check the backend before returning.
  // The backend imports many modules at startup (dashboard, privacy, etc.)
  // which can take 30-60s on first run, so use a generous timeout.
  try {
    await client.call('system.ping', undefined, 120000);
    logger.info('Python backend ready.');
  } catch (e) {
    logger.error('Python backend failed initial ping', e);
  }

  return client;
}
