/**
 * DiskAnalyzerPage - Main Disk Analyzer page
 */

import { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { PageHeader } from '../../components/PageHeader';
import { DiskAnalyzerViewModel } from './DiskAnalyzerViewModel';
import { diskAnalyzerService } from './disk-analyzer.service';

export default function DiskAnalyzerPage() {
  const vm = useMemo(() => new DiskAnalyzerViewModel(diskAnalyzerService), []);
  const state = useViewModel(vm);
  const [maxDepth, setMaxDepth] = useState(2);

  useEffect(() => {
    void vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const handleAnalyze = () => {
    void vm.analyze(maxDepth);
  };

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

          {state.analysisResult && (
            <>
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
    </div>
  );
}
