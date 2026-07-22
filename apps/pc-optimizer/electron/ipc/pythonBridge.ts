/**
 * pythonBridge — spawns the Python backend as a child process and speaks
 * JSON-RPC 2.0 over line-delimited stdio.
 *
 * The bundled backend location is:
 *   - dev:   backend/src/avs_backend/api/rpc_server.py (invoked via python)
 *   - prod:  <resources>/backend/avs-backend(.exe) — a PyInstaller bundle
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
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
}

interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

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

  const pending = new Map<string | number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let buffer = '';

  child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
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
    for (const cb of pending.values()) cb.reject(new Error('Backend process exited'));
    pending.clear();
  });

  const client: RpcClient = {
    call<T>(method: string, params?: unknown, customTimeoutMs?: number): Promise<T> {
      const doCall = (attempt: number): Promise<T> => new Promise<T>((resolve, reject) => {
        const id = nextId++;
        // Give optimize/clean/analyze operations more time since they do real work
        const isLongOperation = method.includes('optimize') || method.includes('clean') || method.includes('execute') || method.includes('analyze') || method.includes('scan') || method.includes('dashboard.') || method.includes('metrics');
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
        });
        const req: JsonRpcRequest = { jsonrpc: '2.0', id, method: method as never, params };
        child.stdin.write(JSON.stringify(req) + '\n');
      });
      return doCall(0);
    },
    async shutdown(): Promise<void> {
      child.kill();
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
