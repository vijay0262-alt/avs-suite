/**
 * SecurityDashboardPage — the AI Active Protection Dashboard.
 *
 * A premium security dashboard giving users a complete real-time view
 * of their computer's security posture. Tabbed interface with:
 *   - Overview: security score, protection status, AI confidence, threat level
 *   - Protection: live monitoring counts, active monitors, controls
 *   - Timeline: threat activity timeline (detection → resolution)
 *   - Providers: provider health with latency and status
 *   - Analytics: charts, risk trends, severity heatmaps
 *   - Reports: security, weekly, threat, investigation, remediation summaries
 *   - Search: unified search across threats, processes, investigations, etc.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button, StatCard, DashboardSection } from '@avs/ui';
import type { BadgeTone } from '@avs/ui';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  CpuChipIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { ModuleErrorState, ModuleLoadingState } from '../../components/ModuleStates';
import { SecurityDashboardViewModel } from './SecurityDashboardViewModel';
import type { DashboardTab } from './SecurityDashboardViewModel';
import { OverviewPanel } from './OverviewPanel';
import { ProtectionStatusPanel } from './ProtectionStatusPanel';
import { ThreatTimelinePanel } from './ThreatTimelinePanel';
import { ProviderHealthPanel } from './ProviderHealthPanel';
import { SecurityAnalyticsPanel } from './SecurityAnalyticsPanel';
import { CommandCenter } from './CommandCenter';
import { ProtectionReportsPanel } from './ProtectionReportsPanel';
import { AIInsightsPanel } from './AIInsightsPanel';
import { SecuritySearchPanel } from './SecuritySearchPanel';

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'protection', label: 'Protection' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'providers', label: 'Providers' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'reports', label: 'Reports' },
  { id: 'search', label: 'Search' },
];

export default function SecurityDashboardPage() {
  const vm = useMemo(() => new SecurityDashboardViewModel(), []);
  const state = useViewModel(vm);
  const [showCommandCenter, setShowCommandCenter] = useState(false);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleTabChange = useCallback((tab: DashboardTab) => vm.setActiveTab(tab), [vm]);
  const handleToggleCommandCenter = useCallback(() => setShowCommandCenter((v) => !v), []);

  if (state.bootstrap === 'loading') {
    return (
      <div data-testid="page-security-dashboard">
        <PageHeader
          title="AI Active Protection"
          description="Real-time security monitoring and threat protection"
          actions={<HelpButton text="AI Active Protection monitors your system in real-time." />}
        />
        <ModuleLoadingState message="Initializing security dashboard…" testId="security-dashboard-loading" />
      </div>
    );
  }

  if (state.bootstrap === 'error') {
    return (
      <div data-testid="page-security-dashboard">
        <PageHeader
          title="AI Active Protection"
          description="Real-time security monitoring and threat protection"
          actions={<HelpButton text="AI Active Protection monitors your system in real-time." />}
        />
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="security-dashboard-error"
        />
      </div>
    );
  }

  const overview = state.overview;

  return (
    <div data-testid="page-security-dashboard" className="space-y-6">
      <PageHeader
        title="AI Active Protection"
        description="Real-time security monitoring and threat protection"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleToggleCommandCenter}
              data-testid="btn-command-center"
            >
              Command Center
            </Button>
            <HelpButton text="AI Active Protection monitors your system in real-time." />
          </div>
        }
      />

      {/* Status bar — always visible */}
      {overview && (
        <DashboardSection>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="security-status-bar">
            <StatCard
              label="Security Score"
              value={overview.securityScore}
              unit="/ 100"
              icon={<ShieldCheckIcon className="h-5 w-5" />}
              tone={overview.securityScore >= 80 ? 'success' : overview.securityScore >= 60 ? 'warning' : 'danger'}
              description={overview.threatLevel !== 'none' ? `Threat level: ${overview.threatLevel}` : 'No active threats'}
              progress={overview.securityScore}
              data-testid="stat-security-score"
            />
            <StatCard
              label="Protection Status"
              value={overview.protectionStatus}
              icon={<ShieldExclamationIcon className="h-5 w-5" />}
              tone={protectionStatusTone(overview.protectionStatus) as 'success' | 'warning' | 'danger' | 'neutral'}
              description={`Mode: ${overview.protectionMode}`}
              progress={overview.protectionStatus === 'running' ? 100 : overview.protectionStatus === 'paused' ? 50 : 20}
              data-testid="stat-protection-status"
            />
            <StatCard
              label="AI Confidence"
              value={`${(overview.aiConfidenceScore * 100).toFixed(0)}%`}
              icon={<CpuChipIcon className="h-5 w-5" />}
              tone={overview.aiConfidenceScore >= 0.8 ? 'success' : overview.aiConfidenceScore >= 0.5 ? 'warning' : 'danger'}
              description="Based on evidence and provider health"
              progress={overview.aiConfidenceScore * 100}
              data-testid="stat-ai-confidence"
            />
            <StatCard
              label="Real-Time Status"
              value={overview.realTimeStatus}
              icon={<EyeIcon className="h-5 w-5" />}
              tone={realTimeStatusTone(overview.realTimeStatus) as 'success' | 'warning' | 'danger' | 'neutral'}
              description={`${overview.activeMonitors}/${overview.totalMonitors} monitors active`}
              progress={overview.totalMonitors > 0 ? (overview.activeMonitors / overview.totalMonitors) * 100 : 0}
              data-testid="stat-realtime-status"
            />
          </div>
        </DashboardSection>
      )}

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-1 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] p-1" role="tablist" aria-label="Security dashboard sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={state.activeTab === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => handleTabChange(tab.id)}
            className={
              state.activeTab === tab.id
                ? 'px-4 py-2 text-sm font-medium text-white rounded-[var(--avs-radius-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]'
                : 'px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary rounded-[var(--avs-radius-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary transition-all duration-[var(--avs-duration-fast)] ease-[var(--avs-easing)]'
            }
            style={state.activeTab === tab.id ? { background: 'var(--avs-gradient-brand)' } : undefined}
            data-testid={`tab-btn-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div
        role="tabpanel"
        id={`tabpanel-${state.activeTab}`}
        aria-labelledby={`tab-${state.activeTab}`}
        data-testid={`tabpanel-${state.activeTab}`}
      >
        {state.activeTab === 'overview' && (
          <OverviewPanel
            overview={state.overview}
            liveCounts={state.liveCounts}
            insights={state.insights}
            health={state.health}
            statistics={state.statistics}
            telemetry={state.telemetry}
            session={state.session}
            lastUpdated={state.lastUpdated}
          />
        )}

        {state.activeTab === 'protection' && (
          <ProtectionStatusPanel
            overview={state.overview}
            monitors={state.monitors}
            liveCounts={state.liveCounts}
            onPause={() => vm.pauseProtection()}
            onResume={() => vm.resumeProtection()}
            onEnableMonitor={(type) => vm.enableMonitor(type)}
            onDisableMonitor={(type) => vm.disableMonitor(type)}
            onSetMode={(mode) => vm.setProtectionMode(mode)}
          />
        )}

        {state.activeTab === 'timeline' && (
          <ThreatTimelinePanel
            timeline={state.timeline}
            history={state.history}
          />
        )}

        {state.activeTab === 'providers' && (
          <ProviderHealthPanel
            providers={state.providers}
            health={state.health}
            diagnostics={state.diagnostics}
          />
        )}

        {state.activeTab === 'analytics' && (
          <SecurityAnalyticsPanel
            statistics={state.statistics}
            telemetry={state.telemetry}
            history={state.history}
            insights={state.insights}
          />
        )}

        {state.activeTab === 'reports' && (
          <ProtectionReportsPanel
            reports={state.reports}
            onGenerate={(type) => vm.generateReport(type)}
            onExport={(type, format) => vm.exportReport(type, format)}
          />
        )}

        {state.activeTab === 'search' && (
          <SecuritySearchPanel
            query={state.searchQuery}
            results={state.searchResults}
            onSearchChange={(q) => vm.setSearchQuery(q)}
          />
        )}
      </div>

      {/* AI Insights — always visible below tabs */}
      {state.activeTab !== 'search' && (state.insights?.length ?? 0) > 0 && (
        <AIInsightsPanel insights={state.insights} />
      )}

      {/* Command Center modal */}
      {showCommandCenter && (
        <CommandCenter
          overview={state.overview}
          onClose={handleToggleCommandCenter}
          onRunQuickScan={() => vm.refresh()}
          onRunFullScan={() => vm.refresh()}
          onRunCustomScan={() => vm.refresh()}
          onViewInvestigations={() => handleTabChange('timeline')}
          onReviewQuarantine={() => handleTabChange('timeline')}
          onReviewFalsePositives={() => handleTabChange('search')}
          onReviewRecommendations={() => handleTabChange('overview')}
          onExportReports={() => handleTabChange('reports')}
        />
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function protectionStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'running': return 'success';
    case 'paused': return 'warning';
    case 'error': return 'danger';
    default: return 'neutral';
  }
}

function realTimeStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'active': return 'success';
    case 'paused': return 'warning';
    case 'error': return 'danger';
    default: return 'neutral';
  }
}
