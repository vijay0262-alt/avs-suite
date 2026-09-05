/**
 * LargeFilesPage — find and manage the largest files on your drives.
 *
 * Uses disk.analyze to scan drives and display the largest files,
 * allowing users to delete space-hogging files directly.
 */
import { useState, useCallback, useEffect } from 'react';
import { Card, Button, Badge, GaugeCard, StatTile } from '@avs/ui';
import { PageHeader } from '../components/PageHeader';
import { HelpButton } from '../components/HelpButton';
import { rpc } from '../services/rpc';
import { RPC_METHODS } from '@avs/shared/rpc';
import { useEdition } from '../config/EditionManager';
import { useUpgradeDialog } from '../components/UpgradeDialog';
import {
  DocumentIcon,
  ArrowPathIcon,
  TrashIcon,
  FolderIcon,
  ArrowDownTrayIcon,
  CircleStackIcon,
  CheckCircleIcon,
  CpuChipIcon,
} from '@heroicons/react/24/outline';

interface LargeFile {
  path: string;
  name: string;
  size: number;
  category: string;
}

interface DriveInfo {
  letter: string;
  label: string;
  totalBytes: number;
  freeBytes: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export default function LargeFilesPage() {
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const isPro = edition === 'professional';
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>('');
  const [files, setFiles] = useState<LargeFile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deletedSize, setDeletedSize] = useState(0);

  // Load drives on mount
  useEffect(() => {
    rpc.raw<{ drives: DriveInfo[] }>(RPC_METHODS.DISK_LIST_DRIVES)
      .then((res) => {
        const driveList = res.drives || [];
        setDrives(driveList);
        if (driveList.length > 0 && !selectedDrive) {
          setSelectedDrive(driveList[0]!.letter);
        }
      })
      .catch(() => setError('Could not load drives. Please try again.'));
  }, [selectedDrive]);

  const handleScan = useCallback(async () => {
    if (!selectedDrive) return;
    setScanning(true);
    setError(null);
    setFiles([]);
    try {
      const res = await rpc.raw<{ largestFiles: LargeFile[] }>(RPC_METHODS.DISK_ANALYZE, { path: selectedDrive });
      setFiles(res.largestFiles || []);
    } catch {
      setError('Scan encountered an issue. Please try again.');
    }
    setScanning(false);
  }, [selectedDrive]);

  const handleDelete = useCallback(async (file: LargeFile) => {
    if (!isPro) {
      showUpgrade('Large Files');
      return;
    }
    if (!confirm(`Delete "${file.name}" (${formatSize(file.size)})?\nThis cannot be undone.`)) return;
    setDeleting(file.path);
    try {
      await rpc.raw(RPC_METHODS.DISK_DELETE_FILES, { files: [file.path] });
      setFiles((prev) => prev.filter((f) => f.path !== file.path));
      setDeletedSize((prev) => prev + file.size);
    } catch {
      setError('Could not delete the file. Please try again.');
    }
    setDeleting(null);
  }, [isPro, showUpgrade]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div data-testid="page-large-files" className="space-y-4">
      <PageHeader
        title="Large Files"
        description="Find and remove the largest files taking up space on your drives."
        actions={<HelpButton text="Select a drive and click Scan to find the 20 largest files. Pro users can delete files directly." />}
      />

      {/* Drive selector + scan */}
      <Card variant="glass" className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-[var(--avs-radius-md)] bg-[color-mix(in_srgb,var(--avs-brand-primary)_10%,transparent)] p-2.5">
              <FolderIcon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
            </div>
            <p className="text-caption text-text-secondary">
              Scans for the 20 largest files on the selected drive.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedDrive}
              onChange={(e) => setSelectedDrive(e.target.value)}
              className="rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary focus:border-[var(--avs-brand-primary)] focus:outline-none"
              data-testid="large-files-drive-select"
            >
              {drives.map((d) => (
                <option key={d.letter} value={d.letter}>
                  {d.letter} {d.label && `(${d.label})`} — {formatSize(d.totalBytes - d.freeBytes)} used
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              onClick={handleScan}
              disabled={scanning || !selectedDrive}
              leftIcon={scanning ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowDownTrayIcon className="h-4 w-4" />}
              data-testid="large-files-scan-btn"
            >
              {scanning ? 'Scanning…' : 'Scan Now'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 px-4 py-2">
          <p className="text-small text-semantic-danger">{error}</p>
        </div>
      )}

      {/* Hero status section — System Mechanic style */}
      {files.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="large-files-hero-section">
          {/* Gauge */}
          <GaugeCard
            title="Large Files"
            value={Math.min(100, files.length * 5)}
            unit=""
            tone="brand"
            icon={<DocumentIcon className="h-6 w-6" />}
            description={`${files.length} files · ${formatSize(totalSize)}`}
            data-testid="large-files-hero-gauge"
          />

          {/* Key stats */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="Files Found"
              value={files.length.toString()}
              hint="Large files"
              icon={<DocumentIcon className="h-5 w-5" />}
              variant="glass"
            />
            <StatTile
              label="Total Size"
              value={formatSize(totalSize)}
              hint="Combined size"
              icon={<CircleStackIcon className="h-5 w-5" />}
              variant="glass"
            />
            <StatTile
              label="Space Freed"
              value={formatSize(deletedSize)}
              hint="Already deleted"
              icon={<CheckCircleIcon className="h-5 w-5" />}
              variant="glass"
              accentColor={deletedSize > 0 ? 'var(--avs-success)' : undefined}
            />
            <StatTile
              label="Drive"
              value={selectedDrive || '—'}
              hint="Selected drive"
              icon={<FolderIcon className="h-5 w-5" />}
              variant="glass"
            />
            <StatTile
              label="Largest"
              value={files.length > 0 ? formatSize(files[0]!.size) : '—'}
              hint={files.length > 0 ? files[0]!.name : 'No files'}
              icon={<ArrowDownTrayIcon className="h-5 w-5" />}
              variant="glass"
            />
            <StatTile
              label="Edition"
              value={isPro ? 'Pro' : 'Free'}
              hint={isPro ? 'Can delete' : 'View only'}
              icon={<CpuChipIcon className="h-5 w-5" />}
              variant="glass"
              accentColor={isPro ? 'var(--avs-success)' : 'var(--avs-warning)'}
            />
          </div>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <Card variant="glass" data-testid="large-files-list">
          <div className="space-y-1.5">
            {files.map((file, i) => (
              <div key={file.path} className="flex items-center gap-3 py-2 px-3 rounded-[var(--avs-radius-md)] hover:bg-[var(--avs-surface-muted)]/50 transition-colors">
                <span className="shrink-0 text-caption font-bold text-text-muted w-6">#{i + 1}</span>
                <DocumentIcon className="h-5 w-5 text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-small font-medium text-text-primary truncate">{file.name}</div>
                  <div className="text-caption text-text-muted truncate">{file.path}</div>
                </div>
                <Badge tone="neutral">{file.category || 'File'}</Badge>
                <span className="text-small font-semibold text-text-primary tabular-nums shrink-0 w-24 text-right">
                  {formatSize(file.size)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(file)}
                  disabled={deleting === file.path || !isPro}
                  leftIcon={<TrashIcon className="h-4 w-4" />}
                  data-testid={`large-files-delete-${i}`}
                >
                  {deleting === file.path ? '…' : 'Delete'}
                </Button>
              </div>
            ))}
          </div>
          {!isPro && (
            <p className="text-caption text-[var(--avs-brand-primary)] mt-3">Professional edition required to delete files.</p>
          )}
        </Card>
      )}

      {files.length === 0 && !scanning && !error && (
        <Card variant="glass" className="p-12 text-center">
          <DocumentIcon className="h-12 w-12 text-text-muted mx-auto mb-3" />
          <p className="text-small text-text-secondary">Select a drive and click Scan to find large files.</p>
        </Card>
      )}
    </div>
  );
}
