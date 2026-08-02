/**
 * Real-Time AI Protection — Comprehensive Tests
 *
 * Tests:
 *   - Event pipeline (normalize, classify, filter, process)
 *   - Protection modes (disabled, passive, interactive, maximum, enterprise)
 *   - State machine transitions
 *   - Rule engine evaluation
 *   - Action queue (priority, overflow, retry)
 *   - Notifications
 *   - Telemetry
 *   - Session tracking
 *   - Health checks
 *   - Diagnostics
 *   - Statistics
 *   - History
 *   - Dashboard
 *   - High event volume
 *   - Provider failures
 *   - Queue overflow
 *   - Rapid process creation
 *   - Multiple simultaneous events
 *   - Long-running stability
 *   - Resource usage
 *   - Regression
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RealTimeProtectionEngine } from '../RealTimeProtectionEngine';
import { ProtectionStateMachine } from '../ProtectionStateMachine';
import { ProtectionRuleEngine } from '../ProtectionRuleEngine';
import { ProtectionActionQueue } from '../ProtectionActionQueue';
import { ProtectionNotificationCenter } from '../ProtectionNotificationCenter';
import { ProtectionTelemetryCollector } from '../ProtectionTelemetry';
import { ProtectionSessionManager } from '../ProtectionSession';
import { ProtectionHealthChecker } from '../ProtectionHealth';
import { ProtectionDiagnosticsRunner } from '../ProtectionDiagnostics';
import { ProtectionStatisticsCollector } from '../ProtectionStatistics';
import { ProtectionHistoryManager } from '../ProtectionHistory';
import { ProtectionManager } from '../ProtectionManager';
import { ProtectionPolicyManager } from '../ProtectionPolicy';
import { ProtectionConfigurationManager } from '../ProtectionConfiguration';
import { ProtectionFactory } from '../ProtectionFactory';
import { protectionEventBus } from '../ProtectionEvents';
import type {
  SystemEvent,
  EventTarget,
  EventMetadata,
  ProtectionRule,
  MonitorConfig,
} from '../types';

// ── Mock Factories ──────────────────────────────────────────────────

function makeEventTarget(overrides: Partial<EventTarget> = {}): EventTarget {
  return {
    type: 'file',
    path: 'C:\\Users\\Test\\Downloads\\test.exe',
    name: 'test.exe',
    ...overrides,
  };
}

function makeEventMetadata(overrides: Partial<EventMetadata> = {}): EventMetadata {
  return {
    operation: 'create',
    details: {},
    ...overrides,
  };
}

function makeMonitorConfigs(): MonitorConfig[] {
  return [
    { type: 'file_system', enabled: true, paths: ['%TEMP%'], filterPatterns: ['*.exe'], priority: 1 },
    { type: 'process', enabled: true, paths: [], filterPatterns: [], priority: 0 },
    { type: 'service', enabled: true, paths: [], filterPatterns: [], priority: 2 },
    { type: 'scheduled_task', enabled: true, paths: [], filterPatterns: [], priority: 2 },
    { type: 'startup', enabled: true, paths: [], filterPatterns: [], priority: 2 },
    { type: 'registry', enabled: true, paths: ['HKCU\\Run'], filterPatterns: [], priority: 2 },
    { type: 'browser', enabled: true, paths: [], filterPatterns: [], priority: 1 },
    { type: 'download', enabled: true, paths: ['%USERPROFILE%\\Downloads'], filterPatterns: ['*.exe'], priority: 1 },
    { type: 'usb', enabled: true, paths: [], filterPatterns: [], priority: 1 },
    { type: 'network', enabled: true, paths: [], filterPatterns: [], priority: 3 },
  ];
}

function makeRule(overrides: Partial<ProtectionRule> = {}): ProtectionRule {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: 'Test Rule',
    description: 'Test rule',
    enabled: true,
    priority: 5,
    conditions: [],
    action: 'monitor',
    mode: 'all',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe('Real-Time AI Protection', () => {

  // ── ProtectionStateMachine ────────────────────────────────────────

  describe('ProtectionStateMachine', () => {
    let sm: ProtectionStateMachine;

    beforeEach(() => {
      sm = new ProtectionStateMachine();
    });

    it('starts in stopped state', () => {
      expect(sm.getState()).toBe('stopped');
    });

    it('transitions from stopped to starting', () => {
      expect(sm.start()).toBe(true);
      expect(sm.getState()).toBe('starting');
    });

    it('transitions from starting to running', () => {
      sm.start();
      expect(sm.completeStart()).toBe(true);
      expect(sm.getState()).toBe('running');
    });

    it('transitions from running to paused', () => {
      sm.start();
      sm.completeStart();
      expect(sm.pause()).toBe(true);
      expect(sm.getState()).toBe('paused');
    });

    it('transitions from paused to running', () => {
      sm.start();
      sm.completeStart();
      sm.pause();
      expect(sm.resume()).toBe(true);
      expect(sm.getState()).toBe('running');
    });

    it('transitions from running to stopped', () => {
      sm.start();
      sm.completeStart();
      expect(sm.stop()).toBe(true);
      expect(sm.getState()).toBe('stopped');
    });

    it('transitions from running to error', () => {
      sm.start();
      sm.completeStart();
      expect(sm.fail('test error')).toBe(true);
      expect(sm.getState()).toBe('error');
    });

    it('transitions from error to restarting', () => {
      sm.start();
      sm.completeStart();
      sm.fail('test error');
      expect(sm.restart()).toBe(true);
      expect(sm.getState()).toBe('restarting');
    });

    it('rejects invalid transitions', () => {
      expect(sm.pause()).toBe(false);
      expect(sm.resume()).toBe(false);
    });

    it('tracks restart attempts', () => {
      sm.start();
      sm.completeStart();
      sm.fail('error 1');
      sm.restart();
      sm.start();
      sm.completeStart();
      sm.fail('error 2');
      sm.restart();
      expect(sm.getRestartAttempts()).toBe(2);
    });

    it('records transition history', () => {
      sm.start();
      sm.completeStart();
      const history = sm.getTransitionHistory();
      expect(history.length).toBe(2);
      expect(history[0]!.from).toBe('stopped');
      expect(history[0]!.to).toBe('starting');
    });
  });

  // ── ProtectionRuleEngine ─────────────────────────────────────────

  describe('ProtectionRuleEngine', () => {
    let engine: ProtectionRuleEngine;

    beforeEach(() => {
      engine = new ProtectionRuleEngine();
    });

    it('returns default monitor action when no rules match', () => {
      const event: SystemEvent = {
        id: 'evt-1',
        type: 'file_created',
        category: 'file_system',
        severity: 'info',
        status: 'pending',
        timestamp: Date.now(),
        source: 'test',
        target: makeEventTarget(),
        metadata: makeEventMetadata(),
        normalized: false,
        classified: false,
        filtered: false,
        processingTime: null,
      };
      const result = engine.evaluate(event, 'passive');
      expect(result.matched).toBe(false);
      expect(result.action).toBe('monitor');
    });

    it('matches path rule', () => {
      engine.addRule(makeRule({
        id: 'rule-path',
        conditions: [{ type: 'path_matches', value: '*Downloads*' }],
        action: 'investigate',
      }));
      const event: SystemEvent = {
        id: 'evt-2',
        type: 'file_created',
        category: 'file_system',
        severity: 'medium',
        status: 'pending',
        timestamp: Date.now(),
        source: 'test',
        target: makeEventTarget({ path: 'C:\\Users\\Test\\Downloads\\evil.exe' }),
        metadata: makeEventMetadata(),
        normalized: false,
        classified: false,
        filtered: false,
        processingTime: null,
      };
      const result = engine.evaluate(event, 'passive');
      expect(result.matched).toBe(true);
      expect(result.action).toBe('investigate');
    });

    it('matches severity rule', () => {
      engine.addRule(makeRule({
        id: 'rule-severity',
        conditions: [{ type: 'severity_above', value: 'high' }],
        action: 'block',
        priority: 10,
      }));
      const event: SystemEvent = {
        id: 'evt-3',
        type: 'process_created',
        category: 'process',
        severity: 'critical',
        status: 'pending',
        timestamp: Date.now(),
        source: 'test',
        target: makeEventTarget({ type: 'process', name: 'evil.exe' }),
        metadata: makeEventMetadata(),
        normalized: false,
        classified: false,
        filtered: false,
        processingTime: null,
      };
      const result = engine.evaluate(event, 'maximum');
      expect(result.matched).toBe(true);
      expect(result.action).toBe('block');
    });

    it('respects mode filter', () => {
      engine.addRule(makeRule({
        id: 'rule-mode',
        conditions: [{ type: 'category_matches', value: 'browser' }],
        action: 'block',
        mode: 'maximum',
      }));
      const event: SystemEvent = {
        id: 'evt-4',
        type: 'browser_extension_installed',
        category: 'browser',
        severity: 'medium',
        status: 'pending',
        timestamp: Date.now(),
        source: 'test',
        target: makeEventTarget({ type: 'browser_extension', name: 'BadExt' }),
        metadata: makeEventMetadata(),
        normalized: false,
        classified: false,
        filtered: false,
        processingTime: null,
      };
      expect(engine.evaluate(event, 'passive').matched).toBe(false);
      expect(engine.evaluate(event, 'maximum').matched).toBe(true);
    });

    it('evaluates rules in priority order', () => {
      engine.setRules([
        makeRule({ id: 'low-priority', priority: 1, conditions: [{ type: 'category_matches', value: 'file_system' }], action: 'monitor' }),
        makeRule({ id: 'high-priority', priority: 10, conditions: [{ type: 'category_matches', value: 'file_system' }], action: 'investigate' }),
      ]);
      const event: SystemEvent = {
        id: 'evt-5',
        type: 'file_created',
        category: 'file_system',
        severity: 'medium',
        status: 'pending',
        timestamp: Date.now(),
        source: 'test',
        target: makeEventTarget(),
        metadata: makeEventMetadata(),
        normalized: false,
        classified: false,
        filtered: false,
        processingTime: null,
      };
      const result = engine.evaluate(event, 'passive');
      expect(result.ruleId).toBe('high-priority');
    });

    it('supports negated conditions', () => {
      engine.addRule(makeRule({
        id: 'rule-negate',
        conditions: [{ type: 'file_in_temp', value: '', negate: true }],
        action: 'allow',
      }));
      const tempEvent: SystemEvent = {
        id: 'evt-temp',
        type: 'file_created',
        category: 'file_system',
        severity: 'info',
        status: 'pending',
        timestamp: Date.now(),
        source: 'test',
        target: makeEventTarget({ path: 'C:\\Temp\\test.exe' }),
        metadata: makeEventMetadata(),
        normalized: false,
        classified: false,
        filtered: false,
        processingTime: null,
      };
      expect(engine.evaluate(tempEvent, 'passive').matched).toBe(false);

      const nonTempEvent: SystemEvent = {
        ...tempEvent,
        target: makeEventTarget({ path: 'C:\\Program Files\\test.exe' }),
      };
      expect(engine.evaluate(nonTempEvent, 'passive').matched).toBe(true);
    });
  });

  // ── ProtectionActionQueue ────────────────────────────────────────

  describe('ProtectionActionQueue', () => {
    let queue: ProtectionActionQueue;

    beforeEach(() => {
      queue = new ProtectionActionQueue(100, 3);
    });

    it('enqueues actions', () => {
      const action = queue.enqueue('evt-1', 'investigate', 'normal');
      expect(action).not.toBeNull();
      expect(action!.status).toBe('queued');
    });

    it('dequeues in priority order', () => {
      queue.enqueue('evt-1', 'investigate', 'low');
      queue.enqueue('evt-2', 'investigate', 'critical');
      queue.enqueue('evt-3', 'investigate', 'normal');
      const first = queue.dequeue();
      expect(first!.priority).toBe('critical');
      const second = queue.dequeue();
      expect(second!.priority).toBe('normal');
    });

    it('respects max concurrent', () => {
      queue.enqueue('evt-1', 'investigate', 'normal');
      queue.enqueue('evt-2', 'investigate', 'normal');
      queue.enqueue('evt-3', 'investigate', 'normal');
      queue.enqueue('evt-4', 'investigate', 'normal');
      queue.dequeue();
      queue.dequeue();
      queue.dequeue();
      expect(queue.dequeue()).toBeNull();
    });

    it('completes actions', () => {
      const action = queue.enqueue('evt-1', 'investigate', 'normal');
      queue.dequeue();
      queue.complete(action!.id, {
        threatDetected: false,
        threatId: null,
        recommendation: null,
        investigationId: null,
        remediationPlanId: null,
        details: 'Done',
      });
    });

    it('retries on failure', () => {
      const action = queue.enqueue('evt-1', 'investigate', 'normal', 3);
      queue.dequeue();
      queue.fail(action!.id, 'Test error');
      expect(queue.getQueueDepth()).toBe(1);
    });

    it('marks as failed after max attempts', () => {
      const action = queue.enqueue('evt-1', 'investigate', 'normal', 1);
      queue.dequeue();
      queue.fail(action!.id, 'Test error');
      expect(queue.getQueueDepth()).toBe(0);
    });

    it('tracks overflow', () => {
      const smallQueue = new ProtectionActionQueue(5, 3);
      for (let i = 0; i < 10; i++) {
        smallQueue.enqueue(`evt-${i}`, 'investigate', 'low');
      }
      expect(smallQueue.getOverflowCount()).toBeGreaterThan(0);
    });

    it('drops lowest priority on overflow', () => {
      const smallQueue = new ProtectionActionQueue(3, 3);
      smallQueue.enqueue('evt-1', 'investigate', 'low');
      smallQueue.enqueue('evt-2', 'investigate', 'low');
      smallQueue.enqueue('evt-3', 'investigate', 'low');
      const critical = smallQueue.enqueue('evt-4', 'investigate', 'critical');
      expect(critical).not.toBeNull();
      expect(smallQueue.getQueueDepth()).toBe(3);
    });
  });

  // ── ProtectionNotificationCenter ─────────────────────────────────

  describe('ProtectionNotificationCenter', () => {
    let center: ProtectionNotificationCenter;

    beforeEach(() => {
      center = new ProtectionNotificationCenter(100);
    });

    it('creates notifications', () => {
      const notif = center.notify('threat_detected', 'high', 'Test', 'Test message');
      expect(notif.id).toBeTruthy();
      expect(notif.read).toBe(false);
    });

    it('marks notifications as read', () => {
      const notif = center.notify('system_alert', 'normal', 'Test', 'Test');
      center.markRead(notif.id);
      expect(center.get(notif.id)!.read).toBe(true);
    });

    it('dismisses notifications', () => {
      const notif = center.notify('system_alert', 'normal', 'Test', 'Test');
      center.dismiss(notif.id);
      expect(center.get(notif.id)!.dismissed).toBe(true);
    });

    it('gets unread notifications', () => {
      center.notify('threat_detected', 'high', 'T1', 'M1');
      center.notify('system_alert', 'normal', 'T2', 'M2');
      const n3 = center.notify('protection_status', 'low', 'T3', 'M3');
      center.markRead(n3.id);
      const unread = center.getUnread();
      expect(unread.length).toBe(2);
    });

    it('computes summary', () => {
      center.notify('threat_detected', 'critical', 'T1', 'M1', { actionRequired: true });
      center.notify('system_alert', 'normal', 'T2', 'M2');
      const summary = center.getSummary();
      expect(summary.total).toBe(2);
      expect(summary.critical).toBe(1);
      expect(summary.actionRequired).toBe(1);
    });

    it('enforces max notifications', () => {
      const small = new ProtectionNotificationCenter(5);
      for (let i = 0; i < 10; i++) {
        small.notify('system_alert', 'low', `T${i}`, `M${i}`);
      }
      expect(small.getAll().length).toBe(5);
    });
  });

  // ── ProtectionTelemetryCollector ─────────────────────────────────

  describe('ProtectionTelemetryCollector', () => {
    let telemetry: ProtectionTelemetryCollector;

    beforeEach(() => {
      telemetry = new ProtectionTelemetryCollector(100, true, 1000);
    });

    afterEach(() => {
      telemetry.stop();
    });

    it('records events', () => {
      telemetry.recordEvent();
      telemetry.recordEvent();
      telemetry.recordEvent();
      telemetry.sample();
      // After sampling, event count resets. Verify sample was recorded.
      expect(telemetry.getSamples().length).toBe(1);
    });

    it('records provider failures', () => {
      telemetry.recordProviderFailure();
      telemetry.recordProviderFailure();
      expect(telemetry.getCurrent().providerFailures).toBe(2);
    });

    it('records dropped events', () => {
      telemetry.recordDroppedEvent();
      expect(telemetry.getCurrent().droppedEvents).toBe(1);
    });

    it('updates CPU and memory usage', () => {
      telemetry.updateCpuUsage(0.5);
      telemetry.updateMemoryUsage(75);
      const current = telemetry.getCurrent();
      expect(current.cpuUsage).toBe(0.5);
      expect(current.memoryUsage).toBe(75);
    });

    it('updates monitor health', () => {
      telemetry.updateMonitorHealth('file_system', true);
      telemetry.updateMonitorHealth('process', false);
      const current = telemetry.getCurrent();
      expect(current.monitorHealth['file_system']).toBe(true);
      expect(current.monitorHealth['process']).toBe(false);
    });

    it('samples and stores history', () => {
      telemetry.updateCpuUsage(1.2);
      telemetry.updateMemoryUsage(80);
      telemetry.recordEvent();
      telemetry.recordEvent();
      const sample = telemetry.sample();
      expect(sample.cpuUsage).toBe(1.2);
      expect(telemetry.getSamples().length).toBe(1);
    });

    it('limits max samples', () => {
      const small = new ProtectionTelemetryCollector(5, false, 1000);
      for (let i = 0; i < 10; i++) {
        small.updateCpuUsage(i);
        small.sample();
      }
      expect(small.getSamples().length).toBe(5);
    });
  });

  // ── ProtectionSessionManager ─────────────────────────────────────

  describe('ProtectionSessionManager', () => {
    let session: ProtectionSessionManager;

    beforeEach(() => {
      session = new ProtectionSessionManager();
    });

    it('starts a session', () => {
      const s = session.start('passive');
      expect(s.id).toBeTruthy();
      expect(s.mode).toBe('passive');
      expect(s.state).toBe('running');
    });

    it('ends a session', () => {
      session.start('passive');
      const ended = session.end();
      expect(ended!.endedAt).not.toBeNull();
      expect(ended!.state).toBe('stopped');
    });

    it('records events and threats', () => {
      session.start('passive');
      session.recordEvent();
      session.recordThreatDetected();
      session.recordThreatBlocked();
      session.recordInvestigation();
      session.recordNotification();
      const s = session.get();
      expect(s!.eventsProcessed).toBe(1);
      expect(s!.threatsDetected).toBe(1);
      expect(s!.threatsBlocked).toBe(1);
      expect(s!.investigationsTriggered).toBe(1);
      expect(s!.notificationsSent).toBe(1);
    });

    it('tracks uptime', () => {
      session.start('passive');
      const uptime = session.getUptime();
      expect(uptime).toBeGreaterThanOrEqual(0);
    });
  });

  // ── ProtectionHealthChecker ──────────────────────────────────────

  describe('ProtectionHealthChecker', () => {
    let checker: ProtectionHealthChecker;

    beforeEach(() => {
      checker = new ProtectionHealthChecker();
    });

    it('reports healthy when everything is fine', () => {
      const stats = {
        totalEvents: 100, eventsByType: {} as never, eventsByCategory: {} as never, eventsBySeverity: {} as never,
        eventsProcessed: 100, eventsFiltered: 0, eventsDropped: 0, threatsDetected: 0, threatsBlocked: 0,
        investigationsTriggered: 0, remediationsTriggered: 0, notificationsSent: 0,
        averageProcessingTime: 10, maxProcessingTime: 50, queueBacklog: 0,
        activeMonitors: 10, totalMonitors: 10, sessionStartTime: Date.now(), uptime: 1000,
      };
      const telemetry = {
        cpuUsage: 0.5, memoryUsage: 80, eventsPerMinute: 10, averageLatencyMs: 100,
        queueDepth: 0, monitorHealth: {} as never, providerFailures: 0, droppedEvents: 0,
        uptime: 1000, timestamp: Date.now(),
      };
      const monitors: never[] = [];
      const report = checker.check(stats, telemetry, monitors, true);
      expect(report.status).toBe('healthy');
    });

    it('reports critical when engine not running', () => {
      const stats = {
        totalEvents: 0, eventsByType: {} as never, eventsByCategory: {} as never, eventsBySeverity: {} as never,
        eventsProcessed: 0, eventsFiltered: 0, eventsDropped: 0, threatsDetected: 0, threatsBlocked: 0,
        investigationsTriggered: 0, remediationsTriggered: 0, notificationsSent: 0,
        averageProcessingTime: 0, maxProcessingTime: 0, queueBacklog: 0,
        activeMonitors: 0, totalMonitors: 10, sessionStartTime: null, uptime: 0,
      };
      const telemetry = {
        cpuUsage: 0, memoryUsage: 0, eventsPerMinute: 0, averageLatencyMs: 0,
        queueDepth: 0, monitorHealth: {} as never, providerFailures: 0, droppedEvents: 0,
        uptime: 0, timestamp: Date.now(),
      };
      const report = checker.check(stats, telemetry, [], false);
      expect(report.status).toBe('critical');
      expect(report.issues.some((i) => i.component === 'engine')).toBe(true);
    });

    it('reports degraded with high queue backlog', () => {
      const stats = {
        totalEvents: 100, eventsByType: {} as never, eventsByCategory: {} as never, eventsBySeverity: {} as never,
        eventsProcessed: 50, eventsFiltered: 0, eventsDropped: 0, threatsDetected: 0, threatsBlocked: 0,
        investigationsTriggered: 0, remediationsTriggered: 0, notificationsSent: 0,
        averageProcessingTime: 100, maxProcessingTime: 500, queueBacklog: 200,
        activeMonitors: 10, totalMonitors: 10, sessionStartTime: Date.now(), uptime: 1000,
      };
      const telemetry = {
        cpuUsage: 0.5, memoryUsage: 80, eventsPerMinute: 10, averageLatencyMs: 100,
        queueDepth: 200, monitorHealth: {} as never, providerFailures: 0, droppedEvents: 0,
        uptime: 1000, timestamp: Date.now(),
      };
      const report = checker.check(stats, telemetry, [], true);
      expect(report.status).toBe('degraded');
      expect(report.issues.some((i) => i.component === 'queue')).toBe(true);
    });
  });

  // ── ProtectionPolicyManager ──────────────────────────────────────

  describe('ProtectionPolicyManager', () => {
    it('disabled mode blocks all actions', () => {
      const policy = new ProtectionPolicyManager({ mode: 'disabled' });
      const event: SystemEvent = {
        id: 'e1', type: 'file_created', category: 'file_system', severity: 'high',
        status: 'pending', timestamp: Date.now(), source: 'test',
        target: makeEventTarget(), metadata: makeEventMetadata(),
        normalized: false, classified: false, filtered: false, processingTime: null,
      };
      expect(policy.shouldInvestigate(event)).toBe(false);
      expect(policy.shouldNotify(event)).toBe(false);
      expect(policy.shouldBlock(event)).toBe(false);
    });

    it('passive mode allows investigation but not blocking', () => {
      const policy = new ProtectionPolicyManager({ mode: 'passive', autoInvestigate: true });
      const event: SystemEvent = {
        id: 'e1', type: 'file_created', category: 'file_system', severity: 'high',
        status: 'pending', timestamp: Date.now(), source: 'test',
        target: makeEventTarget(), metadata: makeEventMetadata(),
        normalized: false, classified: false, filtered: false, processingTime: null,
      };
      expect(policy.shouldInvestigate(event)).toBe(true);
      expect(policy.shouldBlock(event)).toBe(false);
    });

    it('maximum mode allows blocking unsigned executables', () => {
      const policy = new ProtectionPolicyManager({
        mode: 'maximum', blockUnsignedExecutables: true,
      });
      const event: SystemEvent = {
        id: 'e1', type: 'file_created', category: 'file_system', severity: 'medium',
        status: 'pending', timestamp: Date.now(), source: 'test',
        target: makeEventTarget({ signatureStatus: 'unsigned' }),
        metadata: makeEventMetadata(),
        normalized: false, classified: false, filtered: false, processingTime: null,
      };
      expect(policy.shouldBlock(event)).toBe(true);
    });

    it('blocks scripts from temp in maximum mode', () => {
      const policy = new ProtectionPolicyManager({
        mode: 'maximum', blockScriptsFromTemp: true,
      });
      const event: SystemEvent = {
        id: 'e1', type: 'file_created', category: 'file_system', severity: 'medium',
        status: 'pending', timestamp: Date.now(), source: 'test',
        target: makeEventTarget({ path: 'C:\\Temp\\evil.ps1', name: 'evil.ps1' }),
        metadata: makeEventMetadata(),
        normalized: false, classified: false, filtered: false, processingTime: null,
      };
      expect(policy.shouldBlock(event)).toBe(true);
    });

    it('blocks USB auto-run', () => {
      const policy = new ProtectionPolicyManager({
        mode: 'maximum', blockUsbAutoRun: true,
      });
      const event: SystemEvent = {
        id: 'e1', type: 'usb_inserted', category: 'usb', severity: 'medium',
        status: 'pending', timestamp: Date.now(), source: 'test',
        target: makeEventTarget({ type: 'usb_device', name: 'USB Drive' }),
        metadata: makeEventMetadata(),
        normalized: false, classified: false, filtered: false, processingTime: null,
      };
      expect(policy.shouldBlock(event)).toBe(true);
    });
  });

  // ── ProtectionConfigurationManager ───────────────────────────────

  describe('ProtectionConfigurationManager', () => {
    it('uses defaults', () => {
      const config = new ProtectionConfigurationManager();
      expect(config.isEnabled()).toBe(true);
      expect(config.getMode()).toBe('passive');
    });

    it('accepts overrides', () => {
      const config = new ProtectionConfigurationManager({ mode: 'maximum', enabled: false });
      expect(config.getMode()).toBe('maximum');
      expect(config.isEnabled()).toBe(false);
    });

    it('validates config', () => {
      expect(() => new ProtectionConfigurationManager({ maxQueueSize: 5 })).toThrow();
      expect(() => new ProtectionConfigurationManager({ maxConcurrentActions: 0 })).toThrow();
    });

    it('enables and disables monitors', () => {
      const config = new ProtectionConfigurationManager();
      config.disableMonitor('file_system');
      expect(config.getMonitors().find((m) => m.type === 'file_system')!.enabled).toBe(false);
      config.enableMonitor('file_system');
      expect(config.getMonitors().find((m) => m.type === 'file_system')!.enabled).toBe(true);
    });
  });

  // ── ProtectionStatisticsCollector ────────────────────────────────

  describe('ProtectionStatisticsCollector', () => {
    let stats: ProtectionStatisticsCollector;

    beforeEach(() => {
      stats = new ProtectionStatisticsCollector();
    });

    it('records events', () => {
      const event: SystemEvent = {
        id: 'e1', type: 'file_created', category: 'file_system', severity: 'medium',
        status: 'pending', timestamp: Date.now(), source: 'test',
        target: makeEventTarget(), metadata: makeEventMetadata(),
        normalized: false, classified: false, filtered: false, processingTime: null,
      };
      stats.recordEvent(event);
      stats.recordEvent(event);
      const s = stats.getStatistics(5, 10, 0);
      expect(s.totalEvents).toBe(2);
    });

    it('records processing time', () => {
      stats.recordProcessed(100);
      stats.recordProcessed(200);
      const s = stats.getStatistics(0, 0, 0);
      expect(s.eventsProcessed).toBe(2);
      expect(s.averageProcessingTime).toBe(150);
      expect(s.maxProcessingTime).toBe(200);
    });

    it('records threats and blocks', () => {
      stats.recordThreatDetected();
      stats.recordThreatBlocked();
      stats.recordInvestigation();
      stats.recordNotification();
      const s = stats.getStatistics(0, 0, 0);
      expect(s.threatsDetected).toBe(1);
      expect(s.threatsBlocked).toBe(1);
      expect(s.investigationsTriggered).toBe(1);
      expect(s.notificationsSent).toBe(1);
    });
  });

  // ── ProtectionHistoryManager ─────────────────────────────────────

  describe('ProtectionHistoryManager', () => {
    let history: ProtectionHistoryManager;

    beforeEach(() => {
      history = new ProtectionHistoryManager(100);
    });

    it('records events', () => {
      const event: SystemEvent = {
        id: 'e1', type: 'file_created', category: 'file_system', severity: 'medium',
        status: 'analyzed', timestamp: Date.now(), source: 'test',
        target: makeEventTarget(), metadata: makeEventMetadata(),
        normalized: true, classified: true, filtered: false, processingTime: 50,
      };
      history.record(event, 'monitor', false, null, 50);
      expect(history.getEntries().length).toBe(1);
    });

    it('computes summary', () => {
      const event: SystemEvent = {
        id: 'e1', type: 'file_created', category: 'file_system', severity: 'high',
        status: 'threat', timestamp: Date.now(), source: 'test',
        target: makeEventTarget(), metadata: makeEventMetadata(),
        normalized: true, classified: true, filtered: false, processingTime: 100,
      };
      history.record(event, 'block', true, 'threat-1', 100);
      history.record(event, 'investigate', false, null, 50);
      const summary = history.getSummary();
      expect(summary.totalEvents).toBe(2);
      expect(summary.totalThreats).toBe(1);
      expect(summary.totalBlocked).toBe(1);
    });
  });

  // ── ProtectionManager ────────────────────────────────────────────

  describe('ProtectionManager', () => {
    let manager: ProtectionManager;

    beforeEach(() => {
      manager = new ProtectionManager(makeMonitorConfigs());
    });

    it('starts monitors', () => {
      manager.start();
      const active = manager.getActiveMonitors();
      expect(active.length).toBeGreaterThan(0);
    });

    it('stops monitors', () => {
      manager.start();
      manager.stop();
      expect(manager.getActiveMonitors().length).toBe(0);
    });

    it('injects events', () => {
      let received: SystemEvent | null = null;
      manager.setEventCallback((e) => { received = e; });
      manager.start();
      manager.injectEvent('file_created', makeEventTarget(), makeEventMetadata());
      expect(received).not.toBeNull();
      expect(received!.type).toBe('file_created');
    });

    it('pauses and resumes monitors', () => {
      manager.start();
      manager.pause('file_system');
      expect(manager.getMonitor('file_system')!.status).toBe('paused');
      manager.resume('file_system');
      expect(manager.getMonitor('file_system')!.status).toBe('active');
    });

    it('records monitor errors', () => {
      manager.start();
      manager.recordMonitorError('file_system', 'Test error');
      expect(manager.getMonitor('file_system')!.status).toBe('error');
      expect(manager.getMonitor('file_system')!.lastError).toBe('Test error');
    });
  });

  // ── ProtectionDiagnosticsRunner ──────────────────────────────────

  describe('ProtectionDiagnosticsRunner', () => {
    it('runs diagnostics on healthy system', () => {
      const runner = new ProtectionDiagnosticsRunner();
      const report = runner.run({
        isRunning: true, mode: 'passive', activeMonitors: 10, totalMonitors: 10,
        queueDepth: 5, processingCount: 1, overflowCount: 0, droppedCount: 0,
        totalEvents: 100, totalThreats: 0, uptime: 60000, restartAttempts: 0,
      });
      expect(report.overallStatus).toBe('pass');
    });

    it('detects engine failure', () => {
      const runner = new ProtectionDiagnosticsRunner();
      const report = runner.run({
        isRunning: false, mode: 'disabled', activeMonitors: 0, totalMonitors: 10,
        queueDepth: 0, processingCount: 0, overflowCount: 0, droppedCount: 0,
        totalEvents: 0, totalThreats: 0, uptime: 0, restartAttempts: 0,
      });
      expect(report.overallStatus).toBe('fail');
    });
  });

  // ── ProtectionFactory ────────────────────────────────────────────

  describe('ProtectionFactory', () => {
    it('creates all components', () => {
      const components = ProtectionFactory.createComponents();
      expect(components.configManager).toBeDefined();
      expect(components.policyManager).toBeDefined();
      expect(components.stateMachine).toBeDefined();
      expect(components.scheduler).toBeDefined();
      expect(components.ruleEngine).toBeDefined();
      expect(components.actionQueue).toBeDefined();
      expect(components.notificationCenter).toBeDefined();
      expect(components.telemetry).toBeDefined();
      expect(components.session).toBeDefined();
      expect(components.health).toBeDefined();
      expect(components.diagnostics).toBeDefined();
      expect(components.statistics).toBeDefined();
      expect(components.history).toBeDefined();
      expect(components.monitorManager).toBeDefined();
      expect(components.dashboardProvider).toBeDefined();
    });

    it('creates default rules', () => {
      const rules = ProtectionFactory.createDefaultRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r) => r.action === 'block')).toBe(true);
    });
  });

  // ── RealTimeProtectionEngine (Integration) ───────────────────────

  describe('RealTimeProtectionEngine (Integration)', () => {
    let engine: RealTimeProtectionEngine;

    beforeEach(() => {
      engine = new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
    });

    afterEach(() => {
      engine.dispose();
    });

    it('starts and stops', () => {
      expect(engine.start()).toBe(true);
      expect(engine.isRunning()).toBe(true);
      expect(engine.getState()).toBe('running');
      expect(engine.stop()).toBe(true);
      expect(engine.isRunning()).toBe(false);
    });

    it('pauses and resumes', () => {
      engine.start();
      expect(engine.pause()).toBe(true);
      expect(engine.getState()).toBe('paused');
      expect(engine.resume()).toBe(true);
      expect(engine.getState()).toBe('running');
    });

    it('changes mode', () => {
      engine.start();
      engine.setMode('maximum');
      expect(engine.getMode()).toBe('maximum');
    });

    it('processes events', () => {
      engine.start();
      const event = engine.injectEvent(
        'file_created',
        makeEventTarget({ path: 'C:\\Users\\Test\\Downloads\\test.exe', name: 'test.exe' }),
        makeEventMetadata(),
        'medium',
      );
      expect(event.status).not.toBe('pending');
    });

    it('filters events from disabled monitors', () => {
      engine.start();
      engine.disableMonitor('browser');
      const event = engine.injectEvent(
        'browser_extension_installed',
        makeEventTarget({ type: 'browser_extension', name: 'TestExt' }),
        makeEventMetadata(),
        'medium',
      );
      expect(event.status).toBe('filtered');
    });

    it('provides dashboard data', () => {
      engine.start();
      const dashboard = engine.getDashboard();
      expect(dashboard.summary).toBeDefined();
      expect(dashboard.summary.protectionStatus).toBe('running');
    });

    it('provides statistics', () => {
      engine.start();
      engine.injectEvent('file_created', makeEventTarget(), makeEventMetadata(), 'medium');
      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBeGreaterThan(0);
    });

    it('provides health report', () => {
      engine.start();
      const health = engine.getHealth();
      expect(health.status).toBeDefined();
    });

    it('runs diagnostics', () => {
      engine.start();
      const diag = engine.runDiagnostics();
      expect(diag.results.length).toBeGreaterThan(0);
    });

    it('provides session data', () => {
      engine.start();
      const session = engine.getSession();
      expect(session).not.toBeNull();
      expect(session!.mode).toBe('passive');
    });

    it('provides notifications', () => {
      engine.start();
      engine.injectEvent('file_created', makeEventTarget(), makeEventMetadata(), 'high');
      const notifs = engine.getNotifications();
      expect(notifs.length).toBeGreaterThan(0);
    });

    it('provides monitors', () => {
      engine.start();
      const monitors = engine.getMonitors();
      expect(monitors.length).toBe(10);
    });

    it('provides recent events', () => {
      engine.start();
      engine.injectEvent('file_created', makeEventTarget(), makeEventMetadata(), 'medium');
      const events = engine.getRecentEvents();
      expect(events.length).toBeGreaterThan(0);
    });

    it('provides history', () => {
      engine.start();
      engine.injectEvent('file_created', makeEventTarget(), makeEventMetadata(), 'medium');
      const history = engine.getHistory();
      expect(history.totalEvents).toBeGreaterThan(0);
    });

    it('provides telemetry', () => {
      engine.start();
      const telemetry = engine.getTelemetry();
      expect(telemetry).toBeDefined();
      expect(telemetry.timestamp).toBeGreaterThan(0);
    });
  });

  // ── High Event Volume ────────────────────────────────────────────

  describe('High Event Volume', () => {
    let engine: RealTimeProtectionEngine;

    beforeEach(() => {
      engine = new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
      engine.start();
    });

    afterEach(() => {
      engine.dispose();
    });

    it('handles 100 rapid events', () => {
      for (let i = 0; i < 100; i++) {
        engine.injectEvent(
          'file_created',
          makeEventTarget({ path: `C:\\Temp\\file${i}.exe`, name: `file${i}.exe` }),
          makeEventMetadata(),
          'low',
        );
      }
      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBe(100);
    });

    it('handles 500 rapid events', () => {
      for (let i = 0; i < 500; i++) {
        engine.injectEvent(
          'process_created',
          makeEventTarget({ type: 'process', path: `C:\\proc${i}.exe`, name: `proc${i}.exe` }),
          makeEventMetadata(),
          'info',
        );
      }
      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBe(500);
    });

    it('handles rapid process creation simulation', () => {
      for (let i = 0; i < 50; i++) {
        engine.injectEvent(
          'process_created',
          makeEventTarget({ type: 'process', path: `C:\\Temp\\spawn${i}.exe`, name: `spawn${i}.exe`, pid: 1000 + i }),
          makeEventMetadata({ operation: 'create', details: { pid: 1000 + i } }),
          'medium',
        );
      }
      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBe(50);
    });
  });

  // ── Multiple Simultaneous Events ─────────────────────────────────

  describe('Multiple Simultaneous Events', () => {
    it('handles mixed event types', () => {
      const engine = new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
      engine.start();

      engine.injectEvent('file_created', makeEventTarget({ name: 'file1.exe' }), makeEventMetadata(), 'medium');
      engine.injectEvent('process_created', makeEventTarget({ type: 'process', name: 'proc1.exe' }), makeEventMetadata(), 'low');
      engine.injectEvent('browser_extension_installed', makeEventTarget({ type: 'browser_extension', name: 'ext1' }), makeEventMetadata(), 'medium');
      engine.injectEvent('startup_entry_added', makeEventTarget({ type: 'startup_entry', name: 'startup1' }), makeEventMetadata(), 'high');
      engine.injectEvent('usb_inserted', makeEventTarget({ type: 'usb_device', name: 'USB1' }), makeEventMetadata(), 'medium');

      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBe(5);
      engine.dispose();
    });
  });

  // ── Queue Overflow ───────────────────────────────────────────────

  describe('Queue Overflow', () => {
    it('handles queue overflow gracefully', () => {
      const engine = new RealTimeProtectionEngine({
        ...ProtectionFactory.createDefaultConfig(),
        maxQueueSize: 10,
        maxConcurrentActions: 1,
      });
      engine.start();

      // Generate many high-severity events to fill the investigation queue
      for (let i = 0; i < 50; i++) {
        engine.injectEvent(
          'file_created',
          makeEventTarget({ path: `C:\\Temp\\evil${i}.exe`, name: `evil${i}.exe` }),
          makeEventMetadata(),
          'high',
        );
      }

      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBe(50);
      // Some events may be dropped due to queue overflow
      engine.dispose();
    });
  });

  // ── Event Bus ────────────────────────────────────────────────────

  describe('ProtectionEventBus', () => {
    it('emits events to subscribers', () => {
      let received = false;
      const unsub = protectionEventBus.subscribe((event) => {
        if (event.type === 'protection_started') received = true;
      });
      protectionEventBus.emitProtectionStarted('passive');
      expect(received).toBe(true);
      unsub();
    });

    it('supports unsubscribe', () => {
      let count = 0;
      const unsub = protectionEventBus.subscribe(() => { count++; });
      protectionEventBus.emitProtectionStarted('passive');
      unsub();
      protectionEventBus.emitProtectionStopped();
      expect(count).toBe(1);
    });
  });

  // ── Long-Running Stability ───────────────────────────────────────

  describe('Long-Running Stability', () => {
    it('maintains state over many events', () => {
      const engine = new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
      engine.start();

      // Simulate 1000 events over time
      for (let i = 0; i < 1000; i++) {
        engine.injectEvent(
          'file_modified',
          makeEventTarget({ path: `C:\\Temp\\mod${i}.tmp`, name: `mod${i}.tmp` }),
          makeEventMetadata(),
          'info',
        );
      }

      expect(engine.isRunning()).toBe(true);
      const stats = engine.getStatistics();
      expect(stats.totalEvents).toBe(1000);
      engine.dispose();
    });
  });

  // ── Mode Transitions ─────────────────────────────────────────────

  describe('Mode Transitions', () => {
    it('transitions from passive to maximum', () => {
      const engine = new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
      engine.start();
      engine.setMode('maximum');
      expect(engine.getMode()).toBe('maximum');
      engine.dispose();
    });

    it('transitions from passive to disabled', () => {
      const engine = new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
      engine.start();
      engine.setMode('disabled');
      expect(engine.getMode()).toBe('disabled');
      engine.dispose();
    });
  });

  // ── Edge Cases ───────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('handles engine not started', () => {
      const engine = new RealTimeProtectionEngine();
      expect(engine.isRunning()).toBe(false);
      expect(engine.getStatistics().totalEvents).toBe(0);
      engine.dispose();
    });

    it('handles dispose', () => {
      const engine = new RealTimeProtectionEngine();
      engine.start();
      engine.dispose();
      expect(engine.isRunning()).toBe(false);
    });

    it('handles configuration updates', () => {
      const engine = new RealTimeProtectionEngine();
      engine.start();
      engine.updateConfiguration({ mode: 'interactive' });
      expect(engine.getMode()).toBe('interactive');
      engine.dispose();
    });

    it('handles rule management', () => {
      const engine = new RealTimeProtectionEngine();
      const initialRules = engine.getRules();
      const initialCount = initialRules.length;
      engine.addRule(makeRule({ id: 'custom-rule', action: 'monitor' }));
      expect(engine.getRules().length).toBe(initialCount + 1);
      engine.removeRule('custom-rule');
      expect(engine.getRules().length).toBe(initialCount);
      engine.dispose();
    });
  });
});
