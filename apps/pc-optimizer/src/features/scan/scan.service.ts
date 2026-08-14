/**
 * scan.service.ts — frontend bridge to the real orchestrator RPC service.
 *
 * Wraps orchestratorService and exposes a small, scan-only API for the
 * unified scan UI.  All four required methods are thin pass-throughs to
 * `orchestrator.*` RPC methods.  `fullAsync(..., true)` is always invoked
 * with `scanOnly: true` so the backend does not modify the system.
 */
import type { ScanProfile } from '../orchestrator/orchestrator.service';
import { orchestratorService } from '../orchestrator/orchestrator.service';
import type { OrchestratorStatus, OrchestratorModuleStatus } from '../orchestrator/orchestrator.service';

export type { OrchestratorStatus, OrchestratorModuleStatus };

export interface ScanService {
  scan(profile?: ScanProfile): Promise<{ sessionId: string; startedAt: string }>;
  scan_quick(profile?: ScanProfile): Promise<{ sessionId: string; startedAt: string }>;
  scan_full(profile?: ScanProfile): Promise<{ sessionId: string; startedAt: string }>;
  cancel_scan(sessionId: string): Promise<{ sessionId: string; cancelled: boolean }>;
  status(sessionId: string): Promise<OrchestratorStatus>;
  result(sessionId: string): Promise<Record<string, unknown>>;
}

export const scanService: ScanService = {
  scan: (profile?: ScanProfile) => orchestratorService.fullAsync(profile ?? 'dashboard', true),
  scan_quick: (profile?: ScanProfile) => orchestratorService.fullAsync(profile ?? 'dashboard', true),
  scan_full: (profile?: ScanProfile) => orchestratorService.fullAsync(profile ?? 'protection', true),
  cancel_scan: (sessionId: string) => orchestratorService.cancel(sessionId),
  status: (sessionId: string) => orchestratorService.status(sessionId),
  result: (sessionId: string) => orchestratorService.result(sessionId),
};
