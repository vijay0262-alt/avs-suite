/**
 * DuplicateFinderPage - Main Duplicate Finder page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button, Badge, GaugeCard, StatTile } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleEmptyState, ModuleSuccessBanner, ModuleErrorBanner } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { UnifiedScanProgressCard, DUPLICATE_SCAN_CONFIG } from '../unified-scan';
import { UnifiedCleanerResults } from '../unified-results';
import { DuplicateFinderViewModel } from './DuplicateFinderViewModel';
import { duplicateFinderService } from './duplicate-finder.service';
import type { DuplicateScope } from './duplicate-finder.types';
import { useIsPro } from '../sync/syncStore';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { useEditionLimits } from '../licensing/editionLimits';
import { ProStatusPill } from '../licensing/ProStatusBadge';
import {
  SparklesIcon,
  Squares2X2Icon,
  LockClosedIcon,
  ClockIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  CircleStackIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';

const SCOPE_OPTIONS: { id: DuplicateScope; label: string }[] = [
  { id: 'entire', label: 'Entire drive' },
  { id: 'pictures', label: 'Pictures' },
  { id: 'videos', label: 'Videos' },
  { id: 'music', label: 'Music' },
  { id: 'documents', label: 'Documents' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'custom', label: 'Specific folder' },
];

export default function DuplicateFinderPage() {
  const vm = useMemo(() => new DuplicateFinderViewModel(duplicateFinderService), []);
  const state = useViewModel(vm);
  const { guard, dialogElement } = useFeatureGuard();
  const isPro = useIsPro();
  const limits = useEditionLimits();
  const deleteLimit = limits.getLimit('duplicateFinderFilesPerRun');
  const remainingDeletes = vm.remainingDeletes();
  const limitReached = vm.isDeleteLimitReached();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleScan = () => {
    void vm.scan();
  };

  const handleDelete = () => {
    if (limitReached) {
      guard('duplicate.delete', 'Duplicate Finder', () => {}, {
        limitDescription: `Free edition allows deleting up to ${deleteLimit} duplicate files per session.`,
        proBenefit: 'Unlimited deletion + smart duplicate detection + automatic grouping.',
      });
      return;
    }
    guard('duplicate.delete', 'Duplicate Finder', () => vm.delete());
  };

  const handleToggleFile = (filePath: string) => {
    vm.toggleFileSelection(filePath);
  };

  const handleSelectGroup = (groupIndex: number) => {
    vm.selectGroupFiles(groupIndex);
  };

  return (
    <div data-testid="page-duplicate-finder">
      <PageHeader
        title="Duplicate Finder"
        description="Locate duplicate files by content hash to reclaim disk space"
        actions={<HelpButton text="The duplicate finder compares file contents using cryptographic hashes, not just file names. The first file in each group is marked as 'Original' and protected from deletion." />}
      />

      {state.bootstrap === 'loading' && (
        <ModuleLoadingState message="Loading…" testId="duplicate-finder-loading" />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={() => vm.bootstrap()}
          testId="duplicate-finder-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {state.scanError && (
            <ModuleErrorBanner
              message="Scan encountered an issue. Please try again."
              onRetry={() => vm.scan()}
              onDismiss={() => vm.clearScanError()}
              testId="duplicate-finder-scan-error"
            />
          )}
          {state.deleteError && (
            <ModuleErrorBanner
              message="Deletion encountered an issue. Please try again."
              onDismiss={() => vm.clearDeleteError()}
              testId="duplicate-finder-delete-error"
            />
          )}

          {/* Scan Scope Selection */}
          <Card title="Scan Scope" className="mb-4">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {SCOPE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => vm.setScope(s.id)}
                    className={`px-3 py-1.5 text-small rounded-[var(--avs-radius-md)] border transition-all focus:outline-none focus-visible:shadow-focus ${
                      state.scope === s.id
                        ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)] text-[var(--avs-brand-primary)] font-medium'
                        : 'border-[var(--avs-border)] bg-[var(--avs-surface)] text-text-secondary hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_40%,var(--avs-border))]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {state.scope === 'entire' && (
                <div>
                  {state.drives.length === 0 ? (
                    <p className="text-small text-text-muted">No drives found.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {state.drives.map((drive) => (
                        <div
                          key={drive.device}
                          className={`p-3 border-2 rounded-[var(--avs-radius-lg)] cursor-pointer transition-all ${
                            state.selectedDrive === drive.mountpoint
                              ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)]'
                              : 'border-[var(--avs-border)] hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_40%,var(--avs-border))]'
                          }`}
                          onClick={() => vm.selectDrive(drive.mountpoint)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-small font-semibold text-text-primary">{drive.device}</span>
                            <Badge tone="neutral">{drive.fstype}</Badge>
                          </div>
                          <div className="flex justify-between text-caption text-text-secondary">
                            <span>{vm.formatBytes(drive.free)} free</span>
                            <span>of {vm.formatBytes(drive.total)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {state.scope === 'custom' && (
                <div>
                  <input
                    type="text"
                    placeholder="C:\Users\YourName\Documents, C:\Users\YourName\Downloads"
                    value={state.customDirectories}
                    onChange={(e) => vm.setCustomDirectories(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--avs-surface)] border border-[var(--avs-border)] rounded-[var(--avs-radius-md)] text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
                  />
                </div>
              )}

              {state.estimate && (
                <div className="flex flex-wrap gap-4 text-caption text-text-secondary">
                  <span>
                    <strong className="text-text-primary">{state.estimate.estimatedFiles.toLocaleString()}</strong> files
                  </span>
                  <span>
                    <strong className="text-text-primary">{vm.formatBytes(state.estimate.estimatedBytes)}</strong> estimated
                  </span>
                </div>
              )}

              {state.estimateLoading && (
                <div className="animate-pulse h-4 bg-[var(--avs-surface-muted)] rounded w-1/3" />
              )}

              <Button
                onClick={handleScan}
                disabled={
                  state.scanning ||
                  ((state.scope === 'entire' && !state.selectedDrive) ||
                    (state.scope === 'custom' && !state.customDirectories))
                }
                className="w-full"
                leftIcon={<DocumentDuplicateIcon className="h-4 w-4" />}
              >
                {state.scanning ? 'Scanning…' : 'Scan for Duplicates'}
              </Button>
            </div>
          </Card>

          {state.scanning && (
            <div className="mb-4">
              <UnifiedScanProgressCard
                config={DUPLICATE_SCAN_CONFIG}
                isRunning={state.scanning}
                startTime={Date.now()}
              />
            </div>
          )}

          {state.scanResult && (
            <>
              <div className="mb-4">
                <UnifiedCleanerResults
                  data={{
                    moduleId: 'duplicate',
                    moduleName: 'Duplicate Finder',
                    moduleIcon: 'DocumentDuplicateIcon',
                    timestamp: Date.now(),
                    durationMs: state.scanResult.scanDurationMs,
                    itemsAnalyzed: state.scanResult.totalFiles,
                    issuesFound: state.scanResult.totalDuplicates,
                    recoverableSpace: state.scanResult.recoverableSpace,
                    issues: state.scanResult.groups.flatMap((g, gi) =>
                      g.files.map((f, fi) => ({
                        id: `dup-${gi}-${fi}`,
                        description: `Duplicate of ${f.name}`,
                        category: 'duplicate',
                        severity: 'low' as const,
                        location: f.path,
                      })),
                    ),
                  }}
                  isPro={isPro}
                  onClose={() => {}}
                  onRescan={() => vm.scan()}
                />
              </div>

              {/* Hero status section — System Mechanic style */}
              <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="duplicate-hero-section">
                {/* Gauge */}
                <GaugeCard
                  title={state.scanResult.totalDuplicates > 0 ? 'Duplicates Found' : 'No Duplicates'}
                  value={Math.min(100, state.scanResult.totalDuplicates)}
                  unit=""
                  tone={state.scanResult.totalDuplicates > 50 ? 'danger' : state.scanResult.totalDuplicates > 0 ? 'warning' : 'success'}
                  icon={<DocumentDuplicateIcon className="h-6 w-6" />}
                  description={state.scanResult.totalDuplicates > 0 ? `${vm.formatBytes(state.scanResult.recoverableSpace)} recoverable` : 'No duplicate files detected'}
                  data-testid="duplicate-hero-gauge"
                />

                {/* Key stats */}
                <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <StatTile
                    label="Files Scanned"
                    value={state.scanResult.totalFiles.toLocaleString()}
                    hint="Total analyzed"
                    icon={<CircleStackIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                  <StatTile
                    label="Duplicates"
                    value={state.scanResult.totalDuplicates.toString()}
                    hint={`${state.scanResult.groups.length} groups`}
                    icon={<DocumentDuplicateIcon className="h-5 w-5" />}
                    variant="glass"
                    accentColor={state.scanResult.totalDuplicates > 0 ? 'var(--avs-warning)' : 'var(--avs-success)'}
                  />
                  <StatTile
                    label="Recoverable"
                    value={vm.formatBytes(state.scanResult.recoverableSpace)}
                    hint="Space to reclaim"
                    icon={<ArrowDownTrayIcon className="h-5 w-5" />}
                    variant="glass"
                    accentColor="var(--avs-success)"
                  />
                  <StatTile
                    label="Selected"
                    value={vm.getSelectedCount().toString()}
                    hint={vm.getSelectedCount() > 0 ? `${vm.formatBytes(vm.getSelectedSize())} to free` : 'Select files below'}
                    icon={<CheckCircleIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                  <StatTile
                    label="Duration"
                    value={`${(state.scanResult.scanDurationMs / 1000).toFixed(1)}s`}
                    hint="Scan time"
                    icon={<ClockIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                  <StatTile
                    label="Edition"
                    value={isPro ? 'Pro' : 'Free'}
                    hint={!isPro ? `${deleteLimit} files per session` : 'Unlimited'}
                    icon={<SparklesIcon className="h-5 w-5" />}
                    variant="glass"
                  />
                </div>
              </div>

              {/* Free edition limit banner — compact */}
              {!isPro && state.scanResult.totalDuplicates > 0 && (
                <div
                  className={`mb-4 flex items-center gap-2 rounded-[var(--avs-radius-md)] border px-4 py-2 ${
                    limitReached
                      ? 'border-semantic-warning/30 bg-semantic-warning/10'
                      : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)]'
                  }`}
                  data-testid="duplicate-free-limit-banner"
                >
                  <ClockIcon className="h-4 w-4 text-text-secondary shrink-0" />
                  <span className="text-caption text-text-secondary flex-1">
                    Free edition: <strong className="text-text-primary">{vm.getSelectedCount()} of {deleteLimit}</strong> files selected
                    {remainingDeletes !== null && remainingDeletes > 0 && ` (${remainingDeletes} remaining)`}
                  </span>
                  {limitReached && (
                    <button
                      onClick={() => guard('duplicate.delete', 'Duplicate Finder', () => {}, {
                        limitDescription: `Free edition allows deleting up to ${deleteLimit} duplicate files per session.`,
                        proBenefit: 'Unlimited deletion + smart duplicate detection + automatic grouping.',
                      })}
                      className="text-caption font-medium text-[var(--avs-brand-primary)] hover:underline"
                      data-testid="duplicate-upgrade-link"
                    >
                      Upgrade →
                    </button>
                  )}
                </div>
              )}

              {/* Duplicate Groups */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-section-title text-text-primary">Duplicate Groups</h2>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => vm.selectAllFiles()}>
                    Select all
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => vm.deselectAllFiles()}>
                    Clear
                  </Button>
                </div>
              </div>

              {state.scanResult.groups.length === 0 ? (
                <ModuleEmptyState
                  title="No duplicates found"
                  message="No duplicate files were detected in the selected scope."
                  testId="duplicate-finder-empty"
                />
              ) : (
                <div className="space-y-3 mb-4">
                  {state.scanResult.groups.map((group, groupIndex) => (
                    <Card key={group.hash} variant="glass">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <DocumentDuplicateIcon className="h-4 w-4 text-text-secondary" />
                          <span className="text-small font-semibold text-text-primary">
                            {group.fileCount} duplicates
                          </span>
                          <Badge tone="info">{vm.formatBytes(group.totalSize)}</Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectGroup(groupIndex)}
                        >
                          Select duplicates
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        {group.files.map((file, fileIndex) => {
                          const selected = state.selectedFiles.has(file.path);
                          const isOriginal = fileIndex === 0;
                          return (
                            <div
                              key={file.path}
                              onClick={() => !isOriginal && handleToggleFile(file.path)}
                              className={`flex items-center gap-3 p-2.5 rounded-[var(--avs-radius-md)] border transition-all ${
                                isOriginal
                                  ? 'border-semantic-success/30 bg-semantic-success/5 cursor-default'
                                  : selected
                                    ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)] cursor-pointer'
                                    : 'border-[var(--avs-border)] bg-[var(--avs-surface)] cursor-pointer hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_30%,var(--avs-border))]'
                              }`}
                            >
                              <div
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                  isOriginal
                                    ? 'border-semantic-success bg-semantic-success'
                                    : selected
                                      ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]'
                                      : 'border-[var(--avs-border)] bg-transparent'
                                }`}
                              >
                                {(selected || isOriginal) && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-small text-text-primary truncate">{file.name}</p>
                                <p className="text-caption text-text-muted truncate">{file.path}</p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-caption text-text-primary">{vm.formatBytes(file.size)}</p>
                                {isOriginal && (
                                  <span className="text-caption text-semantic-success font-medium">Original</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Selection summary — sticky bottom */}
              {vm.getSelectedCount() > 0 && (
                <Card className="mb-4 border-[var(--avs-brand-primary)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-small font-semibold text-text-primary">
                        {vm.getSelectedCount()} files selected
                      </p>
                      <p className="text-caption text-text-secondary">
                        {vm.formatBytes(vm.getSelectedSize())} will be freed
                      </p>
                    </div>
                    <Button
                      onClick={handleDelete}
                      disabled={state.deleting}
                      variant="danger"
                      leftIcon={<SparklesIcon className="h-4 w-4" />}
                    >
                      {state.deleting ? 'Deleting…' : 'Delete Selected'}
                    </Button>
                  </div>
                </Card>
              )}

              {state.deleteResult && (
                <ModuleSuccessBanner
                  title={`Deleted ${state.deleteResult.deletedCount} files, freed ${vm.formatBytes(state.deleteResult.spaceFreed)}`}
                  message={state.deleteResult.errors.length > 0 ? `${state.deleteResult.errors.length} error(s) occurred.` : undefined}
                  testId="duplicate-finder-delete-result"
                />
              )}

              {/* Professional Features — compact */}
              <Card title="Professional Features" variant="glass" className="mt-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                        <SparklesIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                      </div>
                      <div>
                        <span className="text-small font-medium text-text-primary">Smart Detection</span>
                        <p className="text-caption text-text-muted">AI-powered near-duplicate detection</p>
                      </div>
                    </div>
                    {isPro ? (
                      <Button variant="secondary" size="sm" leftIcon={<SparklesIcon className="h-4 w-4" />}>
                        Run
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<LockClosedIcon className="h-4 w-4" />}
                        onClick={() => guard('duplicate.delete', 'Duplicate Finder', () => {}, {
                          limitDescription: 'Smart duplicate detection is a Professional feature.',
                          proBenefit: 'AI-powered near-duplicate detection with content similarity analysis.',
                        })}
                        data-testid="duplicate-smart-detection-upgrade"
                      >
                        Upgrade
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                        <Squares2X2Icon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                      </div>
                      <div>
                        <span className="text-small font-medium text-text-primary">Auto Grouping</span>
                        <p className="text-caption text-text-muted">Smart keep/delete recommendations</p>
                      </div>
                    </div>
                    {isPro ? (
                      <Button variant="secondary" size="sm" leftIcon={<Squares2X2Icon className="h-4 w-4" />}>
                        Group
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<LockClosedIcon className="h-4 w-4" />}
                        onClick={() => guard('duplicate.delete', 'Duplicate Finder', () => {}, {
                          limitDescription: 'Automatic grouping is a Professional feature.',
                          proBenefit: 'Smart grouping with keep/delete recommendations.',
                        })}
                        data-testid="duplicate-auto-grouping-upgrade"
                      >
                        Upgrade
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                        <ClockIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                      </div>
                      <div>
                        <span className="text-small font-medium text-text-primary">Unlimited Deletion</span>
                        <p className="text-caption text-text-muted">
                          {isPro ? 'No session limits' : `Free: up to ${deleteLimit} files per session`}
                        </p>
                      </div>
                    </div>
                    {!isPro && <ProStatusPill />}
                  </div>
                </div>
              </Card>
            </>
          )}
        </>
      )}
      {dialogElement}
    </div>
  );
}
