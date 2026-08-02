/**
 * ExportCenterPage — centralized report export hub.
 *
 * Allows users to export:
 *   - Health reports
 *   - Security reports
 *   - Optimization reports
 *   - Maintenance history
 *   - System information
 */
import { useEffect, useMemo } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState } from '../../components/ModuleStates';
import {
  DocumentArrowDownIcon,
  ChartBarIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  ClipboardDocumentListIcon,
  ComputerDesktopIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface ExportState {
  exporting: string | null;
  exports: { id: string; type: string; format: string; filename: string; timestamp: string; size: number }[];
  error: string | null;
}

type ExportType = 'health' | 'security' | 'optimization' | 'maintenance' | 'system';
type ExportFormat = 'json' | 'csv' | 'html';

class ExportViewModel extends ViewModel<ExportState> {
  constructor() {
    super({ exporting: null, exports: [], error: null });
  }

  async exportReport(type: ExportType, format: ExportFormat) {
    const id = `export-${type}-${format}`;
    this.setState({ exporting: id, error: null });
    try {
      if (typeof window === 'undefined' || !window.avs) {
        throw new Error('AVS RPC bridge is unavailable');
      }

      let result: { filename: string; content: string };

      if (type === 'maintenance') {
        result = await window.avs.rpc.call('history.export', { format }) as { filename: string; content: string };
      } else if (format === 'html') {
        result = await window.avs.rpc.call('reporting.export.html', { type }) as { filename: string; content: string };
      } else if (format === 'csv') {
        result = await window.avs.rpc.call('reporting.export.text', { type }) as { filename: string; content: string };
      } else {
        const report = await window.avs.rpc.call('reporting.generate', { type }) as Record<string, unknown>;
        const content = JSON.stringify(report, null, 2);
        result = { filename: `${type}-report-${Date.now()}.json`, content };
      }

      const entry = {
        id: `export-${Date.now()}`,
        type,
        format,
        filename: result.filename,
        timestamp: new Date().toISOString(),
        size: result.content.length,
      };
      this.setState({
        exporting: null,
        exports: [entry, ...this.state.exports],
      });
    } catch (e) {
      this.setState({
        exporting: null,
        error: e instanceof Error ? e.message : 'Export failed',
      });
    }
  }

  override dispose() {
    super.dispose();
  }
}

const EXPORT_TYPES: { id: ExportType; label: string; description: string; icon: typeof ChartBarIcon }[] = [
  { id: 'health', label: 'Health Report', description: 'AI Health Engine analysis and scores', icon: ChartBarIcon },
  { id: 'security', label: 'Security Report', description: 'Security scan results and threat history', icon: ShieldCheckIcon },
  { id: 'optimization', label: 'Optimization Report', description: 'Optimization execution history and results', icon: WrenchScrewdriverIcon },
  { id: 'maintenance', label: 'Maintenance History', description: 'All maintenance execution records', icon: ClipboardDocumentListIcon },
  { id: 'system', label: 'System Information', description: 'Complete system hardware and software info', icon: ComputerDesktopIcon },
];

const FORMATS: ExportFormat[] = ['json', 'csv', 'html'];

export default function ExportCenterPage() {
  const vm = useMemo(() => new ExportViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    return () => vm.dispose();
  }, [vm]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export Center"
        description="Export reports and data in multiple formats for sharing, archiving, or analysis"
      />

      {state.error && (
        <Card variant="glass">
          <div className="flex items-center gap-2 text-sm text-[var(--avs-danger)]">
            <ExclamationTriangleIcon className="h-4 w-4" />
            {state.error}
          </div>
        </Card>
      )}

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {EXPORT_TYPES.map((type) => {
          const Icon = type.icon;
          return (
            <Card key={type.id} variant="glass">
              <div className="flex items-start gap-3">
                <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-3">
                  <Icon className="h-6 w-6 text-[var(--avs-brand-primary)]" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[var(--avs-text-primary)]">{type.label}</p>
                  <p className="text-xs text-[var(--avs-text-muted)]">{type.description}</p>
                  <div className="mt-3 flex gap-2">
                    {FORMATS.map((fmt) => (
                      <Button
                        key={fmt}
                        size="sm"
                        variant="secondary"
                        loading={state.exporting === `${type.id}-${fmt}`}
                        disabled={state.exporting !== null}
                        onClick={() => vm.exportReport(type.id, fmt)}
                        leftIcon={<DocumentArrowDownIcon className="h-3.5 w-3.5" />}
                      >
                        {fmt.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Export History */}
      <Card title="Export History" variant="glass">
        {state.exports.length > 0 ? (
          <div className="space-y-2">
            {state.exports.map((exp) => (
              <div key={exp.id} className="flex items-center gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3">
                <CheckCircleIcon className="h-5 w-5 text-[var(--avs-success)]" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-[var(--avs-text-primary)]">{exp.filename}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[var(--avs-text-muted)]">{new Date(exp.timestamp).toLocaleString()}</span>
                    <span className="text-xs text-[var(--avs-text-muted)]">({(exp.size / 1024).toFixed(1)} KB)</span>
                  </div>
                </div>
                <Badge tone="brand">{exp.format.toUpperCase()}</Badge>
                <Badge tone="neutral">{exp.type}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <ModuleEmptyState icon={DocumentArrowDownIcon} title="No exports yet" message="Export a report above to see it listed here." />
        )}
      </Card>
    </div>
  );
}
