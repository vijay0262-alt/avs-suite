/**
 * DuplicateFinderPage - Main Duplicate Finder page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleEmptyState, ModuleSuccessBanner, ModuleErrorBanner } from '../../components/ModuleStates';
import { HelpButton } from '../../components/HelpButton';
import { DuplicateFinderViewModel } from './DuplicateFinderViewModel';
import { duplicateFinderService } from './duplicate-finder.service';
import type { DuplicateScope } from './duplicate-finder.types';
import { useFeatureGuard } from '../licensing/useFeatureGuard';

export default function DuplicateFinderPage() {
  const vm = useMemo(() => new DuplicateFinderViewModel(duplicateFinderService), []);
  const state = useViewModel(vm);
  const { guard, dialogElement } = useFeatureGuard();

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleScan = () => {
    void vm.scan();
  };

  const handleDelete = () => {
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
                    className={`px-3 py-1.5 text-sm rounded-[var(--avs-radius-md)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
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
                    <p className="text-text-secondary">No drives found</p>
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
                            <span className="text-lg font-semibold text-text-primary">{drive.device}</span>
                            <span className="text-sm text-text-muted">{drive.fstype}</span>
                          </div>
                          <div className="space-y-1 text-sm">
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
                  <label className="block text-sm text-text-secondary mb-2">
                    Enter custom directories (comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="C:\\Users\\YourName\\Documents, C:\\Users\\YourName\\Downloads"
                    value={state.customDirectories}
                    onChange={(e) => vm.setCustomDirectories(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--avs-surface-muted)] border border-[var(--avs-border)] rounded text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  />
                </div>
              )}

              {state.estimate && (
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-text-secondary">Estimated files:</span>{' '}
                    <span className="font-semibold text-text-primary">{state.estimate.estimatedFiles.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Estimated size:</span>{' '}
                    <span className="font-semibold text-text-primary">{vm.formatBytes(state.estimate.estimatedBytes)}</span>
                  </div>
                  {state.estimate.directories.length > 0 && (
                    <div className="w-full text-xs text-text-muted truncate">
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

          {state.scanResult && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <Card title="Total Files">
                  <p className="text-3xl font-bold text-text-primary">{state.scanResult.totalFiles}</p>
                  <p className="text-sm text-text-secondary">Scanned</p>
                </Card>
                <Card title="Duplicates">
                  <p className="text-3xl font-bold text-semantic-danger">{state.scanResult.totalDuplicates}</p>
                  <p className="text-sm text-text-secondary">Found</p>
                </Card>
                <Card title="Recoverable Space">
                  <p className="text-3xl font-bold text-semantic-success">
                    {vm.formatBytes(state.scanResult.recoverableSpace)}
                  </p>
                  <p className="text-sm text-text-secondary">Can be freed</p>
                </Card>
                <Card title="Scan Duration">
                  <p className="text-3xl font-bold text-text-primary">
                    {(state.scanResult.scanDurationMs / 1000).toFixed(2)}s
                  </p>
                  <p className="text-sm text-text-secondary">Time taken</p>
                </Card>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Duplicate Groups</h2>
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
                              <p className="text-sm text-text-primary truncate">{file.name}</p>
                              <p className="text-xs text-text-muted truncate">{file.path}</p>
                              <p className="text-xs text-text-muted">
                                {vm.formatBytes(file.size)} • {new Date(file.modified).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {fileIndex === 0 && (
                                <span className="text-xs text-green-500 font-semibold">Original</span>
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
                      <p className="text-lg font-semibold text-text-primary">
                        {vm.getSelectedCount()} files selected
                      </p>
                      <p className="text-sm text-text-secondary">
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
            </>
          )}
        </>
      )}
      {dialogElement}
    </div>
  );
}
