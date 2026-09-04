/**
 * DiskAnalyzerPage - Main Disk Analyzer page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleErrorState, ModuleLoadingState, ModuleErrorBanner } from '../../components/ModuleStates';
import { SharedConfirmDialog } from '../../components/SharedConfirmDialog';
import { HelpButton } from '../../components/HelpButton';
import { DiskAnalyzerViewModel } from './DiskAnalyzerViewModel';
import { diskAnalyzerService } from './disk-analyzer.service';
import { useIsPro } from '../sync/syncStore';
import { useFeatureGuard } from '../licensing/useFeatureGuard';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import {
  SparklesIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  WrenchScrewdriverIcon,
  LockClosedIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleStackIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  ArchiveBoxIcon,
  Cog6ToothIcon,
  CodeBracketIcon,
  CircleStackIcon as DatabaseIcon,
  WrenchScrewdriverIcon as SystemIcon,
  ClipboardDocumentListIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Pictures: PhotoIcon,
  Videos: FilmIcon,
  Documents: DocumentTextIcon,
  Audio: MusicalNoteIcon,
  Archives: ArchiveBoxIcon,
  Applications: Cog6ToothIcon,
  Code: CodeBracketIcon,
  Databases: DatabaseIcon,
  System: SystemIcon,
  Other: ClipboardDocumentListIcon,
};

export default function DiskAnalyzerPage() {
  const vm = useMemo(() => new DiskAnalyzerViewModel(diskAnalyzerService), []);
  const state = useViewModel(vm);
  const [maxDepth, setMaxDepth] = useState(2);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isPro = useIsPro();
  const { guard, dialogElement } = useFeatureGuard();
  const { show: showUpgrade } = useUpgradeDialog();

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
        actions={<HelpButton text="Select a drive or folder to analyze. The scanner categorizes files by type so you can quickly identify what's taking up space. Use the depth slider to control scan thoroughness." />}
      />

      {state.bootstrap === 'loading' && (
        <ModuleLoadingState message="Loading drives…" testId="disk-analyzer-loading" />
      )}

      {state.bootstrap === 'error' && (
        <ModuleErrorState
          message="Could not reach the backend service. Please try again."
          onRetry={() => vm.bootstrap()}
          testId="disk-analyzer-error"
        />
      )}

      {state.bootstrap === 'ready' && (
        <>
          {state.analyzeError && (
            <ModuleErrorBanner
              message="Analysis encountered an issue. Please try again."
              onRetry={() => vm.analyze(maxDepth)}
              onDismiss={() => vm.clearAnalyzeError()}
              testId="disk-analyzer-analyze-error"
            />
          )}
          {state.deleteError && (
            <ModuleErrorBanner
              message="Deletion encountered an issue. Please try again."
              onDismiss={() => vm.clearDeleteError()}
              testId="disk-analyzer-delete-error"
            />
          )}

          {/* Drive Selection */}
          <Card title="Select Drive or Folder" className="mb-4">
            <div className="space-y-4">
              {state.drives.length === 0 ? (
                <p className="text-small text-text-muted">No drives found.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {state.drives.map((drive) => {
                    const selected = state.selectedDrives.includes(drive.mountpoint);
                    const isSystem = drive.isSystemDrive ?? drive.mountpoint.toLowerCase().startsWith('c:');
                    return (
                      <div
                        key={drive.device}
                        onClick={() => vm.toggleDrive(drive.mountpoint)}
                        className={`relative p-3 border-2 rounded-[var(--avs-radius-lg)] cursor-pointer transition-all ${
                          selected
                            ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)]'
                            : 'border-[var(--avs-border)] hover:border-[color-mix(in_srgb,var(--avs-brand-primary)_40%,var(--avs-border))]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                                selected
                                  ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]'
                                  : 'border-[var(--avs-border)] bg-transparent'
                              }`}
                            >
                              {selected && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
                            </div>
                            <span className="text-small font-semibold text-text-primary">{drive.device}</span>
                          </div>
                          {isSystem && <Badge tone="brand">System</Badge>}
                        </div>
                        <div className="flex justify-between text-caption text-text-secondary mb-2">
                          <span>{vm.formatBytes(drive.free)} free</span>
                          <span>of {vm.formatBytes(drive.total)}</span>
                        </div>
                        <div className="w-full h-1.5 bg-[var(--avs-surface-muted)] rounded overflow-hidden">
                          <div
                            className={`h-full transition-all ${drive.percent > 80 ? 'bg-semantic-danger' : drive.percent > 60 ? 'bg-semantic-warning' : 'bg-semantic-success'}`}
                            style={{ width: `${drive.percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-3 border-t border-[var(--avs-border)] space-y-3">
                <input
                  type="text"
                  placeholder="Or enter a specific folder path (e.g. C:\Users\Documents)"
                  value={state.customDirectory}
                  onChange={(e) => vm.setCustomDirectory(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--avs-surface)] border border-[var(--avs-border)] rounded-[var(--avs-radius-md)] text-small text-text-primary focus:outline-none focus-visible:shadow-focus"
                />
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-caption text-text-secondary">Scan depth</label>
                    <Badge tone="info">Level {maxDepth}</Badge>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={maxDepth}
                    onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                    className="w-full accent-[var(--avs-brand-primary)]"
                  />
                  <div className="flex justify-between text-caption text-text-muted">
                    <span>Shallow</span>
                    <span>Deep</span>
                  </div>
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={state.analyzing || (state.selectedDrives.length === 0 && !state.customDirectory)}
                  className="w-full"
                  leftIcon={<ChartBarIcon className="h-4 w-4" />}
                >
                  {state.analyzing ? 'Analyzing…' : 'Analyze Disk'}
                </Button>
              </div>
            </div>
          </Card>

          {state.analyzing && (
            <ModuleLoadingState message="Analyzing disk usage…" testId="disk-analyzer-analyzing" />
          )}

          {state.deleting && (
            <ModuleLoadingState message="Deleting selected files…" testId="disk-analyzer-deleting" />
          )}

          {state.analysisResult && !state.analyzing && !state.deleting && (
            <>
              {/* Delete result feedback — compact */}
              {state.deleteResult && (
                <Card className="mb-4 border-semantic-success/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircleIcon className="h-5 w-5 text-semantic-success shrink-0" />
                      <div>
                        <p className="text-small font-semibold text-semantic-success">
                          Deleted {state.deleteResult.deleted} files — freed {vm.formatBytes(state.deleteResult.bytesFreed)}
                        </p>
                        {state.deleteResult.failed > 0 && (
                          <p className="text-caption text-semantic-danger mt-0.5">
                            {state.deleteResult.failed} files could not be deleted.
                          </p>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => vm.clearSelection()}>Dismiss</Button>
                  </div>
                </Card>
              )}

              {/* Compact stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Card variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">{vm.formatBytes(state.analysisResult.totalSize)}</p>
                  <p className="text-caption text-text-secondary">Total size</p>
                </Card>
                <Card variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">{state.analysisResult.fileCount}</p>
                  <p className="text-caption text-text-secondary">Files</p>
                </Card>
                <Card variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">{state.analysisResult.directoryCount}</p>
                  <p className="text-caption text-text-secondary">Directories</p>
                </Card>
                <Card variant="glass" padded={false} className="p-3">
                  <p className="text-statistic text-text-primary">
                    {(state.analysisResult.scanDurationMs / 1000).toFixed(1)}s
                  </p>
                  <p className="text-caption text-text-secondary">Duration</p>
                </Card>
              </div>

              {/* Categorized files */}
              {state.analysisResult.categorySummary && state.analysisResult.categorySummary.length > 0 && (
                <Card title="Files by Category" className="mb-4"
                  actions={
                    <div className="flex items-center gap-3">
                      {selectedCount > 0 && (
                        <button
                          className="text-caption text-text-muted hover:text-text-primary"
                          onClick={() => vm.clearSelection()}
                        >
                          Clear
                        </button>
                      )}
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={selectedCount === 0 || state.deleting}
                        onClick={() => {
                          if (!isPro) {
                            showUpgrade('Disk Analyzer — Delete Files');
                            return;
                          }
                          setConfirmDelete(true);
                        }}
                      >
                        {state.deleting ? 'Deleting…' : `Delete (${selectedCount})`}
                      </Button>
                    </div>
                  }
                >
                  {selectedCount > 0 && (
                    <div className="mb-3 text-caption text-text-secondary">
                      <strong className="text-text-primary">{selectedCount}</strong> files selected · {vm.formatBytes(selectedSize)}
                    </div>
                  )}

                  <div className="space-y-2">
                    {state.analysisResult.categorySummary.map((cat) => {
                      const files = state.analysisResult!.categorizedFiles[cat.category] || [];
                      const isExpanded = state.expandedCategory === cat.category;
                      const selectedInCat = files.filter(f => state.selectedFiles.has(f.path)).length;
                      const allSelected = selectedInCat === files.length && files.length > 0;
                      const Icon = CATEGORY_ICONS[cat.category] ?? CircleStackIcon;

                      return (
                        <div key={cat.category} className="border border-[var(--avs-border)] rounded-[var(--avs-radius-md)] overflow-hidden">
                          {/* Category header */}
                          <div
                            className="flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--avs-surface-muted)]/50 transition-colors"
                            onClick={() => vm.toggleCategory(cat.category)}
                          >
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                allSelected
                                  ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]'
                                  : selectedInCat > 0
                                    ? 'border-[var(--avs-brand-primary)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_30%,transparent)]'
                                    : 'border-[var(--avs-border)] bg-transparent'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                vm.selectAllInCategory(cat.category, !allSelected);
                              }}
                            >
                              {allSelected && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
                            </div>
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--avs-radius-md)] bg-[var(--avs-info-bg)] text-[var(--avs-brand-primary)]">
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="text-small font-semibold text-text-primary flex-1">
                              {cat.category}
                            </span>
                            <span className="text-caption text-text-muted">{cat.fileCount} files</span>
                            <span className="text-small font-semibold text-text-primary">{vm.formatBytes(cat.totalSize)}</span>
                            {isExpanded ? <ChevronDownIcon className="h-4 w-4 text-text-muted" /> : <ChevronRightIcon className="h-4 w-4 text-text-muted" />}
                          </div>

                          {/* File list when expanded */}
                          {isExpanded && (
                            <div className="max-h-80 overflow-auto border-t border-[var(--avs-border)]">
                              {files.length === 0 ? (
                                <p className="text-small text-text-muted p-3">No files in this category.</p>
                              ) : (
                                files.map((file) => {
                                  const isSelected = state.selectedFiles.has(file.path);
                                  return (
                                    <div
                                      key={file.path}
                                      onClick={() => vm.toggleFileSelection(file.path)}
                                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors border-b border-[var(--avs-border)]/30 ${
                                        isSelected ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_5%,transparent)]' : 'hover:bg-[var(--avs-surface-muted)]/50'
                                      }`}
                                    >
                                      <div
                                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                          isSelected
                                            ? 'border-[var(--avs-brand-primary)] bg-[var(--avs-brand-primary)]'
                                            : 'border-[var(--avs-border)] bg-transparent'
                                        }`}
                                      >
                                        {isSelected && <CheckCircleIcon className="h-3.5 w-3.5 text-white" />}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-small text-text-primary truncate" title={file.name}>{file.name}</p>
                                        <p className="text-caption text-text-muted truncate" title={file.path}>{file.path}</p>
                                      </div>
                                      <span className="text-caption text-text-muted shrink-0">
                                        {new Date(file.modified).toLocaleDateString()}
                                      </span>
                                      <span className="text-small font-semibold text-text-primary shrink-0">
                                        {vm.formatBytes(file.size)}
                                      </span>
                                    </div>
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

              {/* Largest Files + File Types */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <Card title="Largest Files">
                  {state.analysisResult.analysis.largestFiles.length === 0 ? (
                    <p className="text-small text-text-muted">No files found.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {state.analysisResult.analysis.largestFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded-[var(--avs-radius-md)] hover:bg-[var(--avs-surface-muted)]/50">
                          <div className="flex-1 min-w-0">
                            <p className="text-small font-medium text-text-primary truncate">{file.name}</p>
                            <p className="text-caption text-text-muted truncate">{file.path}</p>
                          </div>
                          <Badge tone="info">{vm.formatBytes(file.size)}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card title="File Types by Size">
                  {Object.keys(state.analysisResult.analysis.fileTypes).length === 0 ? (
                    <p className="text-small text-text-muted">No file types found.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {Object.entries(state.analysisResult.analysis.fileTypes).map(([ext, size]) => (
                        <div key={ext} className="flex items-center justify-between p-2 rounded-[var(--avs-radius-md)] hover:bg-[var(--avs-surface-muted)]/50">
                          <span className="text-small text-text-primary">{vm.getExtensionLabel(ext)}</span>
                          <Badge tone="neutral">{vm.formatBytes(size)}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Subdirectories */}
              <Card title="Subdirectories" className="mb-4">
                {state.analysisResult.analysis.subdirectories.length === 0 ? (
                  <p className="text-small text-text-muted">No subdirectories found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {state.analysisResult.analysis.subdirectories.map((subdir, index) => (
                      <div key={index} className="flex items-center justify-between p-2 rounded-[var(--avs-radius-md)] hover:bg-[var(--avs-surface-muted)]/50">
                        <div className="flex-1 min-w-0">
                          <p className="text-small font-medium text-text-primary truncate">{subdir.path}</p>
                          <p className="text-caption text-text-muted">{subdir.fileCount} files · {subdir.directoryCount} subdirs</p>
                        </div>
                        <Badge tone="info">{vm.formatBytes(subdir.totalSize)}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}

          {/* Professional Features — compact */}
          {state.analysisResult && !state.analyzing && (
            <Card title="Professional Features" variant="glass" className="mt-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <SparklesIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <span className="text-small font-medium text-text-primary">AI Storage Insights</span>
                      <p className="text-caption text-text-muted">Personalized disk usage analysis</p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm">Insights</Button>
                  ) : (
                    <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('disk.analyzer', 'Disk Analyzer', () => {}, {
                        limitDescription: 'AI storage insights are a Professional feature.',
                        proBenefit: 'AI-powered disk usage analysis with personalized recommendations.',
                      })}
                      data-testid="disk-ai-insights-upgrade"
                    >Upgrade</Button>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ChartBarIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <span className="text-small font-medium text-text-primary">Growth Trends</span>
                      <p className="text-caption text-text-muted">Track disk usage over time</p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm">Trends</Button>
                  ) : (
                    <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('disk.analyzer', 'Disk Analyzer', () => {}, {
                        limitDescription: 'Growth trends are a Professional feature.',
                        proBenefit: 'Track disk usage over time with visual growth trend charts.',
                      })}
                      data-testid="disk-growth-trends-upgrade"
                    >Upgrade</Button>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <ArrowTrendingUpIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <span className="text-small font-medium text-text-primary">Forecasting</span>
                      <p className="text-caption text-text-muted">Predict when disk will fill up</p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm">Forecast</Button>
                  ) : (
                    <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('disk.analyzer', 'Disk Analyzer', () => {}, {
                        limitDescription: 'Forecasting is a Professional feature.',
                        proBenefit: 'Predict disk space exhaustion with trend-based forecasting.',
                      })}
                      data-testid="disk-forecasting-upgrade"
                    >Upgrade</Button>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--avs-border)] pt-3">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-[var(--avs-radius-md)] p-2 ${isPro ? 'bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)]' : 'bg-[var(--avs-surface-muted)]'}`}>
                      <WrenchScrewdriverIcon className={`h-4 w-4 ${isPro ? 'text-[var(--avs-brand-primary)]' : 'text-text-muted'}`} />
                    </div>
                    <div>
                      <span className="text-small font-medium text-text-primary">Cleanup Suggestions</span>
                      <p className="text-caption text-text-muted">AI-powered safe-to-delete recommendations</p>
                    </div>
                  </div>
                  {isPro ? (
                    <Button variant="secondary" size="sm">Suggestions</Button>
                  ) : (
                    <Button variant="ghost" size="sm" leftIcon={<LockClosedIcon className="h-4 w-4" />}
                      onClick={() => guard('disk.analyzer', 'Disk Analyzer', () => {}, {
                        limitDescription: 'Cleanup suggestions are a Professional feature.',
                        proBenefit: 'AI-powered cleanup recommendations with confidence scores.',
                      })}
                      data-testid="disk-cleanup-suggestions-upgrade"
                    >Upgrade</Button>
                  )}
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {dialogElement}

      <SharedConfirmDialog
        open={confirmDelete}
        title="Delete selected files?"
        variant="danger"
        message={
          <>
            <p className="mb-2">
              You are about to delete <strong>{selectedCount}</strong> file(s) totaling <strong>{vm.formatBytes(selectedSize)}</strong>.
            </p>
            <p className="text-text-muted">This action cannot be undone. Files will be permanently deleted.</p>
          </>
        }
        confirmLabel={`Delete ${selectedCount} File(s)`}
        onConfirm={() => {
          setConfirmDelete(false);
          void vm.deleteSelectedFiles();
        }}
        onCancel={() => setConfirmDelete(false)}
        testId="disk-analyzer-confirm-delete"
      />
    </div>
  );
}
