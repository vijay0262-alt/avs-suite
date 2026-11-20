/**
 * StartupGate — "Please wait, configuring AVS AI Shield" overlay.
 *
 * Shown once at launch while the backend finishes importing its feature
 * modules and the frontend preloads page bundles + warms data caches.
 * Shows honest per-feature progress ("Configuring AI Scam Detection…")
 * driven by the backend `system.modules` RPC.
 *
 * After it dismisses, `startSilentRefresh` keeps caches warm in the
 * background with no visible loading. If the endpoint is unavailable
 * (older backend, dev mode) it dismisses after a short grace period.
 */
import { useEffect, useRef, useState } from 'react';
import {
  fetchModuleStatus,
  friendlyModuleName,
  preloadAllPages,
  startSilentRefresh,
  warmFeatureCaches,
} from '../services/startupWarmup';

const POLL_MS = 400;
/** Never hold the user longer than this, whatever the backend reports. */
const MAX_WAIT_MS = 45_000;
/** If system.modules keeps erroring, assume older backend and let go. */
const ERROR_GRACE_MS = 4_000;
/** Minimum visible time so the modal doesn't flash. */
const MIN_VISIBLE_MS = 800;

export function StartupGate() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0, label: 'core services' });
  const mountedAt = useRef(Date.now());
  const dismissed = useRef(false);

  useEffect(() => {
    // Backend bridge missing (tests / plain browser) — nothing to wait for.
    if (typeof window === 'undefined' || !window.avs) {
      setVisible(false);
      return;
    }

    const dismiss = () => {
      if (dismissed.current) return;
      dismissed.current = true;
      const elapsed = Date.now() - mountedAt.current;
      const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
      setTimeout(() => {
        setFading(true);
        setTimeout(() => setVisible(false), 350);
      }, wait);
      // Background work continues silently after the modal is gone.
      startSilentRefresh();
    };

    preloadAllPages();
    warmFeatureCaches();

    let consecutiveErrors = 0;
    let firstErrorAt = 0;
    const poll = async () => {
      try {
        const s = await fetchModuleStatus();
        consecutiveErrors = 0;
        if (s.ready || Date.now() - mountedAt.current > MAX_WAIT_MS) {
          setProgress({ loaded: s.total, total: s.total, label: 'done' });
          dismiss();
          return;
        }
        const current = s.pending[0];
        setProgress({
          loaded: s.loaded,
          total: s.total,
          label: current ? friendlyModuleName(current) : 'features',
        });
      } catch {
        // Older backend without system.modules — don't trap the user.
        consecutiveErrors++;
        if (!firstErrorAt) firstErrorAt = Date.now();
        if (Date.now() - firstErrorAt > ERROR_GRACE_MS || consecutiveErrors > 8) {
          dismiss();
          return;
        }
      }
      if (!dismissed.current) setTimeout(poll, POLL_MS);
    };
    void poll();

    const failsafe = setTimeout(dismiss, MAX_WAIT_MS);
    return () => clearTimeout(failsafe);
  }, []);

  if (!visible) return null;

  const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-[var(--avs-bg)]/95 backdrop-blur-sm transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
      data-testid="startup-gate"
      role="dialog"
      aria-modal="true"
      aria-label="Configuring AVS AI Shield"
    >
      <div className="flex flex-col items-center gap-5 px-10 py-8 rounded-[var(--avs-radius-lg)] border border-[var(--avs-border)] bg-[var(--avs-glass-bg)] shadow-glow max-w-sm w-[90%]">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-brand-primary border-t-transparent" />
        <div className="text-center">
          <div className="text-body font-semibold text-text-primary">Please wait</div>
          <div className="text-small text-text-secondary mt-1">AVS AI Shield is configuring</div>
        </div>
        <div className="w-full">
          <div className="h-1.5 w-full rounded-full bg-[var(--avs-surface-muted)] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all duration-300"
              style={{ width: `${Math.max(pct, 4)}%` }}
            />
          </div>
          <div className="mt-2 text-caption text-text-muted text-center truncate" data-testid="startup-gate-label">
            {progress.label === 'done' ? 'Ready' : `Configuring ${progress.label}…`}
          </div>
        </div>
        {progress.total > 0 && (
          <div className="text-micro text-text-muted">
            {progress.loaded} / {progress.total} features
          </div>
        )}
      </div>
    </div>
  );
}
