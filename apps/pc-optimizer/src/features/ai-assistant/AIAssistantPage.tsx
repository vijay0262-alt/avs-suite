/**
 * AIAssistantPage — first-class AI assistant page.
 *
 * Connects the existing ConversationEngine, ExplanationEngine,
 * QuestionRouter, and InsightGenerator to a premium chat UI.
 *
 * Supports:
 *   - Ask AI (free-text questions)
 *   - Quick questions (preset buttons)
 *   - Daily briefing (AI insights)
 *   - Follow-up suggestions
 *   - Evidence-based explanations with confidence scores
 *
 * The AI never invents information — every answer is traceable
 * to platform data with evidence and confidence.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState } from '../../components/ModuleStates';
import { useEditionLimits } from '../licensing/editionLimits';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { ProStatusPill } from '../licensing/ProStatusBadge';
import {
  conversationEngine,
  type ConversationResponse,
  type AssistantDashboardData,
  type AssistantInsight,
} from '../ai-assistant';
import { initAssistantContext } from '../ai-assistant/assistantContextInitializer';
import { QUICK_QUESTIONS } from '../ai-assistant/types';
import {
  SparklesIcon,
  PaperAirplaneIcon,
  LightBulbIcon,
  ChartBarIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  CpuChipIcon,
  ShieldCheckIcon,
  FireIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  explanation?: {
    summary: string;
    reasoning: string;
    evidence: { source: string; data: string }[];
    confidence: number;
    followUpSuggestions: string[];
    recommendedAction?: { title: string; description: string } | null;
  } | null;
}

export function AIAssistantPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [dashboardData, setDashboardData] = useState<AssistantDashboardData | null>(null);
  const [insights, setInsights] = useState<AssistantInsight[]>([]);
  const [activeView, setActiveView] = useState<'chat' | 'briefing'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const limits = useEditionLimits();
  const { guard, dialogElement } = useFeatureGuard();

  // Track daily question count for Free edition limit enforcement
  const AI_ASSISTANT_COUNT_KEY = 'avs-ai-assistant-questions';
  const getTodayCount = useCallback((): number => {
    try {
      const raw = localStorage.getItem(AI_ASSISTANT_COUNT_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw) as { date: string; count: number };
      const today = new Date().toISOString().split('T')[0];
      if (data.date !== today) return 0;
      return data.count;
    } catch {
      return 0;
    }
  }, []);
  const [questionsToday, setQuestionsToday] = useState(getTodayCount());

  const incrementQuestionCount = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    const next = questionsToday + 1;
    setQuestionsToday(next);
    try {
      localStorage.setItem(AI_ASSISTANT_COUNT_KEY, JSON.stringify({ date: today, count: next }));
    } catch {
      // localStorage may not be available
    }
  }, [questionsToday]);

  const maxQuestions = limits.getLimit('aiAssistantQuestionsPerDay');
  const questionsRemaining = maxQuestions === null ? null : Math.max(0, maxQuestions - questionsToday);
  const isLimitReached = maxQuestions !== null && questionsToday >= maxQuestions;

  const [contextLoading, setContextLoading] = useState(true);

  const initSession = useCallback(async () => {
    setContextLoading(true);
    try {
      await initAssistantContext();
    } catch {
      // Context init may fail outside Electron; continue with empty context
    }
    const id = conversationEngine.startSession();
    setSessionId(id);
    setDashboardData(conversationEngine.getDashboardData());
    setInsights(conversationEngine.getTopInsights(5));
    setContextLoading(false);
  }, []);

  useEffect(() => {
    void initSession();
  }, [initSession]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAsk = useCallback((question: string) => {
    if (!question.trim() || isThinking) return;

    // Enforce daily question limit for Free edition
    if (isLimitReached) {
      guard('ai.smart_optimization', 'AVS AI Assistant', () => {}, {
        limitDescription: `You've used all ${maxQuestions} AI questions for today. The limit resets at midnight.`,
        proBenefit: 'Unlimited AI questions with conversation history and cross-module reasoning.',
      });
      return;
    }

    incrementQuestionCount();

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsThinking(true);

    // Use setTimeout to allow UI to update before sync response
    setTimeout(() => {
      try {
        const response: ConversationResponse = conversationEngine.ask(question, sessionId ?? undefined);

        const assistantMsg: ChatMessage = {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          timestamp: response.message.timestamp,
          explanation: {
            summary: response.explanation.summary,
            reasoning: response.explanation.reasoning,
            evidence: response.explanation.evidence.map((e) => ({ source: e.source, data: e.data })),
            confidence: response.explanation.confidence,
            followUpSuggestions: response.explanation.followUpSuggestions,
            recommendedAction: response.explanation.recommendedAction
              ? { title: response.explanation.recommendedAction.title, description: response.explanation.recommendedAction.description }
              : null,
          },
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setInsights(conversationEngine.getTopInsights(5));
      } catch (e) {
        const errorMsg: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'I encountered an error processing your question. Please try rephrasing.',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsThinking(false);
      }
    }, 100);
  }, [sessionId, isThinking, isLimitReached, maxQuestions, guard, incrementQuestionCount]);

  const handleReset = () => {
    setMessages([]);
    void initSession();
  };

  return (
    <div className="flex h-full flex-col px-6 py-6">
      <PageHeader
        title="AVS AI Assistant"
        description="Your AI-powered PC health assistant. Ask questions, get explanations, and receive evidence-based recommendations."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            {!limits.isPro && maxQuestions !== null && (
              <Badge tone={questionsRemaining !== null && questionsRemaining <= 5 ? 'warning' : 'neutral'} data-testid="AIAssistant-question-counter">
                {questionsRemaining} / {maxQuestions} questions left today
              </Badge>
            )}
            <div className="flex rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-1">
              <button
                onClick={() => setActiveView('chat')}
                className={`flex items-center gap-1.5 rounded-[var(--avs-radius-sm)] px-3 py-1.5 text-small font-medium transition-all ${
                  activeView === 'chat' ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-[var(--avs-shadow-sm)]' : 'text-[var(--avs-text-secondary)]'
                }`}
              >
                <ChatBubbleLeftRightIcon className="h-4 w-4" />
                Chat
              </button>
              <button
                onClick={() => setActiveView('briefing')}
                className={`flex items-center gap-1.5 rounded-[var(--avs-radius-sm)] px-3 py-1.5 text-small font-medium transition-all ${
                  activeView === 'briefing' ? 'bg-[var(--avs-surface)] text-[var(--avs-text-primary)] shadow-[var(--avs-shadow-sm)]' : 'text-[var(--avs-text-secondary)]'
                }`}
              >
                <LightBulbIcon className="h-4 w-4" />
                Daily Briefing
              </button>
            </div>
            <Button size="sm" variant="secondary" onClick={handleReset} leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
              New Session
            </Button>
          </div>
        }
      />

      {activeView === 'briefing' ? (
        <DailyBriefingView insights={insights} dashboardData={dashboardData} onAsk={handleAsk} contextLoading={contextLoading} />
      ) : (
        <div className="flex flex-1 gap-4 overflow-hidden">
          {/* Chat Panel */}
          <div className="flex flex-1 flex-col">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto rounded-[var(--avs-radius-lg)] bg-[var(--avs-surface-muted)] p-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="rounded-[var(--avs-radius-xl)] bg-gradient-brand p-4">
                    <SparklesIcon className="h-8 w-8 text-white" />
                  </div>
                  <p className="mt-4 text-small font-medium text-[var(--avs-text-primary)]">Ask me anything about your PC</p>
                  <p className="mt-1 text-caption text-[var(--avs-text-muted)]">I can explain scores, recommend optimizations, and investigate issues</p>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onFollowUp={handleAsk} />
              ))}

              {isThinking && (
                <div className="flex items-center gap-2">
                  <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface)] p-2">
                    <SparklesIcon className="h-4 w-4 text-[var(--avs-brand-primary)] animate-pulse" />
                  </div>
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--avs-brand-primary)]" style={{ animationDelay: '0ms' }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--avs-brand-primary)]" style={{ animationDelay: '150ms' }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-[var(--avs-brand-primary)]" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Quick Questions */}
            {messages.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_QUESTIONS.slice(0, 6).map((q) => (
                  <button
                    key={q.type}
                    onClick={() => handleAsk(q.label)}
                    className="rounded-full border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-1.5 text-caption font-medium text-[var(--avs-text-secondary)] transition-all hover:border-[var(--avs-brand-primary)] hover:text-[var(--avs-text-primary)]"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAsk(input); }}
                placeholder="Ask about your PC health, scores, optimizations…"
                className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-4 py-2.5 text-small text-[var(--avs-text-primary)] placeholder:text-[var(--avs-text-muted)] focus:border-[var(--avs-brand-primary)] focus:outline-none"
                disabled={isThinking}
              />
              <Button
                onClick={() => handleAsk(input)}
                disabled={!input.trim() || isThinking || isLimitReached}
                leftIcon={<PaperAirplaneIcon className="h-4 w-4" />}
              >
                Send
              </Button>
            </div>
          </div>

          {/* Sidebar: Insights */}
          <div className="hidden w-72 shrink-0 lg:block">
            <Card title="Insights" variant="glass" padded={false}>
              <div className="max-h-[500px] space-y-2 overflow-y-auto p-3">
                {insights.length === 0 ? (
                  <p className="py-4 text-center text-caption text-[var(--avs-text-muted)]">No insights available yet.</p>
                ) : (
                  insights.map((insight) => <InsightItem key={insight.id} insight={insight} />)
                )}
              </div>
            </Card>

            {dashboardData && (
              <Card title="Health Overview" variant="glass" className="mt-3">
                <div className="space-y-2">
                  {dashboardData.healthScore !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-caption text-[var(--avs-text-secondary)]">Health Score</span>
                      <span className="text-section-title font-bold text-[var(--avs-text-primary)]">{dashboardData.healthScore}</span>
                    </div>
                  )}
                  {dashboardData.healthLevel && (
                    <div className="flex items-center justify-between">
                      <span className="text-caption text-[var(--avs-text-secondary)]">Status</span>
                      <Badge tone={dashboardData.healthLevel === 'excellent' || dashboardData.healthLevel === 'good' ? 'success' : dashboardData.healthLevel === 'fair' ? 'warning' : 'danger'}>
                        {dashboardData.healthLevel}
                      </Badge>
                    </div>
                  )}
                  {dashboardData.recommendedActions.map((rec, i) => (
                    <div key={i} className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2">
                      <p className="text-caption font-medium text-[var(--avs-text-primary)]">{rec.label}</p>
                      <p className="text-caption text-[var(--avs-text-muted)]">{rec.description} · {rec.benefit}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {dialogElement}
    </div>
  );
}

// ─── Message Bubble ─────────────────────────────────────────────────

function MessageBubble({ message, onFollowUp }: { message: ChatMessage; onFollowUp: (q: string) => void }) {
  const [showDetails, setShowDetails] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2 ${isUser ? 'bg-[var(--avs-surface-muted)]' : 'bg-gradient-brand'}`}>
        {isUser ? (
          <ChatBubbleLeftRightIcon className="h-4 w-4 text-[var(--avs-text-secondary)]" />
        ) : (
          <SparklesIcon className="h-4 w-4 text-white" />
        )}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : ''}`}>
        <div className={`rounded-[var(--avs-radius-lg)] px-4 py-3 ${isUser ? 'bg-[var(--avs-brand-primary)] text-white' : 'bg-[var(--avs-surface)] border border-[var(--avs-border)]'}`}>
          <p className="whitespace-pre-wrap text-small text-[var(--avs-text-primary)]">{message.content}</p>
        </div>

        {/* Explanation Details */}
        {message.explanation && !isUser && (
          <div className="mt-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-caption text-[var(--avs-text-muted)] hover:text-[var(--avs-text-primary)]"
            >
              <ChartBarIcon className="h-3 w-3" />
              {showDetails ? 'Hide' : 'Show'} evidence & reasoning
              <span className="ml-1 rounded-full bg-[var(--avs-brand-primary)]/10 px-1.5 py-0.5 text-caption font-bold text-[var(--avs-brand-primary)]">
                {(message.explanation.confidence * 100).toFixed(0)}% confidence
              </span>
            </button>

            {showDetails && (
              <div className="mt-2 space-y-2 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                {message.explanation.evidence.length > 0 && (
                  <div>
                    <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">Evidence</p>
                    <div className="mt-1 space-y-1">
                      {message.explanation.evidence.map((ev, i) => (
                        <div key={i} className="text-caption text-[var(--avs-text-secondary)]">
                          <span className="font-medium text-[var(--avs-text-primary)]">{ev.source}:</span> {ev.data}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-caption font-semibold text-[var(--avs-text-secondary)]">Reasoning</p>
                  <p className="mt-0.5 text-caption text-[var(--avs-text-secondary)]">{message.explanation.reasoning}</p>
                </div>
                {message.explanation.recommendedAction && (
                  <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-brand-primary)]/10 p-2">
                    <p className="text-caption font-semibold text-[var(--avs-brand-primary)]">Recommended: {message.explanation.recommendedAction.title}</p>
                    <p className="text-caption text-[var(--avs-text-secondary)]">{message.explanation.recommendedAction.description}</p>
                  </div>
                )}
              </div>
            )}

            {/* Follow-up Suggestions */}
            {message.explanation.followUpSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {message.explanation.followUpSuggestions.slice(0, 4).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => onFollowUp(s)}
                    className="rounded-full border border-[var(--avs-border)] bg-[var(--avs-surface)] px-2.5 py-1 text-caption text-[var(--avs-text-secondary)] transition-all hover:border-[var(--avs-brand-primary)] hover:text-[var(--avs-text-primary)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Daily Briefing View ────────────────────────────────────────────

function DailyBriefingView({
  insights,
  dashboardData,
  onAsk,
  contextLoading,
}: {
  insights: AssistantInsight[];
  dashboardData: AssistantDashboardData | null;
  onAsk: (q: string) => void;
  contextLoading: boolean;
}) {
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

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card variant="glass" className="overflow-hidden">
        <div className="flex items-center gap-4">
          <div className="rounded-[var(--avs-radius-xl)] bg-gradient-brand p-4">
            <SparklesIcon className="h-8 w-8 text-white" />
          </div>
          <div>
            <h2 className="text-section-title font-bold text-[var(--avs-text-primary)]">AI Daily Briefing</h2>
            <p className="text-small text-[var(--avs-text-secondary)]">
              {contextLoading
                ? 'Loading system data…'
                : insights.length > 0
                ? `${insights.length} insights generated from your system data`
                : 'No insights available — run a health scan to generate insights'}
            </p>
          </div>
        </div>
      </Card>

      {/* Health Score */}
      {dashboardData && dashboardData.healthScore !== null && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card variant="glass" className="p-4">
            <ShieldCheckIcon className="h-6 w-6 text-[var(--avs-success)]" />
            <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{dashboardData.healthScore}</p>
            <p className="text-caption text-[var(--avs-text-muted)]">Health Score</p>
          </Card>
          <Card variant="glass" className="p-4">
            <LightBulbIcon className="h-6 w-6 text-[var(--avs-warning)]" />
            <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{insights.length}</p>
            <p className="text-caption text-[var(--avs-text-muted)]">AI Insights</p>
          </Card>
          <Card variant="glass" className="p-4">
            <ChartBarIcon className="h-6 w-6 text-[var(--avs-info)]" />
            <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{dashboardData.recommendedActions.length}</p>
            <p className="text-caption text-[var(--avs-text-muted)]">Recommendations</p>
          </Card>
          <Card variant="glass" className="p-4">
            <ChatBubbleLeftRightIcon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
            <p className="mt-2 text-statistic font-bold text-[var(--avs-text-primary)]">{QUICK_QUESTIONS.length}</p>
            <p className="text-caption text-[var(--avs-text-muted)]">Quick Questions</p>
          </Card>
        </div>
      )}

      {/* Insights */}
      <Card title="Today's Insights" variant="glass">
        {insights.length === 0 ? (
          <ModuleEmptyState icon={LightBulbIcon} title="No insights yet" message="Insights are generated from your system health data." />
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

      {/* Quick Questions */}
      <Card title="Ask AI" variant="glass">
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q.type}
              onClick={() => onAsk(q.label)}
              className="rounded-full border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-1.5 text-caption font-medium text-[var(--avs-text-secondary)] transition-all hover:border-[var(--avs-brand-primary)] hover:text-[var(--avs-text-primary)]"
            >
              {q.label}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Insight Item (sidebar) ─────────────────────────────────────────

function InsightItem({ insight }: { insight: AssistantInsight }) {
  const toneColor = insight.severity === 'high' ? 'var(--avs-danger)' : insight.severity === 'medium' ? 'var(--avs-warning)' : 'var(--avs-info)';
  return (
    <div className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface-muted)] p-2">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: toneColor }} />
        <p className="text-caption font-medium text-[var(--avs-text-primary)]">{insight.title}</p>
      </div>
      <p className="mt-1 text-caption text-[var(--avs-text-muted)] line-clamp-2">{insight.description}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-caption font-bold text-[var(--avs-brand-primary)]">{(insight.confidence * 100).toFixed(0)}%</span>
        <Badge tone={insight.severity === 'high' ? 'danger' : insight.severity === 'medium' ? 'warning' : 'neutral'}>
          {insight.severity}
        </Badge>
      </div>
    </div>
  );
}

export default AIAssistantPage;
