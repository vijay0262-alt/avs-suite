import { useState } from 'react';
import { ShieldExclamationIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { useElevation } from '../hooks/useElevation';

export function ElevationBanner() {
  const { isAdmin, checking, relaunchAsAdmin } = useElevation();
  const [dismissed, setDismissed] = useState(false);

  if (checking || isAdmin || dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 rounded-[var(--avs-radius-md)] border border-[color-mix(in_srgb,var(--avs-warning)_40%,transparent)] bg-[color-mix(in_srgb,var(--avs-warning)_12%,transparent)] px-4 py-2.5 mb-3"
      data-testid="elevation-banner"
    >
      <ShieldExclamationIcon className="h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--avs-warning)_85%,black)]" />
      <div className="flex-1 text-small text-text-secondary">
        Running without administrator privileges — some system files may be skipped during cleaning.
      </div>
      <button
        type="button"
        onClick={() => void relaunchAsAdmin()}
        className="flex items-center gap-1.5 rounded-[var(--avs-radius-sm)] bg-[color-mix(in_srgb,var(--avs-warning)_85%,black)] px-3 py-1.5 text-caption font-medium text-white transition-opacity hover:opacity-90"
        data-testid="elevation-restart-btn"
      >
        <ArrowPathIcon className="h-3.5 w-3.5" />
        Restart as Administrator
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-text-muted hover:text-text-secondary text-caption"
        aria-label="Dismiss"
        data-testid="elevation-dismiss-btn"
      >
        ✕
      </button>
    </div>
  );
}
