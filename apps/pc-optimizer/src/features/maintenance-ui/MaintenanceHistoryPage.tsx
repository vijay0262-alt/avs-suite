/**
 * MaintenanceHistoryPage — the main maintenance history dashboard.
 *
 * Combines:
 *   - Analytics cards (summary statistics)
 *   - Charts (executions over time, space recovered, success rate, tasks, duration)
 *   - History table (searchable, sortable, paginated)
 *   - Execution detail dialog (on row click)
 *
 * All data comes from useMaintenanceHistory hook which reads from
 * MaintenanceHistoryService — no business logic is duplicated.
 */
import { useState, useMemo } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '@avs/ui';
import { HelpButton } from '../../components/HelpButton';
import { useMaintenanceHistory, useChartData, useTaskFrequency } from '../maintenance-ui/useMaintenanceHistory';
import { AnalyticsCards } from '../maintenance-ui/components/AnalyticsCards';
import { MaintenanceCharts } from '../maintenance-ui/components/MaintenanceCharts';
import { HistoryTable } from '../maintenance-ui/components/HistoryTable';
import { ExecutionDetailDialog } from '../maintenance-ui/components/ExecutionDetailDialog';
import { ErrorState } from '../maintenance-ui/components/ErrorState';
import type { ExecutionRecord } from '../maintenance-history';

export default function MaintenanceHistoryPage() {
  const { records, statistics, loading, error, refresh } = useMaintenanceHistory();
  const chartData = useChartData(records);
  const taskFrequency = useTaskFrequency(records);
  const [selectedRecord, setSelectedRecord] = useState<ExecutionRecord | null>(null);

  const memoizedStats = useMemo(() => statistics, [statistics]);

  return (
    <div data-testid="page-maintenance-history">
      <PageHeader
        title="Maintenance History"
        description="View detailed records of every maintenance execution, analytics, and trends."
        actions={<HelpButton text="Every maintenance operation is logged here with full details. Click any row to see the complete execution record including items processed, space recovered, and duration." />}
      />

      {error && (
        <ErrorState
          message={error}
          onRetry={refresh}
          testId="maintenance-history-error"
        />
      )}

      {!error && (
        <div className="space-y-6">
          {/* Analytics Cards */}
          <AnalyticsCards statistics={memoizedStats} loading={loading} />

          {/* Charts */}
          <MaintenanceCharts
            chartData={chartData}
            taskFrequency={taskFrequency}
            loading={loading}
          />

          {/* History Table */}
          <Card title="Execution History">
            <HistoryTable
              records={records}
              onRowClick={setSelectedRecord}
              loading={loading}
            />
          </Card>
        </div>
      )}

      {/* Detail Dialog */}
      <ExecutionDetailDialog
        record={selectedRecord}
        onClose={() => setSelectedRecord(null)}
      />
    </div>
  );
}
