/**
 * UnifiedScanProgressCard — lightweight inline scan progress card for
 * individual cleaner modules (Registry, Privacy, Browser, etc.).
 *
 * Replaces the old LiveScanProgress component with the unified design
 * while being suitable for inline page use (not a modal).
 */
import { ServerStackIcon } from '@heroicons/react/24/outline';
import { ScanProgress } from './ScanProgress';
import { ScanAnimation } from './ScanAnimation';
import { ScanCounters } from './ScanCounters';
import { ScanTree } from './ScanTree';
import { ScanHeader } from './ScanHeader';
import { useElapsedTimer } from '../useAnimatedCounter';
import type { UnifiedScanModuleConfig, UnifiedScanTreeNode } from '../unifiedScanTypes';

export interface UnifiedScanProgressCardProps {
  config: UnifiedScanModuleConfig;
  isRunning: boolean;
  progress?: number;
  currentFile?: string | null;
  currentFolder?: string | null;
  counters?: Record<string, number>;
  treeNodes?: UnifiedScanTreeNode[];
  currentPhaseIndex?: number;
  startTime?: number | null;
  onCancel?: () => void;
}

export function UnifiedScanProgressCard({
  config,
  isRunning,
  progress = 0,
  currentFile,
  currentFolder,
  counters = {},
  treeNodes = [],
  currentPhaseIndex = 0,
  startTime = null,
}: UnifiedScanProgressCardProps) {
  const elapsed = useElapsedTimer(startTime);
  const currentPhase = config.phases[currentPhaseIndex];

  if (!isRunning) return null;

  const liveStatus = {
    currentPhase: currentPhase?.label ?? 'Scanning...',
    currentActivity: currentPhase?.activities[0] ?? 'Working...',
    overallProgress: progress,
    currentFile: currentFile ?? undefined,
    currentFolder: currentFolder ?? undefined,
  };

  // Build tree nodes from phases if not provided
  const effectiveTreeNodes = treeNodes.length > 0
    ? treeNodes
    : config.phases.map((phase, i) => ({
        id: phase.id,
        label: phase.label,
        status: i < currentPhaseIndex ? 'complete' as const : i === currentPhaseIndex ? 'scanning' as const : 'pending' as const,
        itemsScanned: 0,
        issuesFound: 0,
      }));

  return (
    <div
      className="rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-surface)] p-5 space-y-4"
      data-testid="unified-scan-progress-card"
    >
      <ScanHeader
        moduleIcon={<ServerStackIcon className="h-7 w-7" />}
        moduleName={config.moduleName}
        currentPhaseLabel={liveStatus.currentPhase}
        elapsedMs={elapsed}
        overallProgress={progress}
        step="scanning"
      />

      <ScanProgress
        progress={progress}
        step="scanning"
        currentFile={currentFile}
      />

      {currentPhase && (
        <ScanAnimation
          activities={currentPhase.activities}
          isScanning={isRunning}
        />
      )}

      {currentFolder && (
        <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-2.5 py-1.5 text-xs truncate">
          <span className="text-text-muted">Folder: </span>
          <span className="font-mono text-text-secondary">{currentFolder}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Scan Phases
          </div>
          <ScanTree nodes={effectiveTreeNodes} />
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Live Counters
          </div>
          <ScanCounters definitions={config.counters} values={counters} />
        </div>
      </div>
    </div>
  );
}
