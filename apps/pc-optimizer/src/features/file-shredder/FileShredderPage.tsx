/**
 * FileShredderPage — Secure file deletion with multiple overwrite patterns.
 *
 * Methods:
 *   - Quick (1-pass random) — Free users
 *   - DoD 5220.22-M (3-pass) — Pro users
 *   - Gutmann (35-pass) — Pro users
 *
 * Free: 3 files per run, Quick method only
 * Pro: Unlimited files, all methods
 */
import { useState, useCallback } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { PageHeader } from '../../components/PageHeader';
import { HelpButton } from '../../components/HelpButton';
import { useUpgradeDialog } from '../../components/UpgradeDialog';
import { useIsPro } from '../sync/syncStore';
import {
  FireIcon,
  DocumentArrowUpIcon,
  XCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import {
  fileShredderService,
  type ShredMethod,
  type ShredResultItem,
} from './fileShredder.service';

const SHRED_METHODS: {
  id: ShredMethod;
  label: string;
  description: string;
  passes: number;
  proOnly: boolean;
}[] = [
  {
    id: 'quick',
    label: 'Quick',
    description: '1-pass random overwrite. Fast, prevents casual recovery.',
    passes: 1,
    proOnly: false,
  },
  {
    id: 'dod',
    label: 'DoD 5220.22-M',
    description: '3-pass: zeros, ones, random. US Dept. of Defense standard.',
    passes: 3,
    proOnly: true,
  },
  {
    id: 'gutmann',
    label: 'Gutmann',
    description: '35-pass with specific patterns. Maximum security, slowest.',
    passes: 35,
    proOnly: true,
  },
];

function formatBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

export default function FileShredderPage() {
  const isPro = useIsPro();
  const { show: showUpgrade } = useUpgradeDialog();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [method, setMethod] = useState<ShredMethod>('dod');
  const [shredding, setShredding] = useState(false);
  const [results, setResults] = useState<ShredResultItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFileSelect = useCallback(() => {
    // Use Electron's file dialog if available, otherwise use input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        const paths: string[] = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          // In Electron, File objects have a `path` property
          const filePath = (f as File & { path?: string }).path;
          if (filePath) paths.push(filePath);
        }
        setSelectedFiles((prev) => [...prev, ...paths]);
      }
    };
    input.click();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map((f) => (f as File & { path?: string }).path).filter(Boolean) as string[];
    if (paths.length > 0) {
      setSelectedFiles((prev) => [...prev, ...paths]);
    }
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setResults(null);
    setError(null);
  };

  const handleShred = async () => {
    if (selectedFiles.length === 0) return;

    // Check if method requires Pro
    const methodInfo = SHRED_METHODS.find((m) => m.id === method);
    if (methodInfo?.proOnly && !isPro) {
      showUpgrade('File Shredder');
      return;
    }

    setShredding(true);
    setError(null);
    setResults(null);

    try {
      const response = await fileShredderService.shred(selectedFiles, method);
      if (response.error_code === 'EDITION_LIMIT') {
        setError(response.message);
        showUpgrade('File Shredder');
      } else if (!response.success && response.results.length === 0) {
        setError(response.message);
      } else {
        setResults(response.results);
        if (response.success) {
          setSelectedFiles([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to shred files');
    } finally {
      setShredding(false);
    }
  };

  const totalBytes = results?.reduce((sum, r) => sum + r.bytesShredded, 0) ?? 0;
  const succeededCount = results?.filter((r) => r.success).length ?? 0;
  const failedCount = results ? results.length - succeededCount : 0;

  return (
    <div data-testid="page-file-shredder" className="space-y-4">
      <PageHeader
        title="File Shredder"
        description="Permanently delete files so they cannot be recovered. Uses military-grade overwrite patterns."
        actions={<HelpButton text="Select files to shred, choose a method, and click Shred. Shredded files cannot be recovered." />}
      />

      {/* Warning banner */}
      <div className="rounded-[var(--avs-radius-lg)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3">
        <ExclamationTriangleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
        <div>
          <div className="text-small font-medium text-text-primary">Warning: Shredded files cannot be recovered</div>
          <p className="text-caption text-text-secondary mt-1">
            File Shredder overwrites files multiple times before deletion, making recovery impossible.
            Make sure you have selected the correct files.
          </p>
        </div>
      </div>

      {/* Method selector */}
      <Card title="Shredding Method" variant="glass">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SHRED_METHODS.map((m) => {
            const locked = m.proOnly && !isPro;
            const selected = method === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                disabled={shredding}
                className={`text-left rounded-[var(--avs-radius-md)] border p-4 transition-colors ${
                  selected
                    ? 'border-brand-primary bg-brand-primary/5'
                    : 'border-[var(--avs-border)] hover:border-[var(--avs-border-hover, var(--avs-border))]'
                } ${locked ? 'opacity-60' : ''}`}
                data-testid={`shred-method-${m.id}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-small font-medium text-text-primary">{m.label}</span>
                  {m.proOnly && (
                    <Badge tone={isPro ? 'brand' : 'neutral'}>{isPro ? 'PRO' : 'PRO'}</Badge>
                  )}
                </div>
                <p className="text-caption text-text-secondary">{m.description}</p>
                <p className="text-caption text-text-muted mt-1">{m.passes} pass(es)</p>
              </button>
            );
          })}
        </div>
      </Card>

      {/* File selection */}
      <Card title="Files to Shred" variant="glass">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-[var(--avs-radius-md)] border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-brand-primary bg-brand-primary/5' : 'border-[var(--avs-border)]'
          }`}
          data-testid="shred-drop-zone"
        >
          <DocumentArrowUpIcon className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <p className="text-small text-text-secondary mb-2">Drag and drop files here, or</p>
          <Button variant="secondary" onClick={handleFileSelect} disabled={shredding} data-testid="shred-browse-btn">
            Browse Files
          </Button>
        </div>

        {/* Selected files list */}
        {selectedFiles.length > 0 && (
          <div className="mt-4 space-y-2" data-testid="shred-file-list">
            {selectedFiles.map((file, i) => (
              <div key={`${file}-${i}`} className="flex items-center justify-between rounded-[var(--avs-radius-sm)] bg-surface-muted px-3 py-2">
                <span className="text-small text-text-primary truncate flex-1">{file}</span>
                <button
                  onClick={() => removeFile(i)}
                  disabled={shredding}
                  className="text-text-muted hover:text-semantic-danger shrink-0 ml-2"
                  data-testid={`shred-remove-${i}`}
                >
                  <XCircleIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <span className="text-caption text-text-muted">{selectedFiles.length} file(s) selected</span>
              <Button variant="ghost" size="sm" onClick={clearAll} disabled={shredding}>
                Clear All
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Action button */}
      <div className="flex justify-end gap-3">
        <Button
          variant="primary"
          size="lg"
          leftIcon={shredding ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <FireIcon className="h-5 w-5" />}
          onClick={handleShred}
          disabled={selectedFiles.length === 0 || shredding}
          data-testid="shred-execute-btn"
        >
          {shredding ? 'Shredding...' : `Shred ${selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}`}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-[var(--avs-radius-md)] border border-semantic-danger/30 bg-semantic-danger/5 p-4 flex items-start gap-3" data-testid="shred-error">
          <XCircleIcon className="h-5 w-5 text-semantic-danger shrink-0 mt-0.5" />
          <div>
            <div className="text-small font-medium text-text-primary">Error</div>
            <p className="text-caption text-text-secondary mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <Card title="Shredding Results" variant="glass" data-testid="shred-results">
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary tabular-nums">{succeededCount}</div>
                <div className="text-caption text-text-muted">Shredded</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-semantic-danger tabular-nums">{failedCount}</div>
                <div className="text-caption text-text-muted">Failed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-text-primary tabular-nums">{formatBytes(totalBytes)}</div>
                <div className="text-caption text-text-muted">Data Shredded</div>
              </div>
            </div>

            {/* Per-file results */}
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-t border-[var(--avs-border)]">
                  {r.success ? (
                    <CheckCircleIcon className="h-4 w-4 text-semantic-success shrink-0" />
                  ) : (
                    <XCircleIcon className="h-4 w-4 text-semantic-danger shrink-0" />
                  )}
                  <span className="text-small text-text-primary truncate flex-1">{r.path}</span>
                  <span className="text-caption text-text-muted shrink-0">{r.message}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Free edition limitation notice */}
      {!isPro && (
        <div className="rounded-[var(--avs-radius-md)] border border-brand-primary/20 bg-brand-primary/5 p-4 flex items-center justify-between" data-testid="shred-free-notice">
          <div>
            <div className="text-small font-medium text-text-primary">Free Edition Limitations</div>
            <p className="text-caption text-text-secondary mt-1">
              Quick method only (1-pass). Maximum 3 files per run. Upgrade for DoD 5220.22-M and Gutmann methods.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => showUpgrade('File Shredder')} leftIcon={<FireIcon className="h-4 w-4" />}>
            Upgrade
          </Button>
        </div>
      )}
    </div>
  );
}
