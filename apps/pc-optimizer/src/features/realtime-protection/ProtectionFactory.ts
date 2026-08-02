/**
 * ProtectionFactory — creates and wires all protection components.
 *
 * Provides a single entry point for creating a fully configured
 * RealTimeProtectionEngine with all sub-components properly connected.
 */
import type { ProtectionConfiguration, ProtectionRule } from './types';
import { DEFAULT_PROTECTION_CONFIG } from './types';
import { ProtectionConfigurationManager } from './ProtectionConfiguration';
import { ProtectionPolicyManager } from './ProtectionPolicy';
import { ProtectionStateMachine } from './ProtectionStateMachine';
import { ProtectionScheduler } from './ProtectionScheduler';
import { ProtectionRuleEngine } from './ProtectionRuleEngine';
import { ProtectionActionQueue } from './ProtectionActionQueue';
import { ProtectionNotificationCenter } from './ProtectionNotificationCenter';
import { ProtectionTelemetryCollector } from './ProtectionTelemetry';
import { ProtectionSessionManager } from './ProtectionSession';
import { ProtectionHealthChecker } from './ProtectionHealth';
import { ProtectionDiagnosticsRunner } from './ProtectionDiagnostics';
import { ProtectionStatisticsCollector } from './ProtectionStatistics';
import { ProtectionHistoryManager } from './ProtectionHistory';
import { ProtectionManager } from './ProtectionManager';
import { ProtectionDashboardProvider } from './ProtectionDashboardProvider';

export interface ProtectionComponents {
  configManager: ProtectionConfigurationManager;
  policyManager: ProtectionPolicyManager;
  stateMachine: ProtectionStateMachine;
  scheduler: ProtectionScheduler;
  ruleEngine: ProtectionRuleEngine;
  actionQueue: ProtectionActionQueue;
  notificationCenter: ProtectionNotificationCenter;
  telemetry: ProtectionTelemetryCollector;
  session: ProtectionSessionManager;
  health: ProtectionHealthChecker;
  diagnostics: ProtectionDiagnosticsRunner;
  statistics: ProtectionStatisticsCollector;
  history: ProtectionHistoryManager;
  monitorManager: ProtectionManager;
  dashboardProvider: ProtectionDashboardProvider;
}

export class ProtectionFactory {
  static createComponents(config?: Partial<ProtectionConfiguration>): ProtectionComponents {
    const configManager = new ProtectionConfigurationManager(config);
    const configObj = configManager.get();

    const policyManager = new ProtectionPolicyManager({
      mode: configObj.mode,
      autoInvestigate: configObj.autoInvestigate,
      autoNotify: configObj.autoNotify,
    });

    const stateMachine = new ProtectionStateMachine();
    stateMachine.setMode(configObj.mode);

    const scheduler = new ProtectionScheduler();

    const ruleEngine = new ProtectionRuleEngine(configObj.rules);

    const actionQueue = new ProtectionActionQueue(configObj.maxQueueSize, configObj.maxConcurrentActions);

    const notificationCenter = new ProtectionNotificationCenter();

    const telemetry = new ProtectionTelemetryCollector(
      configObj.maxTelemetrySamples,
      configObj.telemetryEnabled,
      configObj.telemetryIntervalMs,
    );

    const session = new ProtectionSessionManager();

    const health = new ProtectionHealthChecker();

    const diagnostics = new ProtectionDiagnosticsRunner();

    const statistics = new ProtectionStatisticsCollector();

    const history = new ProtectionHistoryManager(configObj.maxHistoryEntries);

    const monitorManager = new ProtectionManager(configObj.monitors);

    const dashboardProvider = new ProtectionDashboardProvider();

    return {
      configManager,
      policyManager,
      stateMachine,
      scheduler,
      ruleEngine,
      actionQueue,
      notificationCenter,
      telemetry,
      session,
      health,
      diagnostics,
      statistics,
      history,
      monitorManager,
      dashboardProvider,
    };
  }

  static createDefaultRules(): ProtectionRule[] {
    return [
      {
        id: 'rule-block-unsigned-temp',
        name: 'Block Unsigned Executables in Temp',
        description: 'Blocks unsigned executable files created in temporary folders',
        enabled: true,
        priority: 10,
        conditions: [
          { type: 'file_in_temp', value: '' },
          { type: 'signature_unsigned', value: '' },
        ],
        action: 'block',
        mode: 'maximum',
      },
      {
        id: 'rule-monitor-downloads',
        name: 'Monitor Downloads',
        description: 'Monitors executable files in the Downloads folder',
        enabled: true,
        priority: 5,
        conditions: [
          { type: 'file_in_download', value: '' },
        ],
        action: 'investigate',
        mode: 'all',
      },
      {
        id: 'rule-block-usb-autorun',
        name: 'Block USB AutoRun',
        description: 'Blocks auto-run when USB devices are inserted',
        enabled: true,
        priority: 8,
        conditions: [
          { type: 'usb_auto_run', value: '' },
        ],
        action: 'block',
        mode: 'all',
      },
      {
        id: 'rule-monitor-browser-changes',
        name: 'Monitor Browser Changes',
        description: 'Monitors browser extension and setting changes',
        enabled: true,
        priority: 3,
        conditions: [
          { type: 'category_matches', value: 'browser' },
        ],
        action: 'monitor',
        mode: 'all',
      },
      {
        id: 'rule-investigate-high-severity',
        name: 'Investigate High Severity Events',
        description: 'Automatically investigates events with high or critical severity',
        enabled: true,
        priority: 7,
        conditions: [
          { type: 'severity_above', value: 'high' },
        ],
        action: 'investigate',
        mode: 'all',
      },
    ];
  }

  static createDefaultConfig(): ProtectionConfiguration {
    return {
      ...DEFAULT_PROTECTION_CONFIG,
      monitors: DEFAULT_PROTECTION_CONFIG.monitors.map((m) => ({ ...m })),
      rules: ProtectionFactory.createDefaultRules(),
    };
  }
}
