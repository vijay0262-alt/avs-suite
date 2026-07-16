import { Button, Card } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { SparklesIcon, CheckCircleIcon, ExclamationTriangleIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import type { OptimizePreview, OptimizeExecuteResponse } from '../dashboard.types';

export interface OneClickOptimizeProps {
  preview: OptimizePreview | null;
  previewLoading: boolean;
  previewError: string | null;
  result: OptimizeExecuteResponse | null;
  optimizeError: string | null;
  onPreview: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onClose: () => void;
  step: 'idle' | 'preview' | 'confirm' | 'optimizing' | 'complete';
}

export function OneClickOptimize({
  preview,
  previewLoading,
  previewError,
  result,
  optimizeError,
  onPreview,
  onConfirm,
  onCancel,
  onClose,
  step,
}: OneClickOptimizeProps) {
  if (step === 'idle') {
    return (
      <Card title="One Click Optimize">
        <div className="text-center py-8">
          <SparklesIcon className="h-16 w-16 mx-auto text-brand-primary mb-4" aria-hidden />
          <p className="text-sm text-text-secondary mb-6">
            Optimize your system with a single click. Clean temporary files, clear caches, and improve performance.
          </p>
          <Button
            onClick={onPreview}
            leftIcon={<SparklesIcon className="h-4 w-4" />}
            size="lg"
            data-testid="optimize-preview-btn"
            aria-label="Start system optimization"
          >
            Optimize Now
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'preview') {
    return (
      <Modal
        open
        title="One Click Optimize"
        onClose={onCancel}
        size="lg"
        testId="optimize-preview-modal"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCancel} aria-label="Cancel optimization">
              Cancel
            </Button>
            <Button onClick={onConfirm} leftIcon={<SparklesIcon className="h-4 w-4" />} aria-label="Confirm and start optimization">
              Optimize Now
            </Button>
          </div>
        }
      >
        {previewLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-text-muted">Analyzing system...</div>
          </div>
        ) : previewError ? (
          <div className="flex items-center gap-3 py-4 text-sm text-semantic-danger">
            <ExclamationTriangleIcon className="h-5 w-5" aria-hidden />
            <span>{previewError}</span>
          </div>
        ) : preview ? (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-3xl font-bold text-text-primary tabular-nums">
                  {formatBytes(preview.totalRecoverable)}
                </div>
                <div className="text-sm text-text-secondary">Space to recover</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-text-primary tabular-nums">
                  ~{preview.estimatedTime}s
                </div>
                <div className="text-sm text-text-secondary">Estimated time</div>
              </div>
            </div>

            <div>
              <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
                Actions to perform
              </div>
              <div className="space-y-2">
                {preview.actions.map((action) => (
                  <div
                    key={action.name}
                    className="flex items-center justify-between py-2 px-3 rounded-md bg-surface-muted"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircleIcon className="h-5 w-5 text-semantic-success" aria-hidden />
                      <div>
                        <div className="text-sm font-medium text-text-primary">{action.name}</div>
                        <div className="text-xs text-text-secondary">{action.description}</div>
                      </div>
                    </div>
                    {action.size > 0 && (
                      <div className="text-sm font-medium text-text-primary tabular-nums">
                        {formatBytes(action.size)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    );
  }

  if (step === 'optimizing') {
    return (
      <Modal
        open
        title="Optimizing System"
        onClose={() => {}}
        size="md"
        testId="optimize-running-modal"
        actions={null}
      >
        <div className="flex flex-col items-center py-12">
          <div className="relative h-16 w-16 mb-4">
            <div className="absolute inset-0 border-4 border-border rounded-full" />
            <div className="absolute inset-0 border-4 border-brand-primary rounded-full border-t-transparent animate-spin" />
          </div>
          <div className="text-lg font-medium text-text-primary mb-2">Optimizing your system...</div>
          <div className="text-sm text-text-secondary">This may take a few moments</div>
        </div>
      </Modal>
    );
  }

  if (step === 'complete') {
    if (!result) return null;

    const successCount = Object.values(result.results).filter(
      (r) => r.cleaned && !r.error
    ).length;
    const totalCount = Object.keys(result.results).length;

    return (
      <Modal
        open
        title="Optimization Complete"
        onClose={onClose}
        size="lg"
        testId="optimize-complete-modal"
        actions={
          <Button onClick={onClose} data-testid="optimize-close-btn">
            Done
          </Button>
        }
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-semantic-success/10">
              <CheckCircleIcon className="h-8 w-8 text-semantic-success" aria-hidden />
            </div>
            <div>
              <div className="text-2xl font-bold text-text-primary tabular-nums">
                {formatBytes(result.totalRecovered)}
              </div>
              <div className="text-sm text-text-secondary">Space recovered</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <StatCard
              label="Actions completed"
              value={`${successCount}/${totalCount}`}
              icon={CheckCircleIcon}
            />
            <StatCard
              label="Time taken"
              value={`${(result.elapsedMs / 1000).toFixed(1)}s`}
              icon={ClockIcon}
            />
          </div>

          {optimizeError && (
            <div className="flex items-start gap-3 py-3 px-4 rounded-md bg-semantic-danger/10 text-sm text-semantic-danger">
              <ExclamationTriangleIcon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
              <span>{optimizeError}</span>
            </div>
          )}

          <div>
            <div className="mb-3 text-xs uppercase tracking-wide text-text-muted">
              Action details
            </div>
            <div className="space-y-2">
              {Object.entries(result.results).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-surface-muted"
                >
                  <div className="flex items-center gap-3">
                    {value.cleaned ? (
                      <CheckCircleIcon className="h-5 w-5 text-semantic-success" aria-hidden />
                    ) : (
                      <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning" aria-hidden />
                    )}
                    <div className="text-sm text-text-primary capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                  </div>
                  {value.size > 0 && (
                    <div className="text-sm font-medium text-text-primary tabular-nums">
                      {formatBytes(value.size)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-md bg-surface-muted">
      <Icon className="h-5 w-5 text-semantic-primary" aria-hidden />
      <div>
        <div className="text-xs text-text-muted">{label}</div>
        <div className="text-sm font-semibold text-text-primary tabular-nums">{value}</div>
      </div>
    </div>
  );
}
