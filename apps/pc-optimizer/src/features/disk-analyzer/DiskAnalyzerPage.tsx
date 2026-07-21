/**
 * DiskAnalyzerPage - Main Disk Analyzer page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { DiskAnalyzerViewModel } from './DiskAnalyzerViewModel';
import { diskAnalyzerService } from './disk-analyzer.service';

const CATEGORY_ICONS: Record<string, string> = {
  Pictures: '🖼️',
  Videos: '🎬',
  Documents: '📄',
  Audio: '🎵',
  Archives: '📦',
  Applications: '⚙️',
  Code: '💻',
  Databases: '🗄️',
  System: '🔧',
  Other: '📋',
};

export default function DiskAnalyzerPage() {
  const vm = useMemo(() => new DiskAnalyzerViewModel(diskAnalyzerService), []);
  const state = useViewModel(vm);
  const [maxDepth, setMaxDepth] = useState(2);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleAnalyze = () => {
    void vm.analyze(maxDepth);
  };

  const selectedCount = state.selectedFiles.size;
  const selectedSize = vm.getSelectedFilesSize();

  return (
    <div data-testid="page-disk-analyzer">
      <PageHeader
        title="Disk Analyzer"
        description="Analyze disk usage by directory and file type to identify space hogs"
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
          <Card title="Select Drives or Folder to Analyze" className="mb-4">
            <div className="space-y-4">
              {state.drives.length === 0 ? (
                <p className="text-text-secondary">No drives found</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {state.drives.map((drive) => {
                    const selected = state.selectedDrives.includes(drive.mountpoint);
                    const isSystem = drive.isSystemDrive ?? drive.mountpoint.toLowerCase().startsWith('c:');
                    return (
                      <label
                        key={drive.device}
                        className={`relative p-4 border rounded cursor-pointer transition-colors ${
                          selected
                            ? 'border-brand-primary bg-bg-secondary'
                            : 'border-border hover:border-brand-primary'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="absolute top-3 right-3 h-4 w-4 accent-brand-primary"
                          checked={selected}
                          onChange={() => vm.toggleDrive(drive.mountpoint)}
                        />
                        <div className="flex items-center justify-between mb-2 pr-6">
                          <div>
                            <span className="text-lg font-semibold text-text-primary block">{drive.device}</span>
                            {drive.label && <span className="text-xs text-text-muted">{drive.label}</span>}
                          </div>
                          <span className="text-sm text-text-muted">{drive.fstype}</span>
                        </div>
                        {isSystem && (
                          <span className="inline-block mb-2 px-1.5 py-0.5 text-[10px] font-semibold rounded bg-brand-primary/20 text-brand-primary">
                            System Drive
                          </span>
                        )}
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Capacity:</span>
                            <span className="text-text-primary">{vm.formatBytes(drive.total)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Used:</span>
                            <span className="text-text-primary">{vm.formatBytes(drive.used)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Free:</span>
                            <span className="text-text-primary">{vm.formatBytes(drive.free)}</span>
                          </div>
                          <div className="w-full h-2 bg-bg-secondary rounded overflow-hidden mt-2">
                            <div
                              className={`h-full ${drive.percent > 80 ? 'bg-semantic-danger' : drive.percent > 60 ? 'bg-semantic-warning' : 'bg-semantic-success'}`}
                              style={{ width: `${drive.percent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-text-muted">{drive.percent.toFixed(1)}% used</span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="pt-4 border-t border-border">
                <div>
                  <label className="block text-sm text-text-secondary mb-2">
                    Or enter a specific folder
                  </label>
                  <input
                    type="text"
                    placeholder="C:\\Users\\YourName\\Documents"
                    value={state.customDirectory}
                    onChange={(e) => vm.setCustomDirectory(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-secondary border border-border rounded text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm text-text-secondary mb-2">
                    Scan Depth: {maxDepth}
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-text-muted">
                    <span>Shallow (1)</span>
                    <span>Deep (5)</span>
                  </div>
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={state.analyzing || (state.selectedDrives.length === 0 && !state.customDirectory)}
                  className="w-full mt-4"
                >
                  {state.analyzing ? 'Analyzing...' : 'Analyze Disk'}
                </Button>
              </div>
            </div>
          </Card>

          {state.analyzing && (
            <Card>
              <div className="text-center py-8">
                <p className="text-text-secondary">Analyzing disk usage...</p>
              </div>
            </Card>
          )}

          {state.analysisResult && !state.analyzing && (
            <>
              {/* Delete result feedback */}
              {state.deleteResult && (
                <Card className="mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        Deleted {state.deleteResult.deleted} files, freed {vm.formatBytes(state.deleteResult.bytesFreed)}
                      </p>
                      {state.deleteResult.failed > 0 && (
                        <p className="text-xs text-red-400 mt-1">
                          {state.deleteResult.failed} files could not be deleted
                        </p>
                      )}
                      {state.deleteResult.errors.length > 0 && (
                        <div className="mt-2 max-h-24 overflow-auto">
                          {state.deleteResult.errors.slice(0, 5).map((err, i) => (
                            <p key={i} className="text-xs text-red-400 truncate" title={err.path}>
                              {err.path}: {err.error}
                            </p>
                          ))}
                          {state.deleteResult.errors.length > 5 && (
                            <p className="text-xs text-text-muted">...and {state.deleteResult.errors.length - 5} more</p>
                          )}
                        </div>
                      )}
                    </div>
                    <Button variant="secondary" onClick={() => vm.clearSelection()}>Dismiss</Button>
                  </div>
                </Card>
              )}

              {/* Categorized files with checkboxes */}
              {state.analysisResult.categorySummary && state.analysisResult.categorySummary.length > 0 && (
                <Card title="Files by Category — Select and Delete to Free Up Space" className="mb-4">
                  {/* Selection toolbar */}
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-text-secondary">
                        {selectedCount > 0
                          ? `${selectedCount} file(s) selected — ${vm.formatBytes(selectedSize)}`
                          : 'No files selected'}
                      </span>
                      {selectedCount > 0 && (
                        <button
                          className="text-xs text-text-muted hover:text-text-primary"
                          onClick={() => vm.clearSelection()}
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                    <Button
                      variant="primary"
                      disabled={selectedCount === 0 || state.deleting}
                      onClick={() => setConfirmDelete(true)}
                    >
                      {state.deleting ? 'Deleting...' : `Delete Selected (${selectedCount})`}
                    </Button>
                  </div>

                  {/* Category sections */}
                  <div className="space-y-3">
                    {state.analysisResult.categorySummary.map((cat) => {
                      const files = state.analysisResult!.categorizedFiles[cat.category] || [];
                      const isExpanded = state.expandedCategory === cat.category;
                      const selectedInCat = files.filter(f => state.selectedFiles.has(f.path)).length;
                      const allSelected = selectedInCat === files.length && files.length > 0;
                      const icon = CATEGORY_ICONS[cat.category] || '📋';

                      return (
                        <div key={cat.category} className="border border-border rounded-lg overflow-hidden">
                          {/* Category header */}
                          <div
                            className="flex items-center gap-3 p-3 bg-bg-secondary cursor-pointer hover:bg-bg-secondary/80 transition-colors"
                            onClick={() => vm.toggleCategory(cat.category)}
                          >
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-brand-primary"
                              checked={allSelected}
                              ref={(el) => { if (el) el.indeterminate = selectedInCat > 0 && !allSelected; }}
                              onChange={(e) => {
                                e.stopPropagation();
                                vm.selectAllInCategory(cat.category, e.target.checked);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-lg">{icon}</span>
                            <span className="text-sm font-semibold text-text-primary flex-1">
                              {cat.category}
                            </span>
                            <span className="text-xs text-text-muted">
                              {cat.fileCount} files
                            </span>
                            <span className="text-sm font-semibold text-text-primary">
                              {vm.formatBytes(cat.totalSize)}
                            </span>
                            {selectedInCat > 0 && (
                              <span className="text-xs text-brand-primary">
                                {selectedInCat} selected
                              </span>
                            )}
                            <span className="text-text-muted text-xs">
                              {isExpanded ? '▼' : '▶'}
                            </span>
                          </div>

                          {/* File list when expanded */}
                          {isExpanded && (
                            <div className="max-h-80 overflow-auto">
                              {files.length === 0 ? (
                                <p className="text-sm text-text-secondary p-3">No files in this category</p>
                              ) : (
                                files.map((file) => {
                                  const isSelected = state.selectedFiles.has(file.path);
                                  return (
                                    <label
                                      key={file.path}
                                      className={`flex items-center gap-3 px-3 py-2 border-b border-border/50 cursor-pointer transition-colors ${
                                        isSelected ? 'bg-brand-primary/5' : 'hover:bg-bg-secondary/50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 accent-brand-primary shrink-0"
                                        checked={isSelected}
                                        onChange={() => vm.toggleFileSelection(file.path)}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm text-text-primary truncate" title={file.name}>{file.name}</p>
                                        <p className="text-xs text-text-muted truncate" title={file.path}>{file.path}</p>
                                      </div>
                                      <span className="text-xs text-text-muted shrink-0">
                                        {new Date(file.modified).toLocaleDateString()}
                                      </span>
                                      <span className="text-sm font-semibold text-text-primary shrink-0 ml-2">
                                        {vm.formatBytes(file.size)}
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Original analysis sections */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <Card title="Total Size">
                  <p className="text-3xl font-bold text-text-primary">
                    {vm.formatBytes(state.analysisResult.totalSize)}
                  </p>
                  <p className="text-sm text-text-secondary">Disk usage</p>
                </Card>
                <Card title="Files">
                  <p className="text-3xl font-bold text-text-primary">
                    {state.analysisResult.fileCount}
                  </p>
                  <p className="text-sm text-text-secondary">Total files</p>
                </Card>
                <Card title="Directories">
                  <p className="text-3xl font-bold text-text-primary">
                    {state.analysisResult.directoryCount}
                  </p>
                  <p className="text-sm text-text-secondary">Total directories</p>
                </Card>
                <Card title="Scan Duration">
                  <p className="text-3xl font-bold text-text-primary">
                    {(state.analysisResult.scanDurationMs / 1000).toFixed(2)}s
                  </p>
                  <p className="text-sm text-text-secondary">Time taken</p>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <Card title="Largest Files">
                  {state.analysisResult.analysis.largestFiles.length === 0 ? (
                    <p className="text-text-secondary">No files found</p>
                  ) : (
                    <div className="space-y-2">
                      {state.analysisResult.analysis.largestFiles.map((file, index) => (
                        <div key={index} className="p-2 border border-border rounded">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
                              <p className="text-xs text-text-muted truncate">{file.path}</p>
                            </div>
                            <span className="text-sm font-semibold text-text-primary ml-2">
                              {vm.formatBytes(file.size)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="File Types by Size">
                  {Object.keys(state.analysisResult.analysis.fileTypes).length === 0 ? (
                    <p className="text-text-secondary">No file types found</p>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(state.analysisResult.analysis.fileTypes).map(([ext, size]) => (
                        <div key={ext} className="flex items-center justify-between">
                          <span className="text-sm text-text-primary">
                            {vm.getExtensionLabel(ext)}
                          </span>
                          <span className="text-sm text-text-primary">
                            {vm.formatBytes(size)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card title="Subdirectories">
                {state.analysisResult.analysis.subdirectories.length === 0 ? (
                  <p className="text-text-secondary">No subdirectories found</p>
                ) : (
                  <div className="space-y-2">
                    {state.analysisResult.analysis.subdirectories.map((subdir, index) => (
                      <div key={index} className="p-3 border border-border rounded">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-text-primary truncate">{subdir.path}</p>
                          </div>
                          <span className="text-sm font-semibold text-text-primary ml-2">
                            {vm.formatBytes(subdir.totalSize)}
                          </span>
                        </div>
                        <div className="flex gap-4 text-xs text-text-muted">
                          <span>{subdir.fileCount} files</span>
                          <span>{subdir.directoryCount} subdirectories</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-text-primary mb-2">Delete selected files?</h3>
            <p className="text-sm text-text-secondary mb-2">
              You are about to delete <strong>{selectedCount}</strong> file(s) totaling <strong>{vm.formatBytes(selectedSize)}</strong>.
            </p>
            <p className="text-sm text-text-muted mb-6">
              This action cannot be undone. Files will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmDelete(false);
                  void vm.deleteSelectedFiles();
                }}
              >
                Delete {selectedCount} File(s)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
