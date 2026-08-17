/**
 * AI Remediation, Quarantine & Recovery — Comprehensive Tests
 *
 * Tests:
 *   - Quarantine lifecycle
 *   - Restore
 *   - Rollback
 *   - False positives
 *   - Approval workflow
 *   - Policy handling
 *   - Report generation
 *   - Recovery integration
 *   - Safety validation
 *   - Edge cases
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ThreatRemediationEngine } from '../ThreatRemediationEngine';
import { ThreatQuarantineManager } from '../ThreatQuarantineManager';
import { ThreatRollbackManager } from '../ThreatRollbackManager';
import { ThreatApprovalManager } from '../ThreatApprovalManager';
import { ThreatSafetyValidator } from '../ThreatSafetyValidator';
import { ThreatRemediationPolicyManager } from '../ThreatRemediationPolicy';
import { ThreatRemediationPlanner } from '../ThreatRemediationPlanner';
import { ThreatRemediationHistory } from '../ThreatRemediationHistory';
import { ThreatRemediationReportGenerator } from '../ThreatRemediationReport';
import { ThreatFalsePositiveTracker } from '../ThreatFalsePositiveTracker';
import { ThreatConfigurationManager } from '../ThreatConfiguration';
import { remediationEventBus } from '../ThreatRemediationEvents';
import type {
  ThreatInvestigation,
  RemediationAction,
} from '../types';
import type { Threat as SecurityThreat } from '../../security-center/types';

// ── Mock Factories ──────────────────────────────────────────────────

function makeThreat(overrides: Partial<SecurityThreat> & { id: string; name: string; category: SecurityThreat['category'] }): SecurityThreat {
  const now = Date.now();
  return {
    severity: 'medium',
    confidence: 0.8,
    confidenceLabel: 'high',
    risk: 'moderate',
    status: 'active',
    evidence: [{ source: 'test', type: 'test', value: 'test', description: 'test evidence', timestamp: now }],
    detectionSource: 'test-provider',
    detectionTime: now,
    recommendation: 'Review and quarantine.',
    explanation: 'Threat detected.',
    mitreAttack: null,
    affectedAssets: [{ type: 'file', path: 'C:\\Users\\Test\\Downloads\\evil.exe', name: 'evil.exe' }],
    requiresRestart: false,
    reversible: true,
    canRemediate: true,
    ...overrides,
  } as SecurityThreat;
}

function makeSpywareThreat(): SecurityThreat {
  return makeThreat({
    id: 'threat-spyware-1',
    name: 'Spyware: keylogger.exe',
    category: 'spyware',
    severity: 'high',
    confidence: 0.85,
    risk: 'high',
    evidence: [
      { source: 'spyware-detection', type: 'keyboard_hook', value: 'keylogger.exe', description: 'Keyboard hook', timestamp: Date.now() },
      { source: 'spyware-detection', type: 'clipboard_monitoring', value: 'keylogger.exe', description: 'Clipboard monitoring', timestamp: Date.now() },
    ],
    affectedAssets: [{ type: 'file', path: 'C:\\Temp\\keylogger.exe', name: 'keylogger.exe' }],
  });
}

function makeAdwareThreat(): SecurityThreat {
  return makeThreat({
    id: 'threat-adware-1',
    name: 'Adware: adware.exe',
    category: 'adware',
    severity: 'low',
    confidence: 0.7,
    risk: 'low',
    affectedAssets: [{ type: 'file', path: 'C:\\Program Files\\AdwareApp\\adware.exe', name: 'adware.exe' }],
  });
}

function makeInvestigation(threats: SecurityThreat[]): ThreatInvestigation {
  const primary = threats[0] ?? makeThreat({ id: 'empty', name: 'Empty', category: 'unknown' });
  return {
    id: 'inv-test-1',
    threatIds: threats.map((t) => t.id),
    primaryThreatId: primary.id,
    summary: {
      title: 'Test Investigation',
      oneLiner: 'Test threat detected',
      category: primary.category,
      threatCount: threats.length,
      primaryThreatName: primary.name,
      detectedAt: Date.now(),
      lastActivity: Date.now(),
    },
    explanation: {
      whatHappened: 'Threat detected',
      whyDetected: 'Evidence found',
      evidenceSummary: '2 pieces of evidence',
      confidenceReasoning: 'High confidence',
      possibleFalsePositiveFactors: [],
      userFriendlyExplanation: 'A threat was found',
      technicalExplanation: 'Technical details',
    },
    severity: { level: 'high', score: 75, reasoning: 'High severity', factors: [] },
    confidence: { score: 0.85, label: 'high', reasoning: 'High confidence', factors: [], mitigatingFactors: [] },
    risk: 'high',
    evidence: { total: 2, bySource: { 'spyware-detection': 2 }, byType: { keyboard_hook: 1, clipboard_monitoring: 1 }, items: [], strongestEvidence: null, evidenceQuality: 'moderate' },
    timeline: [],
    relationships: [],
    affectedComponents: [],
    mitreAttack: [],
    recommendedActions: [],
    estimatedImpact: 'High',
    estimatedRecovery: 'Moderate',
    falsePositiveAnalysis: { couldBeLegitimate: false, reasons: [], confidenceReducingFactors: [], additionalVerificationSteps: [], similarKnownGoodSoftware: [] },
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: { source: 'automatic', version: '1.0.0', engineVersion: '1.2.0', processingTime: 100, threatsProcessed: threats.length, correlationsFound: 0 },
    relationshipGraph: { nodes: [], edges: [], clusters: [], totalNodes: 0, totalEdges: 0 },
    context: {
      systemState: { osVersion: 'Windows', lastBootTime: 0, uptime: 0, securityScore: 75, providersActive: 5, providersTotal: 6 },
      relatedThreats: [],
      historicalContext: null,
      processContext: null,
      hardwareContext: null,
      networkContext: null,
    },
  };
}

function makeRemediationAction(overrides: Partial<RemediationAction> = {}): RemediationAction {
  return {
    id: 'act-test-1',
    planId: 'plan-test-1',
    investigationId: 'inv-test-1',
    threatId: 'threat-1',
    type: 'quarantine',
    status: 'pending',
    riskLevel: 'medium_risk',
    requiresApproval: true,
    requiresUserConfirmation: false,
    target: { type: 'file', path: 'C:\\Temp\\evil.exe', name: 'evil.exe' },
    reason: 'Test reason',
    explanation: 'Test explanation',
    reversible: true,
    rollbackId: null,
    tier: 'free',
    createdAt: Date.now(),
    executedAt: null,
    completedAt: null,
    error: null,
    metadata: {
      detectionSource: 'test',
      detectionTime: Date.now(),
      confidence: 0.8,
      severity: 'high',
      category: 'spyware',
      evidenceCount: 2,
      investigationTitle: 'Test',
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('AI Remediation, Quarantine & Recovery', () => {

  // ── ThreatQuarantineManager ───────────────────────────────────────

  describe('ThreatQuarantineManager', () => {
    let manager: ThreatQuarantineManager;

    beforeEach(() => {
      manager = new ThreatQuarantineManager(true, 'C:\\Quarantine');
    });

    it('quarantines a file with metadata', () => {
      const threat = makeSpywareThreat();
      const entry = manager.quarantine(threat, 'inv-1', 'C:\\Temp\\keylogger.exe', 'keylogger.exe', 1024, 'abc123', 'SignedBy');
      expect(entry.id).toBeTruthy();
      expect(entry.status).toBe('quarantined');
      expect(entry.encrypted).toBe(true);
      expect(entry.originalPath).toBe('C:\\Temp\\keylogger.exe');
      expect(entry.fileHash).toBe('abc123');
      expect(entry.metadata.threatCategory).toBe('spyware');
    });

    it('restores a quarantined file', () => {
      const threat = makeSpywareThreat();
      const entry = manager.quarantine(threat, 'inv-1', 'C:\\Temp\\keylogger.exe', 'keylogger.exe', 1024, 'abc123', null);
      const restored = manager.restore(entry.id);
      expect(restored).not.toBeNull();
      expect(restored!.status).toBe('restored');
    });

    it('deletes a quarantined file', () => {
      const threat = makeSpywareThreat();
      const entry = manager.quarantine(threat, 'inv-1', 'C:\\Temp\\keylogger.exe', 'keylogger.exe', 1024, 'abc123', null);
      const deleted = manager.delete(entry.id);
      expect(deleted).toBe(true);
      expect(manager.get(entry.id)!.status).toBe('deleted');
    });

    it('cannot restore a deleted entry', () => {
      const threat = makeSpywareThreat();
      const entry = manager.quarantine(threat, 'inv-1', 'C:\\Temp\\keylogger.exe', 'keylogger.exe', 1024, 'abc123', null);
      manager.delete(entry.id);
      const restored = manager.restore(entry.id);
      expect(restored).toBeNull();
    });

    it('computes quarantine summary', () => {
      const threat = makeSpywareThreat();
      manager.quarantine(threat, 'inv-1', 'C:\\Temp\\a.exe', 'a.exe', 100, 'h1', null);
      manager.quarantine(threat, 'inv-1', 'C:\\Temp\\b.exe', 'b.exe', 200, 'h2', null);
      const summary = manager.getSummary();
      expect(summary.totalItems).toBe(2);
      expect(summary.activeQuarantine).toBe(2);
      expect(summary.totalSize).toBe(300);
    });

    it('checks if threat is quarantined', () => {
      const threat = makeSpywareThreat();
      expect(manager.isQuarantined(threat.id)).toBe(false);
      manager.quarantine(threat, 'inv-1', 'C:\\Temp\\keylogger.exe', 'keylogger.exe', 1024, 'abc123', null);
      expect(manager.isQuarantined(threat.id)).toBe(true);
    });
  });

  // ── ThreatRollbackManager ─────────────────────────────────────────

  describe('ThreatRollbackManager', () => {
    let manager: ThreatRollbackManager;

    beforeEach(() => {
      manager = new ThreatRollbackManager(100);
    });

    it('creates rollback entry for reversible action', () => {
      const action = makeRemediationAction({ reversible: true });
      const rollbackData = { originalPath: 'C:\\Test', backupPath: 'C:\\Backup', originalValue: null, registryKey: null, registryValueName: null, browserSetting: null, extensionId: null, taskName: null, serviceName: null, startupEntryName: null };
      const entry = manager.createEntry(action, rollbackData);
      expect(entry).not.toBeNull();
      expect(entry!.status).toBe('available');
    });

    it('does not create rollback for irreversible action', () => {
      const action = makeRemediationAction({ type: 'delete', reversible: false });
      const rollbackData = { originalPath: '', backupPath: '', originalValue: null, registryKey: null, registryValueName: null, browserSetting: null, extensionId: null, taskName: null, serviceName: null, startupEntryName: null };
      const entry = manager.createEntry(action, rollbackData);
      expect(entry).toBeNull();
    });

    it('rolls back an action', () => {
      const action = makeRemediationAction({ reversible: true });
      const rollbackData = { originalPath: 'C:\\Test', backupPath: 'C:\\Backup', originalValue: null, registryKey: null, registryValueName: null, browserSetting: null, extensionId: null, taskName: null, serviceName: null, startupEntryName: null };
      const entry = manager.createEntry(action, rollbackData);
      const rolledBack = manager.rollback(entry!.id);
      expect(rolledBack).not.toBeNull();
      expect(rolledBack!.status).toBe('rolled_back');
    });

    it('checks rollback availability', () => {
      const action = makeRemediationAction({ reversible: true });
      const rollbackData = { originalPath: 'C:\\Test', backupPath: 'C:\\Backup', originalValue: null, registryKey: null, registryValueName: null, browserSetting: null, extensionId: null, taskName: null, serviceName: null, startupEntryName: null };
      const entry = manager.createEntry(action, rollbackData);
      expect(manager.canRollback(action.id)).toBe(true);
      manager.rollback(entry!.id);
      expect(manager.canRollback(action.id)).toBe(false);
    });
  });

  // ── ThreatApprovalManager ─────────────────────────────────────────

  describe('ThreatApprovalManager', () => {
    let manager: ThreatApprovalManager;

    beforeEach(() => {
      manager = new ThreatApprovalManager();
    });

    it('creates approval request', () => {
      const actions = [makeRemediationAction()];
      const req = manager.createRequest('plan-1', 'inv-1', actions, 'high_risk', 'Test summary', 'Test explanation');
      expect(req.id).toBeTruthy();
      expect(req.response).toBeNull();
    });

    it('approves a request', () => {
      const actions = [makeRemediationAction()];
      const req = manager.createRequest('plan-1', 'inv-1', actions, 'high_risk', 'Test', 'Test');
      const approved = manager.approve(req.id, 'user-1', 'Looks good');
      expect(approved!.response).toBe('approved');
      expect(approved!.userId).toBe('user-1');
    });

    it('rejects a request', () => {
      const actions = [makeRemediationAction()];
      const req = manager.createRequest('plan-1', 'inv-1', actions, 'high_risk', 'Test', 'Test');
      const rejected = manager.reject(req.id, 'user-1', 'Too risky');
      expect(rejected!.response).toBe('rejected');
    });

    it('cannot approve twice', () => {
      const actions = [makeRemediationAction()];
      const req = manager.createRequest('plan-1', 'inv-1', actions, 'high_risk', 'Test', 'Test');
      manager.approve(req.id);
      const second = manager.approve(req.id);
      expect(second).toBeNull();
    });

    it('computes approval summary', () => {
      manager.createRequest('plan-1', 'inv-1', [], 'low_risk', 'T', 'T');
      manager.createRequest('plan-2', 'inv-2', [], 'low_risk', 'T', 'T');
      const req1 = manager.getPending()[0]!;
      manager.approve(req1.id);
      const summary = manager.getSummary();
      expect(summary.pendingCount).toBe(1);
      expect(summary.approvedCount).toBe(1);
    });
  });

  // ── ThreatSafetyValidator ─────────────────────────────────────────

  describe('ThreatSafetyValidator', () => {
    let validator: ThreatSafetyValidator;

    beforeEach(() => {
      validator = new ThreatSafetyValidator(0.5);
    });

    it('validates safe action', () => {
      const action = makeRemediationAction({ type: 'review', riskLevel: 'safe' });
      const threat = makeSpywareThreat();
      const assessment = validator.validate(action, threat);
      expect(assessment.safe).toBe(true);
      expect(assessment.blockers.length).toBe(0);
    });

    it('blocks critical service modification', () => {
      const action = makeRemediationAction({
        type: 'quarantine',
        target: { type: 'service', path: 'C:\\Windows\\System32\\svchost.exe', name: 'RpcSs' },
      });
      const threat = makeSpywareThreat();
      const assessment = validator.validate(action, threat);
      expect(assessment.safe).toBe(false);
      expect(assessment.blockers.length).toBeGreaterThan(0);
    });

    it('warns about system locations', () => {
      const action = makeRemediationAction({
        type: 'quarantine',
        target: { type: 'file', path: 'C:\\Windows\\System32\\evil.dll', name: 'evil.dll' },
      });
      const threat = makeSpywareThreat();
      const assessment = validator.validate(action, threat);
      expect(assessment.warnings.length).toBeGreaterThan(0);
    });

    it('warns about low confidence', () => {
      const action = makeRemediationAction({ type: 'quarantine' });
      const threat = makeThreat({ id: 't1', name: 'T1', category: 'malware', confidence: 0.2 });
      const assessment = validator.validate(action, threat);
      expect(assessment.warnings.some((w) => w.includes('confidence'))).toBe(true);
    });

    it('flags destructive actions', () => {
      const action = makeRemediationAction({ type: 'delete', reversible: false });
      const threat = makeSpywareThreat();
      const assessment = validator.validate(action, threat);
      expect(assessment.requiresUserConfirmation).toBe(true);
    });
  });

  // ── ThreatRemediationPolicy ───────────────────────────────────────

  describe('ThreatRemediationPolicyManager', () => {
    it('manual_only requires approval for everything', () => {
      const policy = new ThreatRemediationPolicyManager({ mode: 'manual_only' });
      const action = makeRemediationAction({ riskLevel: 'safe' });
      expect(policy.shouldAutoExecute(action)).toBe(false);
    });

    it('recommend_only never auto-executes', () => {
      const policy = new ThreatRemediationPolicyManager({ mode: 'recommend_only' });
      const action = makeRemediationAction({ riskLevel: 'safe' });
      expect(policy.shouldAutoExecute(action)).toBe(false);
    });

    it('auto_remediate_low_risk auto-executes safe actions', () => {
      const policy = new ThreatRemediationPolicyManager({ mode: 'auto_remediate_low_risk', autoRemediateThreshold: 'low_risk' });
      const action = makeRemediationAction({ type: 'disable_startup_entry', riskLevel: 'low_risk', requiresApproval: false });
      expect(policy.shouldAutoExecute(action)).toBe(true);
    });

    it('auto_remediate_low_risk does not auto-execute high risk', () => {
      const policy = new ThreatRemediationPolicyManager({ mode: 'auto_remediate_low_risk', autoRemediateThreshold: 'low_risk' });
      const action = makeRemediationAction({ type: 'quarantine', riskLevel: 'high_risk' });
      expect(policy.shouldAutoExecute(action)).toBe(false);
    });

    it('never auto-executes destructive actions', () => {
      const policy = new ThreatRemediationPolicyManager({ mode: 'auto_remediate_low_risk' });
      const action = makeRemediationAction({ type: 'delete', riskLevel: 'safe' });
      expect(policy.shouldAutoExecute(action)).toBe(false);
    });

    it('PRO tier enables bulk remediation', () => {
      const policy = new ThreatRemediationPolicyManager({ tier: 'pro', allowBulkRemediation: true });
      expect(policy.allowsBulkRemediation()).toBe(true);
    });

    it('FREE tier disables bulk remediation', () => {
      const policy = new ThreatRemediationPolicyManager({ tier: 'free', allowBulkRemediation: true });
      expect(policy.allowsBulkRemediation()).toBe(false);
    });
  });

  // ── ThreatRemediationPlanner ──────────────────────────────────────

  describe('ThreatRemediationPlanner', () => {
    let planner: ThreatRemediationPlanner;

    beforeEach(() => {
      const validator = new ThreatSafetyValidator(0.5);
      const policy = new ThreatRemediationPolicyManager({ mode: 'manual_only' });
      planner = new ThreatRemediationPlanner(validator, policy);
    });

    it('creates plan from investigation', () => {
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      const plan = planner.createPlan(investigation, [threat], 'free');
      expect(plan.id).toBeTruthy();
      expect(plan.actions.length).toBeGreaterThan(0);
      expect(plan.totalActions).toBe(plan.actions.length);
    });

    it('generates quarantine action for spyware', () => {
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      const plan = planner.createPlan(investigation, [threat], 'free');
      expect(plan.actions.some((a) => a.type === 'quarantine')).toBe(true);
    });

    it('generates disable action for scheduled task', () => {
      const threat = makeThreat({
        id: 't-task', name: 'Task', category: 'suspicious_scheduled_task',
        affectedAssets: [{ type: 'scheduled_task', path: '\\EvilTask', name: 'EvilTask' }],
      });
      const investigation = makeInvestigation([threat]);
      const plan = planner.createPlan(investigation, [threat], 'free');
      expect(plan.actions.some((a) => a.type === 'disable_scheduled_task')).toBe(true);
    });

    it('includes explanation for each action', () => {
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      const plan = planner.createPlan(investigation, [threat], 'free');
      for (const action of plan.actions) {
        expect(action.explanation.length).toBeGreaterThan(10);
      }
    });
  });

  // ── ThreatFalsePositiveTracker ────────────────────────────────────

  describe('ThreatFalsePositiveTracker', () => {
    let tracker: ThreatFalsePositiveTracker;

    beforeEach(() => {
      tracker = new ThreatFalsePositiveTracker();
    });

    it('marks false positive with reason', () => {
      const threat = makeSpywareThreat();
      const entry = tracker.markFalsePositive(threat, 'inv-1', 'Legitimate screen recorder', 'mark_safe');
      expect(entry.reason).toBe('Legitimate screen recorder');
      expect(entry.exclusionType).toBe('mark_safe');
    });

    it('detects false positive by hash', () => {
      const threat = makeThreat({
        id: 't1', name: 'T1', category: 'spyware',
        affectedAssets: [{ type: 'file', path: 'C:\\Test\\app.exe', name: 'app.exe', hash: 'hash123' }],
      });
      tracker.markFalsePositive(threat, 'inv-1', 'Safe app', 'whitelist');
      expect(tracker.isFalsePositive(threat)).toBe(true);
    });

    it('detects false positive by path', () => {
      const threat = makeThreat({
        id: 't1', name: 'T1', category: 'adware',
        affectedAssets: [{ type: 'file', path: 'C:\\Safe\\app.exe', name: 'app.exe' }],
      });
      tracker.markFalsePositive(threat, 'inv-1', 'Safe', 'exclude');
      expect(tracker.isFalsePositive(threat)).toBe(true);
    });

    it('computes summary', () => {
      const threat = makeSpywareThreat();
      tracker.markFalsePositive(threat, 'inv-1', 'Safe', 'mark_safe');
      tracker.markFalsePositive(threat, 'inv-1', 'Safe', 'whitelist');
      const summary = tracker.getSummary();
      expect(summary.totalFalsePositives).toBe(2);
      expect(summary.markSafeCount).toBe(1);
      expect(summary.whitelistCount).toBe(1);
    });

    it('removes false positive entry', () => {
      const threat = makeSpywareThreat();
      const entry = tracker.markFalsePositive(threat, 'inv-1', 'Safe', 'mark_safe');
      const removed = tracker.remove(entry.id);
      expect(removed).toBe(true);
      expect(tracker.get(entry.id)).toBeNull();
    });
  });

  // ── ThreatRemediationHistory ──────────────────────────────────────

  describe('ThreatRemediationHistory', () => {
    let history: ThreatRemediationHistory;

    beforeEach(() => {
      history = new ThreatRemediationHistory(100);
    });

    it('records actions', () => {
      history.record('plan-1', 'inv-1', 'quarantine', 'completed', 'evil.exe', 'medium_risk');
      const entries = history.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0]!.action).toBe('quarantine');
    });

    it('computes summary', () => {
      history.record('plan-1', 'inv-1', 'quarantine', 'completed', 'evil.exe', 'medium_risk');
      history.record('plan-1', 'inv-1', 'delete', 'failed', 'evil.exe', 'critical_risk');
      const summary = history.getSummary();
      expect(summary.totalActions).toBe(2);
      expect(summary.successfulActions).toBe(1);
      expect(summary.failedActions).toBe(1);
    });
  });

  // ── ThreatRemediationReportGenerator ──────────────────────────────

  describe('ThreatRemediationReportGenerator', () => {
    let rollbackManager: ThreatRollbackManager;
    let generator: ThreatRemediationReportGenerator;

    beforeEach(() => {
      rollbackManager = new ThreatRollbackManager();
      generator = new ThreatRemediationReportGenerator(rollbackManager);
    });

    it('generates report from plan', () => {
      const plan: RemediationAction[] = [
        makeRemediationAction({ type: 'quarantine', status: 'completed', executedAt: Date.now() - 1000, completedAt: Date.now() }),
      ];
      const planObj = {
        id: 'plan-1', investigationId: 'inv-1', actions: plan, totalActions: 1,
        requiresApproval: false, autoExecutableActions: 0, manualActions: 1,
        estimatedTime: 10000, rollbackAvailable: true, createdAt: Date.now(),
        status: 'completed' as const, summary: 'Test plan',
      };
      const report = generator.generate(planObj, 'free');
      expect(report.planId).toBe('plan-1');
      expect(report.actionsTaken.length).toBeGreaterThan(0);
      expect(report.summary).toBeTruthy();
      expect(report.details).toBeTruthy();
    });
  });

  // ── ThreatConfigurationManager ────────────────────────────────────

  describe('ThreatConfigurationManager', () => {
    it('uses defaults', () => {
      const config = new ThreatConfigurationManager();
      expect(config.isEnabled()).toBe(true);
      expect(config.isQuarantineEnabled()).toBe(true);
    });

    it('accepts overrides', () => {
      const config = new ThreatConfigurationManager({ enabled: false, quarantineEnabled: false });
      expect(config.isEnabled()).toBe(false);
      expect(config.isQuarantineEnabled()).toBe(false);
    });

    it('validates config', () => {
      expect(() => new ThreatConfigurationManager({ maxConcurrentActions: 0 })).toThrow();
    });
  });

  // ── ThreatRemediationEngine (Integration) ─────────────────────────

  describe('ThreatRemediationEngine (Integration)', () => {
    let engine: ThreatRemediationEngine;

    beforeEach(() => {
      engine = new ThreatRemediationEngine();
    });

    it('creates plan from investigation', () => {
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      const plan = engine.createPlan(investigation, [threat]);
      expect(plan).toBeTruthy();
      expect(plan.actions.length).toBeGreaterThan(0);
    });

    it('marks false positive', () => {
      const threat = makeSpywareThreat();
      const result = engine.markFalsePositive(threat, 'inv-1', 'Safe app', 'mark_safe');
      expect(result).toBe(true);
      expect(engine.isFalsePositive(threat)).toBe(true);
    });

    it('generates report', () => {
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      const plan = engine.createPlan(investigation, [threat]);
      const report = engine.generateReport(plan.id);
      expect(report).not.toBeNull();
      expect(report!.summary).toBeTruthy();
    });

    it('provides dashboard data', () => {
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      engine.createPlan(investigation, [threat]);
      const dashboard = engine.getDashboard();
      expect(dashboard.summary.totalPlans).toBeGreaterThan(0);
    });

    it('provides history', () => {
      const history = engine.getHistory();
      expect(history).toBeTruthy();
      expect(history.totalActions).toBe(0);
    });

    it('handles empty threats', () => {
      const investigation = makeInvestigation([]);
      const plan = engine.createPlan(investigation, []);
      expect(plan.actions.length).toBe(0);
    });
  });

  // ── Event Bus ─────────────────────────────────────────────────────

  describe('RemediationEventBus', () => {
    it('emits plan created event', () => {
      let received = false;
      const unsub = remediationEventBus.subscribe((event) => {
        if (event.type === 'plan_created') received = true;
      });
      remediationEventBus.emitPlanCreated('plan-1', 'inv-1', 'Test');
      expect(received).toBe(true);
      unsub();
    });

    it('supports unsubscribe', () => {
      let count = 0;
      const unsub = remediationEventBus.subscribe(() => { count++; });
      remediationEventBus.emitPlanCreated('p1', 'i1');
      unsub();
      remediationEventBus.emitPlanCreated('p2', 'i2');
      expect(count).toBe(1);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles disabled engine', () => {
      const engine = new ThreatRemediationEngine({ enabled: false });
      // Engine still creates plans but they should note disabled state
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      const plan = engine.createPlan(investigation, [threat]);
      expect(plan).toBeTruthy();
    });

    it('handles disabled quarantine', () => {
      const engine = new ThreatRemediationEngine({ quarantineEnabled: false });
      const threat = makeSpywareThreat();
      const investigation = makeInvestigation([threat]);
      const plan = engine.createPlan(investigation, [threat]);
      // Quarantine actions should still be in the plan
      expect(plan.actions.length).toBeGreaterThan(0);
    });

    it('handles multiple threats in one plan', () => {
      const engine = new ThreatRemediationEngine();
      const t1 = makeSpywareThreat();
      const t2 = makeAdwareThreat();
      const investigation = makeInvestigation([t1, t2]);
      const plan = engine.createPlan(investigation, [t1, t2]);
      expect(plan.actions.length).toBeGreaterThan(1);
    });
  });
});
