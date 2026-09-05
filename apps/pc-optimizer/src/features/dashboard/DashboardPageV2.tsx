import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, EmptyState, LoadingState } from '@avs/ui';
import { ModuleErrorBanner } from '../../components/ModuleStates';
import {
  ShieldExclamationIcon,
  CpuChipIcon,
  CircleStackIcon,
  HeartIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  BoltIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { DashboardViewModel } from './DashboardViewModel';
import { dashboardService } from './dashboard.service';
import { useJunkMonitor } from '../scheduled-cleanup/useJunkMonitor';
import { performanceService, type MemoryOptimizeResult } from '../performance/performance.service';
import type { DashboardMetrics, LiveMetrics } from './dashboard.types';
import { DashboardScanStatusCard } from '../scan/components/DashboardScanStatusCard';
import { useDashboardScan } from '../scan/useDashboardScan';
import { ProStatusBanner } from '../licensing/ProStatusBadge';
import { useIsPro } from '../sync/syncStore';
import { ScanView } from '../scan';
import { Modal } from './components/Modal';
import { AIStatusOverview } from './components/AIStatusOverview';
import { optimizationEventBus, OptimizationEventType } from '../health/OptimizationEventBus';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

function getSecurityTone(metrics: DashboardMetrics | null): 'success' | 'warning' | 'danger' {
  if (!metrics) return 'warning';
  const avsActive = !!metrics.avsAvActive;
  if ((avsActive || metrics.security.realTimeProtection) && (avsActive || metrics.security.defender.enabled)) return 'success';
  if (metrics.security.defender.enabled || metrics.security.firewall.enabled || avsActive) return 'warning';
  return 'danger';
}

function getSecurityLabel(metrics: DashboardMetrics | null): string {
  if (!metrics) return 'Checking...';
  const avsActive = !!metrics.avsAvActive;
  if ((avsActive || metrics.security.realTimeProtection) && (avsActive || metrics.security.defender.enabled)) return 'Protected';
  if (metrics.security.defender.enabled || metrics.security.firewall.enabled || avsActive) return 'At Risk';
  return 'Unprotected';
}

function getStorageValue(metrics: DashboardMetrics | null): string {
  if (!metrics?.storage?.length) return '—';
  const drive = metrics.storage[0];
  if (!drive) return '—';
  return `${Math.round(drive.usage)}%`;
}

function getPerformanceValue(live: LiveMetrics | null): string {
  if (!live) return '—';
  return `${Math.round(live.cpu.usage)}%`;
}

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

export default function DashboardPage() {
  const vm = useMemo(() => new DashboardViewModel(dashboardService), []);
  const state = useViewModel(vm);
  const { snapshot } = useDashboardScan();
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const isPro = useIsPro();
  const location = useLocation();
  // V1.0: When set, the modal shows previous scan results (Review Findings)
  // instead of auto-starting a new scan. null = start a new scan.
  const [reviewPlanId, setReviewPlanId] = useState<string | null>(null);
  const [viewCleanupResults, setViewCleanupResults] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const { status: junkStatus } = useJunkMonitor();
  const [boosting, setBoosting] = useState(false);
  const [boostResult, setBoostResult] = useState<MemoryOptimizeResult | null>(null);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  // Onboarding: auto-open scan modal when navigated from FirstScanDialog
  // with location state { action: 'auto-scan' }.
  useEffect(() => {
    const navState = location.state as { action?: string } | null;
    if (navState?.action === 'auto-scan') {
      setReviewPlanId(null);
      setViewCleanupResults(false);
      setScanModalOpen(true);
    }
  }, [location.state]);

  // V1.0: Refresh dashboard metrics after cleanup completes.
  // The ViewModel already listens via dashboardRefreshManager, but
  // that has a 500ms debounce. This direct subscription triggers
  // an immediate metrics reload so cards update right away when
  // the user clicks Done on the cleanup results.
  useEffect(() => {
    return optimizationEventBus.subscribe((event) => {
      if (event.type === OptimizationEventType.CleaningCompleted) {
        void vm.loadMetrics();
      }
    });
  }, [vm]);

  const handleBoostMemory = async () => {
    if (!isPro) {
      setUpgradeModalOpen(true);
      return;
    }
    setBoosting(true);
    setBoostResult(null);
    try {
      const result = await performanceService.optimizeMemory();
      setBoostResult(result);
      // Refresh dashboard metrics after boost
      void vm.loadMetrics();
    } catch (e) {
      setBoostResult({
        status: 'error',
        memoryFreed: 0,
        optimizationTimeMs: 0,
        processesOptimized: 0,
        errors: [e instanceof Error ? e.message : 'Memory optimization failed'],
        healthImprovement: 0,
        beforeMemory: null,
        afterMemory: null,
      });
    } finally {
      setBoosting(false);
    }
  };

  const isScanning = snapshot.scanStatus === 'preparing' || snapshot.scanStatus === 'scanning';
  const hasCompletedScan = snapshot.scanStatus === 'complete';
  const hasScanError = snapshot.scanStatus === 'error';
  // V1.0: Detect initialization errors and show a friendlier message.
  // The backend may return "Scan engine is still initializing" when the
  // orchestrator hasn't finished booting. This is transient, not a real
  // scan failure — show "AVS is preparing the scanner" instead of "Scan
  // could not be completed".
  const isInitializationError =
    hasScanError &&
    Boolean(snapshot.error) &&
    /initializing|still init|not ready|not available/i.test(snapshot.error ?? '');

  const healthScore = state.healthScore?.overallScore ?? 0;
  const securityTone = useMemo(() => getSecurityTone(state.metrics), [state.metrics]);
  const securityLabel = useMemo(() => getSecurityLabel(state.metrics), [state.metrics]);
  const performanceValue = useMemo(() => getPerformanceValue(state.liveMetrics), [state.liveMetrics]);
  const storageValue = useMemo(() => getStorageValue(state.metrics), [state.metrics]);

  // ── V1.0 Dashboard: No plan review redirect. The single modal handles
  // the full Scan → Clean → Verify → Results workflow. ──────────────

  if (state.bootstrap === 'loading') {
    return <LoadingState message="Loading dashboard..." data-testid="dashboard-loading" />;
  }

  if (state.bootstrap === 'error') {
    return (
      <EmptyState
        icon={<CheckCircleIcon className="h-8 w-8" />}
        title="Failed to load dashboard"
        description={state.bootstrapError || 'An error occurred while loading the dashboard.'}
        action={{ label: 'Retry', onClick: () => vm.bootstrap() }}
        data-testid="dashboard-error"
      />
    );
  }

  return (
    <div className="space-y-5" data-testid="page-dashboard">
      {/* Error banners for data load failures */}
      {state.metricsError && (
        <ModuleErrorBanner
          message="Failed to load system metrics. Please retry."
          onRetry={() => vm.loadMetrics()}
          onDismiss={() => vm.clearMetricsError()}
          testId="dashboard-metrics-error"
        />
      )}
      {state.liveMetricsError && (
        <ModuleErrorBanner
          message="Failed to load live metrics. Please retry."
          onRetry={() => vm.loadLiveMetrics()}
          onDismiss={() => vm.clearLiveMetricsError()}
          testId="dashboard-live-metrics-error"
        />
      )}

      {/* Pro Status Banner */}
      <ProStatusBanner />

      {/* ── PAGE HEADER ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-page-title text-text-primary">{getGreeting()}</h1>
          <p className="mt-1 text-caption text-text-secondary">
            {healthScore >= 80 ? 'Your PC is healthy.' : healthScore >= 60 ? 'Your PC needs minor attention.' : 'Your PC needs optimization.'}
          </p>
        </div>
      </div>

      {/* ── PRIMARY: SYSTEM HEALTH + SCAN ─────────────────────────── */}
      <Card variant="glass" className="p-6" data-testid="primary-system-health">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Health Score */}
          <div className="flex items-center gap-4">
            <div className={`relative inline-flex items-center justify-center h-20 w-20 rounded-full ${
              healthScore >= 80 ? 'bg-semantic-success/10' : healthScore >= 60 ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
            }`}>
              <HeartIcon className={`h-9 w-9 ${
                healthScore >= 80 ? 'text-semantic-success' : healthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted uppercase tracking-wide">System Health</div>
              <div className="text-3xl font-bold text-text-primary tabular-nums">{healthScore}<span className="text-base text-text-muted">/100</span></div>
              <div className={`text-small font-medium ${
                healthScore >= 80 ? 'text-semantic-success' : healthScore >= 60 ? 'text-semantic-warning' : 'text-semantic-danger'
              }`}>
                {healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : 'Needs Attention'}
              </div>
            </div>
          </div>

          {/* Scan Status & CTA */}
          <div className="lg:col-span-2 flex flex-col justify-center">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                {isScanning ? (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Scan Status</div>
                    <div className="text-section-title font-semibold text-text-primary">
                      {snapshot.scanStatus === 'preparing' ? 'Preparing scanner...' : 'Scanning your PC'}
                    </div>
                    <div className="mt-1 text-small text-text-secondary">
                      Analyzing system...
                    </div>
                  </>
                ) : hasCompletedScan ? (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Last Scan</div>
                    <div className="text-section-title font-semibold text-text-primary">
                      {snapshot.completedAt ? new Date(snapshot.completedAt).toLocaleString() : 'Recently completed'}
                    </div>
                    <div className="mt-1 text-small text-text-secondary">
                      {(() => {
                        // V1.0 Disk Cleanup style: After cleanup, show files cleaned,
                        // folders cleaned, space recovered, and health before → after.
                        const hasCleanup = snapshot.cleanupResult != null;
                        if (hasCleanup) {
                          const cleaned = snapshot.cleanupResult!.cleaned ?? 0;
                          const foldersCleaned = snapshot.cleanupResult!.foldersCleaned ?? 0;
                          const space = snapshot.cleanupResult!.spaceRecovered ?? 0;
                          const healthBefore = snapshot.cleanupResult!.healthBefore;
                          const healthAfter = snapshot.cleanupResult!.healthAfter;
                          if (cleaned > 0 || foldersCleaned > 0) {
                            const parts: string[] = [];
                            parts.push(`${cleaned.toLocaleString()} files cleaned`);
                            if (foldersCleaned > 0) {
                              parts.push(`${foldersCleaned.toLocaleString()} folders cleaned`);
                            }
                            if (space > 0) {
                              const mb = space / 1024 / 1024;
                              if (mb >= 1024) {
                                parts.push(`${(mb / 1024).toFixed(1)} GB recovered`);
                              } else {
                                parts.push(`${mb.toFixed(1)} MB recovered`);
                              }
                            }
                            const healthStr = (healthBefore != null && healthAfter != null)
                              ? ` · Health ${healthBefore} → ${healthAfter}`
                              : '';
                            return (
                              <span className="text-semantic-success font-medium">
                                {parts.join(' · ')}{healthStr}
                              </span>
                            );
                          }
                          return <span className="text-semantic-success">PC is clean</span>;
                        }
                        const issueCount = snapshot.issuesFound;
                        if (issueCount > 0) {
                          return (
                            <span className="text-semantic-warning font-medium">
                              {issueCount} issues found
                            </span>
                          );
                        }
                        return <span className="text-semantic-success">No issues found</span>;
                      })()}
                    </div>
                  </>
                ) : hasScanError ? (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Scan Status</div>
                    {isInitializationError ? (
                      <>
                        <div className="text-section-title font-semibold text-semantic-warning">
                          AVS is preparing the scanner
                        </div>
                        <div className="mt-1 text-small text-text-secondary">
                          The scan engine is warming up. Please try again in a moment.
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-section-title font-semibold text-semantic-danger">Scan could not be completed</div>
                        <div className="mt-1 text-small text-text-secondary">
                          {snapshot.error || 'An error occurred during the scan.'}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="text-caption text-text-muted uppercase tracking-wide">Scan Status</div>
                    <div className="text-section-title font-semibold text-text-primary">Ready to scan</div>
                    <div className="mt-1 text-small text-text-secondary">
                      {snapshot.hasActiveSession && snapshot.completedAt 
                        ? `Last scan: ${new Date(snapshot.completedAt).toLocaleDateString()}`
                        : 'Scan your PC to detect issues and optimize performance'}
                    </div>
                  </>
                )}
              </div>

              {/* Primary Scan CTA — V1.0 Dashboard: single Scan Now button.
                  V1.0: Removed "View Progress" — the 4 scan modules are
                  independent. The Dashboard scan is its own scan; it does
                  not redirect to or show progress of other modules' scans. */}
              <div className="shrink-0">
                <Button
                  onClick={() => {
                    setReviewPlanId(null);
                    setViewCleanupResults(false);
                    setScanModalOpen(true);
                  }}
                  disabled={isScanning}
                  size="lg"
                  leftIcon={isScanning ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <BoltIcon className="h-5 w-5" />}
                  data-testid="dashboard-scan-cta"
                >
                  {isScanning ? 'Scanning...' : hasScanError ? 'Try Again' : 'Optimize Now'}
                </Button>
                {!isPro && (
                  <p className="text-xs text-white/40 mt-1.5 text-right" data-testid="dashboard-free-limit-hint">
                    Free edition: up to 500 MB per run
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── SECONDARY: QUICK METRICS ───────────────────────────────
          V1.0: Removed "Issues" card — after scan and optimize there
          should be no issues shown. The 3 remaining metrics are
          Protection, CPU Usage, and Storage. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card variant="glass" className="p-4" data-testid="metric-protection">
          <div className="flex items-center gap-3">
            <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
              securityTone === 'success' ? 'bg-semantic-success/10' : securityTone === 'warning' ? 'bg-semantic-warning/10' : 'bg-semantic-danger/10'
            }`}>
              <ShieldExclamationIcon className={`h-5 w-5 ${
                securityTone === 'success' ? 'text-semantic-success' : securityTone === 'warning' ? 'text-semantic-warning' : 'text-semantic-danger'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Protection</div>
              <div className="text-small font-semibold text-text-primary truncate">{securityLabel}</div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-4" data-testid="metric-performance">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-surface-muted">
              <CpuChipIcon className="h-5 w-5 text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">CPU Usage</div>
              <div className="text-small font-semibold text-text-primary tabular-nums">{performanceValue}</div>
            </div>
          </div>
        </Card>

        <Card variant="glass" className="p-4" data-testid="metric-storage">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-surface-muted">
              <CircleStackIcon className="h-5 w-5 text-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">Storage</div>
              <div className="text-small font-semibold text-text-primary tabular-nums">{storageValue}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── AI SUBSYSTEMS OVERVIEW ──────────────────────────────────
          Consolidated AI feature status with quick navigation links.
          Shows which AI subsystems are active and provides one-click
          access to each feature's dedicated page. */}
      <AIStatusOverview />

      {/* ── SECONDARY ACTION: REMOVED — V1.0 Dashboard uses single Scan Now → Clean → Results modal ── */}

      {/* ── BOOST MEMORY (Feature #2) ─────────────────────────────
          One-click RAM optimizer. Calls performance.memory.optimize
          which trims working sets of inactive processes via
          EmptyWorkingSet, releases cached memory, and refreshes
          standby memory. Professional feature — Free users see
          upgrade modal. */}
      <Card variant="glass" className="p-4" data-testid="dashboard-boost-memory">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] p-2.5 bg-brand-primary/10">
              <BoltIcon className="h-5 w-5 text-brand-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-caption text-text-muted">RAM Optimizer</div>
              <div className="text-small font-semibold text-text-primary">
                {boosting
                  ? 'Optimizing memory...'
                  : boostResult && (boostResult.status === 'error' || boostResult.status === 'failed')
                    ? 'Optimization failed'
                    : boostResult && boostResult.status === 'cancelled'
                      ? 'Optimization cancelled'
                      : boostResult && boostResult.memoryFreed > 0
                        ? `Freed ${formatBytes(boostResult.memoryFreed)}`
                        : boostResult && boostResult.status === 'completed'
                          ? 'Memory optimized'
                          : 'Free up RAM instantly'}
              </div>
              {boostResult && boostResult.processesOptimized > 0 && !boosting && (
                <div className="text-caption text-text-muted mt-0.5">
                  {boostResult.processesOptimized} processes optimized
                </div>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant={isPro ? 'primary' : 'secondary'}
            leftIcon={boosting ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BoltIcon className="h-4 w-4" />}
            onClick={handleBoostMemory}
            disabled={boosting}
            data-testid="dashboard-boost-memory-btn"
          >
            {boosting ? 'Boosting...' : isPro ? 'Boost Memory' : 'Upgrade'}
          </Button>
        </div>
      </Card>

      {/* ── JUNK MONITOR INDICATOR ──────────────────────────────
          V1.0 Feature #1: Shows current junk accumulation.
          Only shows when junk > 0 so the dashboard stays clean. */}
      {junkStatus && junkStatus.total_bytes > 0 && (
        <Card variant="glass" className="p-4" data-testid="dashboard-junk-monitor">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`shrink-0 rounded-[var(--avs-radius-md)] p-2.5 ${
                junkStatus.threshold_exceeded
                  ? 'bg-semantic-warning/10'
                  : 'bg-surface-muted'
              }`}>
                <TrashIcon className={`h-5 w-5 ${
                  junkStatus.threshold_exceeded
                    ? 'text-semantic-warning'
                    : 'text-text-muted'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-text-muted">Junk Files Detected</div>
                <div className="text-small font-semibold text-text-primary">
                  {junkStatus.total_files.toLocaleString()} files · {junkStatus.total_gb >= 1
                    ? `${junkStatus.total_gb.toFixed(2)} GB`
                    : `${junkStatus.total_mb.toFixed(2)} MB`}
                </div>
              </div>
            </div>
            {junkStatus.threshold_exceeded && (
              <Button
                size="sm"
                variant="primary"
                leftIcon={<BoltIcon className="h-4 w-4" />}
                onClick={() => {
                  setReviewPlanId(null);
                  setViewCleanupResults(false);
                  setScanModalOpen(true);
                }}
                data-testid="dashboard-junk-clean-now"
              >
                Clean Now
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Latest unified scan/remediation status from scan_core */}
      <DashboardScanStatusCard
        onOpenScan={() => {
          // V1.0: If the previous scan has reviewable findings, show them.
          // If it has cleanup results (direct cleanup), show those.
          // Otherwise, start a new scan.
          if (snapshot.canReview && snapshot.planId) {
            setReviewPlanId(snapshot.planId);
            setViewCleanupResults(false);
          } else if (snapshot.cleanupResult && snapshot.cleanupResult.cleaned > 0) {
            setReviewPlanId(null);
            setViewCleanupResults(true);
          } else {
            setReviewPlanId(null);
            setViewCleanupResults(false);
          }
          setScanModalOpen(true);
        }}
      />

      {/* ── COLLAPSIBLE SECONDARY CONTENT ───────────────────────────
          V1.0: System Health and Recent Activity panels hidden to
          simplify the dashboard. Users have plenty of info already
          from the primary health card, quick metrics, and scan status. */}

      {/* Scan modal — V1.0 Dashboard: single modal handles Scan → Clean → Verify → Results */}
      <Modal
        open={scanModalOpen}
        onClose={() => setScanModalOpen(false)}
        title="System Scan"
        size="xl"
        testId="dashboard-scan-modal"
        hideCloseButton
      >
        <ScanView
          module="optimize"
          mode="quick"
          source="dashboard"
          onClose={() => {
            setScanModalOpen(false);
            setReviewPlanId(null);
            setViewCleanupResults(false);
          }}
          buttonLabel="Scan Now"
          autoStart={!reviewPlanId && !viewCleanupResults}
          reviewPlanId={reviewPlanId}
          viewCleanupResults={viewCleanupResults}
          onUpgrade={() => {
            setScanModalOpen(false);
            setUpgradeModalOpen(true);
          }}
        />
      </Modal>

      {/* ── Upgrade Modal ─────────────────────────────────────── */}
      <Modal
        open={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        title="Upgrade to Professional"
        size="md"
        testId="dashboard-upgrade-modal"
      >
        <div className="text-center space-y-4 py-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Unlock 1-Click Optimization
          </h3>
          <p className="text-small text-text-secondary">
            Professional edition cleans all junk files, browser caches, temp files,
            and more in a single click. Free users can clean manually from Junk Cleaner.
          </p>
          <div className="flex justify-center gap-3">
            <Button onClick={() => setUpgradeModalOpen(false)} variant="secondary">
              Maybe Later
            </Button>
            <Button
              onClick={() => {
                setUpgradeModalOpen(false);
                window.open('https://avsshield.com/upgrade', '_blank');
              }}
              variant="primary"
              data-testid="dashboard-upgrade-cta"
            >
              Upgrade Now
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}
