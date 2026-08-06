/**
 * AIDailyBriefingPage — standalone AI Daily Briefing page.
 *
 * Uses the ConversationEngine to generate insights and dashboard data,
 * then renders the DailyBriefingView from the AIAssistant page.
 */
import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState } from '../../components/ModuleStates';
import { conversationEngine } from '../ai-assistant';
import { initAssistantContext } from '../ai-assistant/assistantContextInitializer';
import type { AssistantDashboardData, AssistantInsight } from '../ai-assistant';
import { ProStatusBanner, ProStatusPill, ProOnlySection } from '../licensing/ProStatusBadge';
import {
  SparklesIcon,
  LightBulbIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  ClockIcon,
  FireIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { healthTimelineService, type HealthTimelineEntry } from '../health/HealthTimelineService';

const insightIcons: Record<string, typeof LightBulbIcon> = {
  storage_increase: ChartBarIcon,
  startup_improvement: CpuChipIcon,
  browser_cache_growth: ShieldCheckIcon,
  windows_update_overdue: ClockIcon,
  duplicate_space: ChartBarIcon,
  score_improvement: SparklesIcon,
  score_decline: FireIcon,
  maintenance_due: ClockIcon,
  privacy_concern: ShieldCheckIcon,
  performance_bottleneck: FireIcon,
};

export default function AIDailyBriefingPage() {
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState<AssistantDashboardData | null>(null);
  const [insights, setInsights] = useState<AssistantInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [briefingTab, setBriefingTab] = useState<'today' | 'yesterday' | 'weekly' | 'monthly'>('today');
  const [timelineData, setTimelineData] = useState<HealthTimelineEntry[]>([]);

  const init = useCallback(async () => {
    setLoading(true);
    try {
      await initAssistantContext();
    } catch {
      // Context init may fail outside Electron; continue with empty context
    }
    conversationEngine.startSession();
    setDashboardData(conversationEngine.getDashboardData());
    setInsights(conversationEngine.getTopInsights(10));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (briefingTab === 'today') {
      setTimelineData([]);
      return;
    }
    const days = briefingTab === 'yesterday' ? 2 : briefingTab === 'weekly' ? 7 : 30;
    setTimelineData(healthTimelineService.getDailySummary(days));
  }, [briefingTab]);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="space-y-6">
      <ProStatusBanner compact />
      <PageHeader
        title="Daily Briefing"
        description="Your daily system health summary with insights and recommendations"
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <Button size="sm" variant="secondary" onClick={() => void init()} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              Refresh
            </Button>
            <Button size="sm" onClick={() => navigate('/ai-assistant')} leftIcon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}>
              Open AVS AI Assistant
            </Button>
          </div>
        }
      />

      {/* Briefing Tabs — Pro gets Yesterday, Weekly Summary, Monthly Trends */}
      <div className="flex gap-1 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-1 w-fit">
        <button
          onClick={() => setBriefingTab('today')}
          className={`rounded-[var(--avs-radius-sm)] px-3 py-1.5 text-small font-medium transition-all ${briefingTab === 'today' ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-[var(--avs-shadow-sm)]' : 'text-[var(--avs-text-secondary)]'}`}
        >
          Today
        </button>
        <ProOnlySection>
          <button
            onClick={() => setBriefingTab('yesterday')}
            className={`rounded-[var(--avs-radius-sm)] px-3 py-1.5 text-small font-medium transition-all ${briefingTab === 'yesterday' ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-[var(--avs-shadow-sm)]' : 'text-[var(--avs-text-secondary)]'}`}
          >
            Yesterday
          </button>
          <button
            onClick={() => setBriefingTab('weekly')}
            className={`rounded-[var(--avs-radius-sm)] px-3 py-1.5 text-small font-medium transition-all ${briefingTab === 'weekly' ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-[var(--avs-shadow-sm)]' : 'text-[var(--avs-text-secondary)]'}`}
          >
            Weekly Summary
          </button>
          <button
            onClick={() => setBriefingTab('monthly')}
            className={`rounded-[var(--avs-radius-sm)] px-3 py-1.5 text-small font-medium transition-all ${briefingTab === 'monthly' ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-[var(--avs-shadow-sm)]' : 'text-[var(--avs-text-secondary)]'}`}
          >
            Monthly Trends
          </button>
        </ProOnlySection>
      </div>

      {loading ? (
        <Card variant="glass">
          <div className="flex items-center gap-3 py-8 justify-center">
            <SparklesIcon className="h-6 w-6 text-[var(--avs-brand-primary)] animate-pulse" />
            <span className="text-small text-[var(--avs-text-secondary)]">Generating your daily briefing...</span>
          </div>
        </Card>
      ) : (
        <>
          {/* Summary Card */}
          <Card variant="glass" className="overflow-hidden">
            <div className="flex items-center gap-4">
              <div className="rounded-[var(--avs-radius-xl)] bg-gradient-brand p-4">
                <SparklesIcon className="h-8 w-8 text-white" />
              </div>
              <div>
                <h2 className="text-section-title font-bold text-[var(--avs-text-primary)]">
                  {briefingTab === 'today' ? "Today's Briefing"
                    : briefingTab === 'yesterday' ? "Yesterday's Briefing"
                    : briefingTab === 'weekly' ? "Weekly Summary"
                    : "Monthly Trends"}
                </h2>
                <p className="text-small text-[var(--avs-text-secondary)]">
                  {insights.length > 0
                    ? `${insights.length} insights generated from your system data`
                    : 'No insights available — run a health scan to generate insights'}
                </p>
              </div>
            </div>
          </Card>

          {/* Score Cards */}
          {dashboardData && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Card variant="glass" className="p-4">
                <ShieldCheckIcon className="h-6 w-6 text-[var(--avs-success)]" />
                <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{dashboardData.healthScore ?? '—'}</p>
                <p className="text-caption text-[var(--avs-text-muted)]">Health Score</p>
              </Card>
              <Card variant="glass" className="p-4">
                <LightBulbIcon className="h-6 w-6 text-[var(--avs-warning)]" />
                <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{insights.length}</p>
                <p className="text-caption text-[var(--avs-text-muted)]">Insights</p>
              </Card>
              <Card variant="glass" className="p-4">
                <ChartBarIcon className="h-6 w-6 text-[var(--avs-info)]" />
                <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{dashboardData.recommendedActions.length}</p>
                <p className="text-caption text-[var(--avs-text-muted)]">Recommendations</p>
              </Card>
              <Card variant="glass" className="p-4">
                <ChatBubbleLeftRightIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
                <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{dashboardData.isAvailable ? 'Active' : 'N/A'}</p>
                <p className="text-caption text-[var(--avs-text-muted)]">Status</p>
              </Card>
            </div>
          )}

          {/* Recommendations — only for today tab */}
          {briefingTab === 'today' && dashboardData && dashboardData.recommendedActions.length > 0 && (
            <Card title="Today's Recommendations" variant="glass">
              <div className="space-y-2">
                {dashboardData.recommendedActions.map((rec, i) => (
                  <div key={i} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                    <p className="text-small font-medium text-[var(--avs-text-primary)]">{rec.label}</p>
                    <p className="text-caption text-[var(--avs-text-muted)]">{rec.description} · {rec.benefit}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Historical Timeline — for non-today tabs */}
          {briefingTab !== 'today' && (
            <Card title="Health Score History" variant="glass">
              {timelineData.length === 0 ? (
                <ModuleEmptyState
                  icon={ChartBarIcon}
                  title="No historical data yet"
                  message="Health score history is recorded during your session. Keep the app running to build up timeline data for this period."
                />
              ) : (
                <div className="space-y-2">
                  {timelineData.map((entry, i) => (
                    <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            background:
                              entry.score >= 90 ? 'var(--avs-success)' :
                              entry.score >= 70 ? 'var(--avs-warning)' :
                              'var(--avs-danger)',
                          }}
                        />
                        <div>
                          <p className="text-small font-medium text-[var(--avs-text-primary)]">
                            {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-caption text-[var(--avs-text-muted)]">
                            {entry.issueCount} issues · {entry.scoreZone}
                          </p>
                        </div>
                      </div>
                      <span className="text-section-title font-bold text-[var(--avs-text-primary)]">{entry.score}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Insights — only for today tab */}
          {briefingTab === 'today' && (
          <Card title="System Highlights" variant="glass">
            {insights.length === 0 ? (
              <ModuleEmptyState icon={LightBulbIcon} title="No insights yet" message="Insights are generated from your system health data. Run a health scan to get personalized insights." />
            ) : (
              <div className="space-y-3">
                {insights.map((insight) => {
                  const Icon = insightIcons[insight.type] ?? LightBulbIcon;
                  const toneColor = insight.severity === 'high' ? 'var(--avs-danger)' : insight.severity === 'medium' ? 'var(--avs-warning)' : 'var(--avs-info)';
                  return (
                    <div key={insight.id} className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-[var(--avs-radius-md)] p-2" style={{ background: `${toneColor}15` }}>
                          <Icon className="h-5 w-5" style={{ color: toneColor }} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <p className="text-small font-semibold text-[var(--avs-text-primary)]">{insight.title}</p>
                            <div className="flex items-center gap-2">
                              <Badge tone={insight.severity === 'high' ? 'danger' : insight.severity === 'medium' ? 'warning' : 'neutral'}>
                                {insight.severity}
                              </Badge>
                              <span className="text-caption font-bold text-[var(--avs-brand-primary)]">{(insight.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <p className="mt-1 text-small text-[var(--avs-text-secondary)]">{insight.description}</p>
                          <p className="mt-2 text-caption text-[var(--avs-text-muted)]">
                            <span className="font-medium text-[var(--avs-text-secondary)]">Evidence:</span> {insight.evidence}
                          </p>
                          <p className="mt-1 text-caption text-[var(--avs-text-muted)]">
                            <span className="font-medium text-[var(--avs-text-secondary)]">Suggested:</span> {insight.suggestedAction}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}
        </>
      )}
    </div>
  );
}
