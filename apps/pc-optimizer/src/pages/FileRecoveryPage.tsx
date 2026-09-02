/**
 * FileRecoveryPage — recover deleted files from Recycle Bin and shadow copies.
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
  ArrowUturnLeftIcon,
  DocumentMagnifyingGlassIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';

interface RecyclableItem {
  Name: string;
  Path: string;
  Size: number;
  ModifyDate: string;
  Type: string;
  OriginalPath: string;
}

interface ShadowCopy {
  ID: string;
  VolumeName: string;
  CreationTime: string;
  DeviceObject: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export default function FileRecoveryPage() {
  const edition = useEdition();
  const { show: showUpgrade } = useUpgradeDialog();
  const [recyclable, setRecyclable] = useState<RecyclableItem[]>([]);
  const [shadows, setShadows] = useState<ShadowCopy[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchPattern, setSearchPattern] = useState('');
  const [searchResults, setSearchResults] = useState<RecyclableItem[]>([]);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isPro = edition === 'professional';

  const refreshRecyclable = useCallback(async () => {
    try {
      const res = await rpc.raw<{ items: RecyclableItem[]; supported: boolean }>(RPC_METHODS.FILE_RECOVERY_RECYCLABLE);
      setRecyclable(res.items || []);
    } catch {
      setError('Failed to load Recycle Bin items');
    }
  }, []);

  const refreshShadows = useCallback(async () => {
    try {
      const res = await rpc.raw<{ copies: ShadowCopy[]; supported: boolean }>(RPC_METHODS.FILE_RECOVERY_SHADOW_COPIES);
      setShadows(res.copies || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refreshRecyclable();
    refreshShadows();
  }, [refreshRecyclable, refreshShadows]);

  const handleRestore = async (item: RecyclableItem) => {
    if (!isPro) {
      showUpgrade();
      return;
    }
    setRestoring(item.Path);
    setError(null);
    setMessage(null);
    try {
      const res = await rpc.raw<{ success: boolean; restored: boolean }>(RPC_METHODS.FILE_RECOVERY_RESTORE, {
        item_path: item.Path,
      });
      if (res.success) {
        setMessage(`Restored: ${item.Name}`);
        refreshRecyclable();
      } else {
        setError('Restore failed');
      }
    } catch (e) {
      setError(String(e));
    }
    setRestoring(null);
  };

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rpc.raw<{ items: RecyclableItem[] }>(RPC_METHODS.FILE_RECOVERY_SEARCH, {
        pattern: searchPattern || '*',
      });
      setSearchResults(res.items || []);
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  };

  return (
    <div data-testid="page-file-recovery">
      <PageHeader
        title="File Recovery"
        description="Recover deleted files from the Recycle Bin and Volume Shadow Copies."
        actions={<HelpButton text="File Recovery lets you restore files deleted to the Recycle Bin. On Professional edition, you can also recover files from Volume Shadow Copies (Previous Versions) when Windows System Protection is enabled." />}
      />

      <div className="space-y-4">
        {error && (
          <Card variant="glass">
            <p className="text-small text-semantic-danger">{error}</p>
          </Card>
        )}

        {message && (
          <Card variant="glass">
            <p className="text-small text-semantic-success">{message}</p>
          </Card>
        )}

        {/* Recycle Bin */}
        <Card title={`Recycle Bin (${recyclable.length} items)`} variant="glass">
          {recyclable.length === 0 ? (
            <p className="text-small text-text-secondary">Recycle Bin is empty.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {recyclable.map((item) => (
                <div key={item.Path} className="flex items-center gap-2 py-2 px-3 rounded hover:bg-[var(--avs-surface-hover)]">
                  <ArrowUturnLeftIcon className="h-5 w-5 text-brand-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-small font-medium text-text-primary truncate">{item.Name}</div>
                    <div className="text-caption text-text-muted truncate">{item.OriginalPath || item.Path}</div>
                  </div>
                  <div className="text-small text-text-secondary tabular-nums whitespace-nowrap">
                    {formatBytes(item.Size || 0)}
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleRestore(item)}
                    disabled={restoring === item.Path || !isPro}
                    leftIcon={<ArrowUturnLeftIcon className="h-4 w-4" />}
                  >
                    {restoring === item.Path ? 'Restoring...' : 'Restore'}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {!isPro && recyclable.length > 0 && (
            <p className="text-caption text-brand-primary mt-2">Professional edition required to restore files.</p>
          )}
        </Card>

        {/* Search */}
        <Card title="Search Deleted Files" variant="glass">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="*.docx or report*"
              value={searchPattern}
              onChange={(e) => setSearchPattern(e.target.value)}
              className="flex-1 rounded-[var(--avs-radius-md)] border border-[var(--avs-border)] bg-[var(--avs-surface)] px-3 py-2 text-small text-text-primary placeholder:text-text-muted focus:border-brand-primary focus:outline-none"
              data-testid="file-recovery-search-input"
            />
            <Button
              onClick={handleSearch}
              disabled={loading}
              leftIcon={<DocumentMagnifyingGlassIcon className="h-4 w-4" />}
              data-testid="file-recovery-search"
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
              {searchResults.map((item) => (
                <div key={item.Path} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-[var(--avs-surface-hover)]">
                  <DocumentMagnifyingGlassIcon className="h-4 w-4 text-text-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="text-small text-text-primary truncate">{item.Name}</div>
                    <div className="text-caption text-text-muted truncate">{item.OriginalPath}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => handleRestore(item)} disabled={!isPro}>
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Shadow Copies */}
        <Card title={`Volume Shadow Copies (${shadows.length})`} variant="glass">
          {shadows.length === 0 ? (
            <p className="text-small text-text-secondary">
              No shadow copies available. Enable Windows System Protection to create restore points.
            </p>
          ) : (
            <div className="space-y-2">
              {shadows.map((sc) => (
                <div key={sc.ID} className="flex items-center gap-2 py-2 px-3 rounded border border-[var(--avs-border)]">
                  <ServerStackIcon className="h-5 w-5 text-brand-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-small font-medium text-text-primary">{sc.VolumeName}</div>
                    <div className="text-caption text-text-muted truncate">
                      Created: {sc.CreationTime ? new Date(sc.CreationTime).toLocaleString() : 'Unknown'}
                    </div>
                  </div>
                  <Badge tone="neutral">Shadow Copy</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
