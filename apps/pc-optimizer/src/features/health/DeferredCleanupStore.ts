/**
 * DeferredCleanupStore — persistent store for deferred cleanup items.
 *
 * Items that could not be cleaned during the main optimization pass
 * (locked files, browser running, permission errors) are stored here.
 * The BackgroundCleanupService retries them automatically when the
 * blocking application closes.
 *
 * Persists to localStorage so items survive app restarts.
 */

import { create } from 'zustand';
import { idbGetAll, idbPut, idbDelete, idbClear } from '../../services/avsWithIDB';

export interface DeferredCleanupItem {
  id: string;
  moduleId: string;
  moduleName: string;
  path: string;
  reason: string;
  size: number;
  timestamp: number;
  blockingProcess?: string;
}

const MAX_ITEMS = 500;
const STALE_ITEM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function loadFromIDB(): Promise<DeferredCleanupItem[]> {
  const all = await idbGetAll<DeferredCleanupItem>('deferredCleanup');
  const now = Date.now();
  const fresh = all.filter((i) => i.timestamp && (now - i.timestamp) < STALE_ITEM_TTL_MS);
  return fresh.slice(0, MAX_ITEMS);
}

interface DeferredCleanupState {
  items: DeferredCleanupItem[];
  addItem: (item: DeferredCleanupItem) => void;
  addItems: (items: DeferredCleanupItem[]) => void;
  removeItem: (id: string) => void;
  removeItems: (ids: string[]) => void;
  getItemsForProcess: (processName: string) => DeferredCleanupItem[];
  getItemsForModule: (moduleId: string) => DeferredCleanupItem[];
  clearAll: () => void;
  clearCompleted: () => void;
  /** Replace all items (used on load). */
  setItems: (items: DeferredCleanupItem[]) => void;
}

export const useDeferredCleanupStore = create<DeferredCleanupState>((set, get) => ({
  items: [],

  addItem: (item) => {
    const items = [item, ...get().items.filter((i) => i.id !== item.id)].slice(0, MAX_ITEMS);
    idbPut('deferredCleanup', item);
    set({ items });
  },

  addItems: (newItems) => {
    const existingIds = new Set(get().items.map((i) => i.id));
    const filtered = newItems.filter((i) => !existingIds.has(i.id));
    const items = [...filtered, ...get().items].slice(0, MAX_ITEMS);
    filtered.forEach((i) => idbPut('deferredCleanup', i));
    set({ items });
  },

  removeItem: (id) => {
    const items = get().items.filter((i) => i.id !== id);
    idbDelete('deferredCleanup', id);
    set({ items });
  },

  removeItems: (ids) => {
    const idSet = new Set(ids);
    const items = get().items.filter((i) => !idSet.has(i.id));
    ids.forEach((id) => idbDelete('deferredCleanup', id));
    set({ items });
  },

  getItemsForProcess: (processName) => {
    const lower = processName.toLowerCase();
    return get().items.filter((i) =>
      i.blockingProcess?.toLowerCase().includes(lower) ||
      i.reason.toLowerCase().includes(lower),
    );
  },

  getItemsForModule: (moduleId) => {
    return get().items.filter((i) => i.moduleId === moduleId);
  },

  clearAll: () => {
    idbClear('deferredCleanup');
    set({ items: [] });
  },

  clearCompleted: () => {
    // Items are removed when completed, so this is a no-op
    // but kept for API completeness
  },

  setItems: (items) => {
    const trimmed = items.slice(0, MAX_ITEMS);
    idbClear('deferredCleanup');
    trimmed.forEach((i) => idbPut('deferredCleanup', i));
    set({ items: trimmed });
  },
}));

export async function initDeferredCleanupStore(): Promise<void> {
  const items = await loadFromIDB();
  useDeferredCleanupStore.setState({ items });
}
