/**
 * DuplicateFinderPage - Main Duplicate Finder page
 */

import { useEffect, useMemo } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { DuplicateFinderViewModel } from './DuplicateFinderViewModel';
import { duplicateFinderService } from './duplicate-finder.service';
import type { DuplicateScope } from './duplicate-finder.types';

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
      />

      {state.bootstrap === 'loading' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-text-secondary">Loading...</p>
          </div>
        </Card>
      )}

      {state.bootstrap === 'error' && (
        <Card>
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{state.bootstrapError}</p>
            <Button onClick={() => vm.bootstrap()}>Retry</Button>
          </div>
        </Card>
      )}

      {state.bootstrap === 'ready' && (
        <>
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
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                      state.scope === s.id
                        ? 'bg-brand-primary text-white'
                        : 'bg-bg-secondary text-text-secondary hover:bg-surface-muted'
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
                              ? 'border-brand-primary bg-bg-secondary'
                              : 'border-border hover:border-brand-primary'
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
                    className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
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
                <div className="animate-pulse h-4 bg-bg-secondary rounded w-1/3" />
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
                <Card>
                  <div className="text-center py-8">
                    <p className="text-text-secondary">No duplicates found</p>
                  </div>
                </Card>
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
                                ? 'border-brand-primary bg-bg-secondary'
                                : 'border-border'
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
                <Card title="Delete Results">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-text-secondary">Files Deleted</span>
                      <span className="text-sm text-text-primary">{state.deleteResult.deletedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-text-secondary">Space Freed</span>
                      <span className="text-sm text-text-primary">{vm.formatBytes(state.deleteResult.spaceFreed)}</span>
                    </div>
                    {state.deleteResult.errors.length > 0 && (
                      <div>
                        <p className="text-sm text-red-500 mb-1">Errors:</p>
                        <ul className="list-disc list-inside space-y-1">
                          {state.deleteResult.errors.map((error, index) => (
                            <li key={index} className="text-xs text-text-secondary">{error}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
