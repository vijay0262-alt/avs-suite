/**
 * unifiedScanState.ts — in-memory, transient canonical state for the latest
 * unified scan_core scan session and its remediation/rollback lifecycle.
 *
 * This is intentionally NOT persisted to localStorage, IndexedDB, or any
 * browser storage. It is a thin, UI-only mirror of the authoritative backend
 * state so that the dashboard and other read-only views can display the latest
 * scan/remediation status without starting new scans.
 *
 * The single source of truth remains the backend scan_core orchestration and
 * the ActionPlan/RemediationCoordinator. React is orchestration/UI only.
 */
import type { ScanStatistics, RemediationExecution, RollbackSummary, RemediationPreview, RemediationValidation } from './types';

export type AppScanStatus =
  | 'idle'
  | 'preparing'
  | 'scanning'
  | 'complete'
  | 'error'
  | 'cancelled';

export type AppRemediationStatus =
  | 'none'
  | 'preparing'
  | 'validating'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled'
  | 'rejected'
  | 'rollback_success'
  | 'rollback_partial'
  | 'rollback_failed'
  | 'rollback_unavailable';

export interface AppScanSession {
  sessionId: string;
  planId?: string;
  module: 'protection' | 'optimize' | 'security';
  mode: 'quick' | 'full';
  status: AppScanStatus;
  startedAt: string;
  completedAt?: string;
  result?: Record<string, unknown> | null;
  statistics?: ScanStatistics;
  preview?: RemediationPreview;
  validation?: RemediationValidation;
  rollbackSupported?: boolean;
  executionId?: string;
  remediationStatus: AppRemediationStatus;
  execution?: RemediationExecution;
  rollbackSummary?: RollbackSummary;
  error: string | null;
  /** V1.0: Cleanup result from auto-optimize, used by dashboard cards. */
  cleanupResult?: {
    detected: number;
    cleaned: number;
    foldersCleaned: number;
    remaining: number;
    failed: number;
    reviewRequired: number;
    spaceRecovered: number;
    healthBefore?: number;
    healthAfter?: number;
    verificationStatus?: string;
    requiresUpgrade?: boolean;
  } | null;
}

export type AppScanSessionUpdate = Partial<AppScanSession>;

type Listener = (session: AppScanSession | null) => void;

class UnifiedScanStateService {
  private latest: AppScanSession | null = null;
  private listeners: Listener[] = [];

  getLatest(): AppScanSession | null {
    return this.latest;
  }

  setLatest(session: AppScanSession): void {
    this.latest = session;
    this.emit();
  }

  updateLatest(update: AppScanSessionUpdate): void {
    if (!this.latest) return;
    this.latest = { ...this.latest, ...update };
    this.emit();
  }

  clear(): void {
    this.latest = null;
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    listener(this.latest);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.latest);
    }
  }
}

export const unifiedScanState = new UnifiedScanStateService();
