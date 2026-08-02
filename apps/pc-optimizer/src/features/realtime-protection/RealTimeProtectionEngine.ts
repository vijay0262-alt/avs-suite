/**
 * RealTimeProtectionEngine — the orchestrator.
 *
 * Event-driven real-time protection that continuously watches for
 * security events. Lightweight, non-blocking, and enterprise-ready.
 *
 * Event Pipeline:
 *   System Event → Normalize → Classify → Filter → Provider Analysis
 *   → AI Investigation → Recommendation → User Notification → Optional Remediation
 *
 * Resource Limits:
 *   - Idle CPU: <1%
 *   - Memory: <150MB
 *   - No blocking UI thread
 *
 * Integration:
 *   - Security Center (threats, providers)
 *   - Threat Investigation (investigations)
 *   - Remediation (quarantine, rollback)
 *   - Hardware Intelligence
 *   - Process Intelligence
 *   - Predictive Health
 *   - Smart Optimization
 */
import type {
  ProtectionConfiguration,
  ProtectionMode,
  SystemEvent,
  EventTarget,
  EventMetadata,
  SystemEventType,
  EventSeverity,
  ProtectionDashboardData,
  ProtectionStatistics,
  ProtectionHealthReport,
  ProtectionDiagnosticsReport,
  ProtectionSession as ProtectionSessionData,
  ProtectionNotification,
  ProtectionRule,
  QueuedAction,
  ActionResult,
  MonitorInfo,
} from './types';

import { ProtectionFactory, type ProtectionComponents } from './ProtectionFactory';
import { protectionEventBus } from './ProtectionEvents';
import { realtimeBackendService } from './realtimeBackendService';

export class RealTimeProtectionEngine {
  private components: ProtectionComponents;
  private recentEvents: SystemEvent[] = [];
  private maxRecentEvents = 200;
  private restartAttempts = 0;

  constructor(config?: Partial<ProtectionConfiguration>) {
    const effectiveConfig = config ?? ProtectionFactory.createDefaultConfig();
    this.components = ProtectionFactory.createComponents(effectiveConfig);
    this.setupEventPipeline();
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  start(): boolean {
    const { stateMachine, monitorManager, session, scheduler, telemetry, statistics, configManager } = this.components;

    if (!stateMachine.start()) return false;

    // Start monitors
    monitorManager.start();

    // Start session
    const config = configManager.get();
    session.start(config.mode);
    statistics.startSession();

    // Start telemetry
    if (configManager.isTelemetryEnabled()) {
      telemetry.start();
    }

    // Start scheduler
    scheduler.start();

    // Complete state transition
    stateMachine.completeStart();

    // ── Start backend process monitoring ───────────────────
    // The Python backend polls psutil for new processes and
    // checks for suspicious locations / unsigned executables.
    void realtimeBackendService.start().catch((err) => {
      console.warn('[RealTimeProtection] Backend start failed:', err);
    });

    protectionEventBus.emitProtectionStarted(config.mode);
    return true;
  }

  stop(): boolean {
    const { stateMachine, monitorManager, session, scheduler, telemetry, statistics } = this.components;

    monitorManager.stop();
    session.end();
    statistics.stopSession();
    scheduler.stop();
    telemetry.stop();

    stateMachine.stop();

    // ── Stop backend process monitoring ────────────────────
    void realtimeBackendService.stop().catch((err) => {
      console.warn('[RealTimeProtection] Backend stop failed:', err);
    });

    protectionEventBus.emitProtectionStopped();
    return true;
  }

  pause(): boolean {
    const { stateMachine, monitorManager } = this.components;
    if (!stateMachine.pause()) return false;
    monitorManager.stop();
    protectionEventBus.emitProtectionPaused();
    return true;
  }

  resume(): boolean {
    const { stateMachine, monitorManager } = this.components;
    if (!stateMachine.resume()) return false;
    monitorManager.start();
    protectionEventBus.emitProtectionResumed();
    return true;
  }

  restart(): boolean {
    const { stateMachine, configManager } = this.components;

    if (stateMachine.fail()) {
      this.restartAttempts++;
      if (this.restartAttempts > configManager.getMaxRestartAttempts()) {
        stateMachine.stop();
        return false;
      }

      setTimeout(() => {
        stateMachine.restart();
        this.start();
        protectionEventBus.emitProtectionRestarted();
      }, configManager.getRestartDelayMs());

      return true;
    }
    return false;
  }

  setMode(mode: ProtectionMode): void {
    const { configManager, policyManager, stateMachine, session } = this.components;
    configManager.setMode(mode);
    policyManager.setMode(mode);
    stateMachine.setMode(mode);
    session.setMode(mode);
    protectionEventBus.emitModeChanged(mode);
  }

  // ── Event Pipeline ────────────────────────────────────────────────

  injectEvent(
    type: SystemEventType,
    target: EventTarget,
    metadata: EventMetadata,
    severity?: EventSeverity,
  ): SystemEvent {
    return this.components.monitorManager.injectEvent(type, target, metadata, severity);
  }

  processEvent(event: SystemEvent): void {
    const startTime = Date.now();
    const { statistics, policyManager, ruleEngine, actionQueue, history, telemetry, configManager } = this.components;

    // 1. Record event
    statistics.recordEvent(event);
    telemetry.recordEvent();
    protectionEventBus.emitEventReceived(event.id);

    // 2. Normalize (already done in injectEvent)
    event.normalized = true;

    // 3. Classify (already done in injectEvent)
    event.classified = true;

    // 4. Filter — skip if monitor type is disabled or inactive
    const monitorInfo = this.components.monitorManager.getMonitor(event.category as never);
    if (!policyManager.shouldMonitor(event.category) || (monitorInfo && monitorInfo.status !== 'active')) {
      event.status = 'filtered';
      event.filtered = true;
      statistics.recordFiltered();
      protectionEventBus.emitEventFiltered(event.id, 'Monitor type disabled or inactive');
      return;
    }

    // 5. Rule evaluation
    const ruleResult = ruleEngine.evaluate(event, configManager.getMode());
    if (ruleResult.action === 'block' && policyManager.shouldBlock(event)) {
      event.status = 'threat';
      statistics.recordThreatBlocked();
      this.components.session.recordThreatBlocked();
      this.notifyThreatBlocked(event);
      history.record(event, 'block', true, null, Date.now() - startTime);
      protectionEventBus.emitThreatDetected(event.id, '', `Blocked by rule: ${ruleResult.ruleId}`);
      event.processingTime = Date.now() - startTime;
      this.addRecentEvent(event);
      return;
    }

    // 6. Enqueue for investigation if needed
    if (policyManager.shouldInvestigate(event) || ruleResult.action === 'investigate') {
      const action = actionQueue.enqueue(event.id, 'investigate', this.severityToPriority(event.severity));
      if (action) {
        event.status = 'processing';
        statistics.recordProcessed(Date.now() - startTime);
        this.components.session.recordInvestigation();
        protectionEventBus.emitInvestigationTriggered(event.id);
      } else {
        // Queue full — drop
        event.status = 'dropped';
        statistics.recordDropped();
        telemetry.recordDroppedEvent();
        protectionEventBus.emitEventDropped(event.id, 'Queue full');
      }
    } else {
      event.status = 'analyzed';
      statistics.recordProcessed(Date.now() - startTime);
    }

    // 7. Notify if needed
    if (policyManager.shouldNotify(event)) {
      this.notifyEvent(event);
    }

    // 8. Record in history
    history.record(event, ruleResult.action, false, null, Date.now() - startTime);

    // 9. Update telemetry
    const processingTime = Date.now() - startTime;
    event.processingTime = processingTime;
    telemetry.updateLatency(processingTime);
    telemetry.updateQueueDepth(actionQueue.getQueueDepth());

    this.addRecentEvent(event);
    protectionEventBus.emitEventProcessed(event.id);
  }

  // ── Actions ───────────────────────────────────────────────────────

  processActionQueue(): void {
    const { actionQueue } = this.components;

    while (actionQueue.hasCapacity()) {
      const action = actionQueue.dequeue();
      if (!action) break;

      const result = this.executeAction(action);
      if (result) {
        actionQueue.complete(action.id, result);
      }
    }
  }

  private executeAction(action: QueuedAction): ActionResult | null {
    // In production, this would trigger the investigation engine
    // For now, we simulate the result
    const result: ActionResult = {
      threatDetected: false,
      threatId: null,
      recommendation: 'No threat detected — event appears benign.',
      investigationId: null,
      remediationPlanId: null,
      details: `Action ${action.type} processed for event ${action.eventId}`,
    };

    return result;
  }

  // ── Notifications ─────────────────────────────────────────────────

  private notifyEvent(event: SystemEvent): void {
    const { notificationCenter, session } = this.components;
    notificationCenter.notify(
      'system_alert',
      this.severityToNotificationPriority(event.severity),
      `Security Event: ${event.type}`,
      `Detected: ${event.target.name} at ${event.target.path}`,
      { eventId: event.id },
    );
    session.recordNotification();
    protectionEventBus.emitNotificationSent(event.id);
  }

  private notifyThreatBlocked(event: SystemEvent): void {
    const { notificationCenter, session } = this.components;
    notificationCenter.notify(
      'threat_detected',
      'critical',
      'Threat Blocked',
      `Blocked: ${event.target.name} — ${event.target.path}`,
      { eventId: event.id, actionRequired: true, actionLabel: 'Review' },
    );
    session.recordNotification();
    protectionEventBus.emitNotificationSent(event.id);
  }

  // ── Public API ────────────────────────────────────────────────────

  getDashboard(): ProtectionDashboardData {
    const { configManager, stateMachine, monitorManager, notificationCenter, health, statistics, telemetry, session, dashboardProvider } = this.components;

    const stats = statistics.getStatistics(
      monitorManager.getMonitorCount().active,
      monitorManager.getMonitorCount().total,
      this.components.actionQueue.getQueueDepth(),
    );

    const telemetryData = telemetry.getCurrent();
    const healthReport = health.check(
      stats,
      telemetryData,
      monitorManager.getAllMonitors(),
      stateMachine.isRunning(),
    );

    return dashboardProvider.build(
      stateMachine.getState(),
      configManager.getMode(),
      monitorManager.getAllMonitors(),
      this.recentEvents,
      notificationCenter.getAll(),
      healthReport,
      stats,
      telemetryData.cpuUsage,
      telemetryData.memoryUsage,
      session.getUptime(),
      notificationCenter.getActionRequired().length,
    );
  }

  getStatistics(): ProtectionStatistics {
    const { statistics, monitorManager, actionQueue } = this.components;
    return statistics.getStatistics(
      monitorManager.getMonitorCount().active,
      monitorManager.getMonitorCount().total,
      actionQueue.getQueueDepth(),
    );
  }

  getHealth(): ProtectionHealthReport {
    const { health, telemetry, monitorManager, stateMachine } = this.components;
    return health.check(
      this.getStatistics(),
      telemetry.getCurrent(),
      monitorManager.getAllMonitors(),
      stateMachine.isRunning(),
    );
  }

  runDiagnostics(): ProtectionDiagnosticsReport {
    const { diagnostics, stateMachine, monitorManager, actionQueue, statistics, session } = this.components;
    return diagnostics.run({
      isRunning: stateMachine.isRunning(),
      mode: stateMachine.getMode(),
      activeMonitors: monitorManager.getMonitorCount().active,
      totalMonitors: monitorManager.getMonitorCount().total,
      queueDepth: actionQueue.getQueueDepth(),
      processingCount: actionQueue.getProcessingCount(),
      overflowCount: actionQueue.getOverflowCount(),
      droppedCount: actionQueue.getDroppedCount(),
      totalEvents: statistics.getStatistics(0, 0, 0).totalEvents,
      totalThreats: statistics.getStatistics(0, 0, 0).threatsDetected,
      uptime: session.getUptime(),
      restartAttempts: this.restartAttempts,
    });
  }

  getSession(): ProtectionSessionData | null {
    return this.components.session.get();
  }

  getNotifications(): ProtectionNotification[] {
    return this.components.notificationCenter.getAll();
  }

  getUnreadNotifications(): ProtectionNotification[] {
    return this.components.notificationCenter.getUnread();
  }

  markNotificationRead(id: string): void {
    this.components.notificationCenter.markRead(id);
  }

  dismissNotification(id: string): void {
    this.components.notificationCenter.dismiss(id);
  }

  getMonitors(): MonitorInfo[] {
    return this.components.monitorManager.getAllMonitors();
  }

  enableMonitor(type: MonitorInfo['type']): void {
    this.components.monitorManager.enable(type);
  }

  disableMonitor(type: MonitorInfo['type']): void {
    this.components.monitorManager.disable(type);
  }

  getConfiguration(): ProtectionConfiguration {
    return this.components.configManager.get();
  }

  updateConfiguration(updates: Partial<ProtectionConfiguration>): void {
    this.components.configManager.update(updates);
    if (updates.monitors) {
      this.components.monitorManager.updateConfigs(updates.monitors);
    }
    if (updates.rules) {
      this.components.ruleEngine.setRules(updates.rules);
    }
    if (updates.maxQueueSize) {
      this.components.actionQueue.setMaxQueueSize(updates.maxQueueSize);
    }
    if (updates.maxConcurrentActions) {
      this.components.actionQueue.setMaxConcurrent(updates.maxConcurrentActions);
    }
  }

  getRules(): ProtectionRule[] {
    return this.components.ruleEngine.getRules();
  }

  addRule(rule: ProtectionRule): void {
    this.components.ruleEngine.addRule(rule);
  }

  removeRule(ruleId: string): void {
    this.components.ruleEngine.removeRule(ruleId);
  }

  getRecentEvents(): SystemEvent[] {
    return [...this.recentEvents];
  }

  /**
   * Fetch real events and alerts from the Python backend and inject
   * them into the frontend event pipeline. This bridges the backend's
   * psutil-based process monitoring with the frontend's rule engine
   * and notification system.
   *
   * Should be called periodically (e.g. every 5 seconds) when protection
   * is running.
   */
  async syncBackendEvents(): Promise<void> {
    if (!this.components.stateMachine.isRunning()) return;

    try {
      // Fetch recent backend alerts
      const { alerts } = await realtimeBackendService.getAlerts(50);

      for (const alert of alerts) {
        // Convert backend alert to frontend SystemEvent
        const event = {
          id: `backend-${alert.pid}-${alert.timestamp}`,
          type: 'process_started' as SystemEventType,
          target: {
            name: alert.name,
            path: alert.exe,
            pid: alert.pid,
          },
          metadata: {
            reason: alert.reason,
            severity: alert.severity,
            source: 'backend',
          },
          severity: alert.severity === 'high' ? 'critical' : alert.severity === 'medium' ? 'warning' : 'info',
          timestamp: new Date(alert.timestamp).getTime(),
          category: 'process',
          status: 'pending',
          normalized: false,
          classified: false,
          filtered: false,
          processed: false,
          source: 'backend',
          processingTime: 0,
        } as unknown as SystemEvent;

        // Inject into the pipeline if not already seen
        const exists = this.recentEvents.some(e => e.id === event.id);
        if (!exists) {
          this.processEvent(event);
        }
      }
    } catch (err) {
      // Backend unavailable — silently skip
    }
  }

  getHistory() {
    return this.components.history.getSummary();
  }

  getTelemetry() {
    return this.components.telemetry.getCurrent();
  }

  isRunning(): boolean {
    return this.components.stateMachine.isRunning();
  }

  getState() {
    return this.components.stateMachine.getState();
  }

  getMode(): ProtectionMode {
    return this.components.configManager.getMode();
  }

  dispose(): void {
    this.stop();
    this.components.scheduler.clear();
    this.components.telemetry.clear();
    this.components.statistics.reset();
    this.components.history.clear();
    this.components.notificationCenter.clear();
    this.components.actionQueue.clear();
    this.components.ruleEngine.clear();
    this.components.monitorManager.clear();
    this.components.session.clear();
    this.components.stateMachine.reset();
    this.recentEvents = [];
    protectionEventBus.clear();
  }

  // ── Private Helpers ───────────────────────────────────────────────

  private setupEventPipeline(): void {
    this.components.monitorManager.setEventCallback((event: SystemEvent) => {
      this.processEvent(event);
    });
  }

  private addRecentEvent(event: SystemEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents = this.recentEvents.slice(-this.maxRecentEvents);
    }
  }

  private severityToPriority(severity: EventSeverity): QueuedAction['priority'] {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'normal';
      default: return 'low';
    }
  }

  private severityToNotificationPriority(severity: EventSeverity): ProtectionNotification['priority'] {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'normal';
      default: return 'low';
    }
  }
}
