/**
 * AIWorkspacePage — exposes the ai-workspace backend modules.
 *
 * Tabs:
 *   - Command Center: widget dashboard, search, layout management
 *   - AIAssistant: prompt processing, suggestions, analytics
 *   - Report Studio: report generation, history, export, scheduling
 *   - Tools: AI tool discovery and execution analytics
 *   - Actions: natural language action planning
 *   - Personalization: workspace profiles, preferences, templates
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState } from '../../components/ModuleStates';
import { CommandCenterManager } from './command-center/commandCenterManager';
import { AIAssistantManager } from './aiAssistant/aiAssistantManager';
import { ReportStudioManager } from './report-studio/reportStudioManager';
import { ToolManager } from './tools/toolManager';
import { NaturalLanguageActionManager } from './actions/naturalLanguageActionManager';
import { WorkspacePersonalizationManager } from './personalization/workspacePersonalizationManager';
import type { DashboardState, SearchResult, SearchQuery } from './command-center/types';
import type { AIAssistantSuggestion, AIAssistantPromptResult } from './aiAssistant/types';
import type { Report, ReportHistoryEntry, ReportSchedule } from './report-studio/types';
import type { ToolDefinition } from './tools/types';
import type { ParsedRequest } from './actions/types';
import type { WorkspaceProfile } from './personalization/types';

type CCAnalytics = ReturnType<CommandCenterManager['getAnalytics']>;
type AIAssistantAnalyticsData = ReturnType<AIAssistantManager['getAnalytics']>;
type ReportAnalytics = ReturnType<ReportStudioManager['getAnalytics']>;
type ToolStats = ReturnType<ToolManager['getToolStatistics']>;
type ActionStats = ReturnType<NaturalLanguageActionManager['getAnalytics']>;
type WorkspaceStats = ReturnType<WorkspacePersonalizationManager['getAnalytics']>;
import {
  Squares2X2Icon,
  ChatBubbleLeftRightIcon,
  DocumentChartBarIcon,
  WrenchScrewdriverIcon,
  BoltIcon,
  Cog6ToothIcon,
  ArrowPathIcon,
  SparklesIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';

type WorkspaceTab = 'command-center' | 'aiAssistant' | 'report-studio' | 'tools' | 'actions' | 'personalization';

interface AIWorkspaceState {
  bootstrap: 'idle' | 'loading' | 'ready' | 'error';
  activeTab: WorkspaceTab;
  // Command Center
  dashboardState: DashboardState | null;
  ccAnalytics: CCAnalytics | null;
  searchResults: SearchResult[];
  searchQuery: string;
  // AVS AI Assistant
  aiAssistantAnalytics: AIAssistantAnalyticsData | null;
  aiAssistantSuggestions: AIAssistantSuggestion[];
  aiAssistantResult: AIAssistantPromptResult | null;
  aiAssistantInput: string;
  isProcessingPrompt: boolean;
  // Report Studio
  reports: Report[];
  reportHistory: ReportHistoryEntry[];
  reportAnalytics: ReportAnalytics | null;
  scheduledReports: ReportSchedule[];
  availableReportTypes: { type: string; title: string; description: string }[];
  // Tools
  toolStatistics: ToolStats | null;
  registeredTools: ToolDefinition[];
  // Actions
  actionAnalytics: ActionStats | null;
  actionInput: string;
  parsedRequest: ParsedRequest | null;
  // Personalization
  profiles: WorkspaceProfile[];
  workspaceAnalytics: WorkspaceStats | null;
  error: string | null;
}

class AIWorkspaceViewModel extends ViewModel<AIWorkspaceState> {
  private ccManager: CommandCenterManager;
  private aiAssistantManager: AIAssistantManager;
  private reportStudio: ReportStudioManager;
  private toolManager: ToolManager;
  private actionManager: NaturalLanguageActionManager;
  private personalizationManager: WorkspacePersonalizationManager;

  constructor() {
    super({
      bootstrap: 'idle',
      activeTab: 'command-center',
      dashboardState: null,
      ccAnalytics: null,
      searchResults: [],
      searchQuery: '',
      aiAssistantAnalytics: null,
      aiAssistantSuggestions: [],
      aiAssistantResult: null,
      aiAssistantInput: '',
      isProcessingPrompt: false,
      reports: [],
      reportHistory: [],
      reportAnalytics: null,
      scheduledReports: [],
      availableReportTypes: [],
      toolStatistics: null,
      registeredTools: [],
      actionAnalytics: null,
      actionInput: '',
      parsedRequest: null,
      profiles: [],
      workspaceAnalytics: null,
      error: null,
    });
    this.ccManager = new CommandCenterManager();
    this.aiAssistantManager = new AIAssistantManager();
    this.reportStudio = new ReportStudioManager();
    this.toolManager = new ToolManager();
    this.actionManager = new NaturalLanguageActionManager();
    this.personalizationManager = new WorkspacePersonalizationManager();
  }

  bootstrap() {
    this.setState({ bootstrap: 'loading' });
    try {
      this.setState({
        ccAnalytics: this.ccManager.getAnalytics(),
        aiAssistantAnalytics: this.aiAssistantManager.getAnalytics(),
        reportAnalytics: this.reportStudio.getAnalytics(),
        reportHistory: this.reportStudio.getReportHistory(),
        scheduledReports: this.reportStudio.getScheduledReports(),
        availableReportTypes: this.reportStudio.getAvailableReportTypes(),
        toolStatistics: this.toolManager.getToolStatistics(),
        registeredTools: this.toolManager.getRegistry().getAllDefinitions(),
        actionAnalytics: this.actionManager.getAnalytics(),
        workspaceAnalytics: this.personalizationManager.getAnalytics(),
        profiles: this.personalizationManager.getAvailableProfiles(),
        bootstrap: 'ready',
      });
    } catch (e) {
      this.setState({ bootstrap: 'error', error: e instanceof Error ? e.message : 'Failed to initialize' });
    }
  }

  setTab(tab: WorkspaceTab) {
    this.setState({ activeTab: tab });
  }

  // ── Command Center ───────────────────────────────────────────

  async loadDashboard() {
    try {
      const state = await this.ccManager.loadDashboard();
      this.setState({ dashboardState: state, ccAnalytics: this.ccManager.getAnalytics() });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Failed to load dashboard' });
    }
  }

  async refreshAll() {
    try {
      await this.ccManager.refreshAll();
      this.setState({ dashboardState: this.ccManager.getDashboardState() });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Refresh failed' });
    }
  }

  search(query: string) {
    this.setState({ searchQuery: query });
    if (!query.trim()) {
      this.setState({ searchResults: [] });
      return;
    }
    const sq: SearchQuery = { query };
    const results = this.ccManager.search(sq);
    this.setState({ searchResults: results });
  }

  // ── AIAssistant ──────────────────────────────────────────────────

  setAIAssistantInput(text: string) {
    this.setState({ aiAssistantInput: text });
  }

  processPrompt() {
    const { aiAssistantInput } = this.state;
    if (!aiAssistantInput.trim()) return;
    this.setState({ isProcessingPrompt: true, error: null });
    try {
      const result = this.aiAssistantManager.processPrompt(
        { prompt: aiAssistantInput, conversationId: 'ui-' + Date.now(), userPermissionLevel: 'free', userPreferences: {}, futureMetadata: {} },
        { healthScore: 75, sources: [], futureMetadata: {} } as never,
      );
      this.setState({
        aiAssistantResult: result,
        aiAssistantSuggestions: result.suggestions,
        aiAssistantAnalytics: this.aiAssistantManager.getAnalytics(),
        isProcessingPrompt: false,
      });
    } catch (e) {
      this.setState({ isProcessingPrompt: false, error: e instanceof Error ? e.message : 'Prompt failed' });
    }
  }

  // ── Report Studio ────────────────────────────────────────────

  generateReport(type: string) {
    try {
      const report = this.reportStudio.generateReport(type as never);
      this.setState({
        reports: [report, ...this.state.reports],
        reportHistory: this.reportStudio.getReportHistory(),
        reportAnalytics: this.reportStudio.getAnalytics(),
      });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Report generation failed' });
    }
  }

  exportReport(report: Report) {
    try {
      this.reportStudio.exportReport(report);
      this.setState({ reportAnalytics: this.reportStudio.getAnalytics() });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Export failed' });
    }
  }

  cancelSchedule(scheduleId: string) {
    this.reportStudio.cancelSchedule(scheduleId);
    this.setState({ scheduledReports: this.reportStudio.getScheduledReports() });
  }

  // ── Actions ──────────────────────────────────────────────────

  setActionInput(text: string) {
    this.setState({ actionInput: text });
  }

  parseActionRequest() {
    const { actionInput } = this.state;
    if (!actionInput.trim()) return;
    try {
      const parsed = this.actionManager.parseRequest(actionInput);
      this.setState({
        parsedRequest: parsed,
        actionAnalytics: this.actionManager.getAnalytics(),
      });
    } catch (e) {
      this.setState({ error: e instanceof Error ? e.message : 'Action parsing failed' });
    }
  }

  // ── Personalization ──────────────────────────────────────────

  setActiveProfile(_profileId: string) {
    // Profile activation requires loadWorkspace(userId) — deferred to future wiring
  }

  override dispose() {
    super.dispose();
    this.ccManager.clearAll();
    this.aiAssistantManager.clearAll();
    this.reportStudio.clearAll();
    this.toolManager.clearAll();
    this.actionManager.clearAll();
  }
}

// ── Page ───────────────────────────────────────────────────────

const TABS: { id: WorkspaceTab; label: string; icon: typeof Squares2X2Icon }[] = [
  { id: 'command-center', label: 'Command Center', icon: Squares2X2Icon },
  { id: 'aiAssistant', label: 'AVS AI Assistant', icon: ChatBubbleLeftRightIcon },
  { id: 'report-studio', label: 'Report Studio', icon: DocumentChartBarIcon },
  { id: 'tools', label: 'AI Tools', icon: WrenchScrewdriverIcon },
  { id: 'actions', label: 'Actions', icon: BoltIcon },
  { id: 'personalization', label: 'Personalization', icon: Cog6ToothIcon },
];

export default function AIWorkspacePage() {
  const vm = useMemo(() => new AIWorkspaceViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  if (state.bootstrap === 'loading') {
    return (
      <div className="px-6 py-6">
        <PageHeader title="AI Workspace"        description="Unified AI platform: Command Center, AVS AI Assistant, Report Studio, Tools, Actions, and Personalization." />
        <ModuleLoadingState />
      </div>
    );
  }

  const s = state;

  return (
    <div className="px-6 py-6 space-y-6">
      <PageHeader
        title="AI Workspace"
        description="Unified AI platform: Command Center, AVS AI Assistant, Report Studio, Tools, Actions, and Personalization."
        actions={
          <Button
            onClick={() => vm.loadDashboard()}
            leftIcon={<ArrowPathIcon className="h-4 w-4" />}
            variant="secondary"
          >
            Refresh
          </Button>
        }
      />

      {/* Tab Bar */}
      <div className="flex items-center gap-1 border-b border-[var(--avs-glass-border)] pb-px">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => vm.setTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              s.activeTab === tab.id
                ? 'text-[var(--avs-brand-primary)] border-b-2 border-[var(--avs-brand-primary)]'
                : 'text-[var(--avs-text-muted)] hover:text-[var(--avs-text-primary)]'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {s.activeTab === 'command-center' && <CommandCenterTab state={s} vm={vm} />}
      {s.activeTab === 'aiAssistant' && <AIAssistantTab state={s} vm={vm} />}
      {s.activeTab === 'report-studio' && <ReportStudioTab state={s} vm={vm} />}
      {s.activeTab === 'tools' && <ToolsTab state={s} />}
      {s.activeTab === 'actions' && <ActionsTab state={s} vm={vm} />}
      {s.activeTab === 'personalization' && <PersonalizationTab state={s} vm={vm} />}

      {s.error && (
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-danger)]/10 p-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-[var(--avs-danger)]" />
            <span className="text-sm text-[var(--avs-danger)]">{s.error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Command Center Tab ─────────────────────────────────────────

function CommandCenterTab({ state, vm }: { state: AIWorkspaceState; vm: AIWorkspaceViewModel }) {
  const s = state;
  const dash = s.dashboardState;

  return (
    <div className="space-y-4">
      {/* Analytics */}
      {s.ccAnalytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Dashboard Loads" value={s.ccAnalytics.totalDashboardLoads} icon={ChartBarIcon} />
          <StatBox label="Widget Refreshes" value={s.ccAnalytics.totalWidgetRefreshes} icon={ArrowPathIcon} />
          <StatBox label="Layouts Saved" value={s.ccAnalytics.totalLayoutSaves} icon={Squares2X2Icon} />
          <StatBox label="Avg Load Time" value={`${s.ccAnalytics.averageLoadTimeMs.toFixed(0)}ms`} icon={ClockIcon} />
        </div>
      )}

      {/* Search */}
      <Card title="Search" variant="glass">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--avs-text-muted)]" />
            <input
              value={s.searchQuery}
              onChange={(e) => vm.search(e.target.value)}
              placeholder="Search widgets, actions, recommendations..."
              className="w-full rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] pl-9 pr-3 py-2 text-sm text-[var(--avs-text-primary)]"
            />
          </div>
          <Button onClick={() => vm.refreshAll()} leftIcon={<ArrowPathIcon className="h-4 w-4" />} variant="secondary">
            Refresh All
          </Button>
        </div>
        {s.searchResults.length > 0 && (
          <div className="mt-3 space-y-1">
            {s.searchResults.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <SparklesIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                <span className="text-sm text-[var(--avs-text-primary)]">{r.title}</span>
                <Badge tone="neutral" className="ml-auto">{r.type}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Dashboard Widgets */}
      {dash ? (
        <Card title="Dashboard Widgets" variant="glass">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {dash.widgets.map((w) => (
              <div key={w.definition.id} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--avs-text-primary)]">{w.definition.title}</span>
                  <Badge tone={w.status === 'visible' ? 'success' : w.status === 'error' ? 'danger' : 'neutral'}>{w.status}</Badge>
                </div>
                <p className="text-xs text-[var(--avs-text-muted)] mt-1">{w.definition.category}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <ModuleEmptyState
            icon={Squares2X2Icon}
            title="Dashboard not loaded"
            message="Click 'Refresh' to load the AI Command Center dashboard."
          />
        </Card>
      )}
    </div>
  );
}

// ── AIAssistant Tab ────────────────────────────────────────────────

function AIAssistantTab({ state, vm }: { state: AIWorkspaceState; vm: AIWorkspaceViewModel }) {
  const s = state;

  return (
    <div className="space-y-4">
      {s.aiAssistantAnalytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Conversations" value={s.aiAssistantAnalytics.totalConversations} icon={ChatBubbleLeftRightIcon} />
          <StatBox label="Messages" value={s.aiAssistantAnalytics.totalMessages} icon={SparklesIcon} />
          <StatBox label="Avg Confidence" value={`${(s.aiAssistantAnalytics.averageConfidence * 100).toFixed(0)}%`} icon={LightBulbIcon} />
          <StatBox label="Action Plan Rate" value={`${(s.aiAssistantAnalytics.actionPlanRate * 100).toFixed(0)}%`} icon={BoltIcon} />
        </div>
      )}

      <Card title="Process Prompt" variant="glass">
        <div className="flex items-center gap-2">
          <input
            value={s.aiAssistantInput}
            onChange={(e) => vm.setAIAssistantInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && vm.processPrompt()}
            placeholder="Ask the AVS AI Assistant..."
            className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-sm text-[var(--avs-text-primary)]"
          />
          <Button onClick={() => vm.processPrompt()} loading={s.isProcessingPrompt} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Process
          </Button>
        </div>
      </Card>

      {s.aiAssistantResult && (
        <Card title="Last Response" variant="glass">
          <div className="space-y-3">
            <p className="text-sm text-[var(--avs-text-primary)]">{s.aiAssistantResult.response.answer}</p>
            <div className="flex items-center gap-2">
              <Badge tone="brand">{s.aiAssistantResult.response.intent}</Badge>
              <span className="text-xs text-[var(--avs-text-muted)]">
                Confidence: {(s.aiAssistantResult.response.confidence * 100).toFixed(0)}%
              </span>
              <span className="text-xs text-[var(--avs-text-muted)]">
                {(s.aiAssistantResult.processingTimeMs / 1000).toFixed(2)}s
              </span>
            </div>
            {s.aiAssistantSuggestions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--avs-text-muted)] mb-1">Suggestions</h4>
                {s.aiAssistantSuggestions.map((sug) => (
                  <div key={sug.id} className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2 mt-1">
                    <LightBulbIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                    <span className="text-xs text-[var(--avs-text-primary)]">{sug.title}</span>
                    <Badge tone="neutral" className="ml-auto">{sug.priority}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Report Studio Tab ──────────────────────────────────────────

function ReportStudioTab({ state, vm }: { state: AIWorkspaceState; vm: AIWorkspaceViewModel }) {
  const s = state;

  return (
    <div className="space-y-4">
      {s.reportAnalytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Reports Generated" value={s.reportAnalytics.totalReportsGenerated} icon={DocumentChartBarIcon} />
          <StatBox label="Exports" value={s.reportAnalytics.totalExports} icon={ArrowDownTrayIcon} />
          <StatBox label="Comparisons" value={s.reportAnalytics.totalComparisons} icon={ChartBarIcon} />
          <StatBox label="Scheduled" value={s.reportAnalytics.totalScheduled} icon={ClockIcon} />
        </div>
      )}

      {/* Generate Report */}
      <Card title="Generate Report" variant="glass">
        <div className="flex flex-wrap gap-2">
          {s.availableReportTypes.map((rt) => (
            <Button
              key={rt.type}
              onClick={() => vm.generateReport(rt.type)}
              variant="secondary"
              size="sm"
              leftIcon={<PlusIcon className="h-3.5 w-3.5" />}
            >
              {rt.title}
            </Button>
          ))}
        </div>
      </Card>

      {/* Generated Reports */}
      {s.reports.length > 0 && (
        <Card title="Generated Reports" variant="glass">
          <div className="space-y-2">
            {s.reports.map((report) => (
              <div key={report.id} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <DocumentChartBarIcon className="h-4 w-4 text-[var(--avs-brand-primary)]" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-[var(--avs-text-primary)]">{report.title}</span>
                  <span className="text-xs text-[var(--avs-text-muted)] ml-2">{report.type}</span>
                </div>
                <Badge tone={report.status === 'exported' ? 'success' : 'neutral'}>{report.status}</Badge>
                <Button onClick={() => vm.exportReport(report)} size="sm" variant="ghost" leftIcon={<ArrowDownTrayIcon className="h-3.5 w-3.5" />}>
                  Export
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Scheduled Reports */}
      {s.scheduledReports.length > 0 && (
        <Card title="Scheduled Reports" variant="glass">
          <div className="space-y-2">
            {s.scheduledReports.map((sched) => (
              <div key={sched.id} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <ClockIcon className="h-4 w-4 text-[var(--avs-text-muted)]" />
                <span className="text-sm text-[var(--avs-text-primary)]">{sched.reportType}</span>
                <Badge tone="brand">{sched.frequency}</Badge>
                <button
                  onClick={() => vm.cancelSchedule(sched.id)}
                  className="ml-auto text-[var(--avs-text-muted)] hover:text-[var(--avs-danger)]"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* History */}
      {s.reportHistory.length > 0 && (
        <Card title="Report History" variant="glass">
          <div className="space-y-1">
            {s.reportHistory.slice(0, 10).map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
                <DocumentChartBarIcon className="h-3.5 w-3.5 text-[var(--avs-text-muted)]" />
                <span className="text-xs text-[var(--avs-text-primary)]">{entry.reportType}</span>
                <span className="text-xs text-[var(--avs-text-muted)] ml-auto">
                  {new Date(entry.generatedAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Tools Tab ──────────────────────────────────────────────────

function ToolsTab({ state }: { state: AIWorkspaceState }) {
  const s = state;

  return (
    <div className="space-y-4">
      {s.toolStatistics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Total Tools" value={s.registeredTools.length} icon={WrenchScrewdriverIcon} />
          <StatBox label="Executions" value={s.toolStatistics.totalExecutions} icon={BoltIcon} />
          <StatBox label="Successful" value={s.toolStatistics.successfulExecutions} icon={CheckCircleIcon} />
          <StatBox label="Failed" value={s.toolStatistics.failedExecutions} icon={ExclamationTriangleIcon} />
        </div>
      )}

      <Card title="Registered AI Tools" variant="glass">
        {s.registeredTools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {s.registeredTools.map((tool) => (
              <div key={tool.id} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--avs-text-primary)]">{tool.name}</span>
                  <Badge tone="brand">{tool.category}</Badge>
                </div>
                <p className="text-xs text-[var(--avs-text-muted)] mt-1">{tool.description}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge tone={tool.riskLevel === 'none' ? 'success' : tool.riskLevel === 'low' ? 'success' : 'warning'}>
                    Risk: {tool.riskLevel}
                  </Badge>
                  <span className="text-xs text-[var(--avs-text-muted)]">{tool.outputType}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ModuleEmptyState icon={WrenchScrewdriverIcon} title="No tools registered" message="AI tools will appear here when registered." />
        )}
      </Card>
    </div>
  );
}

// ── Actions Tab ────────────────────────────────────────────────

function ActionsTab({ state, vm }: { state: AIWorkspaceState; vm: AIWorkspaceViewModel }) {
  const s = state;

  return (
    <div className="space-y-4">
      {s.actionAnalytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Total Requests" value={s.actionAnalytics.totalRequests} icon={ChatBubbleLeftRightIcon} />
          <StatBox label="Plans Generated" value={s.actionAnalytics.totalPlansGenerated} icon={BoltIcon} />
          <StatBox label="Approved" value={s.actionAnalytics.totalApproved} icon={CheckCircleIcon} />
          <StatBox label="Rejected" value={s.actionAnalytics.totalRejected} icon={ExclamationTriangleIcon} />
        </div>
      )}

      <Card title="Natural Language Action" variant="glass">
        <div className="flex items-center gap-2">
          <input
            value={s.actionInput}
            onChange={(e) => vm.setActionInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && vm.parseActionRequest()}
            placeholder="Describe an action in natural language..."
            className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-sm text-[var(--avs-text-primary)]"
          />
          <Button onClick={() => vm.parseActionRequest()} leftIcon={<BoltIcon className="h-4 w-4" />}>
            Parse
          </Button>
        </div>
      </Card>

      {s.parsedRequest && (
        <Card title="Parsed Request" variant="glass">
          <div className="space-y-2">
            {s.parsedRequest.intent && (
              <div className="flex items-center gap-2">
                <Badge tone="brand">{s.parsedRequest.intent.intent}</Badge>
                <span className="text-xs text-[var(--avs-text-muted)]">
                  Confidence: {(s.parsedRequest.intent.confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
            {s.parsedRequest.entities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {s.parsedRequest.entities.map((e, i) => (
                  <Badge key={i} tone="neutral">{e.type}: {e.value}</Badge>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {s.parsedRequest?.actionPlan && (
        <Card title="Action Plan" variant="glass">
          <div className="space-y-2">
            <div className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--avs-text-primary)]">{s.parsedRequest.actionPlan.estimatedBenefit}</span>
                <Badge tone={s.parsedRequest.actionPlan.status === 'approved' ? 'success' : s.parsedRequest.actionPlan.status === 'rejected' ? 'danger' : 'neutral'}>
                  {s.parsedRequest.actionPlan.status}
                </Badge>
              </div>
              <p className="text-xs text-[var(--avs-text-muted)] mt-1">{s.parsedRequest.actionPlan.explanation.summary}</p>
              {s.parsedRequest.actionPlan.steps.length > 0 && (
                <div className="mt-2 space-y-1">
                  {s.parsedRequest.actionPlan.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2 text-xs text-[var(--avs-text-secondary)]">
                      <span className="font-medium text-[var(--avs-text-muted)]">{i + 1}.</span>
                      <span>{step.description}</span>
                      <Badge tone="neutral" className="ml-auto">{step.riskLevel}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Personalization Tab ────────────────────────────────────────

function PersonalizationTab({ state }: { state: AIWorkspaceState; vm: AIWorkspaceViewModel }) {
  const s = state;

  return (
    <div className="space-y-4">
      {s.workspaceAnalytics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatBox label="Profiles" value={s.profiles.length} icon={Cog6ToothIcon} />
          <StatBox label="Sessions" value={s.workspaceAnalytics.totalSessions} icon={SparklesIcon} />
          <StatBox label="Suggestions Generated" value={s.workspaceAnalytics.totalSuggestionsGenerated} icon={LightBulbIcon} />
          <StatBox label="Behavior Events" value={s.workspaceAnalytics.totalBehaviorEvents} icon={ChartBarIcon} />
        </div>
      )}

      {/* Profile Selection */}
      <Card title="Workspace Profiles" variant="glass">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {s.profiles.map((profile) => (
            <div
              key={profile.id}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] p-4 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--avs-text-primary)]">{profile.label}</span>
                {profile.isBuiltIn && <Badge tone="brand">Built-in</Badge>}
              </div>
              <p className="text-xs text-[var(--avs-text-muted)] mt-1">{profile.type}</p>
              {profile.description && (
                <p className="text-xs text-[var(--avs-text-secondary)] mt-2">{profile.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2">
                <Badge tone="neutral">{profile.aiInteractionStyle}</Badge>
                <span className="text-xs text-[var(--avs-text-muted)]">{profile.quickActions.length} quick actions</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Shared Sub-components ──────────────────────────────────────

function StatBox({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof ChartBarIcon }) {
  return (
    <Card variant="glass" className="p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
        <div>
          <p className="text-xs text-[var(--avs-text-muted)]">{label}</p>
          <p className="text-lg font-bold text-[var(--avs-text-primary)]">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function _PrefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2">
      <span className="text-xs font-medium text-[var(--avs-text-muted)]">{label}</span>
      <span className="text-xs text-[var(--avs-text-primary)] capitalize">{value}</span>
    </div>
  );
}
