/**
 * Execution Store — Zustand store for reactive UI access to the execution engine.
 *
 * The engine runs independently of UI components.
 * Closing the dashboard does NOT stop the execution engine.
 * This store merely mirrors the engine's state for React components.
 */
import { create } from 'zustand';
import { executionEngine } from './executionEngine';
import { executionEvents } from './executionEvents';
import type {
  ExecutionResult,
  EngineState,
  EngineSnapshot,
  MaintenanceJob,
} from './types';

export interface ExecutionStoreState {
  state: EngineState;
  currentExecutionId: string | null;
  currentTaskId: string | null;
  lastResult: ExecutionResult | null;
  lastError: string | null;
  history: ExecutionResult[];

  init: () => void;
  shutdown: () => void;
  executeJob: (job: MaintenanceJob) => Promise<ExecutionResult | null>;
  quickScan: () => Promise<ExecutionResult | null>;
  browserCleanup: () => Promise<ExecutionResult | null>;
  deepClean: () => Promise<ExecutionResult | null>;
  runManual: (taskIds: string[], name?: string) => Promise<ExecutionResult | null>;
  clear: () => void;
  getSnapshot: () => EngineSnapshot;
}

// ── Engine state sync ─────────────────────────────────────────

function syncFromEngine(): Partial<ExecutionStoreState> {
  const snap = executionEngine.getSnapshot();
  return {
    state: snap.state,
    currentExecutionId: snap.currentExecutionId,
    currentTaskId: snap.currentTaskId,
    lastResult: snap.lastExecutionResult,
    lastError: snap.lastError,
  };
}

// ── Event subscriptions ───────────────────────────────────────

let _unsubExecutionCompleted: (() => void) | null = null;
let _unsubExecutionFailed: (() => void) | null = null;
let _unsubTaskStarted: (() => void) | null = null;
let _unsubTaskCompleted: (() => void) | null = null;

function subscribeToEvents(set: (partial: Partial<ExecutionStoreState>) => void, get: () => ExecutionStoreState): void {
  _unsubTaskStarted = executionEvents.on('task_started', (payload) => {
    const p = payload as { executionId: string; taskId: string; taskName: string };
    set({ currentTaskId: p.taskId, state: 'running' });
  });

  _unsubTaskCompleted = executionEvents.on('task_completed', () => {
    set(syncFromEngine());
  });

  _unsubExecutionCompleted = executionEvents.on('execution_completed', (payload) => {
    const p = payload as { executionId: string; result: ExecutionResult };
    const synced = syncFromEngine();
    set({
      ...synced,
      history: [p.result, ...get().history].slice(0, 50),
    });
  });

  _unsubExecutionFailed = executionEvents.on('execution_failed', (payload) => {
    const p = payload as { executionId: string; error: string; partialResult?: ExecutionResult };
    const synced = syncFromEngine();
    set({
      ...synced,
      lastError: p.error,
      history: p.partialResult
        ? [p.partialResult, ...get().history].slice(0, 50)
        : get().history,
    });
  });
}

function unsubscribeFromEvents(): void {
  _unsubTaskStarted?.();
  _unsubTaskCompleted?.();
  _unsubExecutionCompleted?.();
  _unsubExecutionFailed?.();
  _unsubTaskStarted = null;
  _unsubTaskCompleted = null;
  _unsubExecutionCompleted = null;
  _unsubExecutionFailed = null;
}

// ── Store ─────────────────────────────────────────────────────

export const useExecutionStore = create<ExecutionStoreState>((set, get) => ({
  state: 'idle',
  currentExecutionId: null,
  currentTaskId: null,
  lastResult: null,
  lastError: null,
  history: [],

  init: () => {
    executionEngine.init();
    subscribeToEvents(set, get);
    set(syncFromEngine());
  },

  shutdown: () => {
    executionEngine.shutdown();
    unsubscribeFromEvents();
    set({ state: 'stopped' });
  },

  executeJob: async (job) => {
    const result = await executionEngine.executeJob(job);
    set(syncFromEngine());
    return result;
  },

  quickScan: async () => {
    const result = await executionEngine.quickScan();
    set(syncFromEngine());
    return result;
  },

  browserCleanup: async () => {
    const result = await executionEngine.browserCleanup();
    set(syncFromEngine());
    return result;
  },

  deepClean: async () => {
    const result = await executionEngine.deepClean();
    set(syncFromEngine());
    return result;
  },

  runManual: async (taskIds, name) => {
    const result = await executionEngine.runManual(taskIds, name);
    set(syncFromEngine());
    return result;
  },

  clear: () => {
    executionEngine.clear();
    unsubscribeFromEvents();
    set({
      state: 'idle',
      currentExecutionId: null,
      currentTaskId: null,
      lastResult: null,
      lastError: null,
      history: [],
    });
  },

  getSnapshot: () => executionEngine.getSnapshot(),
}));

// ── Convenience hooks ─────────────────────────────────────────

export function useExecutionState(): EngineState {
  return useExecutionStore((s) => s.state);
}

export function useIsExecuting(): boolean {
  return useExecutionStore((s) => s.state === 'running');
}

export function useLastExecutionResult(): ExecutionResult | null {
  return useExecutionStore((s) => s.lastResult);
}

export function useExecutionHistory(): ExecutionResult[] {
  return useExecutionStore((s) => s.history);
}
