/**
 * AI Threat Investigation — Comprehensive Tests
 *
 * Tests:
 *   - Threat correlation (related detections → single investigation)
 *   - Timeline generation
 *   - Knowledge base lookup
 *   - Explanation generation
 *   - Report generation
 *   - False-positive handling
 *   - Graph generation
 *   - Edge cases
 *   - Dashboard data
 *   - History tracking
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ThreatInvestigationEngine } from '../ThreatInvestigationEngine';
import { ThreatKnowledgeBase } from '../ThreatKnowledgeBase';
import { ThreatSeverityEngine } from '../ThreatSeverityEngine';
import { ThreatConfidenceEngine } from '../ThreatConfidenceEngine';
import { ThreatEvidenceCollector } from '../ThreatEvidenceCollector';
import { ThreatTimelineBuilder } from '../ThreatTimelineBuilder';
import { ThreatCorrelationEngine } from '../ThreatCorrelationEngine';
import { ThreatRelationshipGraphBuilder } from '../ThreatRelationshipGraph';
import { ThreatExplanationEngine } from '../ThreatExplanationEngine';
import { ThreatSummaryBuilder } from '../ThreatSummaryBuilder';
import { ThreatRecommendationEngine } from '../ThreatRecommendationEngine';
import { ThreatContextBuilder } from '../ThreatContextBuilder';
import { ThreatReportGenerator } from '../ThreatReportGenerator';
import { ThreatHistory } from '../ThreatHistory';
import { ThreatDashboardProvider } from '../ThreatDashboardProvider';
import { ThreatConfigurationManager } from '../ThreatConfiguration';
import { threatEventBus } from '../ThreatEvents';
import type { Threat, SecuritySnapshot, SecurityHistorySummary, InvestigationInput } from '../types';
import type { Threat as SecurityThreat } from '../../security-center/types';

// ── Mock Threat Factory ─────────────────────────────────────────────

function makeThreat(overrides: Partial<SecurityThreat> & { id: string; name: string; category: SecurityThreat['category'] }): SecurityThreat {
  const now = Date.now();
  return {
    severity: 'medium',
    confidence: 0.7,
    confidenceLabel: 'high',
    risk: 'moderate',
    status: 'active',
    evidence: [],
    detectionSource: 'test-provider',
    detectionTime: now,
    recommendation: 'Review and monitor.',
    explanation: 'Threat detected by provider analysis.',
    mitreAttack: null,
    affectedAssets: [],
    requiresRestart: false,
    reversible: true,
    canRemediate: false,
    ...overrides,
  } as SecurityThreat;
}

function makeSpywareThreat(): SecurityThreat {
  return makeThreat({
    id: 'threat-spyware-1',
    name: 'Spyware behavior: keylogger.exe',
    category: 'spyware',
    severity: 'high',
    confidence: 0.85,
    risk: 'high',
    evidence: [
      { source: 'spyware-detection', type: 'keyboard_hook', value: 'keylogger.exe', description: 'Keyboard hook registered', timestamp: Date.now() - 5000 },
      { source: 'spyware-detection', type: 'clipboard_monitoring', value: 'keylogger.exe', description: 'Clipboard monitoring detected', timestamp: Date.now() - 4000 },
      { source: 'spyware-detection', type: 'screen_capture', value: 'keylogger.exe', description: 'Screen capture API called', timestamp: Date.now() - 3000 },
    ],
    mitreAttack: { tactic: 'Collection', technique: 'Keylogging', reference: 'https://attack.mitre.org/techniques/T1056/001' },
    affectedAssets: [{ type: 'process', path: 'C:\\Temp\\keylogger.exe', name: 'keylogger.exe', pid: 1234 }],
  });
}

function makePowerShellThreat(): SecurityThreat {
  return makeThreat({
    id: 'threat-powershell-1',
    name: 'Suspicious PowerShell: evil.ps1',
    category: 'unsafe_script',
    severity: 'high',
    confidence: 0.9,
    risk: 'high',
    evidence: [
      { source: 'powershell-detection', type: 'encoded_command', value: '-enc', description: 'Encoded PowerShell command', timestamp: Date.now() - 2000 },
      { source: 'powershell-detection', type: 'download_cradle', value: 'DownloadString', description: 'DownloadString — remote script download', timestamp: Date.now() - 1500 },
    ],
    mitreAttack: { tactic: 'Execution', technique: 'PowerShell', reference: 'https://attack.mitre.org/techniques/T1059/001' },
    affectedAssets: [{ type: 'file', path: 'C:\\Temp\\evil.ps1', name: 'evil.ps1' }],
  });
}

function makeScheduledTaskThreat(): SecurityThreat {
  return makeThreat({
    id: 'threat-task-1',
    name: 'Suspicious scheduled task: evil_task',
    category: 'suspicious_scheduled_task',
    severity: 'medium',
    confidence: 0.7,
    risk: 'moderate',
    evidence: [
      { source: 'scheduled-task', type: 'hidden_task', value: 'evil_task', description: 'Task is hidden from Task Scheduler UI', timestamp: Date.now() - 1000 },
      { source: 'scheduled-task', type: 'no_author', value: 'evil_task', description: 'Task has no author metadata', timestamp: Date.now() - 900 },
    ],
    mitreAttack: { tactic: 'Persistence', technique: 'Scheduled Task/Job', reference: 'https://attack.mitre.org/techniques/T1053' },
    affectedAssets: [{ type: 'scheduled_task', path: '\\evil', name: 'evil_task' }],
  });
}

function makeAdwareThreat(): SecurityThreat {
  return makeThreat({
    id: 'threat-adware-1',
    name: 'Adware detected: adware.exe',
    category: 'adware',
    severity: 'low',
    confidence: 0.6,
    risk: 'low',
    evidence: [
      { source: 'adware-detection', type: 'ad_injection', value: 'adware.exe', description: 'Ad injection detected', timestamp: Date.now() },
      { source: 'adware-detection', type: 'popup_generator', value: 'adware.exe', description: 'Popup generation detected', timestamp: Date.now() },
    ],
    mitreAttack: null,
    affectedAssets: [{ type: 'file', path: 'C:\\Program Files\\AdwareApp\\adware.exe', name: 'adware.exe' }],
  });
}

function makeSnapshot(threats: SecurityThreat[]): SecuritySnapshot {
  return {
    id: 'snapshot-test',
    timestamp: Date.now(),
    threats,
    securityScore: 75,
    threatScore: 40,
    riskScore: 30,
    exposureScore: 20,
    confidenceScore: 80,
    providerStatuses: [],
    protectionStatus: {
      realTimeProtection: false,
      definitionsActive: true,
      providersActive: 5,
      providersTotal: 6,
      lastScanStatus: 'completed',
      overallProtected: true,
    },
    definitionsVersion: '1.0.0',
    lastScan: Date.now(),
    lastUpdate: Date.now(),
    capabilities: [],
    historySummary: null,
  };
}

function makeHistorySummary(): SecurityHistorySummary {
  return {
    totalScans: 10,
    lastScanDate: Date.now(),
    totalThreatsDetected: 5,
    totalThreatsResolved: 3,
    averageScanDuration: 5000,
    lastThreatDetectedAt: Date.now(),
  };
}

function makeInput(threats: SecurityThreat[], overrides?: Partial<InvestigationInput>): InvestigationInput {
  return {
    threats,
    snapshot: makeSnapshot(threats),
    historySummary: makeHistorySummary(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('AI Threat Investigation', () => {

  // ── ThreatKnowledgeBase ───────────────────────────────────────────

  describe('ThreatKnowledgeBase', () => {
    const kb = new ThreatKnowledgeBase();

    it('returns entry for every threat category', () => {
      const categories = kb.getCategories();
      expect(categories.length).toBeGreaterThan(15);
      for (const cat of categories) {
        const entry = kb.get(cat);
        expect(entry).not.toBeNull();
        expect(entry!.userFriendlyName).toBeTruthy();
        expect(entry!.whatIsIt).toBeTruthy();
        expect(entry!.whyDangerous).toBeTruthy();
      }
    });

    it('returns null for unknown category', () => {
      expect(kb.get('nonexistent' as never)).toBeNull();
    });

    it('provides common indicators for spyware', () => {
      const indicators = kb.getCommonIndicators('spyware');
      expect(indicators.length).toBeGreaterThan(3);
      expect(indicators.some((i) => i.toLowerCase().includes('keyboard'))).toBe(true);
    });

    it('provides false-positive scenarios', () => {
      const fps = kb.getFalsePositiveScenarios('spyware');
      expect(fps.length).toBeGreaterThan(0);
    });

    it('provides MITRE techniques', () => {
      const mitre = kb.getMitreTechniques('spyware');
      expect(mitre.length).toBeGreaterThan(0);
      expect(mitre.some((m) => m.includes('T'))).toBe(true);
    });
  });

  // ── ThreatSeverityEngine ──────────────────────────────────────────

  describe('ThreatSeverityEngine', () => {
    const engine = new ThreatSeverityEngine();

    it('returns info for empty threats', () => {
      const result = engine.compute([]);
      expect(result.level).toBe('info');
      expect(result.score).toBe(0);
    });

    it('computes high severity for spyware threat', () => {
      const result = engine.compute([makeSpywareThreat()]);
      expect(result.score).toBeGreaterThan(30);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('amplifies severity with correlated threats', () => {
      const single = engine.compute([makeSpywareThreat()]);
      const multi = engine.compute([makeSpywareThreat(), makePowerShellThreat(), makeScheduledTaskThreat()]);
      expect(multi.score).toBeGreaterThan(single.score);
    });

    it('includes reasoning', () => {
      const result = engine.compute([makeSpywareThreat()]);
      expect(result.reasoning).toContain('severity');
      expect(result.reasoning.length).toBeGreaterThan(20);
    });
  });

  // ── ThreatConfidenceEngine ────────────────────────────────────────

  describe('ThreatConfidenceEngine', () => {
    const engine = new ThreatConfidenceEngine();

    it('returns very_low for empty threats', () => {
      const result = engine.compute([], 0, []);
      expect(result.score).toBe(0);
      expect(result.label).toBe('very_low');
    });

    it('computes confidence with factors', () => {
      const result = engine.compute([makeSpywareThreat()], 2, []);
      expect(result.score).toBeGreaterThan(0);
      expect(result.factors.length).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();
    });

    it('reduces confidence with mitigating factors', () => {
      const withoutMitigating = engine.compute([makeSpywareThreat()], 0, []);
      const withMitigating = engine.compute([makeSpywareThreat()], 0, ['Low evidence count', 'Unknown publisher']);
      expect(withMitigating.score).toBeLessThanOrEqual(withoutMitigating.score);
    });
  });

  // ── ThreatEvidenceCollector ───────────────────────────────────────

  describe('ThreatEvidenceCollector', () => {
    const collector = new ThreatEvidenceCollector();

    it('collects evidence from multiple threats', () => {
      const result = collector.collect([makeSpywareThreat(), makePowerShellThreat()]);
      expect(result.total).toBe(5); // 3 + 2
      expect(Object.keys(result.bySource).length).toBe(2);
    });

    it('assesses evidence quality', () => {
      const result = collector.collect([makeSpywareThreat(), makePowerShellThreat(), makeScheduledTaskThreat()]);
      expect(['weak', 'moderate', 'strong', 'very_strong']).toContain(result.evidenceQuality);
    });

    it('finds strongest evidence', () => {
      const result = collector.collect([makeSpywareThreat()]);
      expect(result.strongestEvidence).not.toBeNull();
    });

    it('handles empty threats', () => {
      const result = collector.collect([]);
      expect(result.total).toBe(0);
      expect(result.strongestEvidence).toBeNull();
    });
  });

  // ── ThreatTimelineBuilder ─────────────────────────────────────────

  describe('ThreatTimelineBuilder', () => {
    const builder = new ThreatTimelineBuilder();

    it('builds chronological timeline', () => {
      const events = builder.build([makeSpywareThreat(), makePowerShellThreat()]);
      expect(events.length).toBeGreaterThan(0);
      // Verify chronological order
      for (let i = 1; i < events.length; i++) {
        expect(events[i]!.timestamp).toBeGreaterThanOrEqual(events[i - 1]!.timestamp);
      }
    });

    it('includes detection events', () => {
      const events = builder.build([makeSpywareThreat()]);
      const detectionEvents = events.filter((e) => e.type === 'detection');
      expect(detectionEvents.length).toBeGreaterThan(0);
    });

    it('maps evidence types to timeline types', () => {
      const events = builder.build([makePowerShellThreat()]);
      const executionEvents = events.filter((e) => e.type === 'execution');
      expect(executionEvents.length).toBeGreaterThan(0);
    });

    it('handles empty threats', () => {
      const events = builder.build([]);
      expect(events.length).toBe(0);
    });
  });

  // ── ThreatCorrelationEngine ───────────────────────────────────────

  describe('ThreatCorrelationEngine', () => {
    const engine = new ThreatCorrelationEngine();

    it('returns single group for single threat', () => {
      const groups = engine.correlate([makeSpywareThreat()], 3600000);
      expect(groups.length).toBe(1);
      expect(groups[0]!.threatIds.length).toBe(1);
    });

    it('correlates threats with shared assets', () => {
      const t1 = makeThreat({
        id: 't1', name: 'Threat 1', category: 'malware',
        affectedAssets: [{ type: 'file', path: 'C:\\Temp\\evil.exe', name: 'evil.exe' }],
        evidence: [{ source: 'test', type: 'test', value: 'C:\\Temp\\evil.exe', description: 'test', timestamp: Date.now() }],
      });
      const t2 = makeThreat({
        id: 't2', name: 'Threat 2', category: 'backdoor',
        affectedAssets: [{ type: 'file', path: 'C:\\Temp\\evil.exe', name: 'evil.exe' }],
        evidence: [{ source: 'test', type: 'test', value: 'C:\\Temp\\evil.exe', description: 'test', timestamp: Date.now() }],
      });
      const groups = engine.correlate([t1, t2], 3600000);
      expect(groups.length).toBe(1);
      expect(groups[0]!.threatIds.length).toBe(2);
    });

    it('correlates by MITRE tactic chaining', () => {
      const t1 = makeThreat({
        id: 't1', name: 'Execution', category: 'unsafe_script',
        mitreAttack: { tactic: 'Execution', technique: 'PowerShell', reference: 'https://attack.mitre.org/techniques/T1059/001' },
        evidence: [], detectionTime: Date.now(),
      });
      const t2 = makeThreat({
        id: 't2', name: 'Persistence', category: 'suspicious_scheduled_task',
        mitreAttack: { tactic: 'Persistence', technique: 'Scheduled Task/Job', reference: 'https://attack.mitre.org/techniques/T1053' },
        evidence: [], detectionTime: Date.now(),
      });
      const groups = engine.correlate([t1, t2], 3600000);
      expect(groups.length).toBe(1);
      expect(groups[0]!.relationships.length).toBeGreaterThan(0);
    });

    it('correlates by category patterns (script → task)', () => {
      const t1 = makeThreat({
        id: 't1', name: 'Script', category: 'unsafe_script',
        evidence: [], detectionTime: Date.now(),
      });
      const t2 = makeThreat({
        id: 't2', name: 'Task', category: 'suspicious_scheduled_task',
        evidence: [], detectionTime: Date.now(),
      });
      const groups = engine.correlate([t1, t2], 3600000);
      expect(groups.length).toBe(1);
    });

    it('does not correlate threats outside time window', () => {
      const t1 = makeThreat({ id: 't1', name: 'T1', category: 'malware', evidence: [], detectionTime: Date.now() - 7200000 });
      const t2 = makeThreat({ id: 't2', name: 'T2', category: 'malware', evidence: [], detectionTime: Date.now() });
      const groups = engine.correlate([t1, t2], 3600000);
      expect(groups.length).toBe(2);
    });
  });

  // ── ThreatRelationshipGraph ───────────────────────────────────────

  describe('ThreatRelationshipGraphBuilder', () => {
    const builder = new ThreatRelationshipGraphBuilder();

    it('builds graph with nodes and edges', () => {
      const threats = [makeSpywareThreat(), makePowerShellThreat()];
      const rels = [{ fromThreatId: threats[0]!.id, toThreatId: threats[1]!.id, type: 'related_to' as const, description: 'Test', strength: 0.7 }];
      const graph = builder.build(threats, rels, threats[0]!.id);
      expect(graph.totalNodes).toBe(2);
      expect(graph.totalEdges).toBe(1);
      expect(graph.nodes[0]!.isPrimary).toBe(true);
    });

    it('builds clusters for same-category threats', () => {
      const t1 = makeSpywareThreat();
      const t2 = makeThreat({ id: 'threat-spyware-2', name: 'Spyware 2', category: 'spyware', evidence: [], detectionTime: Date.now() });
      const graph = builder.build([t1, t2], [], t1.id);
      expect(graph.clusters.length).toBeGreaterThan(0);
    });
  });

  // ── ThreatExplanationEngine ───────────────────────────────────────

  describe('ThreatExplanationEngine', () => {
    const kb = new ThreatKnowledgeBase();
    const engine = new ThreatExplanationEngine(kb);
    const collector = new ThreatEvidenceCollector();
    const confEngine = new ThreatConfidenceEngine();

    it('generates complete explanation', () => {
      const threats = [makeSpywareThreat()];
      const evidence = collector.collect(threats);
      const confidence = confEngine.compute(threats, 0, []);
      const fp = { couldBeLegitimate: true, reasons: ['Legitimate screen recorder'], confidenceReducingFactors: [], additionalVerificationSteps: ['Verify source'], similarKnownGoodSoftware: ['OBS'] };

      const explanation = engine.explain(threats, evidence, confidence, fp);
      expect(explanation.whatHappened).toBeTruthy();
      expect(explanation.whyDetected).toBeTruthy();
      expect(explanation.evidenceSummary).toBeTruthy();
      expect(explanation.confidenceReasoning).toBeTruthy();
      expect(explanation.userFriendlyExplanation).toBeTruthy();
      expect(explanation.technicalExplanation).toBeTruthy();
      expect(explanation.possibleFalsePositiveFactors.length).toBeGreaterThan(0);
    });

    it('includes knowledge base info in explanation', () => {
      const threats = [makeSpywareThreat()];
      const evidence = collector.collect(threats);
      const confidence = confEngine.compute(threats, 0, []);
      const fp = { couldBeLegitimate: false, reasons: [], confidenceReducingFactors: [], additionalVerificationSteps: [], similarKnownGoodSoftware: [] };

      const explanation = engine.explain(threats, evidence, confidence, fp);
      expect(explanation.whatHappened).toContain('Spyware');
    });
  });

  // ── ThreatSummaryBuilder ──────────────────────────────────────────

  describe('ThreatSummaryBuilder', () => {
    const kb = new ThreatKnowledgeBase();
    const builder = new ThreatSummaryBuilder(kb);

    it('builds summary for single threat', () => {
      const summary = builder.build([makeSpywareThreat()]);
      expect(summary.title).toBeTruthy();
      expect(summary.oneLiner).toBeTruthy();
      expect(summary.threatCount).toBe(1);
      expect(summary.category).toBe('spyware');
    });

    it('builds summary for correlated threats', () => {
      const summary = builder.build([makeSpywareThreat(), makePowerShellThreat()]);
      expect(summary.threatCount).toBe(2);
      expect(summary.title).toContain('Related');
    });
  });

  // ── ThreatRecommendationEngine ────────────────────────────────────

  describe('ThreatRecommendationEngine', () => {
    const kb = new ThreatKnowledgeBase();
    const engine = new ThreatRecommendationEngine(kb);

    it('generates recommendations for spyware', () => {
      const recs = engine.generate([makeSpywareThreat()]);
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.some((r) => r.priority === 'immediate')).toBe(true);
    });

    it('generates different recommendations for different categories', () => {
      const spywareRecs = engine.generate([makeSpywareThreat()]);
      const adwareRecs = engine.generate([makeAdwareThreat()]);
      expect(spywareRecs[0]!.action).not.toBe(adwareRecs[0]!.action);
    });

    it('estimates impact', () => {
      const impact = engine.getEstimatedImpact([makeSpywareThreat()]);
      expect(impact).toBeTruthy();
      expect(impact.length).toBeGreaterThan(10);
    });

    it('estimates recovery', () => {
      const recovery = engine.getEstimatedRecovery([makeSpywareThreat()]);
      expect(recovery).toBeTruthy();
      expect(recovery.length).toBeGreaterThan(10);
    });
  });

  // ── ThreatContextBuilder ──────────────────────────────────────────

  describe('ThreatContextBuilder', () => {
    const builder = new ThreatContextBuilder();

    it('builds context from snapshot', () => {
      const threats = [makeSpywareThreat()];
      const context = builder.build(threats, threats, makeSnapshot(threats), makeHistorySummary());
      expect(context.systemState.securityScore).toBe(75);
      expect(context.systemState.providersActive).toBe(5);
    });

    it('extracts process context from threat assets', () => {
      const threats = [makeSpywareThreat()];
      const context = builder.build(threats, threats, makeSnapshot(threats), makeHistorySummary());
      expect(context.processContext).not.toBeNull();
      expect(context.processContext!.processName).toBe('keylogger.exe');
    });

    it('handles null snapshot', () => {
      const threats = [makeSpywareThreat()];
      const context = builder.build(threats, threats, null, null);
      expect(context.systemState.osVersion).toBe('Unknown');
      expect(context.historicalContext).toBeNull();
    });
  });

  // ── ThreatReportGenerator ─────────────────────────────────────────

  describe('ThreatReportGenerator', () => {
    const generator = new ThreatReportGenerator();

    it('generates comprehensive report', () => {
      const engine = new ThreatInvestigationEngine();
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      expect(investigations.length).toBe(1);
      const inv = investigations[0]!;
      const report = generator.generate(inv, [makeSpywareThreat()], inv.evidence, inv.timeline, inv.recommendedActions, inv.falsePositiveAnalysis, inv.affectedComponents);
      expect(report.investigationId).toBe(inv.id);
      expect(report.executiveSummary).toBeTruthy();
      expect(report.technicalDetails).toBeTruthy();
      expect(report.evidence.items.length).toBeGreaterThan(0);
      expect(report.timeline.length).toBeGreaterThan(0);
      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.riskScore).toBeGreaterThan(0);
    });

    it('assesses evidence significance', () => {
      const engine = new ThreatInvestigationEngine();
      const investigations = engine.investigate(makeInput([makePowerShellThreat()]));
      const inv = investigations[0]!;
      const report = generator.generate(inv, [makePowerShellThreat()], inv.evidence, inv.timeline, inv.recommendedActions, inv.falsePositiveAnalysis, inv.affectedComponents);
      const criticalItems = report.evidence.items.filter((i) => i.significance === 'critical');
      expect(criticalItems.length).toBeGreaterThan(0);
    });
  });

  // ── ThreatHistory ─────────────────────────────────────────────────

  describe('ThreatHistory', () => {
    let history: ThreatHistory;

    beforeEach(() => {
      history = new ThreatHistory(100);
    });

    it('records creation', () => {
      history.recordCreated('inv-1');
      const entries = history.getEntries();
      expect(entries.length).toBe(1);
      expect(entries[0]!.action).toBe('created');
    });

    it('records resolution', () => {
      history.recordCreated('inv-1');
      history.recordResolved('inv-1', 'Fixed');
      const entries = history.getEntriesForInvestigation('inv-1');
      expect(entries.length).toBe(2);
      expect(entries[1]!.action).toBe('resolved');
    });

    it('computes summary', () => {
      history.recordCreated('inv-1');
      history.recordCreated('inv-2');
      history.recordResolved('inv-1');
      history.recordFalsePositive('inv-2');
      const summary = history.getSummary();
      expect(summary.totalInvestigations).toBe(2);
      expect(summary.resolvedCount).toBe(1);
      expect(summary.falsePositiveCount).toBe(1);
    });
  });

  // ── ThreatDashboardProvider ───────────────────────────────────────

  describe('ThreatDashboardProvider', () => {
    const provider = new ThreatDashboardProvider();

    it('builds dashboard from investigations', () => {
      const engine = new ThreatInvestigationEngine();
      engine.investigate(makeInput([makeSpywareThreat(), makeAdwareThreat()]));
      const dashboard = provider.build(engine.getAllInvestigations());
      expect(dashboard.summary.totalInvestigations).toBeGreaterThan(0);
      expect(dashboard.severityDistribution).toBeDefined();
      expect(dashboard.categoryDistribution).toBeDefined();
    });

    it('computes correlation stats', () => {
      const engine = new ThreatInvestigationEngine();
      engine.investigate(makeInput([makeSpywareThreat(), makePowerShellThreat(), makeScheduledTaskThreat()]));
      const dashboard = provider.build(engine.getAllInvestigations());
      expect(dashboard.correlationStats).toBeDefined();
    });
  });

  // ── ThreatInvestigationEngine (Integration) ───────────────────────

  describe('ThreatInvestigationEngine (Integration)', () => {
    let engine: ThreatInvestigationEngine;

    beforeEach(() => {
      engine = new ThreatInvestigationEngine();
    });

    it('creates investigation for single threat', () => {
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      expect(investigations.length).toBe(1);
      const inv = investigations[0]!;
      expect(inv.summary.title).toBeTruthy();
      expect(inv.explanation.whatHappened).toBeTruthy();
      expect(inv.severity.level).toBeTruthy();
      expect(inv.confidence.score).toBeGreaterThan(0);
      expect(inv.evidence.total).toBeGreaterThan(0);
      expect(inv.timeline.length).toBeGreaterThan(0);
      expect(inv.recommendedActions.length).toBeGreaterThan(0);
      expect(inv.estimatedImpact).toBeTruthy();
      expect(inv.estimatedRecovery).toBeTruthy();
      expect(inv.falsePositiveAnalysis).toBeDefined();
      expect(inv.status).toBe('open');
    });

    it('correlates related threats into single investigation', () => {
      const t1 = makePowerShellThreat();
      const t2 = makeScheduledTaskThreat();
      const investigations = engine.investigate(makeInput([t1, t2]));
      // Should correlate script → task
      expect(investigations.length).toBe(1);
      expect(investigations[0]!.threatIds.length).toBe(2);
    });

    it('creates separate investigations for unrelated threats', () => {
      const t1 = makeSpywareThreat();
      const t2 = makeAdwareThreat();
      // Make them far apart in time
      (t2 as Threat).detectionTime = Date.now() - 7200000;
      const investigations = engine.investigate(makeInput([t1, t2]));
      expect(investigations.length).toBe(2);
    });

    it('generates report automatically', () => {
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      const report = engine.getReport(investigations[0]!.id);
      expect(report).not.toBeNull();
      expect(report!.executiveSummary).toBeTruthy();
    });

    it('handles empty threats', () => {
      const investigations = engine.investigate(makeInput([]));
      expect(investigations.length).toBe(0);
    });

    it('updates investigation status', () => {
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      const invId = investigations[0]!.id;
      engine.updateStatus(invId, 'resolved', 'Fixed');
      const inv = engine.getInvestigation(invId);
      expect(inv!.status).toBe('resolved');
    });

    it('marks as false positive', () => {
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      const invId = investigations[0]!.id;
      engine.updateStatus(invId, 'false_positive', 'Was legitimate screen recorder');
      const inv = engine.getInvestigation(invId);
      expect(inv!.status).toBe('false_positive');
    });

    it('provides dashboard data', () => {
      engine.investigate(makeInput([makeSpywareThreat(), makeAdwareThreat()]));
      const dashboard = engine.getDashboard();
      expect(dashboard.summary.totalInvestigations).toBeGreaterThan(0);
    });

    it('provides history data', () => {
      engine.investigate(makeInput([makeSpywareThreat()]));
      const history = engine.getHistory();
      expect(history.totalInvestigations).toBeGreaterThan(0);
    });

    it('includes false-positive analysis in investigation', () => {
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      const fp = investigations[0]!.falsePositiveAnalysis;
      expect(fp.couldBeLegitimate).toBeDefined();
      expect(fp.additionalVerificationSteps.length).toBeGreaterThan(0);
    });

    it('includes MITRE ATT&CK mappings', () => {
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      expect(investigations[0]!.mitreAttack.length).toBeGreaterThan(0);
    });

    it('includes affected components', () => {
      const investigations = engine.investigate(makeInput([makeSpywareThreat()]));
      expect(investigations[0]!.affectedComponents.length).toBeGreaterThan(0);
    });

    it('respects disabled configuration', () => {
      const disabledEngine = new ThreatInvestigationEngine({ enabled: false });
      const investigations = disabledEngine.investigate(makeInput([makeSpywareThreat()]));
      expect(investigations.length).toBe(0);
    });

    it('respects disabled correlation', () => {
      const noCorrEngine = new ThreatInvestigationEngine({ enableCorrelation: false });
      const investigations = noCorrEngine.investigate(makeInput([makePowerShellThreat(), makeScheduledTaskThreat()]));
      // Without correlation, each threat is its own investigation
      expect(investigations.length).toBe(2);
    });
  });

  // ── ThreatConfiguration ───────────────────────────────────────────

  describe('ThreatConfigurationManager', () => {
    it('uses defaults', () => {
      const config = new ThreatConfigurationManager();
      expect(config.isEnabled()).toBe(true);
      expect(config.isCorrelationEnabled()).toBe(true);
    });

    it('accepts overrides', () => {
      const config = new ThreatConfigurationManager({ enabled: false, maxInvestigations: 50 });
      expect(config.isEnabled()).toBe(false);
      expect(config.getMaxInvestigations()).toBe(50);
    });

    it('validates config', () => {
      expect(() => new ThreatConfigurationManager({ minConfidenceThreshold: 2 })).toThrow();
      expect(() => new ThreatConfigurationManager({ maxInvestigations: 0 })).toThrow();
    });

    it('updates config', () => {
      const config = new ThreatConfigurationManager();
      config.update({ enabled: false });
      expect(config.isEnabled()).toBe(false);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles threat with no evidence', () => {
      const engine = new ThreatInvestigationEngine();
      const threat = makeThreat({ id: 't-empty', name: 'Empty', category: 'unknown', evidence: [] });
      const investigations = engine.investigate(makeInput([threat]));
      expect(investigations.length).toBe(1);
      expect(investigations[0]!.evidence.total).toBe(0);
    });

    it('handles threat with no MITRE mapping', () => {
      const engine = new ThreatInvestigationEngine();
      const threat = makeThreat({ id: 't-no-mitre', name: 'No MITRE', category: 'pup', evidence: [{ source: 'test', type: 'test', value: 'test', description: 'test', timestamp: Date.now() }] });
      const investigations = engine.investigate(makeInput([threat]));
      expect(investigations[0]!.mitreAttack.length).toBe(0);
    });

    it('handles threat with no affected assets', () => {
      const engine = new ThreatInvestigationEngine();
      const threat = makeThreat({ id: 't-no-assets', name: 'No Assets', category: 'adware', affectedAssets: [], evidence: [{ source: 'test', type: 'test', value: 'test', description: 'test', timestamp: Date.now() }] });
      const investigations = engine.investigate(makeInput([threat]));
      expect(investigations[0]!.affectedComponents.length).toBe(0);
    });

    it('handles null snapshot and history', () => {
      const engine = new ThreatInvestigationEngine();
      const investigations = engine.investigate({
        threats: [makeSpywareThreat()],
        snapshot: null,
        historySummary: null,
      });
      expect(investigations.length).toBe(1);
    });

    it('handles many threats', () => {
      const engine = new ThreatInvestigationEngine();
      const threats: SecurityThreat[] = [];
      for (let i = 0; i < 20; i++) {
        threats.push(makeThreat({
          id: `t-${i}`,
          name: `Threat ${i}`,
          category: 'malware',
          evidence: [{ source: 'test', type: 'test', value: `C:\\Temp\\file${i}.exe`, description: `test ${i}`, timestamp: Date.now() }],
          detectionTime: Date.now() - i * 1000,
        }));
      }
      const investigations = engine.investigate(makeInput(threats));
      expect(investigations.length).toBeGreaterThan(0);
    });
  });

  // ── Event Bus ─────────────────────────────────────────────────────

  describe('ThreatEventBus', () => {
    it('emits investigation created event', () => {
      let received = false;
      const unsub = threatEventBus.subscribe((event) => {
        if (event.type === 'investigation_created') received = true;
      });
      threatEventBus.emitInvestigationCreated('test-inv', 'Test');
      expect(received).toBe(true);
      unsub();
    });

    it('supports unsubscribe', () => {
      let count = 0;
      const unsub = threatEventBus.subscribe(() => { count++; });
      threatEventBus.emitInvestigationCreated('test-1');
      unsub();
      threatEventBus.emitInvestigationCreated('test-2');
      expect(count).toBe(1);
    });
  });
});
