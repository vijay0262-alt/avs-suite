/**
 * DriverInformationPage — displays installed driver details.
 *
 * Shows:
 *   - Driver summary (total, signed, unsigned)
 *   - Filterable list of all installed drivers
 *   - Device class filter
 *   - Driver signing status
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@avs/ui';
import { useViewModel } from '@avs/core/mvvm/useViewModel';
import { ViewModel } from '@avs/core/mvvm/ViewModel';
import { PageHeader } from '../../components/PageHeader';
import { ModuleEmptyState, ModuleLoadingState, ModuleErrorState } from '../../components/ModuleStates';
import {
  CpuChipIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

interface DriverEntry {
  DeviceName: string;
  DeviceID: string;
  Manufacturer: string;
  DriverVersion: string;
  DriverDate: string | null;
  ProviderName: string;
  DeviceClass: string;
  IsSigned: boolean;
  Signer: string;
  Status: string;
}

interface DriverState {
  loading: boolean;
  error: string | null;
  drivers: DriverEntry[];
  summary: { total: number; signed: number; unsigned: number; outdated: number } | null;
  filterClass: string;
  filterSigned: 'all' | 'signed' | 'unsigned';
  searchQuery: string;
}

class DriverViewModel extends ViewModel<DriverState> {
  constructor() {
    super({ loading: false, error: null, drivers: [], summary: null, filterClass: '', filterSigned: 'all', searchQuery: '' });
  }

  async bootstrap() {
    this.setState({ loading: true, error: null });
    try {
      if (typeof window === 'undefined' || !window.avs) {
        throw new Error('AVS RPC bridge is unavailable');
      }
      const [listResult, summaryResult] = await Promise.all([
        window.avs.rpc.call('drivers.list') as Promise<{ drivers: DriverEntry[]; total: number; signed: number; unsigned: number }>,
        window.avs.rpc.call('drivers.summary') as Promise<{ total: number; signed: number; unsigned: number; outdated: number }>,
      ]);
      this.setState({ loading: false, drivers: listResult.drivers, summary: summaryResult });
    } catch (e) {
      this.setState({ loading: false, error: e instanceof Error ? e.message : 'Failed to load drivers' });
    }
  }

  setFilterClass(cls: string) {
    this.setState({ filterClass: cls });
  }

  setFilterSigned(filter: 'all' | 'signed' | 'unsigned') {
    this.setState({ filterSigned: filter });
  }

  setSearch(query: string) {
    this.setState({ searchQuery: query });
  }
}

export default function DriverInformationPage() {
  const vm = useMemo(() => new DriverViewModel(), []);
  const state = useViewModel(vm);

  useEffect(() => {
    vm.bootstrap();
    return () => vm.dispose();
  }, [vm]);

  const deviceClasses = useMemo(() => {
    const set = new Set(state.drivers.map((d) => d.DeviceClass).filter(Boolean));
    return Array.from(set).sort();
  }, [state.drivers]);

  const filteredDrivers = useMemo(() => {
    let result = state.drivers;
    if (state.filterClass) {
      result = result.filter((d) => d.DeviceClass === state.filterClass);
    }
    if (state.filterSigned === 'signed') {
      result = result.filter((d) => d.IsSigned);
    } else if (state.filterSigned === 'unsigned') {
      result = result.filter((d) => !d.IsSigned);
    }
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.toLowerCase();
      result = result.filter((d) =>
        d.DeviceName?.toLowerCase().includes(q) ||
        d.Manufacturer?.toLowerCase().includes(q) ||
        d.ProviderName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [state.drivers, state.filterClass, state.filterSigned, state.searchQuery]);

  if (state.loading) {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Driver Information" description="View installed drivers, versions, and signing status" />
        <ModuleLoadingState message="Loading drivers…" />
      </div>
    );
  }

  if (state.error && state.drivers.length === 0) {
    return (
      <div className="px-6 py-6">
        <PageHeader title="Driver Information" description="View installed drivers, versions, and signing status" />
        <ModuleErrorState message={state.error} onRetry={() => vm.bootstrap()} />
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-6">
      <PageHeader
        title="Driver Information"
        description="View installed drivers, versions, and signing status"
        actions={
          <Button onClick={() => vm.bootstrap()} variant="secondary" leftIcon={<ArrowPathIcon className="h-4 w-4" />}>
            Refresh
          </Button>
        }
      />

      {/* Summary Cards */}
      {state.summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <SummaryCard label="Total Drivers" value={state.summary.total} icon={CpuChipIcon} />
          <SummaryCard label="Signed" value={state.summary.signed} icon={ShieldCheckIcon} tone="success" />
          <SummaryCard label="Unsigned" value={state.summary.unsigned} icon={ExclamationTriangleIcon} tone={state.summary.unsigned > 0 ? 'warning' : 'neutral'} />
          <SummaryCard label="Outdated" value={state.summary.outdated} icon={ArrowPathIcon} tone="neutral" />
        </div>
      )}

      {/* Filters */}
      <Card variant="glass">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={state.searchQuery}
            onChange={(e) => vm.setSearch(e.target.value)}
            placeholder="Search drivers…"
            className="flex-1 min-w-[200px] rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-sm text-[var(--avs-text-primary)]"
          />
          <select
            value={state.filterClass}
            onChange={(e) => vm.setFilterClass(e.target.value)}
            className="rounded-[var(--avs-radius-md)] border border-[var(--avs-glass-border)] bg-[var(--avs-surface-muted)] px-3 py-2 text-sm text-[var(--avs-text-primary)]"
          >
            <option value="">All Classes</option>
            {deviceClasses.map((cls) => (
              <option key={cls} value={cls}>{cls}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {(['all', 'signed', 'unsigned'] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={state.filterSigned === f ? 'primary' : 'secondary'}
                onClick={() => vm.setFilterSigned(f)}
              >
                {f === 'all' ? 'All' : f === 'signed' ? 'Signed' : 'Unsigned'}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {/* Driver List */}
      <Card title={`Drivers (${filteredDrivers.length})`} variant="glass">
        {filteredDrivers.length > 0 ? (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredDrivers.map((driver, i) => (
              <div key={i} className="flex items-start gap-3 rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--avs-text-primary)] truncate">{driver.DeviceName}</span>
                    {driver.IsSigned ? (
                      <Badge tone="success"><ShieldCheckIcon className="h-3 w-3 inline mr-1" />Signed</Badge>
                    ) : (
                      <Badge tone="warning"><ExclamationTriangleIcon className="h-3 w-3 inline mr-1" />Unsigned</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                    <span className="text-xs text-[var(--avs-text-muted)]">Class: {driver.DeviceClass || 'N/A'}</span>
                    <span className="text-xs text-[var(--avs-text-muted)]">Version: {driver.DriverVersion || 'N/A'}</span>
                    <span className="text-xs text-[var(--avs-text-muted)]">Provider: {driver.ProviderName || 'N/A'}</span>
                    <span className="text-xs text-[var(--avs-text-muted)]">Date: {driver.DriverDate || 'N/A'}</span>
                    {driver.Signer && <span className="text-xs text-[var(--avs-text-muted)]">Signer: {driver.Signer}</span>}
                  </div>
                </div>
                <Badge tone={driver.Status === 'OK' ? 'success' : 'neutral'}>{driver.Status || 'Unknown'}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <ModuleEmptyState icon={CpuChipIcon} title="No drivers found" message="No drivers match the current filters." />
        )}
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone = 'neutral' }: { label: string; value: number; icon: typeof CpuChipIcon; tone?: 'neutral' | 'success' | 'warning' }) {
  const colorClass = tone === 'success' ? 'text-[var(--avs-success)]' : tone === 'warning' ? 'text-[var(--avs-warning)]' : 'text-[var(--avs-text-primary)]';
  return (
    <Card variant="glass">
      <div className="flex items-center gap-3">
        <div className="rounded-[var(--avs-radius-md)] bg-[var(--avs-surface-muted)] p-2.5">
          <Icon className="h-5 w-5 text-[var(--avs-brand-primary)]" />
        </div>
        <div>
          <p className="text-2xl font-bold {colorClass}">{value}</p>
          <p className="text-xs text-[var(--avs-text-muted)]">{label}</p>
        </div>
      </div>
    </Card>
  );
}
