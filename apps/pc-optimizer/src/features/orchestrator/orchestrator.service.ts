/**
 * OptimizationOrchestratorService — frontend RPC wrapper for the
 * backend OptimizationOrchestrator.
 *
 * This is the SINGLE entry point for all optimization workflows.
 * Dashboard, AI Smart Optimize, and Protection Center all call this
 * service. The backend orchestrator runs real module scans and
 * optimizations — no simulated progress.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

// ── Types ───────────────────────────────────────────────────────────

export interface OrchestratorModuleResult {
  moduleId: string;
  moduleName: string;
  status: 'pending' | 'complete' | 'error' | 'skipped';
  issues: number;
  size: number;
  score: number;
  scoreAfter?: number;
  issuesAfter?: number;
  canAutoFix: boolean;
  error?: string;
  scanResult?: unknown;
}

export interface OrchestratorScanResponse {
  sessionId: string;
  modules: Record<string, OrchestratorModuleResult>;
  overallScore: number;
  totalIssues: number;
  recoverableSpace: number;
}

export interface OrchestratorOptimizeResult {
  success: boolean;
  bytesRecovered: number;
  itemsRemoved: number;
  entriesDisabled?: number;
  issuesFixed?: number;
  errors: string[];
  reason?: string;
}

export interface OrchestratorOptimizeResponse {
  sessionId: string;
  optimizeResults: Record<string, OrchestratorOptimizeResult>;
  overallScoreBefore: number;
  overallScoreAfter: number;
  spaceRecovered: number;
  itemsFixed: number;
  entriesDisabled: number;
  issuesFixed: number;
  issuesAfter: number;
  errors: string[];
  history: OrchestratorHistoryEntry;
  success: boolean;
}

export interface OrchestratorHistoryEntry {
  id: string;
  date: string;
  healthBefore: number;
  healthAfter: number;
  storageRecovered: number;
  registryFixed: number;
  startupOptimized: number;
  privacyCleaned: number;
  durationMs: number;
  modulesUsed: string[];
  result: string;
}

export interface OrchestratorActivityEntry {
  ts: string;
  module: string;
  action: string;
  detail: string;
  operation?: string;
  path?: string;
}

export interface OrchestratorCounters {
  itemsScanned: number;
  itemsAnalyzed: number;
  itemsOptimized: number;
  itemsSkipped: number;
  storageRecovered: number;
  elapsedMs: number;
  itemsCleaned?: number;
  registryFixed?: number;
  threatsChecked?: number;
  bytesRecovered?: number;
}

export interface OrchestratorModuleStatus {
  status: string;
  progress: number;
  itemsScanned: number;
  issuesFound: number;
}

export interface OrchestratorStatus {
  sessionId: string;
  phase: string;
  progress: number;
  currentModule: string | null;
  currentOperation: string | null;
  currentPath: string | null;
  itemsProcessed: number;
  itemsRemaining: number;
  bytesRecovered: number;
  overallScoreBefore: number;
  overallScoreAfter: number;
  issuesBefore: number;
  issuesAfter: number;
  spaceRecovered: number;
  completedAt: string | null;
  error: string | null;
  cancelled: boolean;
  // Real-time streaming data
  activityLog: OrchestratorActivityEntry[];
  counters: OrchestratorCounters;
  moduleStatuses: Record<string, OrchestratorModuleStatus>;
}

export interface OrchestratorFullResponse {
  sessionId: string;
  scan: {
    modules: Record<string, OrchestratorModuleResult>;
    overallScore: number;
    totalIssues: number;
    recoverableSpace: number;
  };
  optimize: {
    optimizeResults: Record<string, OrchestratorOptimizeResult>;
    overallScoreBefore: number;
    overallScoreAfter: number;
    spaceRecovered: number;
    itemsFixed: number;
    entriesDisabled: number;
    issuesFixed: number;
    issuesAfter: number;
    errors: string[];
    success: boolean;
  };
  history: OrchestratorHistoryEntry;
  elapsedMs: number;
  completedAt: string;
}

// ── Service interface ───────────────────────────────────────────────

export interface IOrchestratorService {
  start(): Promise<{ sessionId: string; startedAt: string }>;
  scan(sessionId: string): Promise<OrchestratorScanResponse>;
  optimize(sessionId: string): Promise<OrchestratorOptimizeResponse>;
  status(sessionId: string): Promise<OrchestratorStatus>;
  result(sessionId: string): Promise<Record<string, unknown>>;
  cancel(sessionId: string): Promise<{ sessionId: string; cancelled: boolean }>;
  full(): Promise<OrchestratorFullResponse>;
  fullAsync(): Promise<{ sessionId: string; startedAt: string }>;
}

export const orchestratorService: IOrchestratorService = {
  start: () => client().call(RPC_METHODS.ORCHESTRATOR_START),
  scan: (sessionId: string) => client().call(RPC_METHODS.ORCHESTRATOR_SCAN, { sessionId }),
  optimize: (sessionId: string) => client().call(RPC_METHODS.ORCHESTRATOR_OPTIMIZE, { sessionId }),
  status: (sessionId: string) => client().call(RPC_METHODS.ORCHESTRATOR_STATUS, { sessionId }),
  result: (sessionId: string) => client().call(RPC_METHODS.ORCHESTRATOR_RESULT, { sessionId }),
  cancel: (sessionId: string) => client().call(RPC_METHODS.ORCHESTRATOR_CANCEL, { sessionId }),
  full: () => client().call(RPC_METHODS.ORCHESTRATOR_FULL),
  fullAsync: () => client().call(RPC_METHODS.ORCHESTRATOR_FULL_ASYNC),
};
