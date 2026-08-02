/**
 * ProtectionReportsPanel — generate, view, and export security reports.
 */
import { useState } from 'react';
import { Card, Button } from '@avs/ui';
import {
  DocumentTextIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ClockIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';
import type { SecurityReportData } from './SecurityDashboardViewModel';

interface ProtectionReportsPanelProps {
  reports: SecurityReportData[];
  onGenerate: (type: SecurityReportData['type']) => void;
  onExport: (type: SecurityReportData['type'], format: 'json' | 'csv' | 'txt') => void;
}

const REPORT_TYPES: { type: SecurityReportData['type']; label: string; icon: typeof DocumentTextIcon }[] = [
  { type: 'security', label: 'Security Report', icon: DocumentTextIcon },
  { type: 'weekly', label: 'Weekly AI Security Report', icon: CalendarDaysIcon },
  { type: 'threat_summary', label: 'Threat Summary', icon: ExclamationTriangleIcon },
  { type: 'investigation_summary', label: 'Investigation Summary', icon: MagnifyingGlassIcon },
  { type: 'remediation_summary', label: 'Remediation Summary', icon: ArrowPathIcon },
  { type: 'protection_history', label: 'Protection History', icon: ClockIcon },
];

export function ProtectionReportsPanel({ reports, onGenerate, onExport }: ProtectionReportsPanelProps) {
  const [selected, setSelected] = useState<SecurityReportData | null>(reports[0] ?? null);
  const [exportOpen, setExportOpen] = useState(false);

  const handleExport = (format: 'json' | 'csv' | 'txt') => {
    if (selected) {
      onExport(selected.type, format);
    }
    setExportOpen(false);
  };

  const handleGenerate = (type: SecurityReportData['type']) => {
    onGenerate(type);
    const report = reports.find((r) => r.type === type);
    if (report) setSelected(report);
  };

  return (
    <div className="space-y-4" data-testid="protection-reports-panel">
      {/* Report type buttons */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {REPORT_TYPES.map((rt) => {
          const existing = reports.find((r) => r.type === rt.type);
          return (
            <Card key={rt.type} data-testid={`report-card-${rt.type}`}>
              <button
                onClick={() => (existing ? setSelected(existing) : handleGenerate(rt.type))}
                className="flex w-full items-start gap-3 text-left"
                data-testid={`report-btn-${rt.type}`}
              >
                <rt.icon className="h-5 w-5 shrink-0 text-brand-primary" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-primary">{rt.label}</div>
                  <div className="text-xs text-text-secondary">
                    {existing ? `Generated: ${new Date(existing.generatedAt).toLocaleString()}` : 'Click to generate'}
                  </div>
                </div>
              </button>
            </Card>
          );
        })}
      </div>

      {/* Selected report detail */}
      {selected ? (
        <Card
          title={selected.title}
          actions={
            <div className="relative">
              <Button variant="secondary" size="sm" onClick={() => setExportOpen((v) => !v)} leftIcon={<DocumentArrowDownIcon className="h-4 w-4" />} data-testid="btn-export-report">
                Export
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded-md border border-border bg-surface shadow-lg" data-testid="export-dropdown">
                  <button className="flex w-full items-center px-3 py-2 text-sm text-text-primary hover:bg-surface-muted" onClick={() => handleExport('json')} data-testid="export-json">
                    JSON
                  </button>
                  <button className="flex w-full items-center px-3 py-2 text-sm text-text-primary hover:bg-surface-muted" onClick={() => handleExport('csv')} data-testid="export-csv">
                    CSV
                  </button>
                  <button className="flex w-full items-center px-3 py-2 text-sm text-text-primary hover:bg-surface-muted" onClick={() => handleExport('txt')} data-testid="export-txt">
                    Text
                  </button>
                </div>
              )}
            </div>
          }
          data-testid="report-detail"
        >
          <div className="space-y-4">
            {/* Summary */}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-text-muted mb-1">Summary</div>
              <p className="text-sm text-text-primary">{selected.summary}</p>
            </div>

            {/* Period */}
            <div className="flex items-center gap-4 text-xs">
              <span className="text-text-secondary">Period:</span>
              <span className="font-medium text-text-primary">
                {new Date(selected.period.start).toLocaleDateString()} — {new Date(selected.period.end).toLocaleDateString()}
              </span>
            </div>

            {/* Metrics */}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">Metrics</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(selected.metrics).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-border p-2" data-testid={`report-metric-${key}`}>
                    <div className="text-xs text-text-muted">{key}</div>
                    <div className="text-sm font-medium text-text-primary">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Details */}
            {selected.details.length > 0 && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-text-muted mb-2">Details</div>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {selected.details.map((detail, i) => (
                    <div key={i} className="text-xs text-text-secondary py-0.5">
                      • {detail}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card data-testid="report-empty">
          <div className="py-8 text-center text-sm text-text-secondary">
            Select a report type above to generate and view it.
          </div>
        </Card>
      )}
    </div>
  );
}
