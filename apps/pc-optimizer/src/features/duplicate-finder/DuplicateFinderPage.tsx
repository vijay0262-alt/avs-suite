/**
 * DuplicateFinderPage - Main Duplicate Finder page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
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
import { ProStatusPill, ProFeatureIndicator } from '../licensing/ProStatusBadge';
import {
  SparklesIcon,
  Squares2X2Icon,
  LockClosedIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

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

  const handleSelectAll = () => {
    vm.selectAllFiles();
  };

  const handleDeselectAll = () => {
    vm.deselectAllFiles();
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
        actions={<HelpButton text="The duplicate finder compares file contents using cryptographic hashes, not just file names. This ensures true duplicates are found. The first file in each group is marked as 'Original' and protected from deletion." />}
      />

      {state.bootstrap === 'loading' && (
        <ModuleLoadingState
          message="Loading…"
          testId="duplicate-finder-loading"
        />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message={state.bootstrapError ?? 'Unknown error'}
          onRetry={() => vm.bootstrap()}
          testId="duplicate-finder-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {state.scanError && (
            <ModuleErrorBanner
              message={state.scanError}
              onRetry={() => vm.scan()}
              onDismiss={() => vm.clearScanError()}
              testId="duplicate-finder-scan-error"
            />
          )}
          {state.deleteError && (
            <ModuleErrorBanner
              message={state.deleteError}
              onDismiss={() => vm.clearDeleteError()}
              testId="duplicate-finder-delete-error"
            />
          )}
          <Card title="Select Scan Scope" className="mb-4">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'entire', label: 'Entire drive' },
                  { id: 'pictures', label: 'Pictures' },
                  { id: 'videos', label: 'Videos' },
                  { id: 'music', label: 'Music' },
                  { id: 'documents', label: 'Documents' },
                  { id: 'downloads', label: 'Downloads' },
                  { id: 'desktop', label: 'Desktop' },
                  { id: 'custom', label: 'Specific folder' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => vm.setScope(s.id as DuplicateScope)}
                    className={`px-3 py-1.5 text-small rounded-[var(--avs-radius-md)] transition-colors focus:outline-none focus-visible:shadow-focus ${
                      state.scope === s.id
                        ? 'bg-brand-primary text-white'
                        : 'bg-[var(--avs-surface-muted)] text-text-secondary hover:bg-[var(--avs-surface-muted)]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {state.scope === 'entire' && (
                <div>
                  {state.drives.length === 0 ? (
                    <p className="text-small text-text-secondary">No drives found</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {state.drives.map((drive) => (
                        <div
                          key={drive.device}
                          className={`p-4 border rounded cursor-pointer transition-colors ${
                            state.selectedDrive === drive.mountpoint
                              ? 'border-brand-primary bg-[var(--avs-surface-muted)]'
                              : 'border-[var(--avs-border)] hover:border-brand-primary'
                          }`}
                          onClick={() => vm.selectDrive(drive.mountpoint)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-small font-semibold text-text-primary">{drive.device}</span>
                            <span className="text-caption text-text-muted">{drive.fstype}</span>
                          </div>
                          <div className="space-y-1 text-small">
                            <div className="flex justify-between">
                              <span className="text-text-secondary">Total:</span>
                              <span className="text-text-primary">{vm.formatBytes(drive.total)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-secondary">Free:</span>
                              <span className="text-text-primary">{vm.formatBytes(drive.free)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {state.scope === 'custom' && (
                <div>
                  <label className="block text-small text-text-secondary mb-2">
                    Enter custom directories (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="C:\\Users\\YourName\\Documents, C:\\Users\\YourName\\Downloads"
                    value={state.customDirectories}
                    onChange={(e) => vm.setCustomDirectories(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] rounded text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
                  />
                </div>
              )}

              {state.estimate && (
                <div className="flex flex-wrap gap-4 text-small">
                  <div>
                    <span className="text-text-secondary">Estimated files:</span>{' '}
                    <span className="font-semibold text-text-primary">{state.estimate.estimatedFiles.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Estimated size:</span>{' '}
                    <span className="font-semibold text-text-primary">{vm.formatBytes(state.estimate.estimatedBytes)}</span>
                  </div>
                  {state.estimate.directories.length > 0 && (
                    <div className="w-full text-caption text-text-muted truncate">
                      {state.estimate.directories.join(', ')}
                    </div>
                  )}
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
                className="w-full mt-2"
              >
                {state.scanning ? 'Scanning...' : 'Scan for Duplicates'}
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <Card title="Total Files">
                  <p className="text-statistic text-text-primary">{state.scanResult.totalFiles}</p>
                  <p className="text-caption text-text-secondary">Scanned</p>
                </Card>
                <Card title="Duplicates">
                  <p className="text-statistic text-semantic-danger">{state.scanResult.totalDuplicates}</p>
                  <p className="text-caption text-text-secondary">Found</p>
                </Card>
                <Card title="Recoverable Space">
                  <p className="text-statistic text-semantic-success">
                    {vm.formatBytes(state.scanResult.recoverableSpace)}
                  </p>
                  <p className="text-caption text-text-secondary">Can be freed</p>
                </Card>
                <Card title="Scan Duration">
                  <p className="text-statistic text-text-primary">
                    {(state.scanResult.scanDurationMs / 1000).toFixed(2)}s
                  </p>
                  <p className="text-caption text-text-secondary">Time taken</p>
                </Card>
              </div>

              {/* Free edition limit banner */}
              {!isPro && state.scanResult.totalDuplicates > 0 && (
                <div
                  className={`mb-4 rounded-[var(--avs-radius-md)] border px-4 py-3 ${
                    limitReached
                      ? 'border-semantic-warning/30 bg-semantic-warning/10'
                      : 'border-[var(--avs-border)] bg-[var(--avs-surface-muted)]'
                  }`}
                  data-testid="duplicate-free-limit-banner"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClockIcon className="h-4 w-4 text-text-secondary shrink-0" />
                      <span className="text-caption text-text-secondary">
                        Free edition: <strong className="text-text-primary">{vm.getSelectedCount()} of {deleteLimit}</strong> files selected for deletion
                        {remainingDeletes !== null && remainingDeletes > 0 && ` (${remainingDeletes} remaining)`}
                      </span>
                    </div>
                    {limitReached && (
                      <button
                        onClick={() => guard('duplicate.delete', 'Duplicate Finder', () => {}, {
                          limitDescription: `Free edition allows deleting up to ${deleteLimit} duplicate files per session.`,
                          proBenefit: 'Unlimited deletion + smart duplicate detection + automatic grouping.',
                        })}
                        className="text-caption font-medium text-brand-primary hover:underline"
                        data-testid="duplicate-upgrade-link"
                      >
                        Upgrade to Pro →
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-section-title text-text-primary">Duplicate Groups</h2>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>

              {state.scanResult.groups.length === 0 ? (
                <ModuleEmptyState
                  title="No duplicates found"
                  message="The scan completed successfully. No duplicate files were detected in the selected scope."
                  testId="duplicate-finder-empty"
                />
              ) : (
                <div className="space-y-4 mb-4">
                  {state.scanResult.groups.map((group, groupIndex) => (
                    <Card key={group.hash} title={`${group.fileCount} duplicates - ${vm.formatBytes(group.totalSize)}`}>
                      <div className="space-y-2">
                        {group.files.map((file, fileIndex) => (
                          <div
                            key={file.path}
                            className={`flex items-center justify-between p-2 rounded border ${
                              state.selectedFiles.has(file.path)
                                ? 'border-brand-primary bg-[var(--avs-surface-muted)]'
                                : 'border-[var(--avs-border)]'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-small text-text-primary truncate">{file.name}</p>
                              <p className="text-caption text-text-muted truncate">{file.path}</p>
                              <p className="text-caption text-text-muted">
                                {vm.formatBytes(file.size)} • {new Date(file.modified).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {fileIndex === 0 && (
                                <span className="text-caption text-semantic-success font-semibold">Original</span>
                              )}
                              <input
                                type="checkbox"
                                checked={state.selectedFiles.has(file.path)}
                                disabled={fileIndex === 0}
                                onChange={() => handleToggleFile(file.path)}
                                className="w-4 h-4"
                              />
                            </div>
                          </div>
                        ))}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleSelectGroup(groupIndex)}
                          className="mt-2"
                        >
                          Select Duplicates in Group
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {vm.getSelectedCount() > 0 && (
                <Card title="Selected for Deletion" className="mb-4">
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
                      variant="primary"
                    >
                      {state.deleting ? 'Deleting...' : 'Delete Selected'}
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

              {/* Professional Features */}
              <div className="mt-8">
                <Card title="Professional Features" variant="glass">
                  <div className="space-y-4">
                    {/* Smart Duplicate Detection */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                          <SparklesIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-small font-semibold text-text-primary">Smart Duplicate Detection</span>
                            {!isPro && <ProStatusPill />}
                            {isPro && <ProFeatureIndicator icon={SparklesIcon} label="AI-Powered" />}
                          </div>
                          <p className="mt-0.5 text-caption text-text-secondary">
                            AI-powered analysis identifies near-duplicates by content similarity, not just exact hash matches. Detects similar images, documents with minor changes, and redundant backups.
                          </p>
                        </div>
                      </div>
                      {isPro ? (
                        <Button variant="secondary" size="sm" leftIcon={<SparklesIcon className="h-4 w-4" />}>
                          Run Smart Scan
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          leftIcon={<LockClosedIcon className="h-4 w-4" />}
                          onClick={() => guard('duplicate.delete', 'Duplicate Finder', () => {}, {
                            limitDescription: 'Smart duplicate detection is a Professional feature.',
                            proBenefit: 'AI-powered near-duplicate detection with content similarity analysis.',
                          })}
                          data-testid="duplicate-smart-detection-upgrade"
                        >
                          Upgrade to Unlock
                        </Button>
                      )}
                    </div>

                    {/* Automatic Grouping */}
                    <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                      <div className="flex items-start gap-3">
                        <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                          <Squares2X2Icon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-small font-semibold text-text-primary">Automatic Grouping</span>
                            {!isPro && <ProStatusPill />}
                            {isPro && <ProFeatureIndicator icon={Squares2X2Icon} label="Auto" />}
                          </div>
                          <p className="mt-0.5 text-caption text-text-secondary">
                            Automatically groups duplicates by file type, size range, and date. Recommends which files to keep and which to delete based on location, recency, and file integrity.
                          </p>
                        </div>
                      </div>
                      {isPro ? (
                        <Button variant="secondary" size="sm" leftIcon={<Squares2X2Icon className="h-4 w-4" />}>
                          Auto-Group
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          leftIcon={<LockClosedIcon className="h-4 w-4" />}
                          onClick={() => guard('duplicate.delete', 'Duplicate Finder', () => {}, {
                            limitDescription: 'Automatic grouping is a Professional feature.',
                            proBenefit: 'Smart grouping with keep/delete recommendations.',
                          })}
                          data-testid="duplicate-auto-grouping-upgrade"
                        >
                          Upgrade to Unlock
                        </Button>
                      )}
                    </div>

                    {/* Unlimited Deletion */}
                    <div className="flex items-start justify-between border-t border-[var(--avs-border)] pt-4">
                      <div className="flex items-start gap-3">
                        <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-brand-primary/10' : 'bg-[var(--avs-surface-muted)]'}`}>
                          <ClockIcon className={`h-5 w-5 ${isPro ? 'text-brand-primary' : 'text-text-muted'}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-small font-semibold text-text-primary">Unlimited Deletion</span>
                            {isPro && <ProFeatureIndicator icon={ClockIcon} label="Unlimited" />}
                          </div>
                          <p className="mt-0.5 text-caption text-text-secondary">
                            {isPro
                              ? 'Delete unlimited duplicate files with no session limits.'
                              : `Free edition: delete up to ${deleteLimit} files per session. Upgrade for unlimited deletion.`}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}
        </>
      )}
      {dialogElement}
    </div>
  );
}
