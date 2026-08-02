// @vitest-environment happy-dom
/**
 * Security Dashboard Tests
 *
 * Tests for:
 * - ViewModel bootstrap, state management, and lifecycle
 * - Overview metrics computation (security score, threat level, confidence)
 * - Live monitoring counts
 * - AI insights generation
 * - Threat timeline construction
 * - Provider health building
 * - Report generation and export (JSON, CSV, TXT)
 * - Search functionality
 * - Tab management
 * - Protection controls (pause, resume, mode, monitors)
 * - Polling lifecycle
 * - Component rendering (SecurityDashboardPage, OverviewPanel, etc.)
 * - Accessibility (ARIA roles, keyboard navigation)
 * - Regression tests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// Global cleanup before and after every test to prevent DOM leakage
beforeEach(() => cleanup());
afterEach(() => cleanup());

import { SecurityDashboardViewModel } from '../SecurityDashboardViewModel';
import { RealTimeProtectionEngine } from '../../realtime-protection';
import { ProtectionFactory } from '../../realtime-protection';

// ── Test Helpers ─────────────────────────────────────────────────────

function createTestEngine(): RealTimeProtectionEngine {
  return new RealTimeProtectionEngine(ProtectionFactory.createDefaultConfig());
}

function createTestVM(): SecurityDashboardViewModel {
  return new SecurityDashboardViewModel(createTestEngine());
}

// ── ViewModel Tests ──────────────────────────────────────────────────

describe('SecurityDashboardViewModel', () => {
  let vm: SecurityDashboardViewModel;

  beforeEach(() => {
    vm = createTestVM();
  });

  afterEach(() => {
    vm.dispose();
  });

  describe('initial state', () => {
    it('starts in idle bootstrap state', () => {
      expect(vm.state.bootstrap).toBe('idle');
      expect(vm.state.bootstrapError).toBeNull();
      expect(vm.state.activeTab).toBe('overview');
      expect(vm.state.overview).toBeNull();
      expect(vm.state.insights).toEqual([]);
      expect(vm.state.timeline).toEqual([]);
      expect(vm.state.providers).toEqual([]);
      expect(vm.state.reports).toEqual([]);
      expect(vm.state.searchQuery).toBe('');
      expect(vm.state.searchResults).toBeNull();
      expect(vm.state.isPolling).toBe(false);
    });

    it('has correct initial live counts', () => {
      expect(vm.state.liveCounts).toEqual({
        processesMonitored: 0,
        filesMonitored: 0,
        registryEvents: 0,
        browserEvents: 0,
        startupEvents: 0,
        usbEvents: 0,
        networkEvents: 0,
        threatsInvestigatedToday: 0,
        threatsBlocked: 0,
        threatsQuarantined: 0,
        falsePositives: 0,
      });
    });
  });

  describe('bootstrap', () => {
    it('transitions from idle to ready', async () => {
      await vm.bootstrap();
      expect(vm.state.bootstrap).toBe('ready');
      expect(vm.state.overview).not.toBeNull();
      expect(vm.state.statistics).not.toBeNull();
      expect(vm.state.health).not.toBeNull();
      expect(vm.state.telemetry).not.toBeNull();
      expect(vm.state.session).not.toBeNull();
      expect(vm.state.monitors.length).toBeGreaterThan(0);
    });

    it('populates providers after bootstrap', async () => {
      await vm.bootstrap();
      expect(vm.state.providers.length).toBeGreaterThan(0);
      const engineProvider = vm.state.providers.find((p) => p.id === 'engine-realtime');
      expect(engineProvider).toBeDefined();
      expect(engineProvider?.name).toBe('Real-Time Engine');
    });

    it('generates initial reports', async () => {
      await vm.bootstrap();
      expect(vm.state.reports.length).toBeGreaterThanOrEqual(2);
      const securityReport = vm.state.reports.find((r) => r.type === 'security');
      expect(securityReport).toBeDefined();
      const weeklyReport = vm.state.reports.find((r) => r.type === 'weekly');
      expect(weeklyReport).toBeDefined();
    });

    it('starts polling after bootstrap', async () => {
      await vm.bootstrap();
      expect(vm.state.isPolling).toBe(true);
    });

    it('sets lastUpdated timestamp', async () => {
      await vm.bootstrap();
      expect(vm.state.lastUpdated).toBeGreaterThan(0);
    });
  });

  describe('tab management', () => {
    it('switches active tab', async () => {
      await vm.bootstrap();
      vm.setActiveTab('timeline');
      expect(vm.state.activeTab).toBe('timeline');
      vm.setActiveTab('providers');
      expect(vm.state.activeTab).toBe('providers');
      vm.setActiveTab('analytics');
      expect(vm.state.activeTab).toBe('analytics');
      vm.setActiveTab('reports');
      expect(vm.state.activeTab).toBe('reports');
      vm.setActiveTab('search');
      expect(vm.state.activeTab).toBe('search');
    });
  });

  describe('protection controls', () => {
    it('pauses protection', async () => {
      await vm.bootstrap();
      expect(vm.state.overview?.protectionStatus).toBe('running');
      vm.pauseProtection();
      expect(vm.state.overview?.protectionStatus).toBe('paused');
    });

    it('resumes protection', async () => {
      await vm.bootstrap();
      vm.pauseProtection();
      expect(vm.state.overview?.protectionStatus).toBe('paused');
      vm.resumeProtection();
      expect(vm.state.overview?.protectionStatus).toBe('running');
    });

    it('sets protection mode', async () => {
      await vm.bootstrap();
      vm.setProtectionMode('maximum');
      expect(vm.state.overview?.protectionMode).toBe('maximum');
      vm.setProtectionMode('passive');
      expect(vm.state.overview?.protectionMode).toBe('passive');
    });

    it('enables and disables monitors', async () => {
      await vm.bootstrap();
      const monitorType = vm.state.monitors[0]?.type;
      expect(monitorType).toBeDefined();
      vm.disableMonitor(monitorType!);
      const disabled = vm.state.monitors.find((m) => m.type === monitorType);
      expect(disabled?.enabled).toBe(false);
      vm.enableMonitor(monitorType!);
      const enabled = vm.state.monitors.find((m) => m.type === monitorType);
      expect(enabled?.enabled).toBe(true);
    });
  });

  describe('overview computation', () => {
    it('computes security score', async () => {
      await vm.bootstrap();
      const score = vm.state.overview?.securityScore;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('computes threat level', async () => {
      await vm.bootstrap();
      expect(['none', 'low', 'moderate', 'high', 'critical']).toContain(vm.state.overview?.threatLevel);
    });

    it('computes AI confidence score', async () => {
      await vm.bootstrap();
      const confidence = vm.state.overview?.aiConfidenceScore;
      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('reports real-time status correctly when running', async () => {
      await vm.bootstrap();
      expect(vm.state.overview?.realTimeStatus).toBe('active');
    });

    it('reports real-time status correctly when paused', async () => {
      await vm.bootstrap();
      vm.pauseProtection();
      expect(vm.state.overview?.realTimeStatus).toBe('paused');
    });

    it('counts active and total monitors', async () => {
      await vm.bootstrap();
      expect(vm.state.overview?.totalMonitors).toBeGreaterThan(0);
      expect(vm.state.overview?.activeMonitors).toBeGreaterThanOrEqual(0);
      expect(vm.state.overview?.activeMonitors).toBeLessThanOrEqual(vm.state.overview?.totalMonitors ?? 0);
    });
  });

  describe('live monitoring counts', () => {
    it('tracks live counts after bootstrap', async () => {
      await vm.bootstrap();
      expect(vm.state.liveCounts).toBeDefined();
      expect(typeof vm.state.liveCounts.processesMonitored).toBe('number');
      expect(typeof vm.state.liveCounts.filesMonitored).toBe('number');
    });
  });

  describe('AI insights', () => {
    it('generates insights after bootstrap', async () => {
      await vm.bootstrap();
      expect(vm.state.insights).toBeDefined();
      expect(Array.isArray(vm.state.insights)).toBe(true);
    });

    it('each insight has required fields', async () => {
      await vm.bootstrap();
      for (const insight of vm.state.insights) {
        expect(insight.id).toBeDefined();
        expect(insight.title).toBeDefined();
        expect(insight.description).toBeDefined();
        expect(['info', 'low', 'medium', 'high', 'critical']).toContain(insight.severity);
        expect(insight.confidence).toBeGreaterThanOrEqual(0);
        expect(insight.confidence).toBeLessThanOrEqual(1);
        expect(insight.source).toBeDefined();
        expect(insight.timestamp).toBeGreaterThan(0);
        expect(typeof insight.actionable).toBe('boolean');
      }
    });

    it('limits insights to max count', async () => {
      await vm.bootstrap();
      expect(vm.state.insights.length).toBeLessThanOrEqual(20);
    });
  });

  describe('threat timeline', () => {
    it('builds timeline from history', async () => {
      await vm.bootstrap();
      expect(Array.isArray(vm.state.timeline)).toBe(true);
    });

    it('each timeline entry has required fields', async () => {
      await vm.bootstrap();
      for (const entry of vm.state.timeline) {
        expect(entry.id).toBeDefined();
        expect(entry.threatId).toBeDefined();
        expect(entry.threatName).toBeDefined();
        expect(['detection', 'investigation', 'evidence', 'correlation', 'recommendation', 'decision', 'quarantine', 'rollback', 'resolution']).toContain(entry.stage);
        expect(entry.timestamp).toBeGreaterThan(0);
        expect(['system', 'ai', 'user']).toContain(entry.actor);
      }
    });
  });

  describe('provider health', () => {
    it('builds providers from monitors', async () => {
      await vm.bootstrap();
      expect(vm.state.providers.length).toBeGreaterThan(0);
      for (const provider of vm.state.providers) {
        expect(provider.id).toBeDefined();
        expect(provider.name).toBeDefined();
        expect(['healthy', 'degraded', 'error', 'inactive']).toContain(provider.status);
        expect(typeof provider.enabled).toBe('boolean');
      }
    });

    it('includes engine providers', async () => {
      await vm.bootstrap();
      const ids = vm.state.providers.map((p) => p.id);
      expect(ids).toContain('engine-realtime');
      expect(ids).toContain('engine-investigation');
      expect(ids).toContain('engine-remediation');
    });
  });

  describe('reports', () => {
    it('generates security report', async () => {
      await vm.bootstrap();
      const report = vm.generateReport('security');
      expect(report.type).toBe('security');
      expect(report.title).toBe('Security Report');
      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.details).toBeDefined();
      expect(report.period.start).toBeLessThan(report.period.end);
    });

    it('generates weekly report', async () => {
      await vm.bootstrap();
      const report = vm.generateReport('weekly');
      expect(report.type).toBe('weekly');
      expect(report.title).toBe('Weekly AI Security Report');
    });

    it('generates threat summary', async () => {
      await vm.bootstrap();
      const report = vm.generateReport('threat_summary');
      expect(report.type).toBe('threat_summary');
      expect(report.title).toBe('Threat Summary');
    });

    it('generates investigation summary', async () => {
      await vm.bootstrap();
      const report = vm.generateReport('investigation_summary');
      expect(report.type).toBe('investigation_summary');
      expect(report.title).toBe('Investigation Summary');
    });

    it('generates remediation summary', async () => {
      await vm.bootstrap();
      const report = vm.generateReport('remediation_summary');
      expect(report.type).toBe('remediation_summary');
      expect(report.title).toBe('Remediation Summary');
    });

    it('generates protection history', async () => {
      await vm.bootstrap();
      const report = vm.generateReport('protection_history');
      expect(report.type).toBe('protection_history');
      expect(report.title).toBe('Protection History');
    });
  });

  describe('report export', () => {
    it('exports as JSON', async () => {
      await vm.bootstrap();
      const json = vm.exportReport('security', 'json');
      const parsed = JSON.parse(json);
      expect(parsed.title).toBe('Security Report');
    });

    it('exports as CSV', async () => {
      await vm.bootstrap();
      const csv = vm.exportReport('security', 'csv');
      expect(csv).toContain('Field,Value');
      expect(csv).toContain('Title,Security Report');
    });

    it('exports as TXT', async () => {
      await vm.bootstrap();
      const txt = vm.exportReport('security', 'txt');
      expect(txt).toContain('Security Report');
      expect(txt).toContain('Summary:');
    });
  });

  describe('search', () => {
    it('clears results when query is empty', async () => {
      await vm.bootstrap();
      vm.setSearchQuery('test');
      vm.setSearchQuery('');
      expect(vm.state.searchResults).toBeNull();
    });

    it('stores search query', async () => {
      await vm.bootstrap();
      vm.setSearchQuery('malware');
      expect(vm.state.searchQuery).toBe('malware');
    });

    it('returns empty results for non-matching query', async () => {
      await vm.bootstrap();
      vm.setSearchQuery('zzz_nonexistent_zzz');
      expect(vm.state.searchResults).toEqual([]);
    });
  });

  describe('polling', () => {
    it('starts polling', async () => {
      await vm.bootstrap();
      vm.stopPolling();
      expect(vm.state.isPolling).toBe(false);
      vm.startPolling();
      expect(vm.state.isPolling).toBe(true);
    });

    it('stops polling', async () => {
      await vm.bootstrap();
      vm.stopPolling();
      expect(vm.state.isPolling).toBe(false);
    });

    it('does not start duplicate polling timers', async () => {
      await vm.bootstrap();
      vm.startPolling();
      vm.startPolling();
      expect(vm.state.isPolling).toBe(true);
    });
  });

  describe('refresh', () => {
    it('updates state on refresh', async () => {
      await vm.bootstrap();
      const before = vm.state.lastUpdated;
      await new Promise((r) => setTimeout(r, 10));
      vm.refresh();
      expect(vm.state.lastUpdated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('dispose', () => {
    it('stops polling on dispose', () => {
      const testVm = createTestVM();
      testVm.startPolling();
      testVm.dispose();
      // After dispose, state should not be updating
      expect(testVm.state.isPolling).toBe(false);
    });
  });
});

// ── Component Rendering Tests ────────────────────────────────────────

describe('SecurityDashboardPage Rendering', () => {

  it('renders page container initially', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    expect(screen.getByTestId('page-security-dashboard')).toBeDefined();
  });

  it('renders main dashboard after bootstrap', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });
    expect(screen.getByTestId('page-security-dashboard')).toBeDefined();
    expect(screen.getByTestId('security-status-bar')).toBeDefined();
  });

  it('renders all tab buttons', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });
    expect(screen.getByTestId('tab-btn-overview')).toBeDefined();
    expect(screen.getByTestId('tab-btn-protection')).toBeDefined();
    expect(screen.getByTestId('tab-btn-timeline')).toBeDefined();
    expect(screen.getByTestId('tab-btn-providers')).toBeDefined();
    expect(screen.getByTestId('tab-btn-analytics')).toBeDefined();
    expect(screen.getByTestId('tab-btn-reports')).toBeDefined();
    expect(screen.getByTestId('tab-btn-search')).toBeDefined();
  });

  it('switches tabs on click', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByTestId('tab-btn-protection'));
    await waitFor(() => {
      expect(screen.getByTestId('tabpanel-protection')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('tab-btn-timeline'));
    await waitFor(() => {
      expect(screen.getByTestId('tabpanel-timeline')).toBeDefined();
    });

    fireEvent.click(screen.getByTestId('tab-btn-providers'));
    await waitFor(() => {
      expect(screen.getByTestId('tabpanel-providers')).toBeDefined();
    });
  });

  it('renders overview panel by default', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });
    expect(screen.getByTestId('tabpanel-overview')).toBeDefined();
    expect(screen.getByTestId('overview-panel')).toBeDefined();
  });

  it('renders security score stat tile', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });
    expect(screen.getAllByText('Security Score').length).toBeGreaterThan(0);
  });

  it('renders command center button', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });
    expect(screen.getByTestId('btn-command-center')).toBeDefined();
  });

  it('opens command center modal on button click', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByTestId('btn-command-center'));
    await waitFor(() => {
      expect(screen.getByTestId('command-center')).toBeDefined();
    });
    expect(screen.getByTestId('command-center-overlay')).toBeDefined();
  });

  it('closes command center on close button', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByTestId('btn-command-center'));
    await waitFor(() => {
      expect(screen.getByTestId('command-center')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('cmd-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('command-center')).toBeNull();
    });
  });

  it('renders command center action buttons', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByTestId('btn-command-center'));
    await waitFor(() => {
      expect(screen.getByTestId('cmd-quick-scan')).toBeDefined();
    });
    expect(screen.getByTestId('cmd-full-scan')).toBeDefined();
    expect(screen.getByTestId('cmd-custom-scan')).toBeDefined();
    expect(screen.getByTestId('cmd-investigations')).toBeDefined();
    expect(screen.getByTestId('cmd-quarantine')).toBeDefined();
    expect(screen.getByTestId('cmd-false-positives')).toBeDefined();
    expect(screen.getByTestId('cmd-recommendations')).toBeDefined();
    expect(screen.getByTestId('cmd-export-reports')).toBeDefined();
  });
});

// ── Overview Panel Tests ─────────────────────────────────────────────

describe('OverviewPanel', () => {
  it('renders empty state when overview is null', async () => {
    const { OverviewPanel } = await import('../OverviewPanel');
    render(
      <OverviewPanel
        overview={null}
        liveCounts={{
          processesMonitored: 0, filesMonitored: 0, registryEvents: 0,
          browserEvents: 0, startupEvents: 0, usbEvents: 0, networkEvents: 0,
          threatsInvestigatedToday: 0, threatsBlocked: 0, threatsQuarantined: 0, falsePositives: 0,
        }}
        insights={[]}
        health={null}
        statistics={null}
        telemetry={null}
        session={null}
        lastUpdated={0}
      />,
    );
    expect(screen.getByTestId('overview-empty')).toBeDefined();
  });

  it('renders overview content when data is provided', async () => {
    const { OverviewPanel } = await import('../OverviewPanel');
    render(
      <OverviewPanel
        overview={{
          securityScore: 85,
          protectionStatus: 'running',
          protectionMode: 'interactive',
          aiConfidenceScore: 0.92,
          threatLevel: 'none',
          definitionsStatus: 'up_to_date',
          protectionUptime: 3600000,
          lastScan: null,
          lastThreat: null,
          realTimeStatus: 'active',
          activeMonitors: 8,
          totalMonitors: 10,
          eventsToday: 150,
          threatsBlocked: 3,
          threatsInvestigated: 5,
          pendingApprovals: 0,
          cpuUsage: 0.5,
          memoryUsage: 80,
        }}
        liveCounts={{
          processesMonitored: 100, filesMonitored: 500, registryEvents: 10,
          browserEvents: 5, startupEvents: 2, usbEvents: 0, networkEvents: 20,
          threatsInvestigatedToday: 5, threatsBlocked: 3, threatsQuarantined: 2, falsePositives: 1,
        }}
        insights={[]}
        health={null}
        statistics={null}
        telemetry={null}
        session={null}
        lastUpdated={Date.now()}
      />,
    );
    expect(screen.getByTestId('overview-panel')).toBeDefined();
    expect(screen.getByTestId('overview-score-ring')).toBeDefined();
    expect(screen.getByTestId('overview-protection-status')).toBeDefined();
    expect(screen.getByTestId('overview-ai-confidence')).toBeDefined();
    expect(screen.getByTestId('overview-threat-level')).toBeDefined();
    expect(screen.getByTestId('overview-live-monitoring')).toBeDefined();
  });
});

// ── Protection Status Panel Tests ────────────────────────────────────

describe('ProtectionStatusPanel', () => {
  it('renders protection controls', async () => {
    const { ProtectionStatusPanel } = await import('../ProtectionStatusPanel');
    render(
      <ProtectionStatusPanel
        overview={{
          securityScore: 85,
          protectionStatus: 'running',
          protectionMode: 'interactive',
          aiConfidenceScore: 0.9,
          threatLevel: 'none',
          definitionsStatus: 'up_to_date',
          protectionUptime: 3600000,
          lastScan: null,
          lastThreat: null,
          realTimeStatus: 'active',
          activeMonitors: 8,
          totalMonitors: 10,
          eventsToday: 100,
          threatsBlocked: 0,
          threatsInvestigated: 0,
          pendingApprovals: 0,
          cpuUsage: 0.5,
          memoryUsage: 80,
        }}
        monitors={[]}
        liveCounts={{
          processesMonitored: 0, filesMonitored: 0, registryEvents: 0,
          browserEvents: 0, startupEvents: 0, usbEvents: 0, networkEvents: 0,
          threatsInvestigatedToday: 0, threatsBlocked: 0, threatsQuarantined: 0, falsePositives: 0,
        }}
        onPause={() => {}}
        onResume={() => {}}
        onEnableMonitor={() => {}}
        onDisableMonitor={() => {}}
        onSetMode={() => {}}
      />,
    );
    expect(screen.getByTestId('protection-status-panel')).toBeDefined();
    expect(screen.getByTestId('protection-controls')).toBeDefined();
    expect(screen.getByTestId('btn-pause-protection')).toBeDefined();
  });

  it('renders resume button when paused', async () => {
    const { ProtectionStatusPanel } = await import('../ProtectionStatusPanel');
    render(
      <ProtectionStatusPanel
        overview={{
          securityScore: 85,
          protectionStatus: 'paused',
          protectionMode: 'interactive',
          aiConfidenceScore: 0.9,
          threatLevel: 'none',
          definitionsStatus: 'up_to_date',
          protectionUptime: 3600000,
          lastScan: null,
          lastThreat: null,
          realTimeStatus: 'paused',
          activeMonitors: 0,
          totalMonitors: 10,
          eventsToday: 100,
          threatsBlocked: 0,
          threatsInvestigated: 0,
          pendingApprovals: 0,
          cpuUsage: 0.5,
          memoryUsage: 80,
        }}
        monitors={[]}
        liveCounts={{
          processesMonitored: 0, filesMonitored: 0, registryEvents: 0,
          browserEvents: 0, startupEvents: 0, usbEvents: 0, networkEvents: 0,
          threatsInvestigatedToday: 0, threatsBlocked: 0, threatsQuarantined: 0, falsePositives: 0,
        }}
        onPause={() => {}}
        onResume={() => {}}
        onEnableMonitor={() => {}}
        onDisableMonitor={() => {}}
        onSetMode={() => {}}
      />,
    );
    expect(screen.getByTestId('btn-resume-protection')).toBeDefined();
  });
});

// ── Threat Timeline Panel Tests ──────────────────────────────────────

describe('ThreatTimelinePanel', () => {
  it('renders empty state when no timeline entries', async () => {
    const { ThreatTimelinePanel } = await import('../ThreatTimelinePanel');
    render(<ThreatTimelinePanel timeline={[]} history={[]} />);
    expect(screen.getByTestId('timeline-empty')).toBeDefined();
  });

  it('renders timeline entries when data is provided', async () => {
    const { ThreatTimelinePanel } = await import('../ThreatTimelinePanel');
    const entries = [
      {
        id: 'tl-1-detection',
        threatId: 'threat-1',
        threatName: 'Malware.exe',
        stage: 'detection' as const,
        timestamp: Date.now(),
        description: 'Threat detected: Malware.exe',
        actor: 'ai' as const,
      },
      {
        id: 'tl-1-investigation',
        threatId: 'threat-1',
        threatName: 'Malware.exe',
        stage: 'investigation' as const,
        timestamp: Date.now() + 1000,
        description: 'AI investigation started',
        actor: 'ai' as const,
      },
    ];
    render(<ThreatTimelinePanel timeline={entries} history={[]} />);
    expect(screen.getByTestId('timeline-entries')).toBeDefined();
    expect(screen.getByTestId('timeline-threat-threat-1')).toBeDefined();
  });

  it('filters by stage', async () => {
    const { ThreatTimelinePanel } = await import('../ThreatTimelinePanel');
    const entries = [
      {
        id: 'tl-1-detection',
        threatId: 'threat-1',
        threatName: 'Test',
        stage: 'detection' as const,
        timestamp: Date.now(),
        description: 'Detected',
        actor: 'ai' as const,
      },
    ];
    render(<ThreatTimelinePanel timeline={entries} history={[]} />);
    fireEvent.click(screen.getByTestId('timeline-filter-detection'));
    expect(screen.getByTestId('timeline-threat-threat-1')).toBeDefined();
  });
});

// ── Provider Health Panel Tests ──────────────────────────────────────

describe('ProviderHealthPanel', () => {
  it('renders provider summary cards', async () => {
    const { ProviderHealthPanel } = await import('../ProviderHealthPanel');
    render(
      <ProviderHealthPanel
        providers={[
          { id: 'p1', name: 'Provider 1', type: 'monitor', status: 'healthy', latency: 5, lastRun: Date.now(), enabled: true, description: 'Test' },
          { id: 'p2', name: 'Provider 2', type: 'engine', status: 'degraded', latency: 50, lastRun: Date.now(), enabled: true, description: 'Test' },
        ]}
        health={null}
        diagnostics={null}
      />,
    );
    expect(screen.getByTestId('provider-health-panel')).toBeDefined();
    expect(screen.getByTestId('provider-summary-total')).toBeDefined();
    expect(screen.getByTestId('provider-summary-healthy')).toBeDefined();
    expect(screen.getByTestId('provider-summary-degraded')).toBeDefined();
  });

  it('renders provider list items', async () => {
    const { ProviderHealthPanel } = await import('../ProviderHealthPanel');
    render(
      <ProviderHealthPanel
        providers={[
          { id: 'test-provider', name: 'Test Provider', type: 'monitor', status: 'healthy', latency: 5, lastRun: Date.now(), enabled: true, description: 'A test provider' },
        ]}
        health={null}
        diagnostics={null}
      />,
    );
    expect(screen.getByTestId('provider-test-provider')).toBeDefined();
  });
});

// ── Security Analytics Panel Tests ───────────────────────────────────

describe('SecurityAnalyticsPanel', () => {
  it('renders analytics panel with metrics', async () => {
    const { SecurityAnalyticsPanel } = await import('../SecurityAnalyticsPanel');
    render(
      <SecurityAnalyticsPanel
        statistics={null}
        telemetry={null}
        history={[]}
        insights={[]}
      />,
    );
    expect(screen.getByTestId('security-analytics-panel')).toBeDefined();
    expect(screen.getByTestId('analytics-total-events')).toBeDefined();
    expect(screen.getByTestId('analytics-risk-trend')).toBeDefined();
    expect(screen.getByTestId('analytics-event-distribution')).toBeDefined();
    expect(screen.getByTestId('analytics-severity-heatmap')).toBeDefined();
  });

  it('renders severity heatmap with all severity levels', async () => {
    const { SecurityAnalyticsPanel } = await import('../SecurityAnalyticsPanel');
    render(
      <SecurityAnalyticsPanel
        statistics={null}
        telemetry={null}
        history={[]}
        insights={[]}
      />,
    );
    expect(screen.getByTestId('severity-heat-critical')).toBeDefined();
    expect(screen.getByTestId('severity-heat-high')).toBeDefined();
    expect(screen.getByTestId('severity-heat-medium')).toBeDefined();
    expect(screen.getByTestId('severity-heat-low')).toBeDefined();
    expect(screen.getByTestId('severity-heat-info')).toBeDefined();
  });
});

// ── AI Insights Panel Tests ──────────────────────────────────────────

describe('AIInsightsPanel', () => {
  it('renders nothing when no insights', async () => {
    const { AIInsightsPanel } = await import('../AIInsightsPanel');
    const { container } = render(<AIInsightsPanel insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders insights when provided', async () => {
    const { AIInsightsPanel } = await import('../AIInsightsPanel');
    render(
      <AIInsightsPanel
        insights={[
          {
            id: 'test-insight',
            title: 'Test Insight',
            description: 'A test insight for testing',
            severity: 'medium',
            confidence: 0.85,
            source: 'test',
            timestamp: Date.now(),
            actionable: true,
            recommendation: 'Take action',
          },
        ]}
      />,
    );
    expect(screen.getByTestId('ai-insights-panel')).toBeDefined();
    expect(screen.getByTestId('insight-test-insight')).toBeDefined();
  });
});

// ── Protection Reports Panel Tests ───────────────────────────────────

describe('ProtectionReportsPanel', () => {
  it('renders report type buttons', async () => {
    const { ProtectionReportsPanel } = await import('../ProtectionReportsPanel');
    render(
      <ProtectionReportsPanel
        reports={[]}
        onGenerate={() => {}}
        onExport={() => {}}
      />,
    );
    expect(screen.getByTestId('protection-reports-panel')).toBeDefined();
    expect(screen.getByTestId('report-card-security')).toBeDefined();
    expect(screen.getByTestId('report-card-weekly')).toBeDefined();
    expect(screen.getByTestId('report-card-threat_summary')).toBeDefined();
  });

  it('renders report detail when report is selected', async () => {
    const { ProtectionReportsPanel } = await import('../ProtectionReportsPanel');
    const report = {
      type: 'security' as const,
      title: 'Security Report',
      generatedAt: Date.now(),
      period: { start: Date.now() - 86400000, end: Date.now() },
      summary: 'Test summary',
      metrics: { score: 85, threats: 0 },
      details: ['Detail 1', 'Detail 2'],
    };
    render(
      <ProtectionReportsPanel
        reports={[report]}
        onGenerate={() => {}}
        onExport={() => {}}
      />,
    );
    expect(screen.getByTestId('report-detail')).toBeDefined();
    expect(screen.getByText('Test summary')).toBeDefined();
  });
});

// ── Security Search Panel Tests ──────────────────────────────────────

describe('SecuritySearchPanel', () => {
  it('renders empty state when no query', async () => {
    const { SecuritySearchPanel } = await import('../SecuritySearchPanel');
    render(
      <SecuritySearchPanel
        query=""
        results={null}
        onSearchChange={() => {}}
      />,
    );
    expect(screen.getByTestId('search-empty')).toBeDefined();
  });

  it('renders search input', async () => {
    const { SecuritySearchPanel } = await import('../SecuritySearchPanel');
    render(
      <SecuritySearchPanel
        query=""
        results={null}
        onSearchChange={() => {}}
      />,
    );
    expect(screen.getByTestId('security-search-input')).toBeDefined();
  });

  it('renders no results when query has no matches', async () => {
    const { SecuritySearchPanel } = await import('../SecuritySearchPanel');
    render(
      <SecuritySearchPanel
        query="zzz"
        results={[]}
        onSearchChange={() => {}}
      />,
    );
    expect(screen.getByTestId('search-no-results')).toBeDefined();
  });

  it('renders results when matches found', async () => {
    const { SecuritySearchPanel } = await import('../SecuritySearchPanel');
    render(
      <SecuritySearchPanel
        query="test"
        results={[
          { id: 'r1', type: 'threat', title: 'Test Threat', description: 'A test threat', timestamp: Date.now(), relevance: 1.0 },
        ]}
        onSearchChange={() => {}}
      />,
    );
    expect(screen.getByTestId('search-results')).toBeDefined();
    expect(screen.getByTestId('search-result-threat-r1')).toBeDefined();
  });
});

// ── Accessibility Tests ──────────────────────────────────────────────

describe('Accessibility', () => {
  it('tab navigation has correct ARIA roles', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });

    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeDefined();
    expect(tablist.getAttribute('aria-label')).toBe('Security dashboard sections');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(7);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('tab panels have correct ARIA attributes', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });

    const panel = screen.getByRole('tabpanel');
    expect(panel).toBeDefined();
    expect(panel.getAttribute('aria-labelledby')).toBeDefined();
  });

  it('command center has dialog ARIA attributes', async () => {
    const { default: SecurityDashboardPage } = await import('../SecurityDashboardPage');
    render(<SecurityDashboardPage />);
    await waitFor(() => {
      expect(screen.queryByTestId('security-dashboard-loading')).toBeNull();
    }, { timeout: 5000 });

    fireEvent.click(screen.getByTestId('btn-command-center'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('search input has aria-label', async () => {
    const { SecuritySearchPanel } = await import('../SecuritySearchPanel');
    render(
      <SecuritySearchPanel
        query=""
        results={null}
        onSearchChange={() => {}}
      />,
    );
    const input = screen.getByTestId('security-search-input');
    expect(input.getAttribute('aria-label')).toBe('Search security data');
  });
});

// ── Regression Tests ─────────────────────────────────────────────────

describe('Regression', () => {
  it('ViewModel does not throw on rapid tab switches', async () => {
    const vm = createTestVM();
    await vm.bootstrap();
    expect(() => {
      vm.setActiveTab('protection');
      vm.setActiveTab('timeline');
      vm.setActiveTab('providers');
      vm.setActiveTab('analytics');
      vm.setActiveTab('reports');
      vm.setActiveTab('search');
      vm.setActiveTab('overview');
    }).not.toThrow();
    vm.dispose();
  });

  it('ViewModel handles rapid pause/resume cycles', async () => {
    const vm = createTestVM();
    await vm.bootstrap();
    expect(() => {
      vm.pauseProtection();
      vm.resumeProtection();
      vm.pauseProtection();
      vm.resumeProtection();
    }).not.toThrow();
    vm.dispose();
  });

  it('ViewModel handles search with special characters', async () => {
    const vm = createTestVM();
    await vm.bootstrap();
    expect(() => {
      vm.setSearchQuery('!@#$%^&*()');
      vm.setSearchQuery('');
    }).not.toThrow();
    vm.dispose();
  });

  it('report generation is idempotent', async () => {
    const vm = createTestVM();
    await vm.bootstrap();
    vm.generateReport('security');
    const countAfterFirst = vm.state.reports.length;
    vm.generateReport('security');
    const countAfterSecond = vm.state.reports.length;
    expect(countAfterFirst).toBe(countAfterSecond);
    vm.dispose();
  });

  it('export does not throw for all formats', async () => {
    const vm = createTestVM();
    await vm.bootstrap();
    expect(() => {
      vm.exportReport('security', 'json');
      vm.exportReport('security', 'csv');
      vm.exportReport('security', 'txt');
      vm.exportReport('weekly', 'json');
      vm.exportReport('weekly', 'csv');
      vm.exportReport('weekly', 'txt');
    }).not.toThrow();
    vm.dispose();
  });

  it('dispose can be called multiple times safely', () => {
    const vm = createTestVM();
    vm.dispose();
    expect(() => vm.dispose()).not.toThrow();
  });
});
