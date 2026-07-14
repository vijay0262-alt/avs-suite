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
  call<T>(method: string, params?: unknown): Promise<T>;
  shutdown(): Promise<void>;
}

interface Logger {
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

function resolveBackendCommand(): { command: string; args: string[] } {
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? 'avs-backend.exe' : 'avs-backend';
    return { command: path.join(process.resourcesPath, 'backend', exe), args: [] };
  }
  const script = path.resolve(__dirname, '../../../../backend/src/avs_backend/api/rpc_server.py');
  return { command: process.env.AVS_PYTHON ?? 'python', args: ['-u', script] };
}

export async function spawnPythonBackend(logger: Logger): Promise<RpcClient> {
  const { command, args } = resolveBackendCommand();
  logger.info(`Spawning Python backend: ${command} ${args.join(' ')}`);

  const child: ChildProcessWithoutNullStreams = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
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
    call<T>(method: string, params?: unknown): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        const req: JsonRpcRequest = { jsonrpc: '2.0', id, method: method as never, params };
        child.stdin.write(JSON.stringify(req) + '\n');
      });
    },
    async shutdown(): Promise<void> {
      child.kill();
    },
  };

  // Health-check the backend before returning.
  try {
    await client.call('system.ping');
    logger.info('Python backend ready.');
  } catch (e) {
    logger.error('Python backend failed initial ping', e);
  }

  return client;
}
