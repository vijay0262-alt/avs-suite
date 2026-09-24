/**
 * DuplicateFinderPage - Main Duplicate Finder page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleEmptyState, ModuleSuccessBanner, ModuleErrorBanner } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { UnifiedScanProgressCard, DUPLICATE_SCAN_CONFIG } from '../unified-scan';
import { DuplicateFinderViewModel } from './DuplicateFinderViewModel';
import { duplicateFinderService } from './duplicate-finder.service';
import type { DuplicateScope } from './duplicate-finder.types';
import {
  SparklesIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';

const FOLDER_SCOPES: { id: DuplicateScope; label: string }[] = [
  { id: 'downloads', label: 'Downloads' },
  { id: 'documents', label: 'Documents' },
  { id: 'pictures', label: 'Pictures' },
  { id: 'videos', label: 'Videos' },
  { id: 'music', label: 'Music' },
  { id: 'desktop', label: 'Desktop' },
];

export default function DuplicateFinderPage() {
  const vm = useMemo(() => new DuplicateFinderViewModel(duplicateFinderService), []);
  const state = useViewModel(vm);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleScan = () => {
    void vm.scan();
  };

  const handleDelete = () => {
    void vm.delete();
  };

  const handleToggleFile = (filePath: string) => {
    vm.toggleFileSelection(filePath);
  };

  const handleSelectGroup = (groupIndex: number) => {
    vm.selectGroupFiles(groupIndex);
  };

  // Current picker value derived from VM state.
  const locationValue =
    state.scope === 'entire' && state.selectedDrive
      ? `drive:${state.selectedDrive}`
      : state.scope === 'custom'
        ? 'custom'
        : state.scope === 'entire'
          ? ''
          : `folder:${state.scope}`;

  const handleLocationChange = (value: string) => {
    if (value.startsWith('drive:')) {
      vm.selectDrive(value.slice(6));
    } else if (value.startsWith('folder:')) {
      vm.setScope(value.slice(7) as DuplicateScope);
    } else if (value === 'custom') {
      vm.setScope('custom');
    }
  };

  const canScan =
    !state.scanning &&
    ((state.scope === 'entire' && Boolean(state.selectedDrive)) ||
      (state.scope === 'custom' && Boolean(state.customDirectories.trim())) ||
      FOLDER_SCOPES.some((f) => f.id === state.scope));

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

          {/* Location picker + scan */}
          <Card className="mb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                aria-label="Scan location"
                value={locationValue}
                onChange={(e) => handleLocationChange(e.target.value)}
                disabled={state.scanning}
                className="flex-1 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] px-3 py-2 text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
                data-testid="duplicate-location-select"
              >
                <option value="">Choose a location to scan…</option>
                <optgroup label="Drives">
                  {state.drives.map((d) => (
                    <option key={d.device} value={`drive:${d.mountpoint}`}>
                      {d.device} — {vm.formatBytes(d.free)} free of {vm.formatBytes(d.total)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Folders">
                  {FOLDER_SCOPES.map((f) => (
                    <option key={f.id} value={`folder:${f.id}`}>{f.label}</option>
                  ))}
                </optgroup>
                <option value="custom">Custom folder…</option>
              </select>
              <Button
                onClick={handleScan}
                disabled={!canScan}
                leftIcon={<DocumentDuplicateIcon className="h-4 w-4" />}
                data-testid="duplicate-scan-btn"
              >
                {state.scanning ? 'Scanning…' : 'Scan'}
              </Button>
            </div>
            {state.scope === 'custom' && (
              <input
                type="text"
                aria-label="Custom folders"
                placeholder="D:\Photos, D:\Backup"
                value={state.customDirectories}
                onChange={(e) => vm.setCustomDirectories(e.target.value)}
                disabled={state.scanning}
                className="mt-3 w-full px-3 py-2 bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] rounded-[var(--avs-radius-md)] text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
                data-testid="duplicate-custom-dirs"
              />
            )}
          </Card>

          {state.scanning && (
            <div className="mb-4">
              <UnifiedScanProgressCard
                config={DUPLICATE_SCAN_CONFIG}
                isRunning={state.scanning}
                progress={
                  state.scanProgress && state.scanProgress.hashTotal > 0
                    ? Math.round((state.scanProgress.hashDone / state.scanProgress.hashTotal) * 100)
                    : undefined
                }
                currentFile={state.scanProgress?.currentPath ?? null}
                startTime={Date.now()}
                counters={{
                  filesScanned: state.scanProgress?.filesScanned ?? 0,
                  filesHashed: state.scanProgress?.hashDone ?? 0,
                }}
              />
            </div>
          )}

          {state.scanResult && (
            <>
              {/* Results summary */}
              <p className="mb-3 text-small text-text-secondary" data-testid="duplicate-results-summary">
                <strong className="text-text-primary">{state.scanResult.totalDuplicates.toLocaleString()}</strong> duplicates
                in <strong className="text-text-primary">{state.scanResult.groups.length}</strong> groups ·{' '}
                <strong className="text-text-primary">{vm.formatBytes(state.scanResult.recoverableSpace)}</strong> recoverable ·{' '}
                {state.scanResult.totalFiles.toLocaleString()} files scanned in{' '}
                {(state.scanResult.scanDurationMs / 1000).toFixed(1)}s
              </p>

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
            </>
          )}
        </>
      )}
    </div>
  );
}
