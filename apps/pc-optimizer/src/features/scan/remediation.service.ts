/**
 * remediation.service.ts — frontend bridge to `scan_core.remediation.*` RPC methods.
 *
 * Exposes `prepare`, `validate`, `execute`, `status`, and `cancel`.
 * `rollback` and orchestrator methods are intentionally not used.
 */
import { RPC_METHODS } from '@avs/shared/rpc';
import type {
  RemediationPrepareResponse,
  RemediationValidateResponse,
  RemediationExecuteResponse,
  RemediationStatusResponse,
  RemediationCancelResponse,
  RemediationRollbackResponse,
  AutoOptimizeStartResponse,
  AutoOptimizeStatus,
  AutoOptimizeCancelResponse,
} from './types';

function client() {
  if (typeof window === 'undefined' || !window.avs) {
    throw new Error('AVS RPC bridge is unavailable (outside Electron?)');
  }
  return window.avs.rpc;
}

export interface RemediationService {
  prepare(planId: string): Promise<RemediationPrepareResponse>;
  validate(planId: string): Promise<RemediationValidateResponse>;
  execute(
    planId: string,
    requestId: string,
    approvalToken: string,
    mode?: string,
  ): Promise<RemediationExecuteResponse>;
  status(executionId: string): Promise<RemediationStatusResponse>;
  cancel(executionId: string): Promise<RemediationCancelResponse>;
  rollback(executionId: string): Promise<RemediationRollbackResponse>;
  autoOptimize(planId: string): Promise<AutoOptimizeStartResponse>;
  autoOptimizeStatus(sessionId: string): Promise<AutoOptimizeStatus>;
  autoOptimizeCancel(sessionId: string): Promise<AutoOptimizeCancelResponse>;
}

export const remediationService: RemediationService = {
  prepare: (planId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_PREPARE, { plan_id: planId }) as Promise<RemediationPrepareResponse>,
  validate: (planId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_VALIDATE, { plan_id: planId }) as Promise<RemediationValidateResponse>,
  execute: (planId: string, requestId: string, approvalToken: string, mode = 'live') =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE, {
      plan_id: planId,
      request_id: requestId,
      approval_token: approvalToken,
      mode,
    }) as Promise<RemediationExecuteResponse>,
  status: (executionId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_STATUS, { execution_id: executionId }) as Promise<RemediationStatusResponse>,
  cancel: (executionId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_CANCEL, { execution_id: executionId }) as Promise<RemediationCancelResponse>,
  rollback: (executionId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK, { execution_id: executionId }) as Promise<RemediationRollbackResponse>,
  autoOptimize: (planId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE, { plan_id: planId }) as Promise<AutoOptimizeStartResponse>,
  autoOptimizeStatus: (sessionId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE_STATUS, { session_id: sessionId }) as Promise<AutoOptimizeStatus>,
  autoOptimizeCancel: (sessionId: string) =>
    client().call(RPC_METHODS.SCAN_CORE_DASHBOARD_AUTO_OPTIMIZE_CANCEL, { session_id: sessionId }) as Promise<AutoOptimizeCancelResponse>,
};
