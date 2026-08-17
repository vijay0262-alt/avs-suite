/**
 * SC-8C14 Phase 2 — Dead Security Remediation Cleanup Regression Tests
 *
 * Verifies that:
 *   - Deleted frontend classes are not importable
 *   - Deleted RPC constants are absent from RPC_METHODS
 *   - Deleted wrapper methods are absent from securityBackendService
 *   - Deleted ThreatRemediationEngine methods are absent
 *   - Canonical scan_core remediation remains available
 *   - quarantine.list remains available for Phase 3
 *   - Active security RPCs (SmartScreen/Defender/Firewall) remain registered
 *   - No legacy execution path is reachable
 */
import { describe, it, expect } from 'vitest';
import { RPC_METHODS } from '@avs/shared/rpc';
import { ThreatRemediationEngine } from '../ThreatRemediationEngine';
import * as securityRemediationBarrel from '../index';
import * as securityBackendServiceModule from '../../security-dashboard/securityBackendService';

const securityBackendService = securityBackendServiceModule.securityBackendService as Record<string, unknown>;

// ── Deleted Constants ─────────────────────────────────────────────────

describe('SC-8C14 Phase 2: Deleted RPC constants', () => {
  it('SECURITY_QUARANTINE is absent', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_QUARANTINE).toBeUndefined();
  });

  it('SECURITY_QUARANTINE_RESTORE is absent', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_QUARANTINE_RESTORE).toBeUndefined();
  });

  it('SECURITY_QUARANTINE_DELETE is absent', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_QUARANTINE_DELETE).toBeUndefined();
  });

  it('SECURITY_REMEDIATION_PLAN is absent', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_REMEDIATION_PLAN).toBeUndefined();
  });

  it('SECURITY_REMEDIATION_EXECUTE is absent', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_REMEDIATION_EXECUTE).toBeUndefined();
  });

  it('SECURITY_REMEDIATION_ROLLBACK is absent', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_REMEDIATION_ROLLBACK).toBeUndefined();
  });
});

// ── Preserved Constants ───────────────────────────────────────────────

describe('SC-8C14 Phase 2/3: Preserved RPC constants', () => {
  it('SECURITY_QUARANTINE_LIST is removed (Phase 3 migrated to canonical)', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_QUARANTINE_LIST).toBeUndefined();
  });

  it('SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST remains (canonical, Phase 3)', () => {
    expect(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST).toBe('scan_core.security_remediation.quarantine_list');
  });

  it('SECURITY_ENABLE_SMARTSCREEN remains', () => {
    expect(RPC_METHODS.SECURITY_ENABLE_SMARTSCREEN).toBe('security.enableSmartScreen');
  });

  it('SECURITY_ENABLE_DEFENDER remains', () => {
    expect(RPC_METHODS.SECURITY_ENABLE_DEFENDER).toBe('security.enableDefender');
  });

  it('SECURITY_ENABLE_FIREWALL remains', () => {
    expect(RPC_METHODS.SECURITY_ENABLE_FIREWALL).toBe('security.enableFirewall');
  });

  it('SCAN_CORE_SECURITY_REMEDIATION_PLAN remains (canonical)', () => {
    expect(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_PLAN).toBe('scan_core.security_remediation.plan');
  });

  it('SCAN_CORE_REMEDIATION_EXECUTE remains (canonical)', () => {
    expect(RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE).toBe('scan_core.remediation.execute');
  });

  it('SCAN_CORE_REMEDIATION_ROLLBACK remains (canonical)', () => {
    expect(RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK).toBe('scan_core.remediation.rollback');
  });
});

// ── Deleted Classes Not Importable ────────────────────────────────────

describe('SC-8C14 Phase 2: Deleted frontend classes are not exported from barrel', () => {
  it('ThreatRestoreManager is not exported', () => {
    expect((securityRemediationBarrel as Record<string, unknown>).ThreatRestoreManager).toBeUndefined();
  });

  it('ThreatDeletionManager is not exported', () => {
    expect((securityRemediationBarrel as Record<string, unknown>).ThreatDeletionManager).toBeUndefined();
  });

  it('ThreatRecoveryProvider is not exported', () => {
    expect((securityRemediationBarrel as Record<string, unknown>).ThreatRecoveryProvider).toBeUndefined();
  });
});

// ── Deleted ThreatRemediationEngine Methods ───────────────────────────

describe('SC-8C14 Phase 2: Deleted ThreatRemediationEngine methods', () => {
  const engine = new ThreatRemediationEngine();
  const deadMethods = [
    'executePlan',
    'executeAction',
    'performAction',
    'performQuarantine',
    'performRestore',
    'performDelete',
    'performDisableStartup',
    'performDisableTask',
    'performDisableExtension',
    'performResetBrowser',
    'performRemovePersistence',
    'rollbackAction',
    'restoreFromQuarantine',
    'deleteFromQuarantine',
    'approvePlan',
    'rejectPlan',
    'getApprovalRequest',
    'getReport',
    'setTier',
    'getRecoveryStatus',
    'getRecoveryProviders',
    'getRecoveryOptions',
    'buildApprovalExplanation',
  ];

  for (const method of deadMethods) {
    it(`${method} is absent from ThreatRemediationEngine`, () => {
      expect((engine as Record<string, unknown>)[method]).toBeUndefined();
    });
  }
});

// ── Preserved ThreatRemediationEngine Methods ─────────────────────────

describe('SC-8C14 Phase 2: Preserved ThreatRemediationEngine methods', () => {
  const engine = new ThreatRemediationEngine();
  const preservedMethods = [
    'createPlan',
    'getPlan',
    'getAllPlans',
    'getQuarantineEntry',
    'getQuarantineSummary',
    'markFalsePositive',
    'isFalsePositive',
    'generateReport',
    'getHistory',
    'getDashboard',
    'getConfiguration',
    'updatePolicy',
    'clear',
  ];

  for (const method of preservedMethods) {
    it(`${method} remains on ThreatRemediationEngine`, () => {
      expect(typeof (engine as Record<string, unknown>)[method]).toBe('function');
    });
  }
});

// ── Deleted Wrapper Methods ───────────────────────────────────────────

describe('SC-8C14 Phase 2: Deleted securityBackendService wrapper methods', () => {
  const deadWrappers = [
    'quarantineFile',
    'restoreQuarantined',
    'deleteQuarantined',
    'generateRemediationPlan',
    'executeRemediationPlan',
    'rollbackRemediation',
  ];

  for (const method of deadWrappers) {
    it(`${method} is absent from securityBackendService`, () => {
      expect(securityBackendService[method]).toBeUndefined();
    });
  }
});

// ── Preserved Wrapper Methods ─────────────────────────────────────────

describe('SC-8C14 Phase 2/3: Preserved securityBackendService wrapper methods', () => {
  it('listQuarantined remains (canonical, migrated in Phase 3)', () => {
    expect(typeof securityBackendService.listQuarantined).toBe('function');
  });
});
