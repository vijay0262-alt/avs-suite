/**
 * SelfLearningPage — AI Self-Learning Cleanup.
 *
 * Learns user cleanup habits over time and provides personalized recommendations:
 *  - Optimal cleanup time based on when user typically cleans
 *  - Category preferences (auto-select/deselect based on past behavior)
 *  - Exclusion suggestions (paths frequently excluded by user)
 *  - Cleanup frequency recommendations
 *
 * Free: view habits and recommendations
 * Pro: configure, reset, auto-apply recommendations
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ChartBarIcon,
  BoltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  selfLearningService,
  type SelfLearningStatus,
  type SelfLearningHabits,
  type Recommendation,
} from './selfLearning.service';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const PRIORITY_TONES: Record<string, 'danger' | 'warning' | 'info' | 'neutral'> = {
  critical: 'danger',
  high: 'warning',
  normal: 'info',
  low: 'neutral',
};

const TYPE_ICONS: Record<string, typeof BoltIcon> = {
  schedule: ClockIcon,
  category: ChartBarIcon,
  exclusion: TrashIcon,
  frequency: BoltIcon,
};

export default function SelfLearningPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<SelfLearningStatus | null>(null);
  const [habits, setHabits] = useState<SelfLearningHabits | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [configuring, setConfiguring] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [statusResult, habitsResult, recsResult] = await Promise.all([
        selfLearningService.getStatus(),
        selfLearningService.getHabits(),
        selfLearningService.getRecommendations(),
      ]);
      setStatus(statusResult);
      setHabits(habitsResult);
      setRecommendations(recsResult.recommendations);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load self-learning data');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleReset = async () => {
    if (!isPro) {
      showUpgrade('Self-Learning Cleanup');
      return;
    }
    setConfiguring(true);
    setError(null);
    try {
      const result = await selfLearningService.reset();
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset');
    } finally {
      setConfiguring(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await selfLearningService.configure({ enabled: !status.enabled });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  const handleToggleAutoApply = async () => {
    if (!isPro || !status) return;
    setConfiguring(true);
    try {
      const result = await selfLearningService.configure({ autoApplyRecommendations: !status.autoApplyRecommendations });
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle');
    } finally {
      setConfiguring(false);
    }
  };

  const handleActOnRecommendation = async (rec: Recommendation) => {
    if (!isPro) {
      showUpgrade('Self-Learning Cleanup');
      return;
    }
    setActingId(rec.id);
    setError(null);
    setActionMessage(null);
    try {
      // The action contains an RPC method to call — we just display it
      // The actual execution would be done by the caller
      setActionMessage(`Action: ${rec.action.label} (RPC: ${rec.action.rpcMethod})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply recommendation');
    } finally {
      setActingId(null);
    }
  };

  const patterns = habits?.cleanupPatterns;
  const categoryPrefs = habits?.categoryPreferences || {};
  const exclusionPatterns = habits?.exclusionPatterns;

  return (
    <div data-testid="page-self-learning" className="space-y-4">
      <PageHeader
        title="AI Self-Learning Cleanup"
        description="AI learns your cleanup habits over time and customizes the experience with personalized recommendations."
        actions={<HelpButton text="The AI tracks when you clean, which categories you select, and which paths you exclude. After a few cleanups, it generates personalized recommendations for optimal scheduling, category defaults, and exclusions." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <AcademicCapIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">AI Habit Learning</div>
          <p className="text-caption text-text-secondary mt-1">
            The AI tracks your cleanup behavior patterns — timing, category preferences, exclusions, and frequency —
            then generates personalized recommendations to optimize your cleanup experience over time.
          </p>
        </div>
      </div>

      {/* Status */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-3 ${
              status?.hasEnoughData ? 'bg-semantic-success/10' : 'bg-semantic-warning/10'
            }`}>
              <AcademicCapIcon className={`h-6 w-6 ${
                status?.hasEnoughData ? 'text-semantic-success' : 'text-semantic-warning'
              }`} />
            </div>
            <div>
              <div className="text-section-title text-text-primary">Learning Status</div>
              <p className="text-caption text-text-secondary mt-1">
                {status ? (
                  status.hasEnoughData
                    ? `${status.stats.totalEvents} cleanup events recorded · Learning active`
                    : `${status.stats.totalEvents}/${status.config.minObservations} events — need more data for recommendations`
                ) : 'Loading...'}
              </p>
            </div>
          </div>
          {status && status.stats.totalEvents > 0 && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={configuring ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
              onClick={handleReset}
              disabled={!isPro || configuring}
              data-testid="self-learning-reset"
            >
              {isPro ? 'Reset Data' : 'Upgrade'}
            </Button>
          )}
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="self-learning-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="self-learning-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Stats cards */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalCleanups}</div>
            <div className="text-caption text-text-muted">Total Cleanups</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{formatBytes(status.stats.totalBytesCleaned)}</div>
            <div className="text-caption text-text-muted">Bytes Cleaned</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalCategoriesTracked}</div>
            <div className="text-caption text-text-muted">Categories Tracked</div>
          </Card>
          <Card variant="glass" className="p-3 text-center">
            <div className="text-xl font-bold text-text-primary tabular-nums">{status.stats.totalExclusions}</div>
            <div className="text-caption text-text-muted">Exclusions</div>
          </Card>
        </div>
      )}

      {/* Recommendations */}
      <Card title="AI Recommendations" variant="glass" data-testid="self-learning-recommendations">
        <p className="text-caption text-text-muted mb-3">
          {recommendations.length > 0
            ? `${recommendations.length} personalized recommendation(s) based on your habits`
            : 'No recommendations yet — perform a few more cleanups for the AI to learn your patterns'}
        </p>

        {recommendations.length > 0 ? (
          <div className="space-y-2">
            {recommendations.map((rec) => {
              const Icon = TYPE_ICONS[rec.type] || BoltIcon;
              const tone = PRIORITY_TONES[rec.priority] || 'neutral';
              return (
                <div
                  key={rec.id}
                  className={`rounded-[var(--avs-radius-md)] border p-4 ${
                    rec.priority === 'critical' ? 'border-semantic-danger/30 bg-semantic-danger/5' :
                    rec.priority === 'high' ? 'border-semantic-warning/30 bg-semantic-warning/5' :
                    'border-[var(--avs-border)] bg-surface-muted'
                  }`}
                  data-testid={`self-learning-rec-${rec.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 rounded-[var(--avs-radius-sm)] p-2 ${
                      tone === 'danger' ? 'bg-semantic-danger/10' :
                      tone === 'warning' ? 'bg-semantic-warning/10' : 'bg-brand-primary/10'
                    }`}>
                      <Icon className={`h-5 w-5 ${
                        tone === 'danger' ? 'text-semantic-danger' :
                        tone === 'warning' ? 'text-semantic-warning' : 'text-brand-primary'
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-small font-medium text-text-primary">{rec.title}</span>
                        <Badge tone={tone}>{rec.priority}</Badge>
                      </div>
                      <p className="text-caption text-text-secondary mt-1">{rec.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="sm"
                          variant="primary"
                          leftIcon={actingId === rec.id ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BoltIcon className="h-4 w-4" />}
                          onClick={() => handleActOnRecommendation(rec)}
                          disabled={actingId === rec.id}
                          data-testid={`self-learning-rec-action-${rec.id}`}
                        >
                          {isPro ? (actingId === rec.id ? '...' : rec.action.label) : 'Upgrade'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6">
            <AcademicCapIcon className="h-8 w-8 text-text-muted mx-auto mb-2" />
            <p className="text-small text-text-secondary">Not enough data yet.</p>
            <p className="text-caption text-text-muted mt-1">Perform at least {status?.config.minObservations || 3} cleanups for recommendations.</p>
          </div>
        )}
      </Card>

      {/* Cleanup patterns */}
      {patterns && patterns.totalEvents > 0 && (
        <Card title="Cleanup Patterns" variant="glass" data-testid="self-learning-patterns">
          <div className="space-y-3">
            {/* Preferred times */}
            {patterns.preferredTimes.length > 0 && (
              <div>
                <div className="text-small font-medium text-text-primary mb-2">Preferred Cleanup Times</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {patterns.preferredTimes.map((time) => (
                    <Badge key={time.hour} tone="brand">
                      {time.label} ({time.count}x)
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Preferred days */}
            {patterns.preferredDays.length > 0 && (
              <div>
                <div className="text-small font-medium text-text-primary mb-2">Preferred Days</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {patterns.preferredDays.slice(0, 5).map((day) => (
                    <Badge key={day.day} tone="neutral">
                      {day.day} ({day.count}x)
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Frequency */}
            {patterns.averageFrequencyHours !== null && (
              <div className="flex items-center justify-between">
                <span className="text-small text-text-muted">Average Frequency</span>
                <span className="text-small font-medium text-text-primary">
                  Every {patterns.averageFrequencyHours < 24
                    ? `${patterns.averageFrequencyHours.toFixed(0)} hours`
                    : `${(patterns.averageFrequencyHours / 24).toFixed(1)} days`}
                </span>
              </div>
            )}

            {/* Averages */}
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Average Bytes Cleaned</span>
              <span className="text-small font-medium text-text-primary">{formatBytes(patterns.averageBytesCleaned)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Average Items Cleaned</span>
              <span className="text-small font-medium text-text-primary">{patterns.averageItemsCleaned}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Category preferences */}
      {Object.keys(categoryPrefs).length > 0 && (
        <Card title="Category Preferences" variant="glass" data-testid="self-learning-categories">
          <div className="space-y-2">
            {Object.entries(categoryPrefs).map(([cat, pref]) => (
              <div key={cat} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-3">
                <div className="flex items-center gap-3">
                  <ChartBarIcon className="h-4 w-4 text-text-muted" />
                  <span className="text-small text-text-primary">{cat}</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 w-24 bg-surface-muted rounded-full overflow-hidden border border-[var(--avs-border)]">
                    <div
                      className={`h-full rounded-full ${pref.recommendation === 'select' ? 'bg-semantic-success' : pref.recommendation === 'deselect' ? 'bg-semantic-danger' : 'bg-text-muted'}`}
                      style={{ width: `${pref.preferenceScore * 100}%` }}
                    />
                  </div>
                  <Badge tone={pref.recommendation === 'select' ? 'success' : pref.recommendation === 'deselect' ? 'danger' : 'neutral'}>
                    {Math.round(pref.preferenceScore * 100)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Exclusion patterns */}
      {exclusionPatterns && exclusionPatterns.frequentExclusions.length > 0 && (
        <Card title="Frequent Exclusions" variant="glass" data-testid="self-learning-exclusions">
          <div className="space-y-1">
            {exclusionPatterns.frequentExclusions.map((exc) => (
              <div key={exc.path} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-2">
                <span className="text-small text-text-primary font-mono truncate">{exc.path}</span>
                <Badge tone="neutral">{exc.count}x</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Configuration */}
      {status && (
        <Card title="Configuration" variant="glass" data-testid="self-learning-config">
          <div className="space-y-4">
            {/* Enabled toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AcademicCapIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Self-Learning</div>
                  <p className="text-caption text-text-secondary">Enable or disable habit tracking</p>
                </div>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  status.enabled ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="self-learning-enabled-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Auto-apply toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SparklesIcon className="h-5 w-5 text-text-muted" />
                <div>
                  <div className="text-small font-medium text-text-primary">Auto-Apply Recommendations</div>
                  <p className="text-caption text-text-secondary">Automatically apply AI recommendations</p>
                </div>
              </div>
              <button
                onClick={handleToggleAutoApply}
                disabled={!isPro || configuring}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                  status.autoApplyRecommendations ? 'bg-brand-primary' : 'bg-surface-muted border border-[var(--avs-border)]'
                }`}
                data-testid="self-learning-auto-apply-toggle"
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  status.autoApplyRecommendations ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="self-learning-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view habits and recommendations for free. Upgrade to Professional to configure, reset data, and auto-apply recommendations.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Self-Learning Cleanup')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
