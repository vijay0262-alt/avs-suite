/**
 * UnifiedScanView — composes all scan components into a single, consistent
 * scanning experience used by every module in AVS Shield.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │  ScanHeader (icon, name, phase, ETA) │
 *   │  ScanProgress (large animated bar)   │
 *   │  ScanAnimation (cycling activity)    │
 *   │  ┌──────────┐  ┌──────────────────┐  │
 *   │  │ ScanTree │  │ ScanCounters     │  │
 *   │  │ (phases) │  │ (live grid)      │  │
 *   │  └──────────┘  └──────────────────┘  │
 *   │  ScanFooter (pause/resume/cancel)    │
 *   └─────────────────────────────────────┘
 *
 * When complete, shows ScanSummary instead.
 */
import type { ReactNode } from 'react';
import { Card } from '@avs/ui';
import {
  SparklesIcon,
  ShieldCheckIcon,
  TrashIcon,
  ServerStackIcon,
  EyeSlashIcon,
  GlobeAltIcon,
  DocumentDuplicateIcon,
  CircleStackIcon,
  CpuChipIcon,
  RocketLaunchIcon,
  ServerIcon,
  ArrowPathIcon,
  ArchiveBoxXMarkIcon,
} from '@heroicons/react/24/outline';
import { ScanHeader } from './ScanHeader';
import { ScanProgress } from './ScanProgress';
import { ScanCounters } from './ScanCounters';
import { ScanTree } from './ScanTree';
import { ScanAnimation } from './ScanAnimation';
import { ScanFooter } from './ScanFooter';
import { ScanSummary } from './ScanSummary';
import { useElapsedTimer } from '../useAnimatedCounter';
import type {
  UnifiedScanStep,
  UnifiedScanModuleConfig,
  UnifiedScanLiveStatus,
  UnifiedScanReport,
  UnifiedScanAction,
  UnifiedScanTreeNode,
} from '../unifiedScanTypes';

export interface UnifiedScanViewProps {
  config: UnifiedScanModuleConfig;
  step: UnifiedScanStep;
  liveStatus: UnifiedScanLiveStatus;
  counters: Record<string, number>;
  treeNodes: UnifiedScanTreeNode[];
  currentPhaseIndex: number;
  startTime: number | null;
  error: string | null;
  report: UnifiedScanReport | null;
  actions: UnifiedScanAction[];
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onClose: () => void;
  /** Optional custom content below the scan tree */
  children?: ReactNode;
}

export function UnifiedScanView({
  config,
  step,
  liveStatus,
  counters,
  treeNodes,
  currentPhaseIndex,
  startTime,
  error,
  report,
  actions,
  onPause,
  onResume,
  onCancel,
  onClose,
  children,
}: UnifiedScanViewProps) {
  const elapsed = useElapsedTimer(startTime);
  const currentPhase = config.phases[currentPhaseIndex];
  const isScanning = step === 'scanning' || step === 'preparing' || step === 'paused';

  // Complete view
  if (step === 'complete' && report) {
    return (
      <Card variant="glass" data-testid="unified-scan-view-complete">
        <ScanSummary report={report} actions={actions} onClose={onClose} />
      </Card>
    );
  }

  // Error view
  if (step === 'error') {
    return (
      <Card variant="glass" data-testid="unified-scan-view-error">
        <div className="space-y-4 text-center py-8">
          <div className="inline-flex p-3 rounded-full bg-semantic-danger/10">
            <svg className="h-10 w-10 text-semantic-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h3 className="text-section-title font-semibold text-text-primary">Scan Failed</h3>
          <p className="text-small text-text-secondary max-w-md mx-auto">{error}</p>
          <button
            onClick={onClose}
            className="rounded-[var(--avs-radius-md)] bg-brand-primary px-4 py-2 text-small font-medium text-white hover:bg-brand-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </Card>
    );
  }

  // Scanning / preparing / paused view
  return (
    <Card variant="glass" data-testid="unified-scan-view-active">
      <div className="space-y-5">
        {/* Header */}
        <ScanHeader
          moduleIcon={<ModuleIcon icon={config.moduleIcon} />}
          moduleName={config.moduleName}
          currentPhaseLabel={liveStatus.currentPhase || currentPhase?.label || 'Preparing...'}
          elapsedMs={elapsed}
          overallProgress={liveStatus.overallProgress}
          step={step as 'preparing' | 'scanning' | 'paused' | 'complete' | 'error'}
        />

        {/* Progress bar */}
        <ScanProgress
          progress={liveStatus.overallProgress}
          subProgress={liveStatus.subProgress}
          step={step}
          currentFile={liveStatus.currentFile}
        />

        {/* Activity message */}
        {isScanning && currentPhase && (
          <ScanAnimation
            activities={currentPhase.activities}
            isScanning={isScanning && step !== 'paused'}
          />
        )}

        {/* Live status details */}
        {(liveStatus.currentFolder || liveStatus.currentModule || liveStatus.currentCategory) && isScanning && (
          <div className="grid grid-cols-2 gap-2 text-caption">
            {liveStatus.currentModule && (
              <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-2.5 py-1.5">
                <span className="text-text-muted">Module: </span>
                <span className="font-medium text-text-primary">{liveStatus.currentModule}</span>
              </div>
            )}
            {liveStatus.currentCategory && (
              <div className="rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-2.5 py-1.5">
                <span className="text-text-muted">Category: </span>
                <span className="font-medium text-text-primary">{liveStatus.currentCategory}</span>
              </div>
            )}
            {liveStatus.currentFolder && (
              <div className="col-span-2 rounded-[var(--avs-radius-sm)] bg-[var(--avs-surface-muted)] px-2.5 py-1.5 truncate">
                <span className="text-text-muted">Folder: </span>
                <span className="font-mono text-text-secondary">{liveStatus.currentFolder}</span>
              </div>
            )}
          </div>
        )}

        {/* Counters + Tree side by side on large screens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Scan tree */}
          <div>
            <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              Scan Phases
            </div>
            <ScanTree nodes={treeNodes} />
          </div>

          {/* Live counters */}
          <div>
            <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-text-muted">
              Live Counters
            </div>
            <ScanCounters
              definitions={config.counters}
              values={counters}
            />
          </div>
        </div>

        {/* Custom module content */}
        {children}

        {/* Error message */}
        {error && (
          <div className="rounded-[var(--avs-radius-md)] bg-semantic-danger/10 p-3 text-small text-semantic-danger">
            {error}
          </div>
        )}

        {/* Footer controls */}
        <ScanFooter
          step={step as 'preparing' | 'scanning' | 'paused' | 'complete' | 'error'}
          supportsPause={config.supportsPause}
          supportsCancel={config.supportsCancel}
          onPause={onPause}
          onResume={onResume}
          onCancel={onCancel}
        />
      </div>
    </Card>
  );
}

// ── Module Icon Renderer ────────────────────────────────────────

function ModuleIcon({ icon }: { icon: string }) {
  const iconMap: Record<string, ReactNode> = {
    SparklesIcon: <SparklesIcon />,
    ShieldCheckIcon: <ShieldCheckIcon />,
    TrashIcon: <TrashIcon />,
    ServerStackIcon: <ServerStackIcon />,
    EyeSlashIcon: <EyeSlashIcon />,
    GlobeAltIcon: <GlobeAltIcon />,
    DocumentDuplicateIcon: <DocumentDuplicateIcon />,
    CircleStackIcon: <CircleStackIcon />,
    CpuChipIcon: <CpuChipIcon />,
    RocketLaunchIcon: <RocketLaunchIcon />,
    ServerIcon: <ServerIcon />,
    ArrowPathIcon: <ArrowPathIcon />,
    ArchiveBoxXMarkIcon: <ArchiveBoxXMarkIcon />,
  };
  return <span className="h-7 w-7">{iconMap[icon] ?? <SparklesIcon />}</span>;
}

