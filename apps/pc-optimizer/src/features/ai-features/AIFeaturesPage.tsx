/**
 * AIFeaturesPage — AVS AI Shield AI-Powered Features.
 *
 * Tier 4 features:
 * - AI Threat Explanation
 * - AI Optimization Recommendations
 * - One-Click Security Audit
 * - Threat Timeline Visualization
 * - Community Threat Intelligence
 * - Privacy Score
 * - Game/Movie Mode
 */
import { useState, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import {
  ModuleLoadingState,
  ModuleErrorState,
  ModuleEmptyState,
} from '../../components/ModuleStates';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import { ProStatusPill } from '../licensing/ProStatusBadge';
import {
  aiFeaturesService,
  type OptimizationResult,
  type SecurityAuditResult,
  type TimelineEvent,
  type TimelineSummary,
  type PrivacyResult,
  type GameModeStatus,
} from './aiFeatures.service';
import {
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  StopIcon,
  ShieldCheckIcon,
  ClockIcon,
  UserGroupIcon,
  LockClosedIcon,
  DevicePhoneMobileIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

type TabId = 'optimization' | 'audit' | 'timeline' | 'community' | 'privacy' | 'gameMode';

const TABS: { id: TabId; label: string; icon: typeof SparklesIcon }[] = [
  { id: 'optimization', label: 'Optimization', icon: SparklesIcon },
  { id: 'audit', label: 'Security Audit', icon: ShieldCheckIcon },
  { id: 'timeline', label: 'Threat Timeline', icon: ClockIcon },
  { id: 'community', label: 'Community Intel', icon: UserGroupIcon },
  { id: 'privacy', label: 'Privacy Score', icon: LockClosedIcon },
  { id: 'gameMode', label: 'Game/Movie Mode', icon: DevicePhoneMobileIcon },
];

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'info' | 'success'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'success',
};

const CHECK_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  pass: 'success',
  good: 'success',
  warn: 'warning',
  warning: 'warning',
  fail: 'danger',
  bad: 'danger',
  info: 'neutral',
  unknown: 'neutral',
};

function formatTime(ts: string): string {
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

export default function AIFeaturesPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('optimization');

  const guard = (fn: () => void) => {
    if (!isPro) { showUpgrade(); return; }
    fn();
  };

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div data-testid="page-ai-features">
        <PageHeader title="AI Features" />
        <ModuleLoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="page-ai-features">
        <PageHeader title="AI Features" />
        <ModuleErrorState message={error} onRetry={() => setError(null)} />
      </div>
    );
  }

  return (
    <div data-testid="page-ai-features">
      <PageHeader
        title="AI Features"
        description="AI-powered threat explanation, optimization recommendations, security audit, threat timeline, community intelligence, privacy score, and Game/Movie Mode."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <HelpButton text="AI Features provide intelligent analysis and recommendations using local rule-based engines — no external LLM API calls required. All processing happens on your device." />
          </div>
        }
      />

      <div className="space-y-4">
        {/* Tab navigation */}
        <Card variant="glass">
          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-small transition-colors ${activeTab === tab.id ? 'bg-brand-primary text-white' : 'hover:bg-[var(--avs-surface-hover)] text-text-secondary'}`}
                data-testid={`tab-${tab.id}`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </Card>

        {activeTab === 'optimization' && <OptimizationTab isPro={isPro} guard={guard} />}
        {activeTab === 'audit' && <AuditTab isPro={isPro} guard={guard} />}
        {activeTab === 'timeline' && <TimelineTab />}
        {activeTab === 'community' && <CommunityTab isPro={isPro} guard={guard} />}
        {activeTab === 'privacy' && <PrivacyTab isPro={isPro} guard={guard} />}
        {activeTab === 'gameMode' && <GameModeTab isPro={isPro} guard={guard} />}

        {!isPro && (
          <Card variant="glass" className="border-brand-primary/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-small font-medium text-brand-primary">Free Edition</div>
                <div className="text-caption text-text-secondary mt-1">
                  Upgrade to Professional to use AI-powered features.
                </div>
              </div>
              <Button variant="primary" size="sm" onClick={() => showUpgrade()} data-testid="upgrade-btn">
                Upgrade
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Optimization Tab ─────────────────────────────────────────────

function OptimizationTab({ isPro, guard }: { isPro: boolean; guard: (fn: () => void) => void }) {
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await aiFeaturesService.analyzeOptimizations();
      setResult(res.result);
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <Card title="AI Optimization Recommendations" variant="glass" data-testid="optimization-tab">
      <p className="text-small text-text-secondary mb-4">
        Analyzes your system and generates personalized optimization recommendations with expected impact estimates.
      </p>
      <Button variant="primary" size="sm" onClick={() => guard(handleAnalyze)} disabled={!isPro || loading}
        leftIcon={loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
        data-testid="optimization-analyze-btn">
        {loading ? 'Analyzing...' : 'Analyze System'}
      </Button>

      {result && (
        <div className="mt-4" data-testid="optimization-result">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-text-primary">{result.system_score}</div>
              <div className="text-caption text-text-muted">System Score</div>
            </div>
            <div>
              <Badge tone="info">{result.potential_gain}</Badge>
              <div className="text-small text-text-secondary mt-1">{result.summary}</div>
            </div>
          </div>
          {result.recommendations.length === 0 ? (
            <ModuleEmptyState message="No optimization recommendations. Your system is well-optimized." />
          ) : (
            <div className="space-y-2">
              {result.recommendations.map((rec) => (
                <div key={rec.id} className="flex items-start gap-2 p-3 rounded border border-[var(--avs-border)]">
                  <Badge tone={PRIORITY_TONE[rec.priority] || 'neutral'} className="shrink-0">{rec.priority}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-small font-medium text-text-primary">{rec.title}</div>
                    <div className="text-caption text-text-secondary">{rec.description}</div>
                    <div className="text-caption text-semantic-info mt-1">Expected: {rec.expected_impact}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Security Audit Tab ───────────────────────────────────────────

function AuditTab({ isPro, guard }: { isPro: boolean; guard: (fn: () => void) => void }) {
  const [result, setResult] = useState<SecurityAuditResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAudit = async () => {
    setLoading(true);
    try {
      const res = await aiFeaturesService.runSecurityAudit();
      setResult(res.result);
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <Card title="One-Click Security Audit" variant="glass" data-testid="audit-tab">
      <p className="text-small text-text-secondary mb-4">
        Comprehensive security posture assessment: Defender, firewall, Windows Update, UAC, BitLocker, network, shares, ports, startup, and processes.
      </p>
      <Button variant="primary" size="sm" onClick={() => guard(handleAudit)} disabled={!isPro || loading}
        leftIcon={loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ShieldCheckIcon className="h-4 w-4" />}
        data-testid="audit-run-btn">
        {loading ? 'Auditing...' : 'Run Security Audit'}
      </Button>

      {result && (
        <div className="mt-4" data-testid="audit-result">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-text-primary">{result.score}</div>
              <div className="text-caption text-text-muted">Score</div>
            </div>
            <div>
              <Badge tone={result.score >= 90 ? 'success' : result.score >= 70 ? 'warning' : 'danger'}>
                Grade: {result.grade}
              </Badge>
              <div className="text-small text-text-secondary mt-1">{result.summary}</div>
            </div>
          </div>
          <div className="space-y-1">
            {result.checks.map((check) => (
              <div key={check.id} className="flex items-center gap-2 py-1.5 px-2 rounded text-small">
                {check.status === 'pass' && <CheckCircleIcon className="h-4 w-4 text-semantic-success" />}
                {check.status === 'warn' && <ExclamationTriangleIcon className="h-4 w-4 text-semantic-warning" />}
                {check.status === 'fail' && <XCircleIcon className="h-4 w-4 text-semantic-danger" />}
                <span className="text-text-secondary flex-1">{check.name}</span>
                <span className="text-caption text-text-muted">{check.message}</span>
              </div>
            ))}
          </div>
          {result.recommendations.length > 0 && (
            <div className="mt-4 p-3 rounded bg-semantic-warning/5 border border-semantic-warning/20">
              <div className="text-small font-medium text-text-primary mb-2">Recommendations:</div>
              {result.recommendations.map((rec, i) => (
                <div key={i} className="text-caption text-text-secondary">• {rec}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Timeline Tab ─────────────────────────────────────────────────

function TimelineTab() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [summary, setSummary] = useState<TimelineSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [tlRes, sumRes] = await Promise.all([
        aiFeaturesService.getTimeline(undefined, undefined, 50),
        aiFeaturesService.getTimelineSummary(),
      ]);
      setEvents(tlRes.events || []);
      setSummary(sumRes.summary);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <Card title="Threat Timeline" variant="glass" data-testid="timeline-tab">
      <div className="flex items-center justify-between mb-4">
        <p className="text-small text-text-secondary">Chronological history of threat detection events.</p>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}
          leftIcon={loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ClockIcon className="h-4 w-4" />}>
          Refresh
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
            <div className="text-lg font-bold text-text-primary">{summary.total_events}</div>
            <div className="text-caption text-text-muted">Total Events</div>
          </div>
          <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
            <div className="text-lg font-bold text-text-primary">{summary.last_24h}</div>
            <div className="text-caption text-text-muted">Last 24h</div>
          </div>
          <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
            <div className="text-lg font-bold text-text-primary">{summary.last_7d}</div>
            <div className="text-caption text-text-muted">Last 7d</div>
          </div>
          <div className="text-center p-2 rounded bg-[var(--avs-surface-muted)]">
            <div className="text-lg font-bold text-text-primary">{summary.trend}</div>
            <div className="text-caption text-text-muted">Trend</div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <ModuleEmptyState message="No threat events recorded." />
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto" data-testid="timeline-events">
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-2 py-1.5 px-2 rounded text-small hover:bg-[var(--avs-surface-hover)]">
              <span className="text-caption text-text-muted w-32 shrink-0">{formatTime(event.timestamp)}</span>
              <Badge tone={CHECK_TONE[event.severity] || 'neutral'} className="shrink-0">{event.severity}</Badge>
              <span className="text-text-secondary truncate flex-1">{event.description}</span>
              <span className="text-caption text-text-muted shrink-0">{event.source}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Community Tab ────────────────────────────────────────────────

function CommunityTab({ isPro, guard }: { isPro: boolean; guard: (fn: () => void) => void }) {
  const [status, setStatus] = useState<{ opt_in: boolean; submissions_count: number } | null>(null);
  const [optIn, setOptIn] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await aiFeaturesService.getCommunityStatus();
      setStatus(res.status);
      setOptIn(res.status?.opt_in ?? false);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleToggle = async () => {
    try {
      await aiFeaturesService.configureCommunity({ opt_in: !optIn });
      setOptIn(!optIn);
      await loadStatus();
    } catch { /* ignore */ }
  };

  return (
    <Card title="Community Threat Intelligence" variant="glass" data-testid="community-tab">
      <p className="text-small text-text-secondary mb-4">
        Share anonymized threat hashes with the AVS community. No file contents, paths, or personal data are ever transmitted.
      </p>
      <div className="flex items-center justify-between p-3 rounded border border-[var(--avs-border)] mb-4">
        <div>
          <div className="text-small font-medium text-text-primary">Opt-in to Community Sharing</div>
          <div className="text-caption text-text-secondary">Only anonymous threat hashes are shared.</div>
        </div>
        <Button variant={optIn ? 'danger' : 'primary'} size="sm" onClick={() => guard(handleToggle)} disabled={!isPro}
          data-testid="community-opt-in-btn">
          {optIn ? 'Opt Out' : 'Opt In'}
        </Button>
      </div>
      {status && (
        <div className="text-caption text-text-muted">
          Submissions: {status.submissions_count ?? 0}
        </div>
      )}
      <div className="mt-4 p-3 rounded bg-semantic-info/5 border border-semantic-info/20">
        <div className="text-small font-medium text-text-primary mb-1">Privacy Guarantee</div>
        <div className="text-caption text-text-secondary">
          Only SHA-256/MD5 hashes, threat names, types, severity, and detection source are shared.
          File paths, file contents, usernames, machine names, and IP addresses are NEVER transmitted.
        </div>
      </div>
    </Card>
  );
}

// ── Privacy Tab ──────────────────────────────────────────────────

function PrivacyTab({ isPro, guard }: { isPro: boolean; guard: (fn: () => void) => void }) {
  const [result, setResult] = useState<PrivacyResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalculate = async () => {
    setLoading(true);
    try {
      const res = await aiFeaturesService.calculatePrivacyScore();
      setResult(res.result);
    } catch { /* ignore */ }
    setLoading(false);
  };

  return (
    <Card title="Privacy Score" variant="glass" data-testid="privacy-tab">
      <p className="text-small text-text-secondary mb-4">
        Assesses your privacy posture: telemetry, camera/microphone access, location, advertising ID, tracking software, DNS, and more.
      </p>
      <Button variant="primary" size="sm" onClick={() => guard(handleCalculate)} disabled={!isPro || loading}
        leftIcon={loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <LockClosedIcon className="h-4 w-4" />}
        data-testid="privacy-calculate-btn">
        {loading ? 'Calculating...' : 'Calculate Privacy Score'}
      </Button>

      {result && (
        <div className="mt-4" data-testid="privacy-result">
          <div className="flex items-center gap-4 mb-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-text-primary">{result.score}</div>
              <div className="text-caption text-text-muted">Score</div>
            </div>
            <div>
              <Badge tone={result.score >= 90 ? 'success' : result.score >= 70 ? 'warning' : 'danger'}>
                Grade: {result.grade}
              </Badge>
              <div className="text-small text-text-secondary mt-1">{result.summary}</div>
            </div>
          </div>
          <div className="space-y-1">
            {result.checks.map((check) => (
              <div key={check.id} className="flex items-center gap-2 py-1.5 px-2 rounded text-small">
                {check.status === 'good' && <CheckCircleIcon className="h-4 w-4 text-semantic-success" />}
                {check.status === 'warning' && <ExclamationTriangleIcon className="h-4 w-4 text-semantic-warning" />}
                {check.status === 'bad' && <XCircleIcon className="h-4 w-4 text-semantic-danger" />}
                <span className="text-text-secondary flex-1">{check.name}</span>
                <span className="text-caption text-text-muted">{check.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Game/Movie Mode Tab ──────────────────────────────────────────

function GameModeTab({ isPro, guard }: { isPro: boolean; guard: (fn: () => void) => void }) {
  const [status, setStatus] = useState<GameModeStatus | null>(null);

  const loadStatus = async () => {
    try {
      const res = await aiFeaturesService.getGameModeStatus();
      setStatus(res.status);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadStatus(); }, []);

  const handleToggle = async () => {
    try {
      await aiFeaturesService.toggleGameMode();
      await loadStatus();
    } catch { /* ignore */ }
  };

  const active = status?.active;

  return (
    <Card title="Game/Movie Mode" variant="glass" data-testid="gameMode-tab">
      <p className="text-small text-text-secondary mb-4">
        Silences non-critical notifications, pauses scheduled scans, and reduces background activity while gaming or watching media.
      </p>
      <div className="flex items-center justify-between p-3 rounded border border-[var(--avs-border)] mb-4">
        <div className="flex items-center gap-3">
          <DevicePhoneMobileIcon className={`h-8 w-8 ${active ? 'text-semantic-success' : 'text-text-muted'}`} />
          <div>
            <div className="text-small font-medium text-text-primary">
              {active ? 'Game/Movie Mode is Active' : 'Game/Movie Mode is Off'}
            </div>
            <div className="text-caption text-text-secondary">
              {active ? 'Non-critical activity is paused' : 'Click to activate'}
            </div>
          </div>
        </div>
        <Button variant={active ? 'danger' : 'primary'} size="sm" onClick={() => guard(handleToggle)} disabled={!isPro}
          leftIcon={active ? <StopIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
          data-testid="gameMode-toggle-btn">
          {active ? 'Deactivate' : 'Activate'}
        </Button>
      </div>
      {status && (
        <div className="text-caption text-text-muted space-y-1">
          <div>Sessions: {status.sessions_count}</div>
          <div>Auto-detect fullscreen: {status.auto_detect ? 'On' : 'Off'}</div>
          {status.fullscreen_detected && <div className="text-semantic-info">Fullscreen application detected</div>}
        </div>
      )}
    </Card>
  );
}
