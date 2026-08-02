/**
 * CommandCenter — modal overlay with quick actions for scans,
 * investigations, quarantine, reports, and AI Copilot.
 */
import { useEffect, useRef } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import {
  XMarkIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  LockClosedIcon,
  EyeSlashIcon,
  LightBulbIcon,
  DocumentArrowDownIcon,
  ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';
import type { SecurityOverview } from './SecurityDashboardViewModel';

interface CommandCenterProps {
  overview: SecurityOverview | null;
  onClose: () => void;
  onRunQuickScan: () => void;
  onRunFullScan: () => void;
  onRunCustomScan: () => void;
  onViewInvestigations: () => void;
  onReviewQuarantine: () => void;
  onReviewFalsePositives: () => void;
  onReviewRecommendations: () => void;
  onExportReports: () => void;
}

export function CommandCenter({
  overview,
  onClose,
  onRunQuickScan,
  onRunFullScan,
  onRunCustomScan,
  onViewInvestigations,
  onReviewQuarantine,
  onReviewFalsePositives,
  onReviewRecommendations,
  onExportReports,
}: CommandCenterProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const actions = [
    { icon: RocketLaunchIcon, label: 'Run Quick Scan', description: 'Fast scan of critical areas', onClick: onRunQuickScan, testId: 'cmd-quick-scan' },
    { icon: ShieldCheckIcon, label: 'Run Full Scan', description: 'Complete system scan', onClick: onRunFullScan, testId: 'cmd-full-scan' },
    { icon: AdjustmentsHorizontalIcon, label: 'Run Custom Scan', description: 'Choose what to scan', onClick: onRunCustomScan, testId: 'cmd-custom-scan' },
    { icon: MagnifyingGlassIcon, label: 'View Investigations', description: 'Review active threat investigations', onClick: onViewInvestigations, testId: 'cmd-investigations' },
    { icon: LockClosedIcon, label: 'Review Quarantine', description: 'Manage quarantined threats', onClick: onReviewQuarantine, testId: 'cmd-quarantine' },
    { icon: EyeSlashIcon, label: 'Review False Positives', description: 'Check items marked as safe', onClick: onReviewFalsePositives, testId: 'cmd-false-positives' },
    { icon: LightBulbIcon, label: 'Review Recommendations', description: 'AI security recommendations', onClick: onReviewRecommendations, testId: 'cmd-recommendations' },
    { icon: DocumentArrowDownIcon, label: 'Export Reports', description: 'Download security reports', onClick: onExportReports, testId: 'cmd-export-reports' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Security Command Center"
      data-testid="command-center-overlay"
    >
      <div
        ref={ref}
        className="w-full max-w-2xl rounded-lg border border-border bg-surface shadow-xl"
        data-testid="command-center"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheckIcon className="h-6 w-6 text-brand-primary" aria-hidden />
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Security Command Center</h2>
              <p className="text-xs text-text-secondary">Quick actions and security controls</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:text-text-primary hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
            aria-label="Close command center"
            data-testid="cmd-close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Status summary */}
        {overview && (
          <div className="border-b border-border px-6 py-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-text-secondary">Score: <span className="font-medium text-text-primary">{overview.securityScore}</span></span>
              <Badge tone={overview.protectionStatus === 'running' ? 'success' : 'warning'}>{overview.protectionStatus}</Badge>
              <span className="text-text-secondary">Mode: <span className="font-medium text-text-primary capitalize">{overview.protectionMode}</span></span>
              <span className="text-text-secondary">Threats blocked: <span className="font-medium text-text-primary">{overview.threatsBlocked}</span></span>
            </div>
          </div>
        )}

        {/* Actions grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-6">
          {actions.map((action) => (
            <button
              key={action.testId}
              onClick={() => {
                action.onClick();
                onClose();
              }}
              className="flex items-start gap-3 rounded-md border border-border p-4 text-left hover:border-brand-primary hover:bg-brand-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              data-testid={action.testId}
            >
              <action.icon className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary">{action.label}</div>
                <div className="text-xs text-text-secondary">{action.description}</div>
              </div>
            </button>
          ))}
        </div>

        {/* AI Copilot button */}
        <div className="border-t border-border px-6 py-4">
          <Button
            variant="primary"
            className="w-full"
            leftIcon={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
            onClick={() => {
              onClose();
            }}
            data-testid="cmd-ai-copilot"
          >
            Open AI Copilot
          </Button>
        </div>
      </div>
    </div>
  );
}
