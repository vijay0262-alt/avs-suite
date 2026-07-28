/**
 * useMaintenanceHistory — React hook that bridges the MaintenanceHistoryService
 * to reactive React state.
 *
 * Subscribes to history events and automatically re-renders when:
 *   - A new execution is logged
 *   - History is updated (insert, delete, retention)
 *   - Statistics are recalculated
 *
 * No business logic is duplicated — the hook merely reads from the service
 * and subscribes to its events.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { maintenanceHistoryService } from '../maintenance-history';
import { historyEvents } from '../maintenance-history';
import type {
  ExecutionRecord,
  ExecutionStatistics,
  ExecutionFilter,
} from '../maintenance-history';

export interface UseMaintenanceHistoryResult {
  records: ExecutionRecord[];
  statistics: ExecutionStatistics;
  recordCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  query: (filter: ExecutionFilter) => ExecutionRecord[];
  getRecordById: (id: string) => ExecutionRecord | null;
  deleteRecord: (id: string) => boolean;
}

export function useMaintenanceHistory(): UseMaintenanceHistoryResult {
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [statistics, setStatistics] = useState<ExecutionStatistics>(
    maintenanceHistoryService.getStatistics(),
  );
  const [recordCount, setRecordCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      setRecords(maintenanceHistoryService.getAllRecords());
      setStatistics(maintenanceHistoryService.getStatistics());
      setRecordCount(maintenanceHistoryService.getRecordCount());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load maintenance history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const unsubLogged = historyEvents.on('execution_logged', () => refresh());
    const unsubUpdated = historyEvents.on('history_updated', () => refresh());
    const unsubStats = historyEvents.on('statistics_updated', () => {
      setStatistics(maintenanceHistoryService.getStatistics());
    });

    return () => {
      unsubLogged();
      unsubUpdated();
      unsubStats();
    };
  }, [refresh]);

  const query = useCallback((filter: ExecutionFilter) => {
    return maintenanceHistoryService.query(filter);
  }, []);

  const getRecordById = useCallback((id: string) => {
    return maintenanceHistoryService.getRecordById(id);
  }, []);

  const deleteRecord = useCallback((id: string) => {
    const result = maintenanceHistoryService.deleteRecord(id);
    if (result) refresh();
    return result;
  }, [refresh]);

  return {
    records,
    statistics,
    recordCount,
    loading,
    error,
    refresh,
    query,
    getRecordById,
    deleteRecord,
  };
}

// ── Derived data hook for charts ──────────────────────────────

export interface ChartDataPoint {
  date: string;
  executions: number;
  spaceRecovered: number;
  successRate: number;
  avgDuration: number;
}

export function useChartData(records: ExecutionRecord[]): ChartDataPoint[] {
  return useMemo(() => {
    if (records.length === 0) return [];

    const byDate = new Map<string, {
      total: number;
      successful: number;
      space: number;
      duration: number;
    }>();

    for (const record of records) {
      const dateKey = record.startTime.split('T')[0] ?? '';
      const existing = byDate.get(dateKey);
      if (existing) {
        existing.total++;
        if (record.status === 'succeeded') existing.successful++;
        existing.space += record.totalSpaceRecovered;
        existing.duration += record.durationMs;
      } else {
        byDate.set(dateKey, {
          total: 1,
          successful: record.status === 'succeeded' ? 1 : 0,
          space: record.totalSpaceRecovered,
          duration: record.durationMs,
        });
      }
    }

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, info]) => ({
        date,
        executions: info.total,
        spaceRecovered: info.space,
        successRate: info.total > 0 ? (info.successful / info.total) * 100 : 0,
        avgDuration: info.total > 0 ? Math.round(info.duration / info.total) : 0,
      }));
  }, [records]);
}

// ── Task frequency hook ───────────────────────────────────────

export interface TaskFrequencyData {
  taskId: string;
  taskName: string;
  count: number;
}

export function useTaskFrequency(records: ExecutionRecord[]): TaskFrequencyData[] {
  return useMemo(() => {
    const taskMap = new Map<string, { taskName: string; count: number }>();

    for (const record of records) {
      for (const task of record.taskResults) {
        const existing = taskMap.get(task.taskId);
        if (existing) {
          existing.count++;
        } else {
          taskMap.set(task.taskId, { taskName: task.taskName, count: 1 });
        }
      }
    }

    return Array.from(taskMap.entries())
      .map(([taskId, info]) => ({ taskId, ...info }))
      .sort((a, b) => b.count - a.count);
  }, [records]);
}
