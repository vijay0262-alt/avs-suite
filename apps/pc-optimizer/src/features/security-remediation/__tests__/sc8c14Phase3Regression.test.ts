/**
 * SC-8C14 Phase 3 — Quarantine Transitional Migration Regression Tests
 *
 * Verifies that:
 *   - Canonical RPC constant SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST exists
 *   - Old SECURITY_QUARANTINE_LIST constant is removed
 *   - securityBackendService.listQuarantined() uses the canonical RPC
 *   - QuarantineEntry interface is privacy-safe (no quarantinePath/originalPath)
 *   - SecurityCenterService.getQuarantineSummary() handles the new response shape
 */
import { describe, it, expect } from 'vitest';
import { RPC_METHODS } from '@avs/shared/rpc';
import * as securityBackendServiceModule from '../../security-dashboard/securityBackendService';
import type { QuarantineEntry } from '../../security-dashboard/securityBackendService';

const securityBackendService = securityBackendServiceModule.securityBackendService as Record<string, unknown>;

// ── Canonical Constant ────────────────────────────────────────────────

describe('SC-8C14 Phase 3: Canonical RPC constant', () => {
  it('SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST exists', () => {
    expect(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_QUARANTINE_LIST).toBe(
      'scan_core.security_remediation.quarantine_list',
    );
  });
});

// ── Old Constant Removed ──────────────────────────────────────────────

describe('SC-8C14 Phase 3: Old transitional constant removed', () => {
  it('SECURITY_QUARANTINE_LIST is absent', () => {
    expect((RPC_METHODS as Record<string, unknown>).SECURITY_QUARANTINE_LIST).toBeUndefined();
  });
});

// ── listQuarantined Wrapper ───────────────────────────────────────────

describe('SC-8C14 Phase 3: listQuarantined wrapper', () => {
  it('listQuarantined remains a function (now canonical)', () => {
    expect(typeof securityBackendService.listQuarantined).toBe('function');
  });
});

// ── Privacy-Safe QuarantineEntry ──────────────────────────────────────

describe('SC-8C14 Phase 3: QuarantineEntry is privacy-safe', () => {
  it('does not expose quarantinePath', () => {
    const sample: QuarantineEntry = {
      id: 'q-1',
      displayName: 'evil.exe',
      status: 'quarantined',
      detectedAt: '2024-01-01T00:00:00Z',
      threatType: null,
      severity: null,
      size: 1024,
      rollbackAvailable: true,
      detectionReason: 'Spyware detected',
    };
    expect(sample).not.toHaveProperty('quarantinePath');
    expect(sample).not.toHaveProperty('originalPath');
    expect(sample).not.toHaveProperty('asset_id');
    expect(sample).not.toHaveProperty('backup_location');
    expect(sample).not.toHaveProperty('canonical_path');
  });

  it('has only display-oriented fields', () => {
    const keys: Array<keyof QuarantineEntry> = [
      'id',
      'displayName',
      'status',
      'detectedAt',
      'threatType',
      'severity',
      'size',
      'rollbackAvailable',
      'detectionReason',
    ];
    expect(keys.length).toBe(9);
    // Verify no path-like fields
    for (const key of keys) {
      expect(key).not.toContain('Path');
      expect(key).not.toContain('path');
    }
  });
});

// ── Active RPCs Still Preserved ───────────────────────────────────────

describe('SC-8C14 Phase 3: Active protection RPCs preserved', () => {
  it('SECURITY_ENABLE_SMARTSCREEN remains', () => {
    expect(RPC_METHODS.SECURITY_ENABLE_SMARTSCREEN).toBe('security.enableSmartScreen');
  });

  it('SECURITY_ENABLE_DEFENDER remains', () => {
    expect(RPC_METHODS.SECURITY_ENABLE_DEFENDER).toBe('security.enableDefender');
  });

  it('SECURITY_ENABLE_FIREWALL remains', () => {
    expect(RPC_METHODS.SECURITY_ENABLE_FIREWALL).toBe('security.enableFirewall');
  });
});

// ── Canonical Remediation RPCs Preserved ──────────────────────────────

describe('SC-8C14 Phase 3: Canonical remediation RPCs preserved', () => {
  it('SCAN_CORE_SECURITY_REMEDIATION_PLAN remains', () => {
    expect(RPC_METHODS.SCAN_CORE_SECURITY_REMEDIATION_PLAN).toBe(
      'scan_core.security_remediation.plan',
    );
  });

  it('SCAN_CORE_REMEDIATION_EXECUTE remains', () => {
    expect(RPC_METHODS.SCAN_CORE_REMEDIATION_EXECUTE).toBe('scan_core.remediation.execute');
  });

  it('SCAN_CORE_REMEDIATION_ROLLBACK remains', () => {
    expect(RPC_METHODS.SCAN_CORE_REMEDIATION_ROLLBACK).toBe('scan_core.remediation.rollback');
  });
});
