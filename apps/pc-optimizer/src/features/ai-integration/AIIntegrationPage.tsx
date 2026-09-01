/**
 * AIIntegrationPage — AI Integration Hub.
 *
 * Shows how AI subsystems are connected and provides cross-module intelligence:
 *  - Self-Learning → Cleaner: auto-select/deselect categories based on habits
 *  - Workload → Process Priority: auto-switch priority mode based on workload
 *  - Self-Learning → Auto-Care: adjust idle threshold based on cleanup frequency
 *  - Anomaly → Smart Notifications: critical anomalies generate alerts
 *
 * Free: view integration status and recommendations
 * Pro: apply workload-based priority switching
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  Squares2X2Icon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  BoltIcon,
  SparklesIcon,
  CpuChipIcon,
  ClockIcon,
  ShieldExclamationIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline';
import {
  aiIntegrationService,
  type IntegrationStatus,
  type RecommendedCleaners,
  type AutoCareSuggestions,
} from './aiIntegration.service';

export default function AIIntegrationPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [recommended, setRecommended] = useState<RecommendedCleaners | null>(null);
  const [autoCareSuggestions, setAutoCareSuggestions] = useState<AutoCareSuggestions | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [statusResult, recResult, acResult] = await Promise.all([
        aiIntegrationService.getStatus(),
        aiIntegrationService.getRecommendedCleaners(),
        aiIntegrationService.getAutoCareSuggestions(),
      ]);
      setStatus(statusResult);
      setRecommended(recResult);
      setAutoCareSuggestions(acResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load integration data');
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleApplyWorkloadPriority = async () => {
    if (!isPro) {
      showUpgrade('AI Integration');
      return;
    }
    setApplying(true);
    setError(null);
    setActionMessage(null);
    try {
      const result = await aiIntegrationService.applyWorkloadPriority();
      setActionMessage(result.message);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply workload priority');
    } finally {
      setApplying(false);
    }
  };

  const integrations = [
    { id: 'self-learning', label: 'Self-Learning', icon: AcademicCapIcon, connected: status?.selfLearningConnected, hasData: status?.selfLearningHasData },
    { id: 'workload', label: 'Workload Detection', icon: CpuChipIcon, connected: status?.workloadConnected, mode: status?.workloadMode },
    { id: 'auto-care', label: 'Auto-Care', icon: ClockIcon, connected: status?.autoCareConnected },
    { id: 'anomaly', label: 'Anomaly Detection', icon: ShieldExclamationIcon, connected: status?.anomalyConnected, activeCount: status?.anomalyActiveCount },
    { id: 'smart-notif', label: 'Smart Notifications', icon: BoltIcon, connected: status?.smartNotificationsConnected },
  ];

  return (
    <div data-testid="page-ai-integration" className="space-y-4">
      <PageHeader
        title="AI Integration Hub"
        description="Cross-module intelligence connecting all AI subsystems for cohesive operation."
        actions={<HelpButton text="The AI Integration Hub connects standalone AI features: self-learning habits inform cleaner category selection, workload detection auto-switches process priorities, cleanup frequency tunes auto-care idle thresholds, and anomaly detection feeds into smart notifications." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <Squares2X2Icon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Cross-Module Intelligence</div>
          <p className="text-caption text-text-secondary mt-1">
            AI subsystems work together: self-learning habits customize cleanup, workload detection drives process priority,
            cleanup frequency tunes auto-care, and anomaly detection feeds smart notifications.
          </p>
        </div>
      </div>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="integration-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="integration-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Integration status */}
      <Card title="Connected Subsystems" variant="glass" data-testid="integration-status">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.id}
                className={`rounded-[var(--avs-radius-md)] border p-4 ${
                  integration.connected
                    ? 'border-semantic-success/30 bg-semantic-success/5'
                    : 'border-[var(--avs-border)] bg-surface-muted'
                }`}
                data-testid={`integration-${integration.id}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-5 w-5 ${integration.connected ? 'text-semantic-success' : 'text-text-muted'}`} />
                  <span className="text-small font-medium text-text-primary">{integration.label}</span>
                  {integration.connected ? (
                    <CheckCircleIcon className="h-4 w-4 text-semantic-success ml-auto" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 text-text-muted ml-auto" />
                  )}
                </div>
                <p className="text-caption text-text-secondary">
                  {integration.connected ? (
                    <>
                      Connected
                      {integration.mode && ` · ${integration.mode}`}
                      {integration.hasData === true && ' · has data'}
                      {integration.hasData === false && ' · learning...'}
                      {integration.activeCount !== undefined && integration.activeCount > 0 && ` · ${integration.activeCount} active`}
                    </>
                  ) : (
                    'Not connected'
                  )}
                </p>
              </div>
            );
          })}
        </div>

        {status && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-small text-text-muted">
              {status.activeIntegrations} of {status.totalIntegrations} subsystems connected
            </span>
            <div className="flex-1 h-2 mx-4 bg-surface-muted rounded-full overflow-hidden border border-[var(--avs-border)]">
              <div
                className="h-full bg-brand-primary rounded-full transition-all"
                style={{ width: `${(status.activeIntegrations / status.totalIntegrations) * 100}%` }}
              />
            </div>
            <Badge tone={status.activeIntegrations === status.totalIntegrations ? 'success' : 'warning'}>
              {status.activeIntegrations === status.totalIntegrations ? 'All Connected' : 'Partial'}
            </Badge>
          </div>
        )}
      </Card>

      {/* Self-Learning → Cleaner */}
      <Card title="Self-Learning to Cleaner Integration" variant="glass" data-testid="integration-cleaner">
        <p className="text-caption text-text-secondary mb-3">
          AI recommends which cleaner categories to auto-select or deselect based on your past cleanup behavior.
        </p>

        {recommended && recommended.hasData ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone="brand">Confidence: {recommended.confidence}</Badge>
              <span className="text-caption text-text-muted">{recommended.totalEvents} cleanup events analyzed</span>
            </div>

            {recommended.recommendedSelect.length > 0 && (
              <div>
                <div className="text-small font-medium text-semantic-success mb-1">Auto-Select These Categories:</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {recommended.recommendedSelect.map((cat) => (
                    <Badge key={cat} tone="success">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}

            {recommended.recommendedDeselect.length > 0 && (
              <div>
                <div className="text-small font-medium text-semantic-warning mb-1">Auto-Deselect These Categories:</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {recommended.recommendedDeselect.map((cat) => (
                    <Badge key={cat} tone="warning">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}

            {recommended.recommendedSelect.length === 0 && recommended.recommendedDeselect.length === 0 && (
              <p className="text-small text-text-secondary">No strong category preferences detected yet.</p>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <AcademicCapIcon className="h-6 w-6 text-text-muted mx-auto mb-1" />
            <p className="text-small text-text-secondary">Not enough data yet. Perform more cleanups for AI recommendations.</p>
          </div>
        )}
      </Card>

      {/* Workload → Process Priority */}
      <Card title="Workload to Process Priority Integration" variant="glass" data-testid="integration-workload-priority">
        <p className="text-caption text-text-secondary mb-3">
          AI auto-switches process priority mode based on your current workload (gaming → Game Mode, coding → Work Mode, etc.).
        </p>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-small text-text-primary">
              Current workload: <span className="font-medium">{status?.workloadMode || 'unknown'}</span>
            </div>
            <p className="text-caption text-text-muted mt-1">
              Click apply to auto-switch priority mode based on detected workload.
            </p>
          </div>
          <Button
            variant="primary"
            leftIcon={applying ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
            onClick={handleApplyWorkloadPriority}
            disabled={applying || !isPro}
            data-testid="integration-apply-workload"
          >
            {applying ? 'Applying...' : isPro ? 'Apply Now' : 'Upgrade'}
          </Button>
        </div>
      </Card>

      {/* Self-Learning → Auto-Care */}
      <Card title="Self-Learning to Auto-Care Integration" variant="glass" data-testid="integration-autocare">
        <p className="text-caption text-text-secondary mb-3">
          AI tunes auto-care idle threshold and task selection based on your cleanup frequency and category preferences.
        </p>

        {autoCareSuggestions && autoCareSuggestions.hasData ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-small text-text-muted">Suggested Idle Threshold</span>
              <span className="text-small font-medium text-text-primary">{autoCareSuggestions.suggestedIdleThreshold}s ({Math.round(autoCareSuggestions.suggestedIdleThreshold / 60)} min)</span>
            </div>
            {autoCareSuggestions.preferredCleanupTime && (
              <div className="flex items-center justify-between">
                <span className="text-small text-text-muted">Preferred Cleanup Time</span>
                <span className="text-small font-medium text-text-primary">{autoCareSuggestions.preferredCleanupTime}</span>
              </div>
            )}
            {autoCareSuggestions.averageFrequencyHours !== null && autoCareSuggestions.averageFrequencyHours !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-small text-text-muted">Average Cleanup Frequency</span>
                <span className="text-small font-medium text-text-primary">
                  Every {autoCareSuggestions.averageFrequencyHours < 24
                    ? `${autoCareSuggestions.averageFrequencyHours.toFixed(0)}h`
                    : `${(autoCareSuggestions.averageFrequencyHours / 24).toFixed(1)} days`}
                </span>
              </div>
            )}
            <div>
              <div className="text-small font-medium text-text-primary mb-1">Recommended Tasks:</div>
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(autoCareSuggestions.suggestedTasks).map(([task, enabled]) => (
                  <Badge key={task} tone={enabled ? 'success' : 'neutral'}>
                    {task}: {enabled ? 'enabled' : 'disabled'}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <ClockIcon className="h-6 w-6 text-text-muted mx-auto mb-1" />
            <p className="text-small text-text-secondary">Not enough data yet. Perform more cleanups for auto-care suggestions.</p>
          </div>
        )}
      </Card>

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="integration-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can view all integration status and recommendations for free. Upgrade to Professional to apply workload-based priority switching.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('AI Integration')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
