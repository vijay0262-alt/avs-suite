/**
 * WorkloadDetectionPage — AI workload detection with Game Mode.
 *
 * Detects: gaming, video editing, coding, browsing, office, media, idle, mixed
 * Free: detect and view current workload
 * Pro: configure, manual override, auto-optimize
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  CpuChipIcon,
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import {
  workloadService,
  type WorkloadDetectResult,
  type WorkloadHistoryEntry,
} from './workload.service';

const MODE_LABELS: Record<string, string> = {
  gaming: 'Gaming',
  video_editing: 'Video Editing',
  coding: 'Coding',
  browsing: 'Browsing',
  office: 'Office',
  media: 'Media',
  idle: 'Idle',
  mixed: 'Mixed',
};

const MODE_ICONS: Record<string, string> = {
  gaming: '🎮',
  video_editing: '🎬',
  coding: '💻',
  browsing: '🌐',
  office: '📄',
  media: '🎵',
  idle: '🌙',
  mixed: '✨',
};

const MODE_TONES: Record<string, 'danger' | 'warning' | 'brand' | 'neutral' | 'success'> = {
  gaming: 'danger',
  video_editing: 'warning',
  coding: 'brand',
  browsing: 'brand',
  office: 'neutral',
  media: 'brand',
  idle: 'neutral',
  mixed: 'warning',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function WorkloadDetectionPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [detection, setDetection] = useState<WorkloadDetectResult | null>(null);
  const [history, setHistory] = useState<WorkloadHistoryEntry[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleDetect = useCallback(async () => {
    setDetecting(true);
    setError(null);
    try {
      const result = await workloadService.detect();
      setDetection(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to detect workload');
    } finally {
      setDetecting(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const result = await workloadService.getHistory(30);
      setHistory(result.entries);
    } catch {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    handleDetect();
    loadHistory();
  }, [handleDetect, loadHistory]);

  const handleSetMode = async (mode: string | null) => {
    if (!isPro) {
      showUpgrade('Workload Detection');
      return;
    }
    setConfiguring(true);
    setError(null);
    try {
      const result = await workloadService.setMode(mode);
      setActionMessage(result.message);
      if (result.success) {
        await handleDetect();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set mode');
    } finally {
      setConfiguring(false);
    }
  };

  const currentMode = detection?.mode ?? 'idle';
  const profile = detection?.profile;
  const modeTone = MODE_TONES[currentMode] || 'neutral';

  return (
    <div data-testid="page-workload" className="space-y-4">
      <PageHeader
        title="AI Workload Detection"
        description="AI detects your current workload (gaming, coding, browsing, etc.) and optimizes your system accordingly."
        actions={<HelpButton text="Click Detect to analyze running processes. Pro users can manually override the detected mode and enable auto-optimization." />}
      />

      {/* Info banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-start gap-3">
        <CpuChipIcon className="h-5 w-5 text-brand-primary shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">AI Workload Classification</div>
          <p className="text-caption text-text-secondary mt-1">
            Analyzes running processes, CPU usage, and memory to classify your current workload.
            Each mode has a tailored optimization profile.
          </p>
        </div>
      </div>

      {/* Current mode display */}
      <Card variant="glass" className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-4 text-3xl ${
              modeTone === 'danger' ? 'bg-semantic-danger/10' :
              modeTone === 'warning' ? 'bg-semantic-warning/10' :
              modeTone === 'brand' ? 'bg-brand-primary/10' : 'bg-surface-muted'
            }`}>
              {MODE_ICONS[currentMode] || '🖥️'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-section-title text-text-primary">
                  {MODE_LABELS[currentMode] || currentMode}
                </span>
                <Badge tone={modeTone as 'danger' | 'warning' | 'brand' | 'neutral'}>
                  {Math.round((detection?.confidence ?? 0) * 100)}% confidence
                </Badge>
                {detection?.manualOverride && <Badge tone="brand">Manual</Badge>}
              </div>
              {profile && (
                <p className="text-caption text-text-secondary mt-1">{profile.description}</p>
              )}
            </div>
          </div>
          <Button
            variant="primary"
            leftIcon={detecting ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
            onClick={handleDetect}
            disabled={detecting}
            data-testid="workload-detect-btn"
          >
            {detecting ? 'Detecting...' : 'Detect Now'}
          </Button>
        </div>
      </Card>

      {/* Error / Action message */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="workload-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-center gap-3" data-testid="workload-action-msg">
          <CheckCircleIcon className="h-5 w-5 text-semantic-success" />
          <span className="text-small text-text-primary">{actionMessage}</span>
        </div>
      )}

      {/* Optimization profile */}
      {profile && (
        <Card title="Optimization Profile" variant="glass" data-testid="workload-profile">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-small font-medium text-text-primary">{profile.label}</span>
            </div>
            <p className="text-caption text-text-secondary">{profile.description}</p>
            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-caption text-text-muted">Actions:</span>
              {profile.actions.map((action, i) => (
                <Badge key={i} tone="neutral">{action.replace(/_/g, ' ')}</Badge>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Matched processes */}
      {detection && detection.matchedProcesses.length > 0 && (
        <Card title="Detected Processes" variant="glass" data-testid="workload-processes">
          <div className="space-y-1">
            {detection.matchedProcesses.map((proc, i) => (
              <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-2">
                <div className="flex items-center gap-3">
                  <CpuChipIcon className="h-4 w-4 text-text-muted" />
                  <span className="text-small text-text-primary font-mono">{proc.name}</span>
                </div>
                <div className="flex items-center gap-4 text-caption text-text-muted">
                  <span>CPU: {proc.cpu.toFixed(1)}%</span>
                  <span>RAM: {proc.memoryMB.toFixed(0)} MB</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Category scores */}
      {detection && Object.keys(detection.categoryScores).length > 0 && (
        <Card title="Category Scores" variant="glass" data-testid="workload-scores">
          <div className="space-y-2">
            {Object.entries(detection.categoryScores)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, score]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-small text-text-primary w-32">{MODE_LABELS[cat] || cat}</span>
                  <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        cat === currentMode ? 'bg-brand-primary' : 'bg-text-muted'
                      }`}
                      style={{ width: `${Math.min(100, score * 20)}%` }}
                    />
                  </div>
                  <span className="text-caption text-text-muted tabular-nums w-12 text-right">
                    {score.toFixed(1)}
                  </span>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Manual override */}
      <Card title="Manual Override" variant="glass" data-testid="workload-override">
        <p className="text-caption text-text-secondary mb-3">
          Manually set a workload mode, or clear the override to return to auto-detection.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(MODE_LABELS).map(([mode, label]) => (
            <Button
              key={mode}
              size="sm"
              variant={currentMode === mode && detection?.manualOverride ? 'primary' : 'ghost'}
              onClick={() => handleSetMode(mode)}
              disabled={!isPro || configuring}
              data-testid={`workload-mode-${mode}`}
            >
              {MODE_ICONS[mode]} {label}
            </Button>
          ))}
          {detection?.manualOverride && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleSetMode(null)}
              disabled={!isPro || configuring}
              data-testid="workload-mode-auto"
            >
              Auto Detect
            </Button>
          )}
        </div>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card title="Detection History" variant="glass" data-testid="workload-history">
          <div className="space-y-1">
            {history.slice().reverse().slice(0, 10).map((entry, i) => (
              <div key={i} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{MODE_ICONS[entry.mode] || '🖥️'}</span>
                  <span className="text-small text-text-primary">{MODE_LABELS[entry.mode] || entry.mode}</span>
                  {entry.manualOverride && <Badge tone="brand">Manual</Badge>}
                </div>
                <div className="text-caption text-text-muted">
                  {formatDate(entry.timestamp)} · {Math.round(entry.confidence * 100)}%
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Free edition notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="workload-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition</div>
            <p className="text-caption text-text-secondary mt-1">
              You can detect your workload for free. Upgrade to Professional for manual override and auto-optimization.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('Workload Detection')} leftIcon={<SparklesIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
