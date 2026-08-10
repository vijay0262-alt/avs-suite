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

export interface DeferredCleanupItem {
  id: string;
  moduleId: string;
  moduleName: string;
  path: string;
  reason: string;
  size: number;
  timestamp: number;
  /** Which application was blocking the cleanup (e.g. 'chrome', 'msedge'). */
  blockingProcess?: string;
}

const STORAGE_KEY = 'avs-deferred-cleanup-queue';
const MAX_ITEMS = 500;
const STALE_ITEM_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function loadFromStorage(): DeferredCleanupItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const fresh = parsed.filter((i: DeferredCleanupItem) =>
      i.timestamp && (now - i.timestamp) < STALE_ITEM_TTL_MS,
    );
    // If stale items were removed, persist the cleaned list
    if (fresh.length !== parsed.length) {
      saveToStorage(fresh);
    }
    return fresh.slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

function saveToStorage(items: DeferredCleanupItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
  } catch {
    // Storage full or unavailable — non-fatal
  }
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
  items: loadFromStorage(),

  addItem: (item) => {
    const items = [item, ...get().items.filter((i) => i.id !== item.id)].slice(0, MAX_ITEMS);
    saveToStorage(items);
    set({ items });
  },

  addItems: (newItems) => {
    const existingIds = new Set(get().items.map((i) => i.id));
    const filtered = newItems.filter((i) => !existingIds.has(i.id));
    const items = [...filtered, ...get().items].slice(0, MAX_ITEMS);
    saveToStorage(items);
    set({ items });
  },

  removeItem: (id) => {
    const items = get().items.filter((i) => i.id !== id);
    saveToStorage(items);
    set({ items });
  },

  removeItems: (ids) => {
    const idSet = new Set(ids);
    const items = get().items.filter((i) => !idSet.has(i.id));
    saveToStorage(items);
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
    saveToStorage([]);
    set({ items: [] });
  },

  clearCompleted: () => {
    // Items are removed when completed, so this is a no-op
    // but kept for API completeness
  },

  setItems: (items) => {
    const trimmed = items.slice(0, MAX_ITEMS);
    saveToStorage(trimmed);
    set({ items: trimmed });
  },
}));
