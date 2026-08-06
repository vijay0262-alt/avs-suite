/**
 * ExportMenu — dropdown for exporting hardware snapshots.
 */
import { useState, useRef, useEffect } from 'react';
import { Button } from '@avs/ui';
import type { ExportFormat } from '../types';

interface ExportMenuProps {
  onExport: (format: ExportFormat) => void;
}

export function ExportMenu({ onExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleExport = (format: ExportFormat) => {
    onExport(format);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        data-testid="btn-export"
      >
        Export
      </Button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-md border border-border bg-surface shadow-lg"
          data-testid="export-menu"
        >
          <button
            className="flex w-full items-center px-3 py-2 text-small text-text-primary hover:bg-surface-muted"
            onClick={() => handleExport('json')}
            data-testid="export-json"
          >
            Export as JSON
          </button>
          <button
            className="flex w-full items-center px-3 py-2 text-small text-text-primary hover:bg-surface-muted"
            onClick={() => handleExport('csv')}
            data-testid="export-csv"
          >
            Export as CSV
          </button>
          <button
            className="flex w-full items-center px-3 py-2 text-small text-text-primary hover:bg-surface-muted"
            onClick={() => handleExport('pdf')}
            data-testid="export-pdf"
          >
            Export as PDF Report
          </button>
        </div>
      )}
    </div>
  );
}
