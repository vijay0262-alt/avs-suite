/**
 * SmartOptimizationPage — V1.0 Redesigned
 *
 * Clean, professional optimization page that matches the Dashboard design.
 * Shows real cleanup data synced with the dashboard scan state.
 *
 * Workflow: Optimize Now → Scanning → Cleaning → Complete
 * Same scan engine as Dashboard, just presented differently.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { FreeEditionNotice } from '../../components/FreeEditionNotice';
import { useIsPro } from '../sync/syncStore';
import { ProStatusBanner, ProStatusPill } from '../licensing/ProStatusBadge';
import { ScanView } from '../scan';
import { useDashboardScan } from '../scan/useDashboardScan';
import { Modal } from '../dashboard/components/Modal';
import { formatDataSize } from '@avs/shared/utils';
import {
  BoltIcon,
  CircleStackIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

export default function SmartOptimizationPage() {
  const isPro = useIsPro();
  const { snapshot } = useDashboardScan();
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  // Sync with dashboard scan state — if a scan is running, reflect it
  const isScanning = snapshot.scanStatus === 'scanning' || snapshot.scanStatus === 'preparing';
  const isComplete = snapshot.scanStatus === 'complete';

  useEffect(() => {
    // No bootstrap needed — we read directly from dashboard scan state
  }, []);

  const handleOptimizeClick = () => {
    if (!isPro) {
      setUpgradeModalOpen(true);
    } else {
      setScanModalOpen(true);
    }
  };

  // ── Derived metrics from actual scan/cleanup data ──────────────
  const healthScore = snapshot.cleanupResult?.healthAfter ?? 0;
  const healthBefore = snapshot.cleanupResult?.healthBefore ?? 0;
  const scoreDelta = healthScore - healthBefore;
  const spaceRecovered = snapshot.cleanupResult?.spaceRecovered ?? 0;
  const filesCleaned = snapshot.cleanupResult?.cleaned ?? 0;
  const filesDetected = snapshot.cleanupResult?.detected ?? 0;

  const lastOptTime = snapshot.completedAt;
  const lastOptLabel = useMemo(() => {
    if (!lastOptTime) return 'Not yet run';
    const date = new Date(lastOptTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    return date.toLocaleDateString();
  }, [lastOptTime]);

  return (
    <div className="space-y-6" data-testid="page-smart-optimization">
      <ProStatusBanner compact />
      <PageHeader
        title="AI Smart Optimize"
        description="Safe, intelligent optimization recommendations tailored to your PC."
        actions={
          <div className="flex items-center gap-2">
            <ProStatusPill />
            <Button
              onClick={handleOptimizeClick}
              size="lg"
              leftIcon={isScanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
              data-testid="smart-opt-scan-cta"
              disabled={isScanning}
            >
              {isScanning ? 'Scanning...' : isPro ? 'Optimize Now' : 'Upgrade to Optimize'}
            </Button>
          </div>
        }
      />

      {/* ── Status Banner ─────────────────────────────────────────── */}
      {isComplete && filesCleaned > 0 && (
        <Card variant="glass" className="p-4 border-[var(--avs-success)]/30 bg-[var(--avs-success)]/5" data-testid="smart-opt-success-banner">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-10 rounded-full bg-[var(--avs-success)]/10 flex items-center justify-center">
              <CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
            </div>
            <div className="flex-1">
              <p className="text-small font-semibold text-[var(--avs-text-primary)]">
                Optimization Complete — {filesCleaned.toLocaleString()} files cleaned, {formatDataSize(spaceRecovered)} recovered
              </p>
              <p className="text-caption text-[var(--avs-text-muted)]">
                {scoreDelta > 0 ? `Health score improved by +${scoreDelta} points` : 'Your PC is now optimized'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Free Edition Notice ───────────────────────────────────── */}
      {!isPro && (
        <FreeEditionNotice
          icon={BoltIcon}
          title="AI Smart Optimization is a Professional Feature"
          message="Upgrade to Professional to unlock one-click AI-driven optimization with automatic sequencing, rollback protection, scheduled optimization, and unlimited junk cleaning."
          action={
            <Button onClick={() => setUpgradeModalOpen(true)} variant="primary" data-testid="smart-opt-upgrade-cta">
              Upgrade to Professional
            </Button>
          }
          testId="smart-opt-free-notice"
        />
      )}

      {/* ── Summary Cards (4) — synced with real scan data ────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="smart-opt-cards">
        {/* Card 1: Optimization Score */}
        <Card variant="glass" className="p-5" data-testid="smart-opt-score">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
              healthScore >= 80 ? 'bg-[var(--avs-success)]/10' :
              healthScore >= 60 ? 'bg-[var(--avs-warning)]/10' :
              'bg-[var(--avs-danger)]/10'
            }`}>
              <ArrowTrendingUpIcon className={`h-5 w-5 ${
                healthScore >= 80 ? 'text-[var(--avs-success)]' :
                healthScore >= 60 ? 'text-[var(--avs-warning)]' :
                'text-[var(--avs-danger)]'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-[var(--avs-text-muted)]">Optimization Score</div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-[var(--avs-text-primary)] tabular-nums">{healthScore}</span>
                <span className="text-caption text-[var(--avs-text-muted)]">/100</span>
              </div>
              <div className="text-caption text-[var(--avs-success)]">
                {scoreDelta > 0 ? `+${scoreDelta} improved` : 'Run optimization to improve'}
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: Storage Recovered */}
        <Card variant="glass" className="p-5" data-testid="smart-opt-storage">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-[var(--avs-success)]/10">
              <CircleStackIcon className="h-5 w-5 text-[var(--avs-success)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-[var(--avs-text-muted)]">Storage Recovered</div>
              <div className="text-2xl font-bold text-[var(--avs-text-primary)] tabular-nums">
                {formatDataSize(spaceRecovered)}
              </div>
              <div className="text-caption text-[var(--avs-text-muted)]">
                {spaceRecovered > 0 ? 'Total recovered' : 'Not yet optimized'}
              </div>
            </div>
          </div>
        </Card>

        {/* Card 3: Items Fixed */}
        <Card variant="glass" className="p-5" data-testid="smart-opt-items">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-[var(--avs-warning)]/10">
              <BoltIcon className="h-5 w-5 text-[var(--avs-warning)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-[var(--avs-text-muted)]">Items Fixed</div>
              <div className="text-2xl font-bold text-[var(--avs-text-primary)] tabular-nums">
                {filesCleaned.toLocaleString()}
              </div>
              <div className="text-caption text-[var(--avs-text-muted)]">
                {filesCleaned > 0 ? 'Files cleaned' : 'Not yet optimized'}
              </div>
            </div>
          </div>
        </Card>

        {/* Card 4: Last Optimization */}
        <Card variant="glass" className="p-5" data-testid="smart-opt-last">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-[var(--avs-surface-muted)]">
              <ClockIcon className="h-5 w-5 text-[var(--avs-text-muted)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-[var(--avs-text-muted)]">Last Optimization</div>
              <div className="text-small font-semibold text-[var(--avs-text-primary)]">
                {lastOptLabel}
              </div>
              <div className="text-caption text-[var(--avs-text-muted)]">
                {isComplete ? 'Completed' : isScanning ? 'In progress...' : 'Ready'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Optimization Categories ───────────────────────────────── */}
      {snapshot.cleanupResult && filesDetected > 0 && (
        <Card variant="glass" className="p-5" data-testid="smart-opt-categories">
          <h3 className="text-small font-semibold text-[var(--avs-text-primary)] mb-4">
            Cleanup Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--avs-text-primary)] tabular-nums">
                {filesDetected.toLocaleString()}
              </div>
              <div className="text-caption text-[var(--avs-text-muted)] mt-1">Files Detected</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--avs-success)] tabular-nums">
                {filesCleaned.toLocaleString()}
              </div>
              <div className="text-caption text-[var(--avs-text-muted)] mt-1">Files Cleaned</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--avs-warning)] tabular-nums">
                {snapshot.cleanupResult.failed.toLocaleString()}
              </div>
              <div className="text-caption text-[var(--avs-text-muted)] mt-1">Files Skipped</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--avs-brand-primary)] tabular-nums">
                {snapshot.cleanupResult.foldersCleaned.toLocaleString()}
              </div>
              <div className="text-caption text-[var(--avs-text-muted)] mt-1">Folders Removed</div>
            </div>
          </div>
        </Card>
      )}

      {/* ── Feature Highlights ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="smart-opt-features">
        <Card variant="glass" className="p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-[var(--avs-radius-md)] bg-[var(--avs-brand-primary)]/10 flex items-center justify-center">
              <CpuChipIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
            </div>
            <div>
              <h4 className="text-small font-semibold text-[var(--avs-text-primary)]">Smart Analysis</h4>
              <p className="text-caption text-[var(--avs-text-muted)] mt-1">
                Scans junk files, temp data, cache, and system clutter — same thorough scan as Dashboard.
              </p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-[var(--avs-radius-md)] bg-[var(--avs-success)]/10 flex items-center justify-center">
              <ShieldCheckIcon className="h-5 w-5 text-[var(--avs-success)]" />
            </div>
            <div>
              <h4 className="text-small font-semibold text-[var(--avs-text-primary)]">Safe Cleanup</h4>
              <p className="text-caption text-[var(--avs-text-muted)] mt-1">
                Only deletes safe-to-remove files. Locked or in-use files are skipped automatically.
              </p>
            </div>
          </div>
        </Card>
        <Card variant="glass" className="p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-10 h-10 rounded-[var(--avs-radius-md)] bg-[var(--avs-warning)]/10 flex items-center justify-center">
              <BoltIcon className="h-5 w-5 text-[var(--avs-warning)]" />
            </div>
            <div>
              <h4 className="text-small font-semibold text-[var(--avs-text-primary)]">One-Click Optimize</h4>
              <p className="text-caption text-[var(--avs-text-muted)] mt-1">
                Scans and cleans in one action. See live progress with file paths and category updates.
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Scan Modal ────────────────────────────────────────────── */}
      <Modal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        title="AI Smart Optimization"
        size="xl"
        hideCloseButton
      >
        <ScanView
          module="optimize"
          mode="quick"
          autoStart={true}
          buttonLabel="Optimize Now"
          source="smart_optimize"
          onClose={() => setScanModalOpen(false)}
          onUpgrade={() => {
            setScanModalOpen(false);
            setUpgradeModalOpen(true);
          }}
        />
      </Modal>

      {/* ── Upgrade Modal ─────────────────────────────────────────── */}
      <Modal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade to Professional"
        size="md"
      >
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
              <BoltIcon className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[var(--avs-text-primary)]">AI Smart Optimization</h3>
              <p className="text-sm text-[var(--avs-text-muted)]">A Professional edition feature</p>
            </div>
          </div>
          <p className="text-sm text-[var(--avs-text-secondary)]">
            Unlock AI-driven automatic system optimization with:
          </p>
          <ul className="text-sm text-[var(--avs-text-secondary)] space-y-2 list-disc list-inside">
            <li>One-click optimization with automatic sequencing</li>
            <li>Rollback protection for every action</li>
            <li>Scheduled and background optimization</li>
            <li>Unlimited junk cleaning (no 500 MB cap)</li>
            <li>Smart recommendations and optimization history</li>
          </ul>
          <div className="flex gap-3 pt-2">
            <Button onClick={() => setUpgradeModalOpen(false)} variant="ghost">
              Maybe Later
            </Button>
            <Button
              onClick={() => {
                setUpgradeModalOpen(false);
                window.open('https://www.avsshield.com/upgrade', '_blank');
              }}
              variant="primary"
              data-testid="upgrade-modal-cta"
            >
              Upgrade Now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
