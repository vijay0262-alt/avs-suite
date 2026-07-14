import { Button, Badge } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import type { CleaningPreview } from '../junkCleaner.types';

export interface PreviewDialogProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  preview: CleaningPreview | null;
  onCancel: () => void;
  onProceed: () => void;
}

/**
 * "Preview cleaning" dialog — first step of the safe-clean flow.
 * Lists every category with its file count / size and any validation
 * warnings surfaced by the backend.
 */
export function PreviewDialog({ open, loading, error, preview, onCancel, onProceed }: PreviewDialogProps) {
  const totalFiles = preview?.totalFiles ?? 0;
  const totalBytes = preview?.totalBytes ?? 0;
  const canProceed = !loading && !error && totalFiles > 0;

  return (
    <Modal
      open={open}
      title="Preview cleaning"
      onClose={onCancel}
      size="lg"
      testId="cleaning-preview-dialog"
      actions={
        <>
          <Button variant="ghost" onClick={onCancel} data-testid="cleaning-preview-cancel">
            Cancel
          </Button>
          <Button
            onClick={onProceed}
            disabled={!canProceed}
            data-testid="cleaning-preview-proceed"
          >
            Continue
          </Button>
        </>
      }
    >
      {loading && (
        <div className="py-8 text-sm text-text-muted" data-testid="cleaning-preview-loading">
          Validating cleaning candidates…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-md border border-semantic-danger/40 bg-[color-mix(in_srgb,var(--avs-danger)_10%,transparent)] p-3 text-sm text-semantic-danger"
        >
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {preview && !loading && !error && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-4 rounded-lg border border-border bg-surface-muted p-4">
            <div>
              <div className="text-xs uppercase text-text-muted">Estimated recovery</div>
              <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
                {formatBytes(totalBytes)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-text-muted">Total files</div>
              <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
                {totalFiles.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-text-muted">Warnings</div>
              <div className="mt-1 text-2xl font-semibold text-text-primary tabular-nums">
                {preview.warningCount.toLocaleString()}
              </div>
            </div>
          </div>

          <table className="w-full text-sm" data-testid="cleaning-preview-table">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-text-muted">
                <th className="py-2 text-left font-medium">Category</th>
                <th className="py-2 text-right font-medium">Files</th>
                <th className="py-2 text-right font-medium">Size</th>
                <th className="py-2 text-right font-medium">Warnings</th>
              </tr>
            </thead>
            <tbody>
              {preview.cleaners.map((c) => (
                <tr key={c.id} className="border-b border-border/60" data-testid={`cleaning-preview-row-${c.id}`}>
                  <td className="py-2 text-text-primary">
                    <div className="flex items-center gap-2">
                      <span>{c.name}</span>
                      <Badge tone="neutral" className="uppercase">
                        {c.category}
                      </Badge>
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">
                    {c.totalFiles.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums text-text-primary">
                    {formatBytes(c.totalBytes)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {c.warningCount > 0 ? (
                      <Badge tone="warning">{c.warningCount}</Badge>
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 text-xs text-text-muted">
            Files sitting in protected Windows folders or symlinked paths have been
            excluded automatically. Nothing outside the categories above will be touched.
          </p>
        </>
      )}
    </Modal>
  );
}
