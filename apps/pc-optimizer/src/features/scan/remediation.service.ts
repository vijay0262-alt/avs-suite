/**
 * remediation.service.ts — frontend bridge to `scan_core.remediation.*` RPC methods.
 *
 * Only `prepare` and `validate` are exposed.  `execute`, `cancel`, `status`, and
 * `rollback` are intentionally omitted for the Phase 2 boundary.
 */
import { RPC_METHODS } from '@avs/shared/rpc';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface RemediationService {
  prepare(planId: string): Promise<Record<string, unknown>>;
  validate(planId: string): Promise<Record<string, unknown>>;
}

export const remediationService: RemediationService = {
  prepare: (planId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE, { plan_id: planId }),
  validate: (planId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE, { plan_id: planId }),
};
