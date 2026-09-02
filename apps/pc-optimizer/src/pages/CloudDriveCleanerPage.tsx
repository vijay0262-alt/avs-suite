/**
 * CloudDriveCleanerPage — scan Google Drive / OneDrive local sync folders
 * for large files, old files, and duplicates.
 */
import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import { useEdition } from '../config/EditionManager';
import { useUpgradeDialog } from '../components/UpgradeDialog';
import {
  CloudArrowUpIcon,
  DocumentDuplicateIcon,
  ArrowTrendingUpIcon,
  ClockIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface CloudFolder {
  provider: string;
  name: string;
  path: string;
}

interface FileInfo {
  path: string;
  name: string;
  size: number;
  modified: string;
  provider: string;
}

interface DupGroup {
  hash: string;
  files: FileInfo[];
  count: number;
  waste_bytes: number;
}

interface ScanResult {
  supported: boolean;
  folders: CloudFolder[];
  large_files: FileInfo[];
  old_files: FileInfo[];
  duplicate_groups: DupGroup[];
  summary: {
    total_files: number;
    total_bytes: number;
    large_count: number;
    old_count: number;
    duplicate_count: number;
    duplicate_bytes: number;
    large_bytes: number;
  };
  message?: string;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export default function CloudDriveCleanerPage() {
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const [folders, setFolders] = useState<CloudFolder[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{ deleted: number; failed: number; bytes_freed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detectFolders = useCallback(async () => {
    try {
      const res = await rpc.raw<{ folders: CloudFolder[] }>(RPC_METHODS.CLOUD_DRIVE_DETECT);
      setFolders(res.folders || []);
    } catch {
      setError('Failed to detect cloud folders');
    }
  }, []);

  useEffect(() => {
    detectFolders();
  }, [detectFolders]);

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setResult(null);
    setSelectedFiles(new Set());
    setCleanResult(null);
    try {
      const res = await rpc.raw<ScanResult>(RPC_METHODS.CLOUD_DRIVE_SCAN, {
        large_threshold_mb: 100,
        old_days: 90,
        find_duplicates: true,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
        setFolders(res.folders || []);
      }
    } catch (e) {
      setError(String(e));
    }
    setScanning(false);
  };

  const toggleFile = (path: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleClean = async () => {
    if (edition === 'free') {
      showUpgrade();
      return;
    }
    if (selectedFiles.size === 0) return;
    setCleaning(true);
    setCleanResult(null);
    try {
      const res = await rpc.raw<{ deleted: number; failed: number; bytes_freed: number }>(
        RPC_METHODS.CLOUD_DRIVE_CLEAN,
        { files: Array.from(selectedFiles) },
      );
      setCleanResult(res);
      setSelectedFiles(new Set());
      // Re-scan after cleaning
      handleScan();
    } catch (e) {
      setError(String(e));
    }
    setCleaning(false);
  };

  const isPro = edition === 'professional';

  return (
    <div data-testid="page-cloud-drive-cleaner">
      <PageHeader
        title="Cloud Drive Cleaner"
        description="Scan Google Drive, OneDrive, and Dropbox sync folders for large, old, and duplicate files."
        actions={<HelpButton text="Cloud Drive Cleaner scans your local cloud sync folders for files taking up unnecessary space. Deleting files here removes them from your local sync folder — your cloud provider's sync client will then sync the deletion to the cloud." />}
      />

      <div className="space-y-4">
        {/* Detected folders */}
        <Card title="Detected Cloud Drives" variant="glass">
          {folders.length === 0 ? (
            <p className="text-small text-text-secondary">
              No cloud sync folders detected. Install Google Drive, OneDrive, or Dropbox and sign in to use this feature.
            </p>
          ) : (
            <div className="space-y-2">
              {folders.map((f) => (
                <div key={f.path} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CloudArrowUpIcon className="h-5 w-5 text-brand-primary" />
                    <div>
                      <div className="text-small font-medium text-text-primary">{f.name}</div>
                      <div className="text-caption text-text-muted">{f.path}</div>
                    </div>
                  </div>
                  <Badge tone="success">Connected</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Scan button */}
        <Card title="Scan" variant="glass">
          <div className="flex items-center justify-between">
            <p className="text-small text-text-secondary">
              Scan for large files (&gt;100 MB), old files (&gt;90 days), and duplicates.
            </p>
            <Button
              onClick={handleScan}
              disabled={scanning || folders.length === 0}
              leftIcon={<ArrowPathIcon className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />}
              data-testid="cloud-drive-scan"
            >
              {scanning ? 'Scanning...' : 'Scan Now'}
            </Button>
          </div>
        </Card>

        {error && (
          <Card variant="glass">
            <p className="text-small text-semantic-danger">{error}</p>
          </Card>
        )}

        {cleanResult && (
          <Card title="Cleanup Results" variant="glass">
            <div className="flex items-center gap-4">
              <CheckCircleIcon className="h-8 w-8 text-semantic-success" />
              <div>
                <div className="text-small font-medium text-text-primary">
                  Deleted {cleanResult.deleted} files, freed {formatBytes(cleanResult.bytes_freed)}
                </div>
                {cleanResult.failed > 0 && (
                  <div className="text-caption text-semantic-warning">
                    {cleanResult.failed} files could not be deleted
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Scan results */}
        {result && (
          <>
            {/* Summary */}
            <Card title="Summary" variant="glass">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="text-center">
                  <div className="text-h2 font-bold text-text-primary">{result.summary.total_files}</div>
                  <div className="text-caption text-text-secondary">Total Files</div>
                </div>
                <div className="text-center">
                  <div className="text-h2 font-bold text-brand-primary">{result.summary.large_count}</div>
                  <div className="text-caption text-text-secondary">Large Files</div>
                </div>
                <div className="text-center">
                  <div className="text-h2 font-bold text-semantic-warning">{result.summary.old_count}</div>
                  <div className="text-caption text-text-secondary">Old Files</div>
                </div>
                <div className="text-center">
                  <div className="text-h2 font-bold text-semantic-danger">{result.summary.duplicate_count}</div>
                  <div className="text-caption text-text-secondary">Duplicate Groups</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 border-t border-[var(--avs-border)] pt-4">
                <div>
                  <div className="text-small text-text-muted">Total size scanned</div>
                  <div className="text-small font-medium text-text-primary">{formatBytes(result.summary.total_bytes)}</div>
                </div>
                <div>
                  <div className="text-small text-text-muted">Large file waste</div>
                  <div className="text-small font-medium text-text-primary">{formatBytes(result.summary.large_bytes)}</div>
                </div>
                <div>
                  <div className="text-small text-text-muted">Duplicate waste</div>
                  <div className="text-small font-medium text-text-primary">{formatBytes(result.summary.duplicate_bytes)}</div>
                </div>
              </div>
            </Card>

            {/* Large files */}
            {result.large_files.length > 0 && (
              <Card title={`Large Files (${result.large_files.length})`} variant="glass">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {result.large_files.map((f) => (
                    <FileRow key={f.path} file={f} selected={selectedFiles.has(f.path)} onToggle={toggleFile} formatBytes={formatBytes} icon={<ArrowTrendingUpIcon className="h-4 w-4 text-brand-primary" />} />
                  ))}
                </div>
              </Card>
            )}

            {/* Old files */}
            {result.old_files.length > 0 && (
              <Card title={`Old Files (${result.old_files.length})`} variant="glass">
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {result.old_files.map((f) => (
                    <FileRow key={f.path} file={f} selected={selectedFiles.has(f.path)} onToggle={toggleFile} formatBytes={formatBytes} icon={<ClockIcon className="h-4 w-4 text-semantic-warning" />} />
                  ))}
                </div>
              </Card>
            )}

            {/* Duplicate groups */}
            {result.duplicate_groups.length > 0 && (
              <Card title={`Duplicate Groups (${result.duplicate_groups.length})`} variant="glass">
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {result.duplicate_groups.map((g) => (
                    <div key={g.hash} className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <DocumentDuplicateIcon className="h-4 w-4 text-semantic-danger" />
                          <span className="text-small font-medium text-text-primary">{g.count} copies</span>
                        </div>
                        <span className="text-caption text-text-muted">Waste: {formatBytes(g.waste_bytes)}</span>
                      </div>
                      {g.files.map((f) => (
                        <FileRow key={f.path} file={f} selected={selectedFiles.has(f.path)} onToggle={toggleFile} formatBytes={formatBytes} icon={null} compact />
                      ))}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Clean button */}
            {selectedFiles.size > 0 && (
              <Card variant="glass">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-small font-medium text-text-primary">{selectedFiles.size} files selected</div>
                    {!isPro && <div className="text-caption text-brand-primary">Professional edition required to delete</div>}
                  </div>
                  <Button
                    variant="danger"
                    onClick={handleClean}
                    disabled={cleaning}
                    leftIcon={<TrashIcon className="h-4 w-4" />}
                    data-testid="cloud-drive-clean"
                  >
                    {cleaning ? 'Deleting...' : 'Delete Selected'}
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FileRow({
  file,
  selected,
  onToggle,
  formatBytes,
  icon,
  compact,
}: {
  file: FileInfo;
  selected: boolean;
  onToggle: (path: string) => void;
  formatBytes: (b: number) => string;
  icon: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? 'py-1' : 'py-2'} px-2 rounded hover:bg-[var(--avs-surface-hover)]`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(file.path)}
        className="h-4 w-4 accent-[var(--avs-brand-primary)]"
      />
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-small text-text-primary truncate">{file.name}</div>
        <div className="text-caption text-text-muted truncate">{file.path}</div>
      </div>
      <div className="text-small font-medium text-text-secondary tabular-nums whitespace-nowrap">
        {formatBytes(file.size)}
      </div>
    </div>
  );
}
