/**
 * ScanFooter — pause/resume/cancel controls with confirmation.
 *
 * Provides consistent scan control buttons across all modules.
 * Cancel shows a confirmation dialog before stopping.
 */
import { useState } from 'react';
import { Button } from '@avs/ui';
import {
  PauseIcon,
  PlayIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export interface ScanFooterProps {
  step: 'preparing' | 'scanning' | 'paused' | 'complete' | 'error';
  supportsPause: boolean;
  supportsCancel: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function ScanFooter({
  step,
  supportsPause,
  supportsCancel,
  onPause,
  onResume,
  onCancel,
}: ScanFooterProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const isActive = step === 'scanning' || step === 'preparing' || step === 'paused';

  if (!isActive) return null;

  if (showCancelConfirm) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-[var(--avs-radius-md)] border border-semantic-warning/30 bg-semantic-warning/10 p-3"
        data-testid="unified-scan-cancel-confirm"
        role="alertdialog"
        aria-label="Cancel scan confirmation"
      >
        <div className="flex items-center gap-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-semantic-warning shrink-0" aria-hidden />
          <span className="text-small text-text-primary">
            Cancel the scan? Results so far will be discarded.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowCancelConfirm(false)}>
            No, Continue
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setShowCancelConfirm(false);
              onCancel();
            }}
          >
            Yes, Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2" data-testid="unified-scan-footer">
      {supportsPause && step === 'scanning' && (
        <Button variant="secondary" onClick={onPause} leftIcon={<PauseIcon className="h-4 w-4" />}>
          Pause
        </Button>
      )}
      {supportsPause && step === 'paused' && (
        <Button variant="secondary" onClick={onResume} leftIcon={<PlayIcon className="h-4 w-4" />}>
          Resume
        </Button>
      )}
      {supportsCancel && (
        <Button
          variant="secondary"
          onClick={() => setShowCancelConfirm(true)}
          leftIcon={<XMarkIcon className="h-4 w-4" />}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
