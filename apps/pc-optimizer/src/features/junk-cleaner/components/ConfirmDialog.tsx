import { Button, Badge } from '@avs/ui';
import { formatBytes } from '@avs/shared/utils';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Modal } from './Modal';
import type { CleaningPreview } from '../junkCleaner.types';
import { canUse, currentEdition } from '../../licensing/FeatureGate';

const FREE_CLEAN_LIMIT_BYTES = 500 * 1024 * 1024; // 500 MB

export interface ConfirmDialogProps {
  open: boolean;
  preview: CleaningPreview | null;
  onBack: () => void;
  onConfirm: () => void;
}

function estimateSeconds(files: number): number {
  // ~1000 files/sec floor — matches the stress-test budget.
  return Math.max(1, Math.ceil(files / 1000));
}

/**
 * Final confirmation before deletion. Requires the user to actively
 * click the primary button; escape / backdrop still cancel safely.
 */
export function ConfirmDialog({ open, preview, onBack, onConfirm }: ConfirmDialogProps) {
  if (!preview) return null;
  const categories = preview.cleaners.filter((c) => c.totalFiles > 0);
  const eta = estimateSeconds(preview.totalFiles);

  const isFree = currentEdition() === 'free';
  const hasUnlimited = canUse('junk.clean_unlimited');
  const exceedsLimit = isFree && !hasUnlimited && preview.totalBytes > FREE_CLEAN_LIMIT_BYTES;
  const cappedBytes = exceedsLimit ? FREE_CLEAN_LIMIT_BYTES : preview.totalBytes;

  return (
    <Modal
      open={open}
      title="Confirm cleaning"
      onClose={onBack}
      size="md"
      testId="cleaning-confirm-dialog"
      actions={
        <>
          <Button variant="ghost" onClick={onBack} data-testid="cleaning-confirm-cancel">
            Back
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            data-testid="cleaning-confirm-proceed"
          >
            Clean {formatBytes(cappedBytes)}{exceedsLimit ? ' (500 MB Free limit)' : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-[var(--avs-radius-md)] border border-[color-mix(in_srgb,var(--avs-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--avs-warning)_10%,transparent)] p-3">
          <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--avs-warning)_85%,black)]" />
          <p className="text-small text-text-primary" data-testid="cleaning-confirm-summary">
            You are about to remove <b>{formatBytes(cappedBytes)}</b>{exceedsLimit ? ` of ${formatBytes(preview.totalBytes)}` : ''} from{' '}
            <b>{categories.length}</b>{' '}
            {categories.length === 1 ? 'category' : 'categories'} — a total of{' '}
            <b>{preview.totalFiles.toLocaleString()}</b> files.
          </p>
          {exceedsLimit && (
            <p className="mt-2 text-caption text-semantic-warning">
              Free edition cleans up to 500 MB. Upgrade to remove all {formatBytes(preview.totalBytes)}.
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 text-caption uppercase tracking-wide text-text-muted">
            Selected categories
          </div>
          <ul className="space-y-1.5">
            {categories.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-3 py-2 text-small"
              >
                <div className="flex items-center gap-2">
                  <span className="text-text-primary">{c.name}</span>
                  <Badge tone="neutral" className="uppercase">
                    {c.category}
                  </Badge>
                </div>
                <span className="tabular-nums text-text-secondary">
                  {c.totalFiles.toLocaleString()} · {formatBytes(c.totalBytes)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-[var(--avs-border)] pt-3">
          <div>
            <div className="text-caption uppercase text-text-muted">Estimated time</div>
            <div className="mt-1 text-small font-medium text-text-primary">
              ≈ {eta}s
            </div>
          </div>
          <div>
            <div className="text-caption uppercase text-text-muted">Restore Point</div>
            <div className="mt-1 text-small font-medium text-text-primary">Created automatically</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
