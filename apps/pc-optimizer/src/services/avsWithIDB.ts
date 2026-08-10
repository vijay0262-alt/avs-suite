const DB_NAME = 'avs-shield-db';
const DB_VERSION = 1;

export type AvsStoreName =
  | 'scanHistory' | 'verificationLogs' | 'deferredCleanup'
  | 'executionHistory' | 'healthTimeline'
  | 'scanState' | 'dashboardSession' | 'executionState';

interface StoreConfig { keyPath: string; maxRecords: number; maxAgeMs: number; }

const CFGS: Record<AvsStoreName, StoreConfig> = {
  scanHistory:      { keyPath: 'id',  maxRecords: 200, maxAgeMs: 90 * 864e5 },
  verificationLogs: { keyPath: 'id',  maxRecords: 500, maxAgeMs: 30 * 864e5 },
  deferredCleanup:  { keyPath: 'id',  maxRecords: 500, maxAgeMs:  7 * 864e5 },
  executionHistory: { keyPath: 'id',  maxRecords: 500, maxAgeMs: 90 * 864e5 },
  healthTimeline:   { keyPath: 'id',  maxRecords: 500, maxAgeMs: 90 * 864e5 },
  scanState:        { keyPath: 'key', maxRecords: 1,   maxAgeMs: 24 * 36e5 },
  dashboardSession: { keyPath: 'key', maxRecords: 1,   maxAgeMs: 24 * 36e5 },
  executionState:   { keyPath: 'key', maxRecords: 1,   maxAgeMs: 24 * 36e5 },
};

let _db: IDBDatabase | null = null;
let _p: Promise<IDBDatabase | null> | null = null;

function ok(): boolean { return typeof window !== 'undefined' && !!window.indexedDB; }

function openDB(): Promise<IDBDatabase | null> {
  if (_db) return Promise.resolve(_db);
  if (_p) return _p;
  if (!ok()) return Promise.resolve(null);
  _p = new Promise((resolve) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      (Object.keys(CFGS) as AvsStoreName[]).forEach((n) => {
        if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: CFGS[n].keyPath });
      });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => { _p = null; resolve(null); };
    req.onblocked = () => { _p = null; resolve(null); };
  });
  return _p;
}

function pr<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

export async function idbGetAll<T>(store: AvsStoreName): Promise<T[]> {
  const db = await openDB();
  if (!db) return [];
  try { return await pr(tx(db, store, 'readonly').getAll() as IDBRequest<T[]>); }
  catch { return []; }
}

export async function idbAdd<T>(store: AvsStoreName, value: T): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try { await pr(tx(db, store, 'readwrite').add(value)); } catch { /* key may already exist */ }
}

export async function idbPut<T>(store: AvsStoreName, value: T): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try { await pr(tx(db, store, 'readwrite').put(value)); } catch { /* write failure — non-fatal */ }
}

export async function idbDelete(store: AvsStoreName, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try { await pr(tx(db, store, 'readwrite').delete(key)); } catch { /* delete failure — non-fatal */ }
}

export async function idbClear(store: AvsStoreName): Promise<void> {
  const db = await openDB();
  if (!db) return;
  try { await pr(tx(db, store, 'readwrite').clear()); } catch { /* clear failure — non-fatal */ }
}

export async function idbGetOne<T>(store: AvsStoreName, key: IDBValidKey): Promise<T | null> {
  const db = await openDB();
  if (!db) return null;
  try { return (await pr(tx(db, store, 'readonly').get(key) as IDBRequest<T>)) ?? null; }
  catch { return null; }
}

function tx(db: IDBDatabase, store: AvsStoreName, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

export async function idbCleanup(store: AvsStoreName): Promise<void> {
  const db = await openDB();
  if (!db) return;
  const cfg = CFGS[store];
  try {
    const all = await idbGetAll<{ timestamp?: number; savedAt?: number; startedAt?: number } & Record<string, unknown>>(store);
    if (all.length <= cfg.maxRecords) {
      const now = Date.now();
      const fresh = all.filter((r) => {
        const ts = (r.timestamp ?? r.savedAt ?? r.startedAt ?? 0) as number;
        return ts && (now - ts) < cfg.maxAgeMs;
      });
      if (fresh.length < all.length) {
        await idbClear(store);
        for (const r of fresh) await idbPut(store, r);
      }
      return;
    }
    const sorted = all.sort((a, b) => {
      const ta = (a.timestamp ?? a.savedAt ?? a.startedAt ?? 0) as number;
      const tb = (b.timestamp ?? b.savedAt ?? b.startedAt ?? 0) as number;
      return tb - ta;
    });
    const kept = sorted.slice(0, cfg.maxRecords);
    await idbClear(store);
    for (const r of kept) await idbPut(store, r);
  } catch { /* cleanup failure — non-fatal */ }
}

export async function idbRecover(): Promise<boolean> {
  if (!ok()) return false;
  try {
    _db?.close();
    _db = null;
    _p = null;
    await new Promise<void>((resolve) => {
      const req = window.indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    await openDB();
    return true;
  } catch { return false; }
}

export async function idbCleanupAll(): Promise<void> {
  const stores = Object.keys(CFGS) as AvsStoreName[];
  await Promise.all(stores.map((s) => idbCleanup(s)));
}

export async function idbCount(store: AvsStoreName): Promise<number> {
  const db = await openDB();
  if (!db) return 0;
  try { return await pr(tx(db, store, 'readonly').count()); }
  catch { return 0; }
}

const LS_KEY_MAP: Record<string, AvsStoreName> = {
  'avs-scan-history': 'scanHistory',
  'avs-verification-logs': 'verificationLogs',
  'avs-deferred-cleanup-queue': 'deferredCleanup',
  'avs_execution_history': 'executionHistory',
  'avs_health_timeline': 'healthTimeline',
  'avs:scan:state': 'scanState',
  'avs:dashboard:session': 'dashboardSession',
  'avs_execution_state': 'executionState',
};

export async function idbMigrateFromLocalStorage(): Promise<{ migrated: string[]; errors: string[] }> {
  const migrated: string[] = [];
  const errors: string[] = [];
  for (const [lsKey, store] of Object.entries(LS_KEY_MAP)) {
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (store === 'scanState' || store === 'dashboardSession' || store === 'executionState') {
        if (parsed && typeof parsed === 'object') {
          parsed.key = 'current';
          await idbPut(store, parsed);
        }
      } else if (Array.isArray(parsed)) {
        for (const item of parsed) await idbPut(store, item);
      }
      localStorage.removeItem(lsKey);
      migrated.push(lsKey);
    } catch (e) {
      errors.push(lsKey);
    }
  }
  await idbCleanupAll();
  return { migrated, errors };
}
